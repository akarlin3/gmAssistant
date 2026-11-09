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
  // Vitals & Combat Resources
  'hp.current',          // Current hit points (non-negative integer)
  'hp.max',              // Maximum hit points (positive integer)
  'hp.temp',             // Temporary hit points (non-negative integer)
  'hitDice',             // Full hit dice object ({ dieSize, max, used })
  'hitDice.dieSize',     // Hit die size (4, 6, 8, 10, 12)
  'hitDice.max',         // Max hit dice (non-negative integer)
  'hitDice.used',        // Expended hit dice (non-negative integer)
  'conditions',          // Active status conditions (string array)
  'exhaustion',          // Exhaustion level (integer in [0, 6])
  'deathSaves',          // Full death saves object ({ successes, failures })
  'deathSaves.successes',// Death save successes (integer in [0, 3])
  'deathSaves.failures', // Death save failures (integer in [0, 3])
  'inspiration',         // Heroic inspiration toggle (boolean)
  'ac',                  // Armor Class (integer in [0, 50])
  'speed',               // Movement speed in feet (non-negative integer)
  'initiativeMod',       // Initiative modifier (integer in [-20, 30])

  // Class & Spell Resources
  'spellSlots',          // Spell slot pips (array of { level: 1..9, max, used })
  'pactSlots',           // Warlock Pact Magic slots ({ level: 1..9, max, used })
  'resourcePools',       // Trackable class/feat resource pools
  'features',            // Class features & resource charges

  // Inventory, Currency & Attunement
  'inventory',           // Personal equipment list
  'attunedCount',        // Attunement slots used (integer in [0, 3])
  'currency',            // Coin purse ({ cp, sp, ep, gp, pp })
  'partyLoot',           // Party loot / unclaimed scratchpad (string)

  // Freeform & Roleplay Traits
  'notes',               // Freeform player session notes (string)
  'goals',               // Player-defined character goals (string array)
  'bonds',               // Player character bonds (string array)
  'ideals',              // Player character ideals (string array)
  'flaws',               // Player character flaws (string array)

  // Opt-In Shared Tracker Slices (strictly filtered to sharedWithGm === true)
  'sharedQuests',        // Player quests explicitly shared with GM
  'sharedAnnotations',   // Per-entity player lore annotations explicitly shared with GM
  'sharedJournal',       // Player session journal entries explicitly shared with GM
  'sharedTombstones',    // Tombstones for previously shared items toggled back to private

  // Table HUD & Companion State
  'turnEconomy',         // Action economy checklist for current turn
  'concentrationSpell',  // Active concentration spell name (string)
  'downtimeDays',        // Tracked downtime days (non-negative integer)
  'renown',              // Tracked renown score (integer)
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

const HitDiceSchema = z.object({
  dieSize: z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10), z.literal(12)]),
  max: z.number().int().min(0).max(40),
  used: z.number().int().min(0).max(40),
});

const DeathSavesSchema = z.object({
  successes: z.number().int().min(0).max(3),
  failures: z.number().int().min(0).max(3),
});

const SpellSlotSchema = z.object({
  level: z.number().int().min(1).max(9),
  max: z.number().int().min(0).max(20),
  used: z.number().int().min(0).max(20),
});

const ResourcePoolSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  current: z.number().int().min(0),
  max: z.number().int().min(0),
  rechargeOn: z.enum(['short', 'long', 'dawn', 'manual']),
});

const FeatureSchema = z.object({
  name: z.string(),
  source: z.string().optional(),
  description: z.string().optional(),
  usesMax: z.number().int().min(0).optional(),
  usesRemaining: z.number().int().min(0).optional(),
  recharge: z.enum(['short', 'long', 'dawn', 'other']).optional(),
});

const InventoryItemSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  qty: z.number().min(0),
  equipped: z.boolean().optional(),
  attuned: z.boolean().optional(),
  weight: z.number().min(0).optional(),
  notes: z.string().optional(),
  sharedWithGm: z.boolean().optional(),
});

const CoinPurseSchema = z.object({
  cp: z.number().int().min(0),
  sp: z.number().int().min(0),
  ep: z.number().int().min(0),
  gp: z.number().int().min(0),
  pp: z.number().int().min(0),
});

const PlayerQuestSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  status: z.enum(['active', 'completed', 'failed']),
  notes: z.string(),
  linkedEntityIds: z.array(z.string()),
  sharedWithGm: z.boolean(),
  category: z.enum(['quest', 'goal', 'rumor', 'mystery']).optional(),
  updatedAt: z.number().optional(),
});

const PlayerLoreAnnotationSchema = z.object({
  id: z.string().min(1),
  entityId: z.string().min(1),
  entityName: z.string().optional(),
  entityCategory: z.string().optional(),
  attitudeTag: z.enum(['friendly', 'neutral', 'suspicious', 'hostile']).optional(),
  privateNotes: z.string(),
  sharedNotes: z.string().optional(),
  sharedWithGm: z.boolean(),
  updatedAt: z.number().optional(),
});

const PlayerJournalEntrySchema = z.object({
  id: z.string().min(1),
  sessionNumber: z.number().int().min(0),
  date: z.string(),
  title: z.string(),
  content: z.string(),
  sharedWithGm: z.boolean(),
  linkedEntityIds: z.array(z.string()).optional(),
  updatedAt: z.number().optional(),
});

const TombstoneSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(['quest', 'annotation', 'journal']),
  deletedAt: z.number(),
});

const TurnEconomySchema = z.object({
  actionUsed: z.boolean(),
  bonusActionUsed: z.boolean(),
  movementUsed: z.boolean(),
  reactionUsed: z.boolean(),
  freeInteractionUsed: z.boolean(),
});

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
    case 'hp.temp':
      return z.number().int().nonnegative().safeParse(value).success;

    case 'hp.max':
      return z.number().int().min(1).max(9999).safeParse(value).success;

    case 'hitDice':
      return HitDiceSchema.safeParse(value).success;

    case 'hitDice.dieSize':
      return z.union([z.literal(4), z.literal(6), z.literal(8), z.literal(10), z.literal(12)]).safeParse(value).success;

    case 'hitDice.max':
    case 'hitDice.used':
      return z.number().int().min(0).max(40).safeParse(value).success;

    case 'conditions':
      return z.array(z.string()).safeParse(value).success;

    case 'exhaustion':
      return z.number().int().min(0).max(6).safeParse(value).success;

    case 'deathSaves':
      return DeathSavesSchema.safeParse(value).success;

    case 'deathSaves.successes':
    case 'deathSaves.failures':
      return z.number().int().min(0).max(3).safeParse(value).success;

    case 'inspiration':
      return z.boolean().safeParse(value).success;

    case 'ac':
      return z.number().int().min(0).max(50).safeParse(value).success;

    case 'speed':
      return z.number().int().min(0).max(999).safeParse(value).success;

    case 'initiativeMod':
      return z.number().int().min(-20).max(30).safeParse(value).success;

    case 'spellSlots':
      return z.array(SpellSlotSchema).safeParse(value).success;

    case 'pactSlots':
      return z.union([SpellSlotSchema, z.null()]).safeParse(value).success;

    case 'resourcePools':
      return z.array(ResourcePoolSchema).safeParse(value).success;

    case 'features':
      return z.array(FeatureSchema).safeParse(value).success;

    case 'inventory':
      return z.array(InventoryItemSchema).safeParse(value).success;

    case 'attunedCount':
      return z.number().int().min(0).max(3).safeParse(value).success;

    case 'currency':
      return CoinPurseSchema.safeParse(value).success;

    case 'partyLoot':
    case 'notes':
    case 'concentrationSpell':
      return z.string().safeParse(value).success;

    case 'goals':
    case 'bonds':
    case 'ideals':
    case 'flaws':
      return z.array(z.string()).safeParse(value).success;

    case 'sharedQuests':
      return z.array(PlayerQuestSchema).safeParse(value).success;

    case 'sharedAnnotations':
      return z.array(PlayerLoreAnnotationSchema).safeParse(value).success;

    case 'sharedJournal':
      return z.array(PlayerJournalEntrySchema).safeParse(value).success;

    case 'sharedTombstones':
      return z.array(TombstoneSchema).safeParse(value).success;

    case 'turnEconomy':
      return TurnEconomySchema.safeParse(value).success;

    case 'downtimeDays':
      return z.number().int().min(0).max(99999).safeParse(value).success;

    case 'renown':
      return z.number().int().min(-999).max(9999).safeParse(value).success;

    default:
      // Fail-closed for any path that falls outside our switch statement mapping
      return false;
  }
}

