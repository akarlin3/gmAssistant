/**
 * @file allowlist.ts
 * @description Secure validation gatekeeper for the Player Write-Back Pipeline.
 * 
 * Since player clients are fully unauthenticated (holding only a high-entropy shareToken),
 * they must never be allowed to perform arbitrary writes to the database.
 * 
 * This module enforces a strict, fail-closed validation boundary:
 * 1. Schema Validation: Checks that the basic structure of the request contains valid string IDs
 *    and maps to an allowed property field name.
 * 2. Strict Type & Range Verification: Deeply parses the payload value using Zod parsers
 *    to ensure it matches exact TTRPG-appropriate constraints (e.g., negative hit points are disallowed,
 *    exhaustion levels must stay within 0-6, and array collections must be arrays of strings).
 */

import { z } from 'zod';

/**
 * Zod validation schema for incoming player-initiated PC state update payloads.
 * Exposes a strict list of fields that the player view is permitted to modify on their designated character sheet.
 * Any property path not explicitly declared in this enum will be immediately rejected with a 403 Forbidden.
 */
// The single source of truth for which PC fields a player may write back. These
// are the *player-authoritative* fields: live self-tracked sheet state during
// play. firestore.rules `isValidPlayerWriteback` mirrors this list, and the
// authored CRDT merge (lib/crdt/writeback-merge.ts) treats exactly these fields
// as player-wins on conflict — every other field is GM-authoritative.
export const PLAYER_EDITABLE_FIELDS = [
  'hp.current',          // Current hit points (non-negative integer)
  'hp.temp',             // Temporary hit points (non-negative integer)
  'conditions',          // Active status conditions (string array matching SRD values)
  'exhaustion',          // Exhaustion level (integer in [0, 6])
  'deathSaves.successes',// Death save successes (integer in [0, 3])
  'deathSaves.failures', // Death save failures (integer in [0, 3])
  'notes',               // Freeform player session notes (string)
  'goals',               // Player-defined character goals (string array)
  'bonds',               // Player character bonds (string array)
  'ideals',              // Player character ideals (string array)
  'flaws',               // Player character flaws (string array)
] as const;

export type PlayerEditableField = (typeof PLAYER_EDITABLE_FIELDS)[number];

export const PlayerUpdatePayloadSchema = z.object({
  // The unique stable identifier of the PC being modified
  pcId: z.string(),

  // The dot-separated property path to write back to the target PC object
  field: z.enum(PLAYER_EDITABLE_FIELDS),
  
  // The unvalidated raw value payload. This is typed as 'any' at this level
  // and is strictly validated on a field-by-field basis via `validatePlayerField`.
  value: z.any(),
});

export type PlayerUpdatePayload = z.infer<typeof PlayerUpdatePayloadSchema>;

/**
 * Validates the value payload for a specific allowed property field.
 * Enforces strict, type-safe rules and range constraints tailored to each PC sheet statistic.
 * 
 * @param field The target dot-path field name (must be one of the enum values in PlayerUpdatePayloadSchema)
 * @param value The value supplied in the update request
 * @returns {boolean} True if the value strictly satisfies all type and range invariants, false otherwise (fail-closed)
 */
export function validatePlayerField(field: string, value: unknown): boolean {
  switch (field) {
    case 'hp.current':
      // Current hit points must be a valid non-negative integer (players cannot set negative HP values directly)
      return z.number().int().nonnegative().safeParse(value).success;
      
    case 'hp.temp':
      // Temporary hit points must also be a non-negative integer
      return z.number().int().nonnegative().safeParse(value).success;
      
    case 'conditions':
      // Conditions must be formatted as an array of strings (individual condition keys validated dynamically at save/merge)
      return z.array(z.string()).safeParse(value).success;
      
    case 'exhaustion':
      // D&D 5e exhaustion levels strictly reside inside the [0, 6] range (where 6 indicates death)
      return z.number().int().min(0).max(6).safeParse(value).success;
      
    case 'deathSaves.successes':
      // Death save successes can only stack up to a maximum of 3
      return z.number().int().min(0).max(3).safeParse(value).success;
      
    case 'deathSaves.failures':
      // Death save failures can only stack up to a maximum of 3
      return z.number().int().min(0).max(3).safeParse(value).success;
      
    case 'notes':
      // Freeform player notes must be a clean string
      return z.string().safeParse(value).success;
      
    case 'goals':
    case 'bonds':
    case 'ideals':
    case 'flaws':
      // List fields represent string arrays mapping character traits or aspirations
      return z.array(z.string()).safeParse(value).success;
      
    default:
      // Fail-closed for any path that falls outside our switch statement mapping
      return false;
  }
}
