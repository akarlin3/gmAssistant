// Daily turn cap for the Campaign Assistant (50 turns/day per Pro user).
//
// This reuses the in-memory limiter from lib/rate-limit (the app has no shared
// Redis; the Admin SDK / Firestore-admin approach in the spec's Appendix E
// isn't available because the org policy blocks service-account keys here). A
// per-process daily bucket is a sufficient bill guardrail, consistent with how
// the Scene/Vivify routes are protected. The standard burst rules still apply
// on top via enforceRateLimit in the route.

import { checkRateLimit } from '../rate-limit';

export const ASSISTANT_DAILY_LIMIT = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

export type AssistantLimitResult = { ok: true; remaining: number } | { ok: false };

export function checkAssistantDailyLimit(uid: string): AssistantLimitResult {
  const rule = { limit: ASSISTANT_DAILY_LIMIT, windowMs: DAY_MS };
  const res = checkRateLimit(`uid:${uid}:assistant:day`, [rule]);
  if (!res.ok) return { ok: false };
  return { ok: true, remaining: -1 };
}

// Returns a ready 429 Response when the user is over the daily cap, else null.
export function enforceAssistantDailyLimit(uid: string): Response | null {
  const res = checkAssistantDailyLimit(uid);
  if (res.ok) return null;
  return new Response(
    JSON.stringify({
      error: `Daily limit reached (${ASSISTANT_DAILY_LIMIT} turns/day). Resets at UTC midnight.`,
    }),
    { status: 429, headers: { 'Content-Type': 'application/json' } },
  );
}
