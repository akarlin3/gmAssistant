/**
 * @file rate-limit.ts
 * @description Rate limiting provider for player writeback submissions.
 * 
 * To prevent malicious flooding of the staged writeback collection and database degradation,
 * this utility throttles player clients to a maximum of 60 modifications per minute per share token.
 * 
 * Uses a token-based key structure, allowing effective protection of our unauthenticated
 * REST endpoint.
 */

import { checkRateLimit } from '../rate-limit';

// Define the sliding window rate limit rules.
// 60 requests per 1-minute (60,000ms) window is a generous limit for ordinary play,
// but prevents automated scripting from overwhelming the Firestore database write quota.
const PLAYER_WRITE_RULES = [
  { limit: 60, windowMs: 60_000 }, // 60 updates per minute
];

/**
 * Checks the current rate limit status of a player share token.
 * 
 * @param shareToken The high-entropy shareToken representing the campaign lobby
 * @returns Rate limit verification result object containing `{ ok: boolean, retryAfterMs: number }`
 */
export function checkPlayerRateLimit(shareToken: string) {
  // Keyed uniquely by player shareToken to scope rate limiting precisely per campaign instance
  return checkRateLimit(`player:${shareToken}`, PLAYER_WRITE_RULES);
}

/**
 * Evaluates the player's rate limit. If they have exceeded their quota,
 * constructs and returns a standard HTTP 429 Response.
 * 
 * @param shareToken The active campaign lobby's share token
 * @returns {Response | null} A pre-configured HTTP 429 Response if throttled, or null if allowed to proceed
 */
export function enforcePlayerRateLimit(shareToken: string): Response | null {
  const result = checkPlayerRateLimit(shareToken);
  
  // Return null if the request falls within the allowed sliding window quota
  if (result.ok) return null;

  // Convert milliseconds into an integer representing seconds for the standard HTTP header
  const retryAfterSec = Math.ceil(result.retryAfterMs / 1000);
  
  // Return an HTTP 429 Too Many Requests response with appropriate CORS/JSON headers and Retry-After interval
  return new Response(
    JSON.stringify({ error: 'Too many updates — please wait before modifying character values again.' }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        // Standard header informing the client exactly how many seconds to wait before retrying
        'Retry-After': String(retryAfterSec),
      },
    },
  );
}
