import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import { checkRateLimit, __resetRateLimitForTests, type RateRule } from '../rate-limit';

describe('checkRateLimit', () => {
  beforeEach(() => {
    __resetRateLimitForTests();
  });

  test('allows requests under the limit', () => {
    const rules: RateRule[] = [{ limit: 3, windowMs: 60_000 }];
    assert.strictEqual(checkRateLimit('a', rules).ok, true);
    assert.strictEqual(checkRateLimit('a', rules).ok, true);
    assert.strictEqual(checkRateLimit('a', rules).ok, true);
  });

  test('blocks once the limit is reached and reports retryAfterMs', () => {
    const rules: RateRule[] = [{ limit: 2, windowMs: 60_000 }];
    checkRateLimit('b', rules);
    checkRateLimit('b', rules);
    const blocked = checkRateLimit('b', rules);
    assert.strictEqual(blocked.ok, false);
    if (!blocked.ok) {
      assert.ok(blocked.retryAfterMs > 0);
      assert.ok(blocked.retryAfterMs <= 60_000);
    }
  });

  test('keys are isolated per identifier', () => {
    const rules: RateRule[] = [{ limit: 1, windowMs: 60_000 }];
    assert.strictEqual(checkRateLimit('user-1', rules).ok, true);
    assert.strictEqual(checkRateLimit('user-1', rules).ok, false);
    // A different key has its own budget.
    assert.strictEqual(checkRateLimit('user-2', rules).ok, true);
  });

  test('a blocked outer window does not consume an inner window', () => {
    // hourly limit already exhausted, minute limit fresh
    const rules: RateRule[] = [
      { limit: 5, windowMs: 60_000 },
      { limit: 1, windowMs: 3_600_000 },
    ];
    assert.strictEqual(checkRateLimit('c', rules).ok, true); // uses 1/1 hour, 1/5 min
    const blocked = checkRateLimit('c', rules);
    assert.strictEqual(blocked.ok, false); // blocked by hour window

    // The minute window should still have budget left (not double-counted):
    // switch to a minute-only rule for the same key and confirm 4 more allowed.
    const minuteOnly: RateRule[] = [{ limit: 5, windowMs: 60_000 }];
    for (let i = 0; i < 4; i++) {
      assert.strictEqual(checkRateLimit('c', minuteOnly).ok, true);
    }
    assert.strictEqual(checkRateLimit('c', minuteOnly).ok, false);
  });
});
