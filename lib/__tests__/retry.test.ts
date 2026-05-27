import { test, describe } from 'node:test';
import assert from 'node:assert';
import { withRetry } from '../firebase/retry.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTransientError(code: string): Error {
  const err = new Error(`Firestore error: ${code}`) as Error & { code: string };
  err.code = code;
  return err;
}

function makePermanentError(code: string): Error {
  const err = new Error(`Firestore error: ${code}`) as Error & { code: string };
  err.code = code;
  return err;
}

// Pass baseDelayMs=0 so retries are near-instant in tests (eliminates the
// exponential backoff wait while preserving the retry logic under test).
const NO_DELAY = 0;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('withRetry', () => {
  test('resolves immediately when the operation succeeds on the first try', async () => {
    let callCount = 0;
    const result = await withRetry(async () => {
      callCount++;
      return 'ok';
    }, 3, NO_DELAY);
    assert.strictEqual(result, 'ok');
    assert.strictEqual(callCount, 1);
  });

  test('retries on a transient error and resolves when the operation eventually succeeds', async () => {
    let callCount = 0;
    const transient = makeTransientError('unavailable');
    const result = await withRetry(async () => {
      callCount++;
      if (callCount === 1) throw transient;
      return 'recovered';
    }, 3, NO_DELAY);
    assert.strictEqual(result, 'recovered');
    assert.strictEqual(callCount, 2);
  });

  test('does NOT retry and throws immediately on a permanent error (permission-denied)', async () => {
    let callCount = 0;
    const permanent = makePermanentError('permission-denied');
    await assert.rejects(
      withRetry(async () => {
        callCount++;
        throw permanent;
      }, 3, NO_DELAY),
      /permission-denied/,
    );
    assert.strictEqual(callCount, 1);
  });

  test('does NOT retry on other permanent error codes', async () => {
    for (const code of ['not-found', 'already-exists', 'invalid-argument']) {
      let callCount = 0;
      const permanent = makePermanentError(code);
      await assert.rejects(
        withRetry(async () => {
          callCount++;
          throw permanent;
        }, 3, NO_DELAY),
        new RegExp(code),
      );
      assert.strictEqual(callCount, 1, `expected 1 call for permanent code '${code}'`);
    }
  });

  test('throws the last error after exhausting all retry attempts on transient errors', async () => {
    let callCount = 0;
    const transient = makeTransientError('deadline-exceeded');
    await assert.rejects(
      withRetry(async () => {
        callCount++;
        throw transient;
      }, 3, NO_DELAY),
      /deadline-exceeded/,
    );
    assert.strictEqual(callCount, 3);
  });

  test('retries on resource-exhausted (quota exceeded) transient error', async () => {
    let callCount = 0;
    const transient = makeTransientError('resource-exhausted');
    const result = await withRetry(async () => {
      callCount++;
      if (callCount < 3) throw transient;
      return 'done';
    }, 3, NO_DELAY);
    assert.strictEqual(result, 'done');
    assert.strictEqual(callCount, 3);
  });

  test('handles prefixed Firebase error codes like "firestore/unavailable"', async () => {
    let callCount = 0;
    const prefixed = makeTransientError('firestore/unavailable');
    const result = await withRetry(async () => {
      callCount++;
      if (callCount === 1) throw prefixed;
      return 'ok';
    }, 3, NO_DELAY);
    assert.strictEqual(result, 'ok');
    assert.strictEqual(callCount, 2);
  });
});
