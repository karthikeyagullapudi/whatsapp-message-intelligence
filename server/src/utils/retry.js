export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Exponential backoff: base, 2×base, 4×base … capped at `max`.
export function backoffDelay(attempt, { base = 5000, max = 5 * 60 * 1000 } = {}) {
  return Math.min(base * 2 ** attempt, max);
}

// Runs `fn` until it succeeds or `retries` attempts are used up.
export async function retry(fn, { retries = 5, base = 1000, max = 30000, onError } = {}) {
  let lastError;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      onError?.(err, attempt);
      if (attempt < retries - 1) await sleep(backoffDelay(attempt, { base, max }));
    }
  }
  throw lastError;
}
