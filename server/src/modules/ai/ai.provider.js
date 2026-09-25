import { GoogleGenAI } from '@google/genai';

// Thin adapter around the model API. The worker only knows this interface:
//   provider.generate({ systemInstruction, contents, jsonSchema }) → { text, latencyMs }
// and errors of type AiProviderError with a `retryable` flag.
// Swapping Gemini for OpenAI/Claude/Kimi means writing one more function like this.

export class AiProviderError extends Error {
  constructor(message, { retryable, status = null, cause } = {}) {
    super(message, { cause });
    this.name = 'AiProviderError';
    this.retryable = retryable;
    this.status = status;
  }
}

// 429 (rate limit), 5xx and timeouts are temporary → retry later.
// 400/401/403/404 (bad request, bad key, unknown model) will not fix themselves.
const RETRYABLE_STATUS = new Set([408, 429, 500, 502, 503, 504]);

function toProviderError(err, { timedOut, timeoutMs }) {
  if (timedOut) return new AiProviderError(`AI request timed out after ${timeoutMs}ms`, { retryable: true, cause: err });
  const status = typeof err?.status === 'number' ? err.status : null;
  if (status !== null) {
    return new AiProviderError(`AI API error ${status}: ${err.message}`, {
      retryable: RETRYABLE_STATUS.has(status),
      status,
      cause: err,
    });
  }
  // No HTTP status: DNS/network failure etc.
  return new AiProviderError(`AI request failed: ${err?.message ?? err}`, { retryable: true, cause: err });
}

export function createGeminiProvider({ apiKey, model, timeoutMs = 30000 }) {
  const configured = Boolean(apiKey);
  // attempts: 1 → the SDK does not retry on its own; the worker owns retries/backoff.
  const client = configured ? new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 1 } } }) : null;

  return {
    name: 'gemini',
    model,
    isConfigured: () => configured,

    // Startup check: is the key valid and does the model exist?
    async check() {
      if (!configured) return { ok: false, retryable: false, reason: 'GEMINI_API_KEY is not set' };
      try {
        await client.models.get({ model });
        return { ok: true };
      } catch (err) {
        const e = toProviderError(err, {});
        return { ok: false, retryable: e.retryable, reason: e.message };
      }
    },

    async generate({ systemInstruction, contents, jsonSchema }) {
      if (!configured) throw new AiProviderError('GEMINI_API_KEY is not set', { retryable: false });

      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs);
      const started = Date.now();

      try {
        const response = await client.models.generateContent({
          model,
          contents,
          config: {
            systemInstruction,
            temperature: 0, // same message → same answer, as far as possible
            responseMimeType: 'application/json',
            responseJsonSchema: jsonSchema,
            abortSignal: controller.signal,
          },
        });
        const text = response.text;
        if (!text) {
          const reason = response.promptFeedback?.blockReason ?? response.candidates?.[0]?.finishReason ?? 'unknown';
          // e.g. SAFETY block: retrying gives the same result, so a human should look.
          return { text: '', latencyMs: Date.now() - started, emptyReason: reason };
        }
        return { text, latencyMs: Date.now() - started };
      } catch (err) {
        throw toProviderError(err, { timedOut, timeoutMs });
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
