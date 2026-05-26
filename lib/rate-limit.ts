// In-memory, per-process rate limiter for the paid LLM routes.
//
// Why in-memory: this app deploys to Railway without a shared Redis, and the
// goal here is a cheap guardrail against a single account (or a leaked ID
// token) hammering the Anthropic-backed endpoints and running up a bill — not
// distributed fairness. Limits are enforced per server instance; if multiple
// instances run, the effective ceiling is `limit × instances`, which is still
// a hard cap. Anthropic-side spend limits remain the backstop.

export type RateRule = { limit: number; windowMs: number };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// Default budget applied to every AI route: bursty within a minute, capped
// over an hour. Tuned for a solo GM clicking "generate" repeatedly, not bots.
export const DEFAULT_RULES: RateRule[] = [
  { limit: 20, windowMs: MINUTE },
  { limit: 200, windowMs: HOUR },
];

type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();

let lastSweep = 0;
function sweepExpired(now: number) {
  if (now - lastSweep < MINUTE) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    if (now >= b.resetAt) buckets.delete(k);
  }
}

export type RateLimitResult = { ok: true } | { ok: false; retryAfterMs: number };

export function checkRateLimit(key: string, rules: RateRule[] = DEFAULT_RULES): RateLimitResult {
  const now = Date.now();
  sweepExpired(now);

  // First pass: would any window be exceeded? Evaluate before mutating so a
  // request blocked by the hourly window doesn't consume the minute window.
  let retryAfterMs = 0;
  for (const rule of rules) {
    const b = buckets.get(`${key}:${rule.windowMs}`);
    if (b && now < b.resetAt && b.count >= rule.limit) {
      retryAfterMs = Math.max(retryAfterMs, b.resetAt - now);
    }
  }
  if (retryAfterMs > 0) return { ok: false, retryAfterMs };

  // Second pass: commit the increment across every window.
  for (const rule of rules) {
    const bk = `${key}:${rule.windowMs}`;
    const b = buckets.get(bk);
    if (!b || now >= b.resetAt) {
      buckets.set(bk, { count: 1, resetAt: now + rule.windowMs });
    } else {
      b.count += 1;
    }
  }
  return { ok: true };
}

// Convenience for route handlers: returns a ready 429 Response when the user
// is over budget, or null to proceed. Keyed by uid so limits are per-account.
export function enforceRateLimit(uid: string, rules?: RateRule[]): Response | null {
  const result = checkRateLimit(`uid:${uid}`, rules);
  if (result.ok) return null;
  const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
  return new Response(
    JSON.stringify({ error: 'Too many requests — slow down and try again in a moment.' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSec),
      },
    },
  );
}

// Test-only: reset internal state between cases.
export function __resetRateLimitForTests() {
  buckets.clear();
  lastSweep = 0;
}
