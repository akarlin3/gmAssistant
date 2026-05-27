// Monthly generation cap for AI battle-map generation.
//
// Mirrors lib/rate-limit.ts (in-memory, per-process) but buckets by calendar
// month with a hard ceiling of 10 generations per Pro user. Same tradeoff as the
// Assistant limiter: per-instance and reset on restart, so it's a cost guardrail
// against runaway usage, not distributed accounting. OpenAI-side spend limits
// remain the backstop.

export const MAP_GEN_MONTHLY_LIMIT = 10;

type MonthBucket = { month: string; count: number };
const buckets = new Map<string, MonthBucket>();

function monthKey(now: number): string {
  const d = new Date(now);
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
}

export type MapGenResult = { ok: true; remaining: number } | { ok: false; remaining: 0 };

// Atomically check the cap and, when under it, record one generation. Returns
// whether the call is allowed and how many generations remain this month.
export function checkAndIncrementMapGen(
  uid: string,
  now: number = Date.now(),
  limit: number = MAP_GEN_MONTHLY_LIMIT,
): MapGenResult {
  const month = monthKey(now);
  const existing = buckets.get(uid);
  const bucket = existing && existing.month === month ? existing : { month, count: 0 };

  if (bucket.count >= limit) {
    buckets.set(uid, bucket);
    return { ok: false, remaining: 0 };
  }
  bucket.count += 1;
  buckets.set(uid, bucket);
  return { ok: true, remaining: limit - bucket.count };
}

// Test-only: reset internal state between cases.
export function __resetMapGenForTests() {
  buckets.clear();
}
