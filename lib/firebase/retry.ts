/**
 * Firestore retry utility with exponential backoff and jitter.
 *
 * Retries on transient Firestore errors (quota-exceeded, unavailable,
 * aborted, deadline-exceeded). Does NOT retry on permanent errors
 * (not-found, permission-denied, already-exists, invalid-argument).
 */

const TRANSIENT_CODES = new Set([
  'resource-exhausted', // quota exceeded
  'unavailable',
  'aborted',
  'deadline-exceeded',
]);

const PERMANENT_CODES = new Set([
  'not-found',
  'permission-denied',
  'already-exists',
  'invalid-argument',
]);

function isTransient(err: unknown): boolean {
  const code = (err as any)?.code as string | undefined;
  if (!code) return false;
  // Firebase error codes may be prefixed like "firestore/unavailable"
  const bare = code.includes('/') ? code.split('/').pop()! : code;
  if (PERMANENT_CODES.has(bare)) return false;
  return TRANSIENT_CODES.has(bare);
}

/**
 * Executes `operation`, retrying up to `maxAttempts` times on transient
 * Firestore errors using exponential backoff with jitter.
 *
 * Backoff formula: 300ms * 2^attempt + random(0, 200)ms
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 300,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;

      // Do not retry on permanent errors
      if (!isTransient(err)) {
        throw err;
      }

      // If this was the last attempt, stop
      if (attempt === maxAttempts - 1) {
        break;
      }

      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 50;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
