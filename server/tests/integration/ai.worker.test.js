import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { Message } from '../../src/modules/messages/message.model.js';
import { messageRepository } from '../../src/modules/messages/message.repository.js';
import { createAiWorker } from '../../src/modules/ai/ai.worker.js';
import { AiProviderError } from '../../src/modules/ai/ai.provider.js';
import { validIncident, validRoutine } from '../fixtures/aiOutputs.js';

const logger = { info() {}, warn() {}, error() {}, child: () => logger };
let mongo;

// Fake provider: returns (or throws) the queued responses in order.
function fakeProvider(responses) {
  const calls = [];
  return {
    name: 'fake',
    model: 'fake-model',
    calls,
    async generate(request) {
      calls.push(request);
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return { text: typeof next === 'string' ? next : JSON.stringify(next), latencyMs: 5 };
    },
  };
}

function makeWorker(provider) {
  return createAiWorker({
    repository: messageRepository,
    provider,
    mediaStorage: { resolve: (p) => p },
    logger,
    rateLimit: async () => {}, // no waiting in tests
  });
}

async function createPending(overrides = {}) {
  return Message.create({
    waMessageId: `msg-${Math.random()}`,
    groupId: 'g@g.us',
    senderId: 's@c.us',
    timestamp: new Date(),
    type: 'text',
    body: 'Pump 3 at Block B is leaking',
    ...overrides,
  });
}

const reload = (doc) => Message.findById(doc._id).lean();

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
beforeEach(() => Message.deleteMany({}));

describe('AI worker', () => {
  it('valid, confident, low-impact result → auto_approved', async () => {
    const msg = await createPending({ body: 'Slab done' });
    await makeWorker(fakeProvider([validRoutine])).runOnce();

    const saved = await reload(msg);
    expect(saved.processing.status).toBe('auto_approved');
    expect(saved.ai).toMatchObject({ category: 'Routine Update', model: 'fake-model', promptVersion: 'v1', reviewReasons: [] });
    expect(saved.body).toBe('Slab done'); // original never touched
  });

  it('Incident → needs_review with reasons', async () => {
    const msg = await createPending();
    await makeWorker(fakeProvider([validIncident])).runOnce();
    const saved = await reload(msg);
    expect(saved.processing.status).toBe('needs_review');
    expect(saved.ai.reviewReasons).toEqual(['high_impact_category', 'high_priority']);
  });

  it('bad JSON then valid JSON → repaired on the second call', async () => {
    const msg = await createPending();
    const provider = fakeProvider(['not json', validRoutine]);
    await makeWorker(provider).runOnce();

    const saved = await reload(msg);
    expect(saved.processing.status).toBe('auto_approved');
    expect(saved.ai.repaired).toBe(true);
    // the repair call includes the error message for the model
    expect(JSON.stringify(provider.calls[1].contents.at(-1))).toContain('Response is not valid JSON');
  });

  it('bad JSON twice → needs_review with validation errors (not failed)', async () => {
    const msg = await createPending();
    await makeWorker(fakeProvider(['nope', { ...validRoutine, category: 'Weird' }])).runOnce();
    const saved = await reload(msg);
    expect(saved.processing.status).toBe('needs_review');
    expect(saved.ai.reviewReasons).toEqual(['validation_failed']);
    expect(saved.ai.validationErrors.length).toBeGreaterThanOrEqual(2);
  });

  it('timeouts are retried with backoff, then failed after max attempts', async () => {
    const msg = await createPending();
    const timeout = () => new AiProviderError('AI request timed out after 30000ms', { retryable: true });
    const worker = makeWorker(fakeProvider([timeout(), timeout(), timeout()]));

    await worker.runOnce();
    let saved = await reload(msg);
    expect(saved.processing).toMatchObject({ status: 'pending', attempts: 1, lastError: expect.stringMatching(/timed out/) });
    expect(saved.processing.nextRunAt.getTime()).toBeGreaterThan(Date.now() + 8000); // ~10s backoff

    for (let i = 0; i < 2; i++) {
      await Message.updateOne({ _id: msg._id }, { 'processing.nextRunAt': new Date() }); // skip the wait
      await worker.runOnce();
    }
    saved = await reload(msg);
    expect(saved.processing).toMatchObject({ status: 'failed', attempts: 3 });
  });

  it('permanent errors (e.g. invalid API key) fail immediately', async () => {
    const msg = await createPending();
    const err = new AiProviderError('AI API error 401: invalid key', { retryable: false, status: 401 });
    await makeWorker(fakeProvider([err])).runOnce();
    expect((await reload(msg)).processing).toMatchObject({ status: 'failed', attempts: 1 });
  });

  it('ignores skipped messages and re-queues jobs stuck in processing (crash recovery)', async () => {
    await createPending({ processing: { status: 'skipped', skipReason: 'duplicate' } });
    const stuck = await createPending({ processing: { status: 'processing', lockedAt: new Date(Date.now() - 10 * 60 * 1000) } });

    expect(await makeWorker(fakeProvider([])).runOnce()).toBe(false); // nothing claimable
    expect(await messageRepository.resetStaleJobs(2 * 60 * 1000)).toBe(1);
    expect((await reload(stuck)).processing.status).toBe('pending');
  });
});
