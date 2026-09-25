import fs from 'node:fs/promises';
import { buildContents, PROMPT_VERSION, SYSTEM_PROMPT } from './ai.prompt.js';
import { toGeminiJsonSchema } from './ai.schema.js';
import { getReviewReasons, parseAiOutput } from './ai.validator.js';

const JSON_SCHEMA = toGeminiJsonSchema();

// Keeps at least `60s / rpm` between AI calls across all worker slots, so a
// burst (e.g. 50 backfilled messages) does not hit the provider's rate limit.
export function createRateLimiter(rpm, { now = () => Date.now(), sleep } = {}) {
  const gap = rpm > 0 ? 60000 / rpm : 0;
  const wait = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  let nextFreeAt = 0;
  return async () => {
    const t = now();
    const startAt = Math.max(t, nextFreeAt);
    nextFreeAt = startAt + gap;
    if (startAt > t) await wait(startAt - t);
  };
}

// Background loop: claim a pending message → call the AI → validate → save.
//
//   valid + no review reasons   → auto_approved
//   valid + any review reason   → needs_review (reasons stored in ai.reviewReasons)
//   invalid JSON twice          → needs_review with ai.validationErrors
//   temporary error (429/5xx/timeout) → back to pending, retried after 10s, 20s …
//   permanent error, or max attempts  → failed (Retry button in the UI)
export function createAiWorker({
  repository,
  provider,
  mediaStorage,
  logger,
  emit = () => {},
  getThreshold = () => 0.75,
  timeZone = 'Asia/Kolkata',
  concurrency = 2,
  pollMs = 2000,
  maxAttempts = 3,
  retryBaseMs = 5000,
  staleAfterMs = 2 * 60 * 1000,
  maxRpm = 10,
  rateLimit = createRateLimiter(maxRpm),
}) {
  let running = false;
  const timers = new Set();
  const inFlight = new Set();

  async function loadImagePart(message) {
    if (message.type !== 'image' || !message.media?.path || message.media.error) return null;
    try {
      const data = await fs.readFile(mediaStorage.resolve(message.media.path));
      return { inlineData: { mimeType: message.media.mimetype, data: data.toString('base64') } };
    } catch (err) {
      logger.warn({ id: message._id, err: err.message }, 'Stored image missing, classifying caption only');
      return null;
    }
  }

  async function callModel(message, imagePart, repair) {
    await rateLimit();
    return provider.generate({
      systemInstruction: SYSTEM_PROMPT,
      contents: buildContents(message, { imagePart, repair, timeZone }),
      jsonSchema: JSON_SCHEMA,
    });
  }

  // Returns the `ai` block to store, and the resulting status.
  async function classify(message) {
    const imagePart = await loadImagePart(message);
    let response = await callModel(message, imagePart);
    let latencyMs = response.latencyMs;
    let parsed = response.emptyReason
      ? { ok: false, errors: [`Model returned no content (${response.emptyReason})`], warnings: [] }
      : parseAiOutput(response.text);
    let repaired = false;

    // One repair attempt: show the model its own answer and the exact errors.
    if (!parsed.ok && !response.emptyReason) {
      const firstErrors = parsed.errors;
      response = await callModel(message, imagePart, { previousOutput: response.text, errors: firstErrors });
      latencyMs += response.latencyMs;
      parsed = parseAiOutput(response.text);
      repaired = true;
      if (!parsed.ok) parsed.errors = [...new Set([...firstErrors, ...parsed.errors])];
    }

    const meta = {
      model: provider.model,
      provider: provider.name,
      promptVersion: PROMPT_VERSION,
      latencyMs,
      repaired,
      warnings: parsed.warnings ?? [],
      processedAt: new Date(),
    };

    if (!parsed.ok) {
      return {
        status: 'needs_review',
        ai: {
          ...meta,
          validationErrors: parsed.errors,
          reviewReasons: ['validation_failed'],
          rawOutput: (response.text ?? '').slice(0, 2000),
        },
      };
    }

    const reviewReasons = getReviewReasons(parsed.data, message, { threshold: getThreshold() });
    return {
      status: reviewReasons.length ? 'needs_review' : 'auto_approved',
      ai: { ...parsed.data, ...meta, validationErrors: [], reviewReasons },
    };
  }

  async function processJob(job) {
    const log = logger.child({ id: String(job._id), attempt: job.processing.attempts });
    try {
      const { status, ai } = await classify(job);
      const saved = await repository.completeJob(job._id, { status, ai });
      log.info({ status, category: ai.category, confidence: ai.confidence, reasons: ai.reviewReasons }, 'Message classified');
      if (saved) emit('message:updated', saved);
    } catch (err) {
      const retryable = err.retryable !== false; // unknown errors: assume temporary
      const attempts = job.processing.attempts;
      let saved;
      if (retryable && attempts < maxAttempts) {
        const delay = retryBaseMs * 2 ** attempts; // 10s, 20s, …
        saved = await repository.retryJobLater(job._id, {
          error: err.message,
          nextRunAt: new Date(Date.now() + delay),
        });
        log.warn({ err: err.message, retryInMs: delay }, 'AI call failed, will retry');
      } else {
        saved = await repository.failJob(job._id, { error: err.message });
        log.error({ err: err.message, retryable }, 'AI processing failed permanently');
      }
      if (saved) emit('message:updated', saved);
    }
  }

  // Claims and processes one job. Returns false when the queue is empty.
  async function runOnce() {
    const job = await repository.claimNextJob();
    if (!job) return false;
    await processJob(job);
    return true;
  }

  function schedule(fn, ms) {
    const timer = setTimeout(async () => {
      timers.delete(timer);
      await fn();
    }, ms);
    timers.add(timer);
  }

  // One slot = one loop: keep working while there are jobs, otherwise sleep pollMs.
  async function slot() {
    if (!running) return;
    let hadJob = false;
    const task = runOnce()
      .then((r) => (hadJob = r))
      .catch((err) => logger.error({ err: err.message }, 'Worker loop error (database?)'));
    inFlight.add(task);
    await task;
    inFlight.delete(task);
    if (running) schedule(slot, hadJob ? 0 : pollMs);
  }

  async function recoverStale() {
    try {
      const count = await repository.resetStaleJobs(staleAfterMs);
      if (count) logger.warn({ count }, 'Re-queued jobs stuck in processing');
    } catch (err) {
      logger.error({ err: err.message }, 'Stale job recovery failed');
    }
    if (running) schedule(recoverStale, 60000);
  }

  return {
    runOnce, // exposed for tests
    isRunning: () => running,

    async start() {
      if (running) return;
      running = true;
      await recoverStale();
      for (let i = 0; i < concurrency; i++) slot();
      logger.info({ concurrency, model: provider.model, maxRpm }, 'AI worker started');
    },

    // Stop taking new jobs and wait for the ones in progress to finish.
    async stop() {
      running = false;
      timers.forEach(clearTimeout);
      timers.clear();
      await Promise.allSettled([...inFlight]);
    },
  };
}
