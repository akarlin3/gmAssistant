// Conversational Campaign & Table Customizer Compiler (`lib/workspaceConfigCompiler.ts`)
//
// Defines the strictly validated `CampaignWorkspacePatch` schema, CRDT & privacy
// authority gatekeeper (`validateWorkspacePatch`), diff preview generator,
// campaign/local/player patch applicators with 1-tap Undo snapshots, local HUD
// layout preference storage, and the 3-tier NL compilation pipeline:
//   1. Cloud Pro Structured JSON Proxy (`/api/workspace-architect`)
//   2. Chrome Built-in On-Device `LanguageModel` API fallback
//   3. Copy/Paste Gemini Relay + Instant Offline Natural-Language Compiler

import { z } from 'zod';
import {
  ALL_TARGET_KEYS,
  OVERRIDES_STATE_KEY,
  TARGETS,
  type PrepTargetKey,
  type PrepTargetOverride,
  type PrepTargetOverrides,
} from '@/lib/prepTargets';
import {
  PLAYER_EDITABLE_FIELDS,
  validatePlayerField,
  type PlayerEditableField,
} from '@/lib/player/allowlist';
import { redactSpoilers } from '@/lib/playerMode/spoilers';
import {
  reconcileTrackerSharingTransition,
  serializeOutboundTrackerWriteback,
  type PlayerLocalTrackerState,
} from '@/lib/playerMode/playerTrackerStorage';
import { sanitizeRollEventsForOutbound } from '@/lib/diceRoller';
import type {
  ActiveBuff,
  PcResourcePool,
  PlayerCharacter,
  RechargeTiming,
} from '@/lib/pc/types';

// ---------------------------------------------------------------------------
// 1. Canonical Constants & Types
// ---------------------------------------------------------------------------

export const WORKSPACE_CONFIG_STATE_KEY = '__workspaceConfig' as const;
export const HUD_PREFS_EVENT_NAME = 'gma:hud-prefs-updated' as const;

export const CAMPAIGN_MODE_OPTIONS = ['standard', 'duet', 'solo', 'player'] as const;
export type CampaignModeOption = (typeof CAMPAIGN_MODE_OPTIONS)[number];

export const HUD_WIDGET_IDS = [
  'initiative',
  'rollFeed',
  'clocks',
  'audioNarration',
  'actionEconomy',
  'conspiracyBoard',
] as const;
export type HudWidgetId = (typeof HUD_WIDGET_IDS)[number];

export const HUD_WIDGET_LABELS: Record<HudWidgetId, string> = {
  initiative: 'Initiative HUD',
  rollFeed: 'Roll Feed',
  clocks: 'Progress Clocks',
  audioNarration: 'Audio / Narration',
  actionEconomy: 'Action Economy',
  conspiracyBoard: 'Conspiracy / Investigation Board',
};

export const HUD_DENSITY_OPTIONS = ['compact', 'comfortable', 'spacious'] as const;
export type HudDensity = (typeof HUD_DENSITY_OPTIONS)[number];

export const RECHARGE_TIMING_OPTIONS = ['short', 'long', 'dawn', 'manual'] as const;

export const BUFF_EXPIRY_OPTIONS = [
  'turn',
  'round',
  'shortRest',
  'longRest',
  'manual',
] as const;
export type SafeBuffExpiry = (typeof BUFF_EXPIRY_OPTIONS)[number];

export const CANONICAL_TERMINOLOGY_KEYS = [
  'quests',
  'dungeons',
  'gold',
  'npcs',
  'locations',
  'factions',
  'secrets',
  'clocks',
  'encounters',
  'monsters',
  'items',
  'sessions',
] as const;
export type CanonicalTerminologyKey = (typeof CANONICAL_TERMINOLOGY_KEYS)[number];

export const DEFAULT_TERMINOLOGY_LABELS: Record<CanonicalTerminologyKey, string> = {
  quests: 'Quests',
  dungeons: 'Dungeons',
  gold: 'Gold',
  npcs: 'NPCs',
  locations: 'Locations',
  factions: 'Factions',
  secrets: 'Secrets',
  clocks: 'Clocks',
  encounters: 'Encounters',
  monsters: 'Monsters',
  items: 'Items',
  sessions: 'Sessions',
};

export const PREP_TARGET_KEYS_WITH_ALIASES = [
  'gWorld',
  'gFNL',
  'lines',
  'facts',
  'factions',
  'conflicts',
  'pcGoals',
  'strongStart',
  'scenes',
  'secrets',
  'locations',
  'npcs',
  'monsters',
  'encounters',
  'items',
  'clocks',
] as const;
export type PrepTargetPatchKey = (typeof PREP_TARGET_KEYS_WITH_ALIASES)[number];

const VALID_PREP_TARGET_KEYS = new Set<PrepTargetKey>(ALL_TARGET_KEYS);

/** Forbidden prototype-pollution and GM-redacted keys that must never pass validation or leak. */
const FORBIDDEN_OR_REDACTED_KEYS = new Set<string>([
  '__proto__',
  'constructor',
  'prototype',
  'gmNotes',
  'gmSecrets',
  'gmSpoiler',
  'gmOnly',
  'secretNotes',
  'entityVisibility',
  'planningVisibility',
  'tokenHash',
  'tokenSalt',
  'fieldOverrides',
]);

// ---------------------------------------------------------------------------
// 2. Zod Schemas + TypeScript Types for `CampaignWorkspacePatch`
// ---------------------------------------------------------------------------

const clampInt = (val: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, Math.round(val)));

export const PrepTargetScaleOverrideSchema = z
  .object({
    standard: z.number().min(0).max(99).optional(),
    duet: z.number().min(0).max(99).optional(),
    solo: z.number().min(0).max(99).optional(),
  })
  .strict();

export const PrepTargetOverrideValueSchema = z.union([
  z.number().min(0).max(99),
  PrepTargetScaleOverrideSchema,
]);

export const CampaignModePatchSchema = z
  .object({
    mode: z.enum(CAMPAIGN_MODE_OPTIONS).optional(),
    prepTargetOverrides: z
      .record(z.string(), PrepTargetOverrideValueSchema)
      .optional(),
  })
  .strict();

export type CampaignModePatch = z.infer<typeof CampaignModePatchSchema>;

export const ResourcePoolTemplateSchema = z
  .object({
    id: z.string().min(1).max(64).optional(),
    name: z.string().trim().min(1).max(60),
    max: z.number().min(1).max(999),
    rechargeOn: z.enum(RECHARGE_TIMING_OPTIONS),
  })
  .strict();

export type ResourcePoolTemplate = z.infer<typeof ResourcePoolTemplateSchema>;

export const ConditionBuffPresetSchema = z
  .object({
    id: z.string().min(1).max(64).optional(),
    presetKey: z.string().min(1).max(64).optional(),
    name: z.string().trim().min(1).max(60),
    description: z.string().trim().max(240).optional(),
    acBonus: z.number().int().min(-20).max(20).optional(),
    speedBonus: z.number().int().min(-60).max(120).optional(),
    speedMultiplier: z.number().min(0).max(10).optional(),
    saveBonusFormula: z.string().trim().max(32).optional(),
    attackBonusFormula: z.string().trim().max(32).optional(),
    checkBonusFormula: z.string().trim().max(32).optional(),
    damageBonusFormula: z.string().trim().max(32).optional(),
    rollModeOverride: z.enum(['normal', 'advantage', 'disadvantage']).optional(),
    affectsChecks: z.boolean().optional(),
    affectsAttacks: z.boolean().optional(),
    affectsSaves: z.boolean().optional(),
    expiresOn: z.enum(BUFF_EXPIRY_OPTIONS).optional(),
  })
  .strict();

export type ConditionBuffPreset = z.infer<typeof ConditionBuffPresetSchema>;

export const SystemFlavorAndTrackersSchema = z
  .object({
    genre: z.string().trim().min(1).max(80).optional(),
    toneTags: z.array(z.string().trim().min(1).max(40)).max(16).optional(),
    resourcePoolTemplates: z.array(ResourcePoolTemplateSchema).max(20).optional(),
    conditionBuffPresets: z.array(ConditionBuffPresetSchema).max(24).optional(),
    clockCategories: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  })
  .strict();

export type SystemFlavorAndTrackers = z.infer<typeof SystemFlavorAndTrackersSchema>;

export const TerminologyMapSchema = z.record(
  z.string().trim().min(1).max(48),
  z.string().trim().min(1).max(48),
);

export type TerminologyMap = z.infer<typeof TerminologyMapSchema>;

export const HudWidgetPrefSchema = z
  .object({
    visible: z.boolean().optional(),
    order: z.number().int().min(0).max(50).optional(),
    pinnedTop: z.boolean().optional(),
  })
  .strict();

export type HudWidgetPref = z.infer<typeof HudWidgetPrefSchema>;

export const HudLayoutPrefsSchema = z
  .object({
    density: z.enum(HUD_DENSITY_OPTIONS).optional(),
    widgets: z
      .object({
        initiative: HudWidgetPrefSchema.optional(),
        rollFeed: HudWidgetPrefSchema.optional(),
        clocks: HudWidgetPrefSchema.optional(),
        audioNarration: HudWidgetPrefSchema.optional(),
        actionEconomy: HudWidgetPrefSchema.optional(),
        conspiracyBoard: HudWidgetPrefSchema.optional(),
      })
      .strict()
      .optional(),
    widgetOrder: z.array(z.enum(HUD_WIDGET_IDS)).max(12).optional(),
  })
  .strict();

export type HudLayoutPrefs = z.infer<typeof HudLayoutPrefsSchema>;

/** Optional per-PC patch proposals (strictly gated by ownership + allowlist). */
export const ProposedPcPatchSchema = z
  .object({
    pcId: z.string().min(1),
    updates: z.record(z.string(), z.unknown()),
  })
  .strict();

export type ProposedPcPatch = z.infer<typeof ProposedPcPatchSchema>;

/** Optional local player tracker patch proposals (strictly gated against unconfirmed `sharedWithGm` flips). */
export const ProposedTrackerPatchSchema = z
  .object({
    quests: z.array(z.record(z.string(), z.unknown())).optional(),
    annotations: z
      .union([
        z.array(z.record(z.string(), z.unknown())),
        z.record(z.string(), z.record(z.string(), z.unknown())),
      ])
      .optional(),
    journal: z.array(z.record(z.string(), z.unknown())).optional(),
    theoryLinks: z.array(z.record(z.string(), z.unknown())).optional(),
    stickyCards: z.array(z.record(z.string(), z.unknown())).optional(),
  })
  .strict();

export type ProposedTrackerPatch = z.infer<typeof ProposedTrackerPatchSchema>;

export const WORKSPACE_HOUSE_RULE_CATEGORIES = [
  'combat',
  'exploration',
  'social',
  'resting',
  'magic',
  'gritty_survival',
  'custom',
] as const;

export const WORKSPACE_PILLAR_OPTIONS = [
  'combat',
  'exploration',
  'social',
  'mystery',
  'intrigue',
  'worldbuilding',
  'craft',
] as const;

export const WORKSPACE_CHANNEL_OPTIONS = [
  'initiative',
  'rollFeed',
  'clocks',
  'audioNarration',
  'actionEconomy',
  'conspiracyBoard',
  'whispers',
  'houseRules',
  'prepNotes',
  'deepPrep',
  'worldbuilding',
  'encounterDesign',
  'Guitar',
  'Reading',
  'Writing',
] as const;

export const WORKSPACE_LOAD_MODE_OPTIONS = [
  'Tier 1',
  'Tier 2',
  'Tier 3',
  'Cruise',
  'Surge',
  'Recovery',
] as const;

export const HouseRulePatchEntrySchema = z
  .object({
    id: z.string().trim().min(1).max(64),
    title: z.string().trim().min(1).max(80),
    category: z.enum(WORKSPACE_HOUSE_RULE_CATEGORIES),
    ruleText: z.string().trim().min(3).max(500),
    mechanicalSummary: z.string().trim().max(160).optional(),
    enabled: z.boolean().default(true),
    op: z.enum(['upsert', 'disable']).optional(),
  })
  .strict();

export type HouseRulePatchEntry = z.infer<typeof HouseRulePatchEntrySchema>;

export const WorkflowChannelPatchSchema = z
  .object({
    key: z.enum(WORKSPACE_CHANNEL_OPTIONS),
    sticky: z.boolean(),
    pillar: z.enum(WORKSPACE_PILLAR_OPTIONS).optional(),
    blockMinutes: z.number().int().min(5).max(60).optional(),
  })
  .strict();

export type WorkflowChannelPatch = z.infer<typeof WorkflowChannelPatchSchema>;

export const WorkflowPatchSchema = z
  .object({
    blockDurationMinutes: z.number().int().min(5).max(60).optional(),
    cruiseCeilingBlocks: z.number().int().min(1).max(24).optional(),
    surgeCeilingBlocks: z.number().int().min(1).max(32).optional(),
    loadMode: z.enum(WORKSPACE_LOAD_MODE_OPTIONS).optional(),
    restVariant: z
      .enum(['standard_5e', 'gritty_realism', 'heroic', 'custom'])
      .optional(),
    activePillars: z.array(z.enum(WORKSPACE_PILLAR_OPTIONS)).min(1).max(7).optional(),
    channels: z.array(WorkflowChannelPatchSchema).min(1).max(15).optional(),
    autoSnapshotIntervalMinutes: z.number().int().min(5).max(60).optional(),
  })
  .strict();

export type WorkflowPatch = z.infer<typeof WorkflowPatchSchema>;

export const CampaignWorkspacePatchSchema = z
  .object({
    campaignMode: CampaignModePatchSchema.optional(),
    workflow: WorkflowPatchSchema.optional(),
    houseRules: z.array(HouseRulePatchEntrySchema).min(1).max(25).optional(),
    systemFlavorAndTrackers: SystemFlavorAndTrackersSchema.optional(),
    terminologyMap: TerminologyMapSchema.optional(),
    hudLayoutPrefs: HudLayoutPrefsSchema.optional(),
    pcPatches: z.array(ProposedPcPatchSchema).max(16).optional(),
    trackerPatch: ProposedTrackerPatchSchema.optional(),
  })
  .strict();

export type CampaignWorkspacePatch = z.infer<typeof CampaignWorkspacePatchSchema>;

export const FollowUpOptionChipSchema = z
  .object({
    id: z.string().min(1).max(64),
    label: z.string().trim().min(1).max(90),
    description: z.string().trim().max(180).optional(),
    promptReply: z.string().trim().min(1).max(320),
    patchOverride: CampaignWorkspacePatchSchema.optional(),
  })
  .strict();

export type FollowUpOptionChip = z.infer<typeof FollowUpOptionChipSchema>;

export const ArchitectTurnResponseSchema = z
  .object({
    reply: z.string().trim().min(1).max(1500),
    patch: CampaignWorkspacePatchSchema,
    followUpOptions: z.array(FollowUpOptionChipSchema).max(4).optional(),
  })
  .strict();

export type ArchitectTurnResponse = z.infer<typeof ArchitectTurnResponseSchema>;

export type StoredWorkspaceConfig = {
  workflow?: WorkflowPatch;
  houseRules?: HouseRulePatchEntry[];
  systemFlavorAndTrackers?: SystemFlavorAndTrackers;
  terminologyMap?: TerminologyMap;
  updatedAtMs?: number;
};

export type ProjectedWorkspaceConfig = {
  houseRules?: HouseRulePatchEntry[];
  systemFlavorAndTrackers?: {
    genre?: string;
    toneTags?: string[];
    resourcePoolTemplates?: ResourcePoolTemplate[];
    conditionBuffPresets?: ConditionBuffPreset[];
    clockCategories?: string[];
  };
  terminologyMap?: TerminologyMap;
};

// ---------------------------------------------------------------------------
// 3. Sanitization & Terminology Helpers
// ---------------------------------------------------------------------------

const DOUBLE_BRACKET_SPOILER_REGEX = /\[\[(?:gm|spoiler):[\s\S]*?\]\]/gi;

/**
 * Strips all inline spoiler syntaxes: `||...||`, `[gm]...[/gm]`, `[spoiler]...[/spoiler]`,
 * and `[[gm:...]]` / `[[spoiler:...]]`.
 */
export function stripInlineSpoilers(text: string): string {
  if (typeof text !== 'string' || !text) return text;
  const step1 = text.replace(DOUBLE_BRACKET_SPOILER_REGEX, '');
  return redactSpoilers(step1).replace(/[ \t]{2,}/g, ' ').trim();
}

/**
 * Recursively strips forbidden prototype-pollution keys and GM-redacted keys
 * from arbitrary untrusted objects. Also strips inline spoiler blocks
 * when `stripSpoilers` is true.
 */
export function scrubUntrustedObject<T = unknown>(
  input: T,
  opts: { stripSpoilers?: boolean; strippedKeys?: Set<string> } = {},
): T {
  const { stripSpoilers = false, strippedKeys } = opts;
  if (input === null || input === undefined) return input;
  if (typeof input === 'string') {
    const cleaned = stripSpoilers ? stripInlineSpoilers(input) : input;
    return cleaned as unknown as T;
  }
  if (Array.isArray(input)) {
    return input.map((item) => scrubUntrustedObject(item, opts)) as unknown as T;
  }
  if (typeof input === 'object') {
    const out: Record<string, unknown> = Object.create(null);
    for (const [key, val] of Object.entries(input as Record<string, unknown>)) {
      if (
        key === '__proto__' ||
        key === 'constructor' ||
        key === 'prototype' ||
        FORBIDDEN_OR_REDACTED_KEYS.has(key)
      ) {
        strippedKeys?.add(key);
        continue;
      }
      out[key] = scrubUntrustedObject(val, opts);
    }
    return { ...out } as T;
  }
  return input;
}

const TERMINOLOGY_SYNONYMS: Record<string, CanonicalTerminologyKey> = {
  quest: 'quests',
  quests: 'quests',
  mission: 'quests',
  missions: 'quests',
  dungeon: 'dungeons',
  dungeons: 'dungeons',
  gold: 'gold',
  gp: 'gold',
  coin: 'gold',
  coins: 'gold',
  currency: 'gold',
  npc: 'npcs',
  npcs: 'npcs',
  location: 'locations',
  locations: 'locations',
  place: 'locations',
  places: 'locations',
  faction: 'factions',
  factions: 'factions',
  secret: 'secrets',
  secrets: 'secrets',
  clue: 'secrets',
  clues: 'secrets',
  clock: 'clocks',
  clocks: 'clocks',
  encounter: 'encounters',
  encounters: 'encounters',
  monster: 'monsters',
  monsters: 'monsters',
  creature: 'monsters',
  creatures: 'monsters',
  item: 'items',
  items: 'items',
  loot: 'items',
  gear: 'items',
  session: 'sessions',
  sessions: 'sessions',
};

export function normalizeTerminologyKey(rawKey: string): string {
  const cleaned = rawKey.trim().toLowerCase().replace(/[^a-z0-9_ -]/g, '');
  if (!cleaned) return '';
  return TERMINOLOGY_SYNONYMS[cleaned] ?? cleaned;
}

export function sanitizeTerminologyMap(
  raw: Record<string, string> | undefined,
  stripSpoilers = true,
): TerminologyMap | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: TerminologyMap = {};
  for (const [k, v] of Object.entries(raw)) {
    if (FORBIDDEN_OR_REDACTED_KEYS.has(k)) continue;
    const normKey = normalizeTerminologyKey(k);
    if (!normKey || typeof v !== 'string') continue;
    const cleanVal = (stripSpoilers ? stripInlineSpoilers(v) : v).trim().slice(0, 48);
    if (!cleanVal) continue;
    out[normKey] = cleanVal;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Resolves a UI label against a `TerminologyMap` (e.g. `resolveTerm(map, 'quests', 'Quests')`
 * -> `'Cases'`), falling back cleanly to `fallback` when unconfigured.
 */
export function resolveTerm(
  map: TerminologyMap | undefined | null,
  key: CanonicalTerminologyKey | string,
  fallback?: string,
): string {
  const defaultFallback =
    fallback ??
    (DEFAULT_TERMINOLOGY_LABELS[key as CanonicalTerminologyKey] || key);
  if (!map) return defaultFallback;
  const norm = normalizeTerminologyKey(key);
  const hit = map[norm] ?? map[key];
  return typeof hit === 'string' && hit.trim().length > 0 ? hit.trim() : defaultFallback;
}

function makeSlugId(prefix: string, name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  return `${prefix}_${slug || 'custom'}`;
}

export function normalizePrepTargetKey(rawKey: string): PrepTargetKey | null {
  const trimmed = rawKey.trim();
  if (VALID_PREP_TARGET_KEYS.has(trimmed as PrepTargetKey)) {
    return trimmed as PrepTargetKey;
  }
  const lower = trimmed.toLowerCase();
  const aliasMap: Record<string, PrepTargetKey> = {
    encounter: 'monsters',
    encounters: 'monsters',
    monster: 'monsters',
    monsters: 'monsters',
    secret: 'secrets',
    secrets: 'secrets',
    clues: 'secrets',
    npc: 'npcs',
    npcs: 'npcs',
    location: 'locations',
    locations: 'locations',
    dungeons: 'locations',
    sites: 'locations',
    scene: 'scenes',
    scenes: 'scenes',
    faction: 'factions',
    factions: 'factions',
    conflict: 'conflicts',
    conflicts: 'conflicts',
    item: 'items',
    items: 'items',
    loot: 'items',
    clock: 'clocks',
    clocks: 'clocks',
    facts: 'facts',
    lines: 'lines',
    goals: 'pcGoals',
    pcgoals: 'pcGoals',
    strongstart: 'strongStart',
  };
  return aliasMap[lower] ?? null;
}

// ---------------------------------------------------------------------------
// 4. Authority & CRDT Privacy Validation (`validateWorkspacePatch`)
// ---------------------------------------------------------------------------

export interface WorkspaceAuthorityContext {
  /** Current workspace role (`'gm'` or `'player'`). */
  role?: 'gm' | 'player';
  /** Alias for `role` (`'gm'` or `'player'`). */
  callerRole?: 'gm' | 'player';
  /**
   * True ONLY when the authenticated user is the owner (GM) of the campaign.
   * Must be `false` on `/player`, `/play/[shareToken]`, or non-owner sessions.
   */
  isCampaignOwner?: boolean;
  /** Active player slot ID when in shared player mode (`/play/[shareToken]`). */
  activeSlotId?: string;
  /** Explicit list of PC IDs owned by this player (cross-checked against `pcs` when present). */
  ownedPcIds?: string[];
  /** Current PCs array for strict CRDT ownership verification & idempotent tracker merging. */
  pcs?: Array<Record<string, any>>;
  /** Current local tracker state to prevent unconfirmed `sharedWithGm: false -> true` flips. */
  currentTrackerState?: Partial<PlayerLocalTrackerState>;
  /**
   * Explicit set of item IDs that the user has individually confirmed sharing
   * with the GM (`sharedWithGm: false -> true`). Without an ID here, no patch
   * can ever flip `sharedWithGm` from `false` to `true`.
   */
  confirmedShareItemIds?: ReadonlySet<string> | string[];
}

export function resolveAuthorityRole(
  context: WorkspaceAuthorityContext,
): 'gm' | 'player' {
  const r = context.callerRole ?? context.role;
  return r === 'gm' ? 'gm' : 'player';
}

export function hasCampaignEditAuthority(
  context: WorkspaceAuthorityContext,
): boolean {
  const effectiveRole = resolveAuthorityRole(context);
  if (effectiveRole !== 'gm') return false;
  if (typeof context.isCampaignOwner === 'boolean') {
    return context.isCampaignOwner;
  }
  return context.callerRole === 'gm';
}

export function isPublicVisibility(value: unknown): boolean {
  if (!value || typeof value !== 'object') return true;
  const vis = (value as Record<string, unknown>).visibility;
  return vis === undefined || vis === 'public';
}

export interface ValidatedWorkspacePatch {
  ok: boolean;
  /** True only when `isCampaignOwner && role === 'gm'`. */
  canApplyToCampaign: boolean;
  /** Sanitized patch permitted for campaign-wide application (empty if `!canApplyToCampaign`). */
  campaignPatch: CampaignWorkspacePatch;
  /** Per-user local HUD layout preferences (safe for both GM and Player local storage / IDB). */
  localHudPrefs?: HudLayoutPrefs;
  /** Per-user local terminology map (used in `/player` mode without touching shared CRDT). */
  localTerminologyMap?: TerminologyMap;
  /**
   * Sanitized, `allowlist.ts`-validated writebacks keyed strictly by owned `pcId`.
   * Guaranteed never to contain unowned PCs, GM-redacted fields, or unconfirmed share flips.
   */
  pcWritebacks: Record<string, Partial<Record<PlayerEditableField, unknown>>>;
  /** Sanitized local tracker state patch preserving `sharedWithGm: false` unless explicitly confirmed. */
  localTrackerPatch?: ProposedTrackerPatch;
  /** Audit trail of scopes/PCs/fields/share-flips blocked by authority enforcement. */
  blockedScopes: string[];
  blockedPcIds: string[];
  blockedFields: string[];
  blockedShareFlips: string[];
  strippedRedactedKeys: string[];
  warnings: string[];
  errors: string[];
}

/**
 * Determines whether a given PC is owned by the current player context.
 * Fails closed:
 * - When `pcs` + `activeSlotId` are provided, requires `pc.ownership.ownerType === 'player'`
 *   AND `pc.ownership.playerSlotId === activeSlotId`.
 * - When standalone `/player` has no `activeSlotId`, checks `ownedPcIds` (and rejects
 *   any PC explicitly marked as owned by `'dm'` or a different `playerSlotId`).
 */
export function isPcOwnedByContext(
  pcId: string,
  context: WorkspaceAuthorityContext,
): boolean {
  if (!pcId) return false;
  const ownedIdSet = new Set(context.ownedPcIds ?? []);
  const pcRecord = Array.isArray(context.pcs)
    ? context.pcs.find((p) => p && typeof p === 'object' && p.id === pcId)
    : undefined;

  if (context.activeSlotId) {
    if (!pcRecord) {
      // Without source PC record, fail closed unless explicitly listed AND no pcs array was supplied
      return !context.pcs && ownedIdSet.has(pcId);
    }
    const ownership = pcRecord.ownership as
      | { ownerType?: string; playerSlotId?: string }
      | undefined;
    const slotMatches =
      ownership?.ownerType === 'player' &&
      ownership?.playerSlotId === context.activeSlotId;
    if (!slotMatches) return false;
    if (context.ownedPcIds && context.ownedPcIds.length > 0) {
      return ownedIdSet.has(pcId);
    }
    return true;
  }

  // Standalone local `/player` vault (no share slotId): must be in ownedPcIds
  // and must NOT belong to `'dm'` or another player's slot.
  if (!ownedIdSet.has(pcId)) return false;
  if (pcRecord?.ownership) {
    const o = pcRecord.ownership as { ownerType?: string; playerSlotId?: string };
    if (o.ownerType === 'dm') return false;
    if (o.ownerType === 'player' && o.playerSlotId) return false;
  }
  return true;
}

function getOwnedPcsList(context: WorkspaceAuthorityContext): Array<Record<string, any>> {
  if (!Array.isArray(context.pcs)) return [];
  return context.pcs.filter(
    (p) => p && typeof p.id === 'string' && isPcOwnedByContext(p.id, context),
  );
}

function buildConfirmedSet(
  raw: ReadonlySet<string> | string[] | undefined,
): Set<string> {
  if (!raw) return new Set();
  return raw instanceof Set ? new Set(raw) : new Set(raw);
}

/**
 * Enforces that an item array (quests, journal, theoryLinks, stickyCards, inventory)
 * never transitions an item from `sharedWithGm: false` (or unset) to `sharedWithGm: true`
 * unless its `id` is explicitly present in `confirmedSet`.
 */
function guardShareArray<T extends Record<string, unknown>>(
  incoming: T[],
  existingById: Map<string, { sharedWithGm?: boolean }>,
  confirmedSet: Set<string>,
  blockedShareFlips: string[],
  stripSpoilers: boolean,
): T[] {
  return incoming
    .filter((item) => item && typeof item === 'object')
    .map((rawItem) => {
      const item = scrubUntrustedObject(rawItem, { stripSpoilers }) as Record<
        string,
        unknown
      >;
      const id = typeof item.id === 'string' ? item.id : '';
      const prev = id ? existingById.get(id) : undefined;
      const wasShared = prev?.sharedWithGm === true;

      if (item.sharedWithGm === true && !wasShared) {
        if (!id || !confirmedSet.has(id)) {
          blockedShareFlips.push(id || 'anonymous_item');
          return { ...item, sharedWithGm: false } as unknown as T;
        }
      } else if (typeof item.sharedWithGm !== 'boolean') {
        item.sharedWithGm = wasShared;
      }
      return item as unknown as T;
    });
}

/**
 * Runtime schema + CRDT authority & privacy validator for `CampaignWorkspacePatch`.
 */
export function validateWorkspacePatch(
  rawInput: unknown,
  context: WorkspaceAuthorityContext,
): ValidatedWorkspacePatch {
  const canApplyToCampaign = hasCampaignEditAuthority(context);
  const confirmedSet = buildConfirmedSet(context.confirmedShareItemIds);
  const strippedRedactedSet = new Set<string>();
  const blockedScopes: string[] = [];
  const blockedPcIds: string[] = [];
  const blockedFields: string[] = [];
  const blockedShareFlips: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!rawInput || typeof rawInput !== 'object' || Array.isArray(rawInput)) {
    return {
      ok: false,
      canApplyToCampaign,
      campaignPatch: {},
      pcWritebacks: {},
      blockedScopes,
      blockedPcIds,
      blockedFields,
      blockedShareFlips,
      strippedRedactedKeys: [],
      warnings,
      errors: ['Patch must be a JSON object.'],
    };
  }

  // Step 1: Scrub prototype pollution + GM-redacted keys before schema parse
  const scrubbedRaw = scrubUntrustedObject(rawInput, {
    stripSpoilers: !canApplyToCampaign,
    strippedKeys: strippedRedactedSet,
  }) as Record<string, unknown>;

  if (strippedRedactedSet.size > 0) {
    warnings.push(
      `Stripped protected/redacted keys: ${Array.from(strippedRedactedSet).join(', ')}`,
    );
  }

  // Keep only recognized top-level keys (record unknown top-level campaign mutation attempts)
  const ALLOWED_TOP_KEYS = new Set([
    'campaignMode',
    'workflow',
    'houseRules',
    'systemFlavorAndTrackers',
    'terminologyMap',
    'hudLayoutPrefs',
    'pcPatches',
    'trackerPatch',
  ]);
  const candidateTop: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(scrubbedRaw)) {
    if (!ALLOWED_TOP_KEYS.has(k)) {
      blockedScopes.push(k);
      warnings.push(`Ignored unsupported patch key "${k}".`);
      continue;
    }
    candidateTop[k] = v;
  }

  // Normalize prepTargetOverrides keys & clamp integers prior to strict Zod validation
  if (
    candidateTop.campaignMode &&
    typeof candidateTop.campaignMode === 'object' &&
    !Array.isArray(candidateTop.campaignMode)
  ) {
    const cm = { ...(candidateTop.campaignMode as Record<string, unknown>) };
    if (
      cm.prepTargetOverrides &&
      typeof cm.prepTargetOverrides === 'object' &&
      !Array.isArray(cm.prepTargetOverrides)
    ) {
      const normOverrides: Record<string, unknown> = {};
      for (const [rawKey, rawVal] of Object.entries(
        cm.prepTargetOverrides as Record<string, unknown>,
      )) {
        const mappedKey = normalizePrepTargetKey(rawKey);
        if (!mappedKey) {
          warnings.push(`Ignored unknown prep target "${rawKey}".`);
          continue;
        }
        if (typeof rawVal === 'number' && Number.isFinite(rawVal)) {
          normOverrides[mappedKey] = clampInt(rawVal, 0, 99);
        } else if (rawVal && typeof rawVal === 'object' && !Array.isArray(rawVal)) {
          const vObj = rawVal as Record<string, unknown>;
          const cleanScale: PrepTargetOverride = {};
          if (typeof vObj.standard === 'number' && Number.isFinite(vObj.standard)) {
            cleanScale.standard = clampInt(vObj.standard, 0, 99);
          }
          if (typeof vObj.duet === 'number' && Number.isFinite(vObj.duet)) {
            cleanScale.duet = clampInt(vObj.duet, 0, 99);
          }
          if (typeof vObj.solo === 'number' && Number.isFinite(vObj.solo)) {
            cleanScale.solo = clampInt(vObj.solo, 0, 99);
          }
          if (Object.keys(cleanScale).length > 0) {
            normOverrides[mappedKey] = cleanScale;
          }
        }
      }
      cm.prepTargetOverrides = normOverrides;
    }
    candidateTop.campaignMode = cm;
  }

  // Normalize resourcePoolTemplates numeric clamping
  if (
    candidateTop.systemFlavorAndTrackers &&
    typeof candidateTop.systemFlavorAndTrackers === 'object' &&
    !Array.isArray(candidateTop.systemFlavorAndTrackers)
  ) {
    const sft = {
      ...(candidateTop.systemFlavorAndTrackers as Record<string, unknown>),
    };
    if (Array.isArray(sft.resourcePoolTemplates)) {
      sft.resourcePoolTemplates = sft.resourcePoolTemplates
        .filter((r) => r && typeof r === 'object')
        .map((r: any) => ({
          ...(typeof r.id === 'string' && r.id.trim() ? { id: r.id.trim().slice(0, 64) } : {}),
          name: String(r.name ?? '').trim().slice(0, 60),
          max: clampInt(Number(r.max) || 1, 1, 999),
          rechargeOn: RECHARGE_TIMING_OPTIONS.includes(r.rechargeOn)
            ? r.rechargeOn
            : 'long',
        }))
        .filter((r) => r.name.length > 0);
    }
    if (Array.isArray(sft.conditionBuffPresets)) {
      sft.conditionBuffPresets = sft.conditionBuffPresets
        .filter((b) => b && typeof b === 'object')
        .map((b: any) => {
          const out: Record<string, unknown> = {
            name: String(b.name ?? '').trim().slice(0, 60),
          };
          if (typeof b.id === 'string' && b.id.trim()) out.id = b.id.trim().slice(0, 64);
          if (typeof b.presetKey === 'string' && b.presetKey.trim()) {
            out.presetKey = b.presetKey.trim().slice(0, 64);
          }
          if (typeof b.description === 'string' && b.description.trim()) {
            out.description = b.description.trim().slice(0, 240);
          }
          if (typeof b.acBonus === 'number' && Number.isFinite(b.acBonus)) {
            out.acBonus = clampInt(b.acBonus, -20, 20);
          }
          if (typeof b.speedBonus === 'number' && Number.isFinite(b.speedBonus)) {
            out.speedBonus = clampInt(b.speedBonus, -60, 120);
          }
          if (typeof b.speedMultiplier === 'number' && Number.isFinite(b.speedMultiplier)) {
            out.speedMultiplier = Math.max(0, Math.min(10, b.speedMultiplier));
          }
          for (const fKey of [
            'saveBonusFormula',
            'attackBonusFormula',
            'checkBonusFormula',
            'damageBonusFormula',
          ] as const) {
            if (typeof b[fKey] === 'string' && b[fKey].trim()) {
              out[fKey] = b[fKey].trim().slice(0, 32);
            }
          }
          if (
            b.rollModeOverride === 'normal' ||
            b.rollModeOverride === 'advantage' ||
            b.rollModeOverride === 'disadvantage'
          ) {
            out.rollModeOverride = b.rollModeOverride;
          }
          for (const boolKey of [
            'affectsChecks',
            'affectsAttacks',
            'affectsSaves',
          ] as const) {
            if (typeof b[boolKey] === 'boolean') out[boolKey] = b[boolKey];
          }
          if (BUFF_EXPIRY_OPTIONS.includes(b.expiresOn)) {
            out.expiresOn = b.expiresOn;
          } else if (b.expiresOn === 'rest') {
            out.expiresOn = 'shortRest';
          }
          return out;
        })
        .filter((b) => String(b.name).length > 0);
    }
    if (Array.isArray(sft.toneTags)) {
      sft.toneTags = Array.from(
        new Set(
          sft.toneTags
            .filter((t): t is string => typeof t === 'string')
            .map((t) => t.trim().slice(0, 40))
            .filter(Boolean),
        ),
      ).slice(0, 16);
    }
    if (Array.isArray(sft.clockCategories)) {
      sft.clockCategories = Array.from(
        new Set(
          sft.clockCategories
            .filter((c): c is string => typeof c === 'string')
            .map((c) => c.trim().slice(0, 40))
            .filter(Boolean),
        ),
      ).slice(0, 20);
    }
    candidateTop.systemFlavorAndTrackers = sft;
  }

  if (
    candidateTop.terminologyMap &&
    typeof candidateTop.terminologyMap === 'object' &&
    !Array.isArray(candidateTop.terminologyMap)
  ) {
    const cleanTerms = sanitizeTerminologyMap(
      candidateTop.terminologyMap as Record<string, string>,
      !canApplyToCampaign,
    );
    if (cleanTerms) {
      candidateTop.terminologyMap = cleanTerms;
    } else {
      delete candidateTop.terminologyMap;
    }
  }

  const parsed = CampaignWorkspacePatchSchema.safeParse(candidateTop);
  if (!parsed.success) {
    return {
      ok: false,
      canApplyToCampaign,
      campaignPatch: {},
      pcWritebacks: {},
      blockedScopes,
      blockedPcIds,
      blockedFields,
      blockedShareFlips,
      strippedRedactedKeys: Array.from(strippedRedactedSet),
      warnings,
      errors: parsed.error.issues.map(
        (iss) => `${iss.path.join('.') || 'patch'}: ${iss.message}`,
      ),
    };
  }

  const validPatch = parsed.data;
  const pcWritebacks: Record<string, Partial<Record<PlayerEditableField, unknown>>> = {};

  // Build lookup maps for existing sharedWithGm items so no patch ever flips false -> true unconfirmed
  const existingQuestMap = new Map<string, { sharedWithGm?: boolean }>();
  for (const q of context.currentTrackerState?.quests ?? []) {
    if (q?.id) existingQuestMap.set(q.id, { sharedWithGm: q.sharedWithGm });
  }
  const existingJournalMap = new Map<string, { sharedWithGm?: boolean }>();
  for (const j of context.currentTrackerState?.journal ?? []) {
    if (j?.id) existingJournalMap.set(j.id, { sharedWithGm: j.sharedWithGm });
  }
  const existingTheoryMap = new Map<string, { sharedWithGm?: boolean }>();
  for (const l of context.currentTrackerState?.theoryLinks ?? []) {
    if (l?.id) existingTheoryMap.set(l.id, { sharedWithGm: l.sharedWithGm });
  }
  const existingStickyMap = new Map<string, { sharedWithGm?: boolean }>();
  for (const c of context.currentTrackerState?.stickyCards ?? []) {
    if (c?.id) existingStickyMap.set(c.id, { sharedWithGm: c.sharedWithGm });
  }
  const existingAnnotationMap = new Map<string, { sharedWithGm?: boolean }>();
  for (const ann of context.currentTrackerState?.annotations ?? []) {
    if (ann?.id) existingAnnotationMap.set(ann.id, { sharedWithGm: ann.sharedWithGm });
    if (ann?.entityId) {
      existingAnnotationMap.set(ann.entityId, { sharedWithGm: ann.sharedWithGm });
    }
  }

  // Validate & guard local trackerPatch (never flip sharedWithGm: false -> true without confirmation)
  let localTrackerPatch: ProposedTrackerPatch | undefined;
  if (validPatch.trackerPatch) {
    const tp: ProposedTrackerPatch = {};
    if (validPatch.trackerPatch.quests) {
      tp.quests = guardShareArray(
        validPatch.trackerPatch.quests,
        existingQuestMap,
        confirmedSet,
        blockedShareFlips,
        !canApplyToCampaign,
      );
    }
    if (validPatch.trackerPatch.journal) {
      tp.journal = guardShareArray(
        validPatch.trackerPatch.journal,
        existingJournalMap,
        confirmedSet,
        blockedShareFlips,
        !canApplyToCampaign,
      );
    }
    if (validPatch.trackerPatch.theoryLinks) {
      tp.theoryLinks = guardShareArray(
        validPatch.trackerPatch.theoryLinks,
        existingTheoryMap,
        confirmedSet,
        blockedShareFlips,
        !canApplyToCampaign,
      );
    }
    if (validPatch.trackerPatch.stickyCards) {
      tp.stickyCards = guardShareArray(
        validPatch.trackerPatch.stickyCards,
        existingStickyMap,
        confirmedSet,
        blockedShareFlips,
        !canApplyToCampaign,
      );
    }
    if (validPatch.trackerPatch.annotations) {
      const rawAnnList: Record<string, unknown>[] = Array.isArray(
        validPatch.trackerPatch.annotations,
      )
        ? validPatch.trackerPatch.annotations
        : Object.entries(validPatch.trackerPatch.annotations)
            .filter(([k]) => !FORBIDDEN_OR_REDACTED_KEYS.has(k))
            .map(([k, v]) => ({
              id: typeof v.id === 'string' ? v.id : k,
              entityId: typeof v.entityId === 'string' ? v.entityId : k,
              ...v,
            }));

      tp.annotations = rawAnnList
        .filter((a) => a && typeof a === 'object')
        .map((rawAnn) => {
          const ann = scrubUntrustedObject(rawAnn, {
            stripSpoilers: !canApplyToCampaign,
          }) as Record<string, unknown>;
          const annId = typeof ann.id === 'string' ? ann.id : '';
          const entityId =
            typeof ann.entityId === 'string'
              ? ann.entityId
              : typeof ann.entityKey === 'string'
                ? ann.entityKey
                : annId;
          if (!ann.id && entityId) ann.id = entityId;
          if (!ann.entityId && entityId) ann.entityId = entityId;
          if (typeof ann.privateNotes !== 'string') ann.privateNotes = '';

          const prev =
            (annId ? existingAnnotationMap.get(annId) : undefined) ??
            (entityId ? existingAnnotationMap.get(entityId) : undefined);
          const wasShared = prev?.sharedWithGm === true;
          const isConfirmed =
            (annId && confirmedSet.has(annId)) ||
            (entityId && confirmedSet.has(entityId));

          if (ann.sharedWithGm === true && !wasShared && !isConfirmed) {
            blockedShareFlips.push(annId || entityId || 'annotation');
            ann.sharedWithGm = false;
          } else if (typeof ann.sharedWithGm !== 'boolean') {
            ann.sharedWithGm = wasShared;
          }
          return ann;
        });
    }
    localTrackerPatch = tp;
  }

  // Helper to stage a single PC field writeback after checking ownership + allowlist + share guard
  const stageWhitelistedPcField = (
    pcId: string,
    rawField: string,
    rawVal: unknown,
    pcRecord?: Record<string, any>,
  ) => {
    if (!(PLAYER_EDITABLE_FIELDS as readonly string[]).includes(rawField)) {
      blockedFields.push(`${pcId}.${rawField}`);
      warnings.push(
        `Blocked non-editable or GM-only field "${rawField}" on "${pcId}".`,
      );
      return;
    }
    const field = rawField as PlayerEditableField;
    let candidateVal = rawVal;

    // Guard secret rolls from outbound writebacks
    if (field === 'rollEvents' && Array.isArray(candidateVal)) {
      candidateVal = sanitizeRollEventsForOutbound(candidateVal as any);
    }

    // Guard inventory item sharedWithGm transitions
    if (field === 'inventory' && Array.isArray(candidateVal)) {
      const existingInvMap = new Map<string, { sharedWithGm?: boolean }>();
      for (const inv of (pcRecord?.inventory as any[]) ?? []) {
        if (inv?.id) existingInvMap.set(inv.id, { sharedWithGm: inv.sharedWithGm });
      }
      candidateVal = guardShareArray(
        candidateVal as Record<string, unknown>[],
        existingInvMap,
        confirmedSet,
        blockedShareFlips,
        !canApplyToCampaign,
      );
    }

    // Guard outbound shared* slices: every item must already be shared in local tracker OR confirmed
    if (
      (field === 'sharedQuests' ||
        field === 'sharedAnnotations' ||
        field === 'sharedJournal' ||
        field === 'sharedTheoryLinks' ||
        field === 'sharedStickyCards') &&
      Array.isArray(candidateVal)
    ) {
      const existingMap =
        field === 'sharedQuests'
          ? existingQuestMap
          : field === 'sharedJournal'
            ? existingJournalMap
            : field === 'sharedTheoryLinks'
              ? existingTheoryMap
              : field === 'sharedStickyCards'
                ? existingStickyMap
                : existingAnnotationMap;

      candidateVal = (candidateVal as Record<string, unknown>[]).filter((item) => {
        if (!item || typeof item !== 'object') return false;
        const itemId = String(item.id ?? item.entityId ?? item.entityKey ?? '');
        const wasShared = itemId ? existingMap.get(itemId)?.sharedWithGm === true : false;
        if (!wasShared && (!itemId || !confirmedSet.has(itemId))) {
          blockedShareFlips.push(itemId || `${field}_item`);
          return false;
        }
        return true;
      });
    }

    const isFieldValid = validatePlayerField(field, candidateVal);
    if (!isFieldValid) {
      blockedFields.push(`${pcId}.${field}`);
      warnings.push(`Rejected invalid PC field "${field}" on ${pcId}.`);
      return;
    }

    if (!pcWritebacks[pcId]) pcWritebacks[pcId] = {};
    pcWritebacks[pcId][field] = candidateVal;
  };

  // Process explicit pcPatches
  if (validPatch.pcPatches) {
    for (const pcPatch of validPatch.pcPatches) {
      const targetPcId = pcPatch.pcId;
      const pcRecord = Array.isArray(context.pcs)
        ? context.pcs.find((p) => p?.id === targetPcId)
        : undefined;

      if (!canApplyToCampaign && !isPcOwnedByContext(targetPcId, context)) {
        blockedPcIds.push(targetPcId);
        warnings.push(
          `Blocked modification to unowned PC "${targetPcId}" (players can only update their own sheet).`,
        );
        continue;
      }

      for (const [fieldKey, fieldVal] of Object.entries(pcPatch.updates)) {
        stageWhitelistedPcField(targetPcId, fieldKey, fieldVal, pcRecord);
      }
    }
  }

  if (blockedShareFlips.length > 0) {
    warnings.push(
      `Preserved private visibility (sharedWithGm: false) on ${blockedShareFlips.length} item(s); sharing requires explicit item-level confirmation.`,
    );
  }

  // Enforce Campaign-Wide vs Player-Only Routing
  if (!canApplyToCampaign) {
    if (validPatch.campaignMode) {
      blockedScopes.push('campaignMode');
      warnings.push(
        'Campaign mode and prep target overrides require GM campaign-owner authority and were stripped.',
      );
    }
    if (validPatch.workflow) {
      blockedScopes.push('workflow');
      warnings.push(
        'Workflow ceilings, block durations, and global sticky channels require GM campaign-owner authority and were stripped.',
      );
    }
    if (validPatch.houseRules && validPatch.houseRules.length > 0) {
      blockedScopes.push('houseRules');
      warnings.push(
        'Campaign house rules can only be added or modified by the GM campaign owner.',
      );
    }

    if (validPatch.systemFlavorAndTrackers) {
      if (
        validPatch.systemFlavorAndTrackers.genre ||
        (validPatch.systemFlavorAndTrackers.toneTags?.length ?? 0) > 0 ||
        (validPatch.systemFlavorAndTrackers.clockCategories?.length ?? 0) > 0
      ) {
        blockedScopes.push('systemFlavorAndTrackers.campaignSettings');
        warnings.push(
          'Campaign genre, tone tags, and global clock categories can only be changed by the GM.',
        );
      }

      // Convert player-requested resourcePoolTemplates & conditionBuffPresets into
      // whitelisted `pcWritebacks` strictly on the player's OWNED PC(s)!
      const ownedPcs = getOwnedPcsList(context);
      const targetIds =
        ownedPcs.length > 0
          ? ownedPcs.map((p) => String(p.id))
          : (context.ownedPcIds ?? []).filter((id) => isPcOwnedByContext(id, context));

      if (
        ((validPatch.systemFlavorAndTrackers.resourcePoolTemplates?.length ?? 0) > 0 ||
          (validPatch.systemFlavorAndTrackers.conditionBuffPresets?.length ?? 0) > 0) &&
        targetIds.length === 0
      ) {
        blockedScopes.push('systemFlavorAndTrackers.unownedPcTrackers');
        warnings.push('No owned PC slot available for custom resource trackers or buffs.');
      }

      for (const ownedId of targetIds) {
        const pcRec = ownedPcs.find((p) => p.id === ownedId);
        if (
          validPatch.systemFlavorAndTrackers.resourcePoolTemplates &&
          validPatch.systemFlavorAndTrackers.resourcePoolTemplates.length > 0
        ) {
          const existingPools: PcResourcePool[] = Array.isArray(pcRec?.resourcePools)
            ? pcRec.resourcePools.filter(isPublicVisibility).map((p: any) => ({
                id: String(p.id || 'pool'),
                name: stripInlineSpoilers(String(p.name ?? '')),
                current: Number(p.current) || 0,
                max: Number(p.max) || 1,
                rechargeOn: RECHARGE_TIMING_OPTIONS.includes(p.rechargeOn)
                  ? p.rechargeOn
                  : 'long',
              }))
            : [];
          const mergedPools = mergeResourcePoolTemplatesIntoPcPools(
            existingPools,
            validPatch.systemFlavorAndTrackers.resourcePoolTemplates,
          );
          stageWhitelistedPcField(ownedId, 'resourcePools', mergedPools, pcRec);
        }

        if (
          validPatch.systemFlavorAndTrackers.conditionBuffPresets &&
          validPatch.systemFlavorAndTrackers.conditionBuffPresets.length > 0
        ) {
          const existingBuffs: ActiveBuff[] = Array.isArray(pcRec?.activeBuffs)
            ? pcRec.activeBuffs.filter(isPublicVisibility).map((b: any) => ({
                ...b,
                name: stripInlineSpoilers(String(b.name ?? '')),
              }))
            : [];
          const mergedBuffs = mergeBuffPresetsIntoPcBuffs(
            existingBuffs,
            validPatch.systemFlavorAndTrackers.conditionBuffPresets,
          );
          stageWhitelistedPcField(ownedId, 'activeBuffs', mergedBuffs, pcRec);
        }
      }
    }

    return {
      ok: true,
      canApplyToCampaign: false,
      campaignPatch: {}, // Strictly empty for non-owners / player mode!
      localHudPrefs: validPatch.hudLayoutPrefs,
      localTerminologyMap: validPatch.terminologyMap,
      pcWritebacks,
      localTrackerPatch,
      blockedScopes,
      blockedPcIds,
      blockedFields,
      blockedShareFlips,
      strippedRedactedKeys: Array.from(strippedRedactedSet),
      warnings,
      errors,
    };
  }

  // GM Campaign Owner path: full campaign patch allowed (still preserving player share confirmation!)
  const gmCampaignPatch: CampaignWorkspacePatch = {
    ...(validPatch.campaignMode ? { campaignMode: validPatch.campaignMode } : {}),
    ...(validPatch.workflow ? { workflow: validPatch.workflow } : {}),
    ...(validPatch.houseRules ? { houseRules: validPatch.houseRules } : {}),
    ...(validPatch.systemFlavorAndTrackers
      ? { systemFlavorAndTrackers: validPatch.systemFlavorAndTrackers }
      : {}),
    ...(validPatch.terminologyMap ? { terminologyMap: validPatch.terminologyMap } : {}),
    ...(validPatch.hudLayoutPrefs ? { hudLayoutPrefs: validPatch.hudLayoutPrefs } : {}),
  };

  return {
    ok: true,
    canApplyToCampaign: true,
    campaignPatch: gmCampaignPatch,
    localHudPrefs: validPatch.hudLayoutPrefs,
    localTerminologyMap: validPatch.terminologyMap,
    pcWritebacks,
    localTrackerPatch,
    blockedScopes,
    blockedPcIds,
    blockedFields,
    blockedShareFlips,
    strippedRedactedKeys: Array.from(strippedRedactedSet),
    warnings,
    errors,
  };
}

// ---------------------------------------------------------------------------
// 5. Idempotent PC Tracker & Campaign State Application + Diff + Undo
// ---------------------------------------------------------------------------

export function mergeResourcePoolTemplatesIntoPcPools(
  existingPools: PcResourcePool[],
  templates: ResourcePoolTemplate[],
): PcResourcePool[] {
  const next = existingPools.map((p) => ({ ...p }));
  for (const tpl of templates) {
    const cleanName = tpl.name.trim();
    if (!cleanName) continue;
    const idx = next.findIndex(
      (p) => p.name.trim().toLowerCase() === cleanName.toLowerCase(),
    );
    if (idx >= 0) {
      const prev = next[idx];
      const nextMax = clampInt(tpl.max, 1, 999);
      next[idx] = {
        ...prev,
        max: nextMax,
        current: Math.min(prev.current ?? nextMax, nextMax),
        rechargeOn: tpl.rechargeOn,
      };
    } else {
      const max = clampInt(tpl.max, 1, 999);
      next.push({
        id: tpl.id || makeSlugId('pool', cleanName),
        name: cleanName,
        current: max,
        max,
        rechargeOn: tpl.rechargeOn,
      });
    }
  }
  return next;
}

export function mergeBuffPresetsIntoPcBuffs(
  existingBuffs: ActiveBuff[],
  presets: ConditionBuffPreset[],
): ActiveBuff[] {
  const next = existingBuffs.map((b) => ({ ...b }));
  for (const preset of presets) {
    const cleanName = preset.name.trim();
    if (!cleanName) continue;
    const idx = next.findIndex(
      (b) => b.name.trim().toLowerCase() === cleanName.toLowerCase(),
    );
    const built: ActiveBuff = {
      id:
        (idx >= 0 ? next[idx].id : undefined) ||
        preset.id ||
        makeSlugId('buff', cleanName),
      ...(preset.presetKey ? { presetKey: preset.presetKey } : {}),
      name: cleanName,
      active: idx >= 0 ? (next[idx].active ?? false) : false,
      ...(typeof preset.acBonus === 'number' ? { acBonus: preset.acBonus } : {}),
      ...(typeof preset.speedBonus === 'number'
        ? { speedBonus: preset.speedBonus }
        : {}),
      ...(typeof preset.speedMultiplier === 'number'
        ? { speedMultiplier: preset.speedMultiplier }
        : {}),
      ...(preset.saveBonusFormula
        ? { saveBonusFormula: preset.saveBonusFormula }
        : {}),
      ...(preset.attackBonusFormula
        ? { attackBonusFormula: preset.attackBonusFormula }
        : {}),
      ...(preset.checkBonusFormula
        ? { checkBonusFormula: preset.checkBonusFormula }
        : {}),
      ...(preset.damageBonusFormula
        ? { damageBonusFormula: preset.damageBonusFormula }
        : {}),
      ...(preset.rollModeOverride
        ? { rollModeOverride: preset.rollModeOverride }
        : {}),
      ...(typeof preset.affectsChecks === 'boolean'
        ? { affectsChecks: preset.affectsChecks }
        : {}),
      ...(typeof preset.affectsAttacks === 'boolean'
        ? { affectsAttacks: preset.affectsAttacks }
        : {}),
      ...(preset.affectsSaves ? { affectsSaves: 'all' as const } : {}),
      expiresOn: preset.expiresOn ?? 'manual',
    };
    if (idx >= 0) {
      next[idx] = built;
    } else {
      next.push(built);
    }
  }
  return next;
}

export type WorkspaceDiffScope = 'campaign' | 'local_hud' | 'owned_pc';

export interface WorkspacePatchDiffItem {
  id: string;
  scope: WorkspaceDiffScope;
  category: string;
  label: string;
  before: string;
  after: string;
}

export function buildWorkspacePatchDiff(
  currentData: Record<string, any> | undefined,
  currentHudPrefs: HudLayoutPrefs | undefined,
  validated: ValidatedWorkspacePatch,
): WorkspacePatchDiffItem[] {
  const items: WorkspacePatchDiffItem[] = [];
  const data = currentData ?? {};
  const existingConfig = (data[WORKSPACE_CONFIG_STATE_KEY] ?? {}) as StoredWorkspaceConfig;

  // 1. Campaign Mode & Prep Targets (GM only)
  if (validated.canApplyToCampaign && validated.campaignPatch.campaignMode) {
    const cm = validated.campaignPatch.campaignMode;
    if (cm.mode) {
      const prevMode = String(data.mode ?? (data.__soloMode ? 'duet' : 'standard'));
      if (prevMode !== cm.mode) {
        items.push({
          id: 'campaignMode.mode',
          scope: 'campaign',
          category: 'Campaign Mode',
          label: 'Play Mode & Scale',
          before: prevMode,
          after: cm.mode,
        });
      }
    }
    if (cm.prepTargetOverrides) {
      const prevOverrides = (data[OVERRIDES_STATE_KEY] ?? {}) as PrepTargetOverrides;
      for (const [k, v] of Object.entries(cm.prepTargetOverrides)) {
        const meta = TARGETS[k as PrepTargetKey];
        const prevEntry = prevOverrides[k as PrepTargetKey];
        const prevStr = prevEntry ? JSON.stringify(prevEntry) : 'default';
        const afterStr =
          typeof v === 'number'
            ? `${v} (active scale)`
            : Object.entries(v)
                .map(([sc, n]) => `${sc}: ${n}`)
                .join(', ');
        items.push({
          id: `prepTarget.${k}`,
          scope: 'campaign',
          category: 'Prep Targets',
          label: meta?.label || k,
          before: prevStr,
          after: afterStr,
        });
      }
    }
  }

  // 1b. Workflow Ceilings, Block Durations & Sticky Channels (GM Campaign)
  if (validated.canApplyToCampaign && validated.campaignPatch.workflow) {
    const wf = validated.campaignPatch.workflow;
    const prevWf = existingConfig.workflow ?? {};
    if (typeof wf.blockDurationMinutes === 'number') {
      items.push({
        id: 'workflow.blockDurationMinutes',
        scope: 'campaign',
        category: 'Workflow & Pacing',
        label: 'Block Duration',
        before: prevWf.blockDurationMinutes ? `${prevWf.blockDurationMinutes}m` : '25m',
        after: `${wf.blockDurationMinutes}m`,
      });
    }
    if (typeof wf.cruiseCeilingBlocks === 'number') {
      items.push({
        id: 'workflow.cruiseCeilingBlocks',
        scope: 'campaign',
        category: 'Workflow & Pacing',
        label: 'Cruise Ceiling',
        before: prevWf.cruiseCeilingBlocks
          ? `${prevWf.cruiseCeilingBlocks} blocks`
          : '8 blocks',
        after: `${wf.cruiseCeilingBlocks} blocks`,
      });
    }
    if (typeof wf.surgeCeilingBlocks === 'number') {
      items.push({
        id: 'workflow.surgeCeilingBlocks',
        scope: 'campaign',
        category: 'Workflow & Pacing',
        label: 'Surge Ceiling',
        before: prevWf.surgeCeilingBlocks
          ? `${prevWf.surgeCeilingBlocks} blocks`
          : '12 blocks',
        after: `${wf.surgeCeilingBlocks} blocks`,
      });
    }
    if (wf.loadMode) {
      items.push({
        id: 'workflow.loadMode',
        scope: 'campaign',
        category: 'Workflow & Pacing',
        label: 'Load Mode',
        before: prevWf.loadMode || 'Cruise',
        after: wf.loadMode,
      });
    }
    if (wf.restVariant) {
      items.push({
        id: 'workflow.restVariant',
        scope: 'campaign',
        category: 'Workflow & Pacing',
        label: 'Rest Variant',
        before: prevWf.restVariant || 'standard_5e',
        after: wf.restVariant,
      });
    }
    if (wf.activePillars && wf.activePillars.length > 0) {
      items.push({
        id: 'workflow.activePillars',
        scope: 'campaign',
        category: 'Workflow & Pacing',
        label: 'Active Pillars',
        before: (prevWf.activePillars ?? ['combat', 'exploration', 'social']).join(', '),
        after: wf.activePillars.join(', '),
      });
    }
    if (wf.channels && wf.channels.length > 0) {
      for (const ch of wf.channels) {
        const prevCh = (prevWf.channels ?? []).find((c) => c.key === ch.key);
        items.push({
          id: `workflow.channel.${ch.key}`,
          scope: 'campaign',
          category: 'Workflow Channels',
          label: `Channel "${ch.key}"`,
          before: prevCh ? (prevCh.sticky ? 'Sticky' : 'Standard') : 'Standard',
          after: ch.sticky ? 'Sticky' : 'Standard',
        });
      }
    }
  }

  // 1c. Campaign House Rules (Non-destructive upserts)
  if (
    validated.canApplyToCampaign &&
    validated.campaignPatch.houseRules &&
    validated.campaignPatch.houseRules.length > 0
  ) {
    const prevRules = existingConfig.houseRules ?? [];
    for (const rule of validated.campaignPatch.houseRules) {
      const existingRule = prevRules.find(
        (r) =>
          r.id === rule.id ||
          r.title.trim().toLowerCase() === rule.title.trim().toLowerCase(),
      );
      const nextEnabled = rule.op === 'disable' ? false : (rule.enabled ?? true);
      items.push({
        id: `houseRule.${rule.id}`,
        scope: 'campaign',
        category: 'House Rules',
        label: `House Rule: ${rule.title}`,
        before: existingRule
          ? existingRule.enabled
            ? existingRule.ruleText.slice(0, 48)
            : 'Disabled'
          : 'Not set',
        after: nextEnabled ? rule.ruleText.slice(0, 64) : 'Disabled',
      });
    }
  }

  // 2. System Flavor & Trackers (GM Campaign)
  if (validated.canApplyToCampaign && validated.campaignPatch.systemFlavorAndTrackers) {
    const sft = validated.campaignPatch.systemFlavorAndTrackers;
    const prevSft = existingConfig.systemFlavorAndTrackers ?? {};
    if (sft.genre) {
      items.push({
        id: 'flavor.genre',
        scope: 'campaign',
        category: 'System & Genre',
        label: 'Campaign Genre',
        before: String(data.genre || prevSft.genre || 'Unset'),
        after: sft.genre,
      });
    }
    if (sft.toneTags && sft.toneTags.length > 0) {
      const prevTones = Array.isArray(data.tone)
        ? data.tone
        : prevSft.toneTags ?? [];
      items.push({
        id: 'flavor.toneTags',
        scope: 'campaign',
        category: 'System & Genre',
        label: 'Tone Tags',
        before: prevTones.length > 0 ? prevTones.join(', ') : 'None',
        after: sft.toneTags.join(', '),
      });
    }
    if (sft.resourcePoolTemplates && sft.resourcePoolTemplates.length > 0) {
      items.push({
        id: 'flavor.resourcePools',
        scope: 'campaign',
        category: 'PC Resource Trackers',
        label: 'Resource Pool Templates',
        before:
          (prevSft.resourcePoolTemplates ?? []).map((p) => p.name).join(', ') ||
          'Standard 5e',
        after: sft.resourcePoolTemplates
          .map((p) => `${p.name} (max ${p.max}, ${p.rechargeOn})`)
          .join(', '),
      });
    }
    if (sft.conditionBuffPresets && sft.conditionBuffPresets.length > 0) {
      items.push({
        id: 'flavor.buffPresets',
        scope: 'campaign',
        category: 'Conditions & Buffs',
        label: 'Custom Buff / Condition Presets',
        before:
          (prevSft.conditionBuffPresets ?? []).map((b) => b.name).join(', ') ||
          'Default Presets',
        after: sft.conditionBuffPresets.map((b) => b.name).join(', '),
      });
    }
    if (sft.clockCategories && sft.clockCategories.length > 0) {
      items.push({
        id: 'flavor.clockCategories',
        scope: 'campaign',
        category: 'Progress Clocks',
        label: 'Clock Categories',
        before: (prevSft.clockCategories ?? []).join(', ') || 'Default',
        after: sft.clockCategories.join(', '),
      });
    }
  }

  // 3. Terminology Map (Campaign for GM, Local HUD for Player)
  const termMap = validated.canApplyToCampaign
    ? validated.campaignPatch.terminologyMap
    : validated.localTerminologyMap;
  if (termMap && Object.keys(termMap).length > 0) {
    const prevTerms = validated.canApplyToCampaign
      ? (existingConfig.terminologyMap ?? {})
      : (projectPublicWorkspaceConfig(data)?.terminologyMap ?? {});
    for (const [k, v] of Object.entries(termMap)) {
      const fallback =
        DEFAULT_TERMINOLOGY_LABELS[k as CanonicalTerminologyKey] ?? k;
      items.push({
        id: `term.${k}`,
        scope: validated.canApplyToCampaign ? 'campaign' : 'local_hud',
        category: 'Terminology Override',
        label: `Rename "${fallback}"`,
        before: prevTerms[k] || fallback,
        after: validated.canApplyToCampaign ? v : stripInlineSpoilers(v),
      });
    }
  }

  // 4. Owned PC Writebacks (Player mode or explicit PC patch)
  for (const [pcId, fields] of Object.entries(validated.pcWritebacks)) {
    for (const [fieldKey, val] of Object.entries(fields)) {
      let summaryAfter = 'Updated';
      if (fieldKey === 'resourcePools' && Array.isArray(val)) {
        summaryAfter = (val as PcResourcePool[])
          .map((p) => `${p.name} (${p.current}/${p.max})`)
          .join(', ');
      } else if (fieldKey === 'activeBuffs' && Array.isArray(val)) {
        summaryAfter = (val as ActiveBuff[]).map((b) => b.name).join(', ');
      }
      if (!validated.canApplyToCampaign) {
        summaryAfter = stripInlineSpoilers(summaryAfter);
      }
      items.push({
        id: `pc.${pcId}.${fieldKey}`,
        scope: 'owned_pc',
        category: 'Owned Character Sheet',
        label: `${fieldKey} (${pcId})`,
        before: 'Current sheet state',
        after: summaryAfter,
      });
    }
  }

  // 5. Local HUD Layout Preferences
  if (validated.localHudPrefs) {
    const hud = validated.localHudPrefs;
    if (hud.density) {
      items.push({
        id: 'hud.density',
        scope: 'local_hud',
        category: 'Table HUD Layout',
        label: 'HUD Density',
        before: currentHudPrefs?.density || 'comfortable',
        after: hud.density,
      });
    }
    if (hud.widgetOrder && hud.widgetOrder.length > 0) {
      items.push({
        id: 'hud.widgetOrder',
        scope: 'local_hud',
        category: 'Table HUD Layout',
        label: 'Pinned / Widget Order',
        before: (currentHudPrefs?.widgetOrder ?? HUD_WIDGET_IDS)
          .map((w) => HUD_WIDGET_LABELS[w])
          .slice(0, 3)
          .join(' → '),
        after: hud.widgetOrder.map((w) => HUD_WIDGET_LABELS[w]).join(' → '),
      });
    }
    if (hud.widgets) {
      for (const [wId, wPref] of Object.entries(hud.widgets) as Array<
        [HudWidgetId, HudWidgetPref | undefined]
      >) {
        if (!wPref) continue;
        const prevVis = currentHudPrefs?.widgets?.[wId]?.visible ?? true;
        const parts: string[] = [];
        if (typeof wPref.visible === 'boolean') {
          parts.push(wPref.visible ? 'Visible' : 'Hidden');
        }
        if (wPref.pinnedTop) parts.push('Pinned to Top');
        if (typeof wPref.order === 'number') parts.push(`Order #${wPref.order + 1}`);
        if (parts.length > 0) {
          items.push({
            id: `hud.widget.${wId}`,
            scope: 'local_hud',
            category: 'Table HUD Layout',
            label: HUD_WIDGET_LABELS[wId] || wId,
            before: prevVis ? 'Visible' : 'Hidden',
            after: parts.join(' · '),
          });
        }
      }
    }
  }

  return items;
}

export interface WorkspaceUndoBundle {
  createdAtMs: number;
  summary: string;
  previousCampaignData?: Record<string, any>;
  previousHudPrefs?: HudLayoutPrefs | null;
  previousLocalTerms?: TerminologyMap | null;
  previousOwnedPcSnapshots?: Record<string, PlayerCharacter>;
  previousTrackerState?: PlayerLocalTrackerState;
}

/**
 * Applies a validated `CampaignWorkspacePatch` to GM campaign data cleanly,
 * returning `{ nextData, undoBundle }` without mutating `currentData` in place.
 * Throws if `!validated.canApplyToCampaign`.
 */
export function applyWorkspacePatchToCampaignData(
  currentData: Record<string, any>,
  validated: ValidatedWorkspacePatch,
): { nextData: Record<string, any>; undoSnapshot: Record<string, any> } {
  if (!validated.canApplyToCampaign) {
    throw new Error(
      'Cannot apply campaign-wide patch without GM campaign-owner authority.',
    );
  }

  const undoSnapshot = JSON.parse(JSON.stringify(currentData ?? {}));
  const nextData: Record<string, any> = JSON.parse(JSON.stringify(currentData ?? {}));
  const patch = validated.campaignPatch;

  // 1. Campaign Mode & Prep Target Overrides
  if (patch.campaignMode) {
    const nextMode = patch.campaignMode.mode;
    const effectiveScale: 'standard' | 'duet' | 'solo' =
      nextMode === 'solo' || nextMode === 'duet' || nextMode === 'standard'
        ? nextMode
        : nextData.__prepScale === 'solo' || nextData.__prepScale === 'duet'
          ? nextData.__prepScale
          : nextData.__soloMode
            ? 'duet'
            : 'standard';

    if (nextMode) {
      nextData.mode = nextMode;
      if (nextMode === 'solo' || nextMode === 'duet' || nextMode === 'standard') {
        nextData.__prepScale = nextMode;
        nextData.__soloMode = nextMode === 'solo' || nextMode === 'duet';
      }
    }

    if (patch.campaignMode.prepTargetOverrides) {
      const prevOverrides: PrepTargetOverrides = {
        ...(nextData[OVERRIDES_STATE_KEY] ?? {}),
      };
      for (const [rawK, val] of Object.entries(
        patch.campaignMode.prepTargetOverrides,
      )) {
        const key = normalizePrepTargetKey(rawK);
        if (!key) continue;
        const existingEntry = { ...(prevOverrides[key] ?? {}) };
        if (typeof val === 'number') {
          existingEntry[effectiveScale] = clampInt(val, 0, 99);
        } else if (val && typeof val === 'object') {
          if (typeof val.standard === 'number') {
            existingEntry.standard = clampInt(val.standard, 0, 99);
          }
          if (typeof val.duet === 'number') {
            existingEntry.duet = clampInt(val.duet, 0, 99);
          }
          if (typeof val.solo === 'number') {
            existingEntry.solo = clampInt(val.solo, 0, 99);
          }
        }
        prevOverrides[key] = existingEntry;
      }
      nextData[OVERRIDES_STATE_KEY] = prevOverrides;
    }
  }

  // 2. Stored Workspace Config (`systemFlavorAndTrackers` + `terminologyMap`)
  const prevConfig: StoredWorkspaceConfig = {
    ...(nextData[WORKSPACE_CONFIG_STATE_KEY] ?? {}),
  };

  if (patch.systemFlavorAndTrackers) {
    const incoming = patch.systemFlavorAndTrackers;
    const prevSft: SystemFlavorAndTrackers = {
      ...(prevConfig.systemFlavorAndTrackers ?? {}),
    };

    if (incoming.genre) {
      prevSft.genre = incoming.genre;
      nextData.genre = incoming.genre;
    }
    if (incoming.toneTags && incoming.toneTags.length > 0) {
      const mergedTones = Array.from(
        new Set([...(prevSft.toneTags ?? []), ...incoming.toneTags]),
      ).slice(0, 16);
      prevSft.toneTags = mergedTones;
      const existingDataTones = Array.isArray(nextData.tone) ? nextData.tone : [];
      nextData.tone = Array.from(
        new Set([...existingDataTones, ...incoming.toneTags]),
      ).slice(0, 16);
    }
    if (incoming.resourcePoolTemplates && incoming.resourcePoolTemplates.length > 0) {
      const existingTemplates = [...(prevSft.resourcePoolTemplates ?? [])];
      for (const tpl of incoming.resourcePoolTemplates) {
        const idx = existingTemplates.findIndex(
          (e) => e.name.toLowerCase() === tpl.name.toLowerCase(),
        );
        if (idx >= 0) existingTemplates[idx] = tpl;
        else existingTemplates.push(tpl);
      }
      prevSft.resourcePoolTemplates = existingTemplates;

      // Seed resource pools onto existing campaign PCs idempotently
      if (Array.isArray(nextData.pcs)) {
        nextData.pcs = nextData.pcs.map((pc: any) => {
          if (!pc || typeof pc !== 'object') return pc;
          const curPools: PcResourcePool[] = Array.isArray(pc.resourcePools)
            ? pc.resourcePools
            : [];
          return {
            ...pc,
            resourcePools: mergeResourcePoolTemplatesIntoPcPools(
              curPools,
              incoming.resourcePoolTemplates!,
            ),
          };
        });
      }
    }
    if (incoming.conditionBuffPresets && incoming.conditionBuffPresets.length > 0) {
      const existingPresets = [...(prevSft.conditionBuffPresets ?? [])];
      for (const preset of incoming.conditionBuffPresets) {
        const idx = existingPresets.findIndex(
          (e) => e.name.toLowerCase() === preset.name.toLowerCase(),
        );
        if (idx >= 0) existingPresets[idx] = preset;
        else existingPresets.push(preset);
      }
      prevSft.conditionBuffPresets = existingPresets;
    }
    if (incoming.clockCategories && incoming.clockCategories.length > 0) {
      prevSft.clockCategories = Array.from(
        new Set([...(prevSft.clockCategories ?? []), ...incoming.clockCategories]),
      ).slice(0, 20);
    }

    prevConfig.systemFlavorAndTrackers = prevSft;
  }

  if (patch.workflow) {
    const prevWf: WorkflowPatch = { ...(prevConfig.workflow ?? {}) };
    if (typeof patch.workflow.blockDurationMinutes === 'number') {
      prevWf.blockDurationMinutes = patch.workflow.blockDurationMinutes;
    }
    if (typeof patch.workflow.cruiseCeilingBlocks === 'number') {
      prevWf.cruiseCeilingBlocks = patch.workflow.cruiseCeilingBlocks;
    }
    if (typeof patch.workflow.surgeCeilingBlocks === 'number') {
      prevWf.surgeCeilingBlocks = patch.workflow.surgeCeilingBlocks;
    }
    if (patch.workflow.loadMode) {
      prevWf.loadMode = patch.workflow.loadMode;
    }
    if (patch.workflow.restVariant) {
      prevWf.restVariant = patch.workflow.restVariant;
    }
    if (typeof patch.workflow.autoSnapshotIntervalMinutes === 'number') {
      prevWf.autoSnapshotIntervalMinutes =
        patch.workflow.autoSnapshotIntervalMinutes;
    }
    if (patch.workflow.activePillars && patch.workflow.activePillars.length > 0) {
      prevWf.activePillars = Array.from(
        new Set([
          ...(prevWf.activePillars ?? []),
          ...patch.workflow.activePillars,
        ]),
      );
    }
    if (patch.workflow.channels && patch.workflow.channels.length > 0) {
      const mergedChannels = [...(prevWf.channels ?? [])];
      for (const ch of patch.workflow.channels) {
        const idx = mergedChannels.findIndex((c) => c.key === ch.key);
        if (idx >= 0) mergedChannels[idx] = { ...mergedChannels[idx], ...ch };
        else mergedChannels.push({ ...ch });
      }
      prevWf.channels = mergedChannels;
    }
    prevConfig.workflow = prevWf;
  }

  if (patch.houseRules && patch.houseRules.length > 0) {
    const mergedRules = [...(prevConfig.houseRules ?? [])];
    for (const incoming of patch.houseRules) {
      const idx = mergedRules.findIndex(
        (r) =>
          r.id === incoming.id ||
          r.title.trim().toLowerCase() === incoming.title.trim().toLowerCase(),
      );
      const enabled = incoming.op === 'disable' ? false : (incoming.enabled ?? true);
      const entry: HouseRulePatchEntry = {
        ...incoming,
        enabled,
      };
      if (idx >= 0) mergedRules[idx] = { ...mergedRules[idx], ...entry };
      else mergedRules.push(entry);
    }
    prevConfig.houseRules = mergedRules;
  }

  if (patch.terminologyMap) {
    prevConfig.terminologyMap = {
      ...(prevConfig.terminologyMap ?? {}),
      ...patch.terminologyMap,
    };
  }

  if (
    patch.workflow ||
    patch.houseRules ||
    patch.systemFlavorAndTrackers ||
    patch.terminologyMap
  ) {
    prevConfig.updatedAtMs = Date.now();
    nextData[WORKSPACE_CONFIG_STATE_KEY] = prevConfig;
  }

  // Apply any explicit GM-validated PC field updates
  if (Object.keys(validated.pcWritebacks).length > 0 && Array.isArray(nextData.pcs)) {
    nextData.pcs = nextData.pcs.map((pc: any) => {
      if (!pc || typeof pc !== 'object' || !validated.pcWritebacks[pc.id]) return pc;
      return { ...pc, ...validated.pcWritebacks[pc.id] };
    });
  }

  return { nextData, undoSnapshot };
}

/**
 * Applies a validated player-scoped tracker patch on top of `prevTracker`,
 * reconciling tombstones and strictly preserving `sharedWithGm: false` unless
 * explicitly confirmed.
 */
export function applyValidatedPatchToPlayerTracker(
  prevTracker: PlayerLocalTrackerState,
  validated: ValidatedWorkspacePatch,
): {
  nextTracker: PlayerLocalTrackerState;
  outboundSharedWritebacks: ReturnType<typeof serializeOutboundTrackerWriteback>;
} {
  const tp = validated.localTrackerPatch;
  if (!tp) {
    return {
      nextTracker: prevTracker,
      outboundSharedWritebacks: serializeOutboundTrackerWriteback(prevTracker),
    };
  }

  const candidate: PlayerLocalTrackerState = {
    ...prevTracker,
    quests: tp.quests ? (tp.quests as any) : prevTracker.quests,
    annotations: tp.annotations ? (tp.annotations as any) : prevTracker.annotations,
    journal: tp.journal ? (tp.journal as any) : prevTracker.journal,
    theoryLinks: tp.theoryLinks ? (tp.theoryLinks as any) : prevTracker.theoryLinks,
    stickyCards: tp.stickyCards ? (tp.stickyCards as any) : prevTracker.stickyCards,
    updatedAtMs: Date.now(),
  };

  const reconciled = reconcileTrackerSharingTransition(prevTracker, candidate);
  return {
    nextTracker: reconciled,
    outboundSharedWritebacks: serializeOutboundTrackerWriteback(reconciled),
  };
}

/**
 * Applies `validated.pcWritebacks` strictly to PCs present in `validated.pcWritebacks`,
 * supporting dotted allowlist paths (e.g. `'hp.current'`, `'hitDice.used'`) while
 * leaving every unowned / untouched PC record byte-for-byte identical.
 */
export function applyPlayerWorkspacePatchToPcs<T extends Record<string, any>>(
  pcs: readonly T[],
  validated: ValidatedWorkspacePatch,
): T[] {
  if (!Array.isArray(pcs)) return [];
  return pcs.map((pc) => {
    if (!pc || typeof pc !== 'object') return pc;
    const pcId = typeof pc.id === 'string' ? pc.id : '';
    const writebacks = pcId ? validated.pcWritebacks[pcId] : undefined;
    if (!writebacks || Object.keys(writebacks).length === 0) {
      // Return an unmutated deep clone so unowned PCs remain byte-for-byte identical
      return JSON.parse(JSON.stringify(pc)) as T;
    }

    const nextPc: Record<string, any> = JSON.parse(JSON.stringify(pc));
    for (const [fieldPath, val] of Object.entries(writebacks)) {
      if (!(PLAYER_EDITABLE_FIELDS as readonly string[]).includes(fieldPath)) {
        continue;
      }
      if (!validatePlayerField(fieldPath, val)) {
        continue;
      }
      if (fieldPath.includes('.')) {
        const [parentKey, childKey] = fieldPath.split('.', 2);
        const prevParent =
          nextPc[parentKey] && typeof nextPc[parentKey] === 'object'
            ? { ...nextPc[parentKey] }
            : {};
        prevParent[childKey] = JSON.parse(JSON.stringify(val));
        nextPc[parentKey] = prevParent;
      } else {
        nextPc[fieldPath] = JSON.parse(JSON.stringify(val));
      }
    }
    return nextPc as T;
  });
}

/**
 * Projects ONLY public, spoiler-scrubbed `terminologyMap` and
 * `systemFlavorAndTrackers` templates from GM campaign data for `SlotProjection`.
 * Never reads or emits entities, secrets, GM notes, or non-public (`visibility !== 'public'`) configs.
 */
export function projectPublicWorkspaceConfig(
  data: Record<string, unknown> | undefined,
): ProjectedWorkspaceConfig | undefined {
  if (!data || typeof data !== 'object') return undefined;
  const playerCfg = (data as Record<string, any>).player;
  if (
    playerCfg?.entityVisibility &&
    typeof playerCfg.entityVisibility === 'object' &&
    playerCfg.entityVisibility[WORKSPACE_CONFIG_STATE_KEY] !== undefined &&
    playerCfg.entityVisibility[WORKSPACE_CONFIG_STATE_KEY] !== 'public'
  ) {
    return undefined;
  }

  const rawCfg = data[WORKSPACE_CONFIG_STATE_KEY] as StoredWorkspaceConfig | undefined;
  if (!rawCfg || typeof rawCfg !== 'object') return undefined;
  if (!isPublicVisibility(rawCfg)) return undefined;

  const out: ProjectedWorkspaceConfig = {};
  if (
    rawCfg.terminologyMap &&
    typeof rawCfg.terminologyMap === 'object' &&
    isPublicVisibility(rawCfg.terminologyMap)
  ) {
    const cleanTerms = sanitizeTerminologyMap(rawCfg.terminologyMap, true);
    if (cleanTerms) out.terminologyMap = cleanTerms;
  }

  if (
    rawCfg.systemFlavorAndTrackers &&
    typeof rawCfg.systemFlavorAndTrackers === 'object' &&
    isPublicVisibility(rawCfg.systemFlavorAndTrackers)
  ) {
    const sft = rawCfg.systemFlavorAndTrackers;
    const pubSft: NonNullable<ProjectedWorkspaceConfig['systemFlavorAndTrackers']> = {};
    if (typeof sft.genre === 'string' && sft.genre.trim()) {
      pubSft.genre = stripInlineSpoilers(sft.genre).trim().slice(0, 80);
    }
    if (Array.isArray(sft.toneTags) && sft.toneTags.length > 0) {
      pubSft.toneTags = sft.toneTags
        .filter((t): t is string => typeof t === 'string')
        .map((t) => stripInlineSpoilers(t).trim().slice(0, 40))
        .filter(Boolean);
    }
    if (
      Array.isArray(sft.resourcePoolTemplates) &&
      sft.resourcePoolTemplates.length > 0
    ) {
      const visiblePools = sft.resourcePoolTemplates.filter(isPublicVisibility);
      if (visiblePools.length > 0) {
        pubSft.resourcePoolTemplates = visiblePools.map((p) => ({
          ...(p.id ? { id: p.id } : {}),
          name: stripInlineSpoilers(p.name).trim().slice(0, 60),
          max: clampInt(p.max, 1, 999),
          rechargeOn: p.rechargeOn,
        }));
      }
    }
    if (
      Array.isArray(sft.conditionBuffPresets) &&
      sft.conditionBuffPresets.length > 0
    ) {
      const visibleBuffs = sft.conditionBuffPresets.filter(isPublicVisibility);
      if (visibleBuffs.length > 0) {
        pubSft.conditionBuffPresets = visibleBuffs.map((b) => ({
          ...(b.id ? { id: b.id } : {}),
          ...(b.presetKey ? { presetKey: b.presetKey } : {}),
          name: stripInlineSpoilers(b.name).trim().slice(0, 60),
          ...(b.description
            ? { description: stripInlineSpoilers(b.description).trim().slice(0, 240) }
            : {}),
          ...(typeof b.acBonus === 'number' ? { acBonus: b.acBonus } : {}),
          ...(typeof b.speedBonus === 'number' ? { speedBonus: b.speedBonus } : {}),
          ...(typeof b.speedMultiplier === 'number'
            ? { speedMultiplier: b.speedMultiplier }
            : {}),
          ...(b.saveBonusFormula ? { saveBonusFormula: b.saveBonusFormula } : {}),
          ...(b.attackBonusFormula ? { attackBonusFormula: b.attackBonusFormula } : {}),
          ...(b.checkBonusFormula ? { checkBonusFormula: b.checkBonusFormula } : {}),
          ...(b.damageBonusFormula ? { damageBonusFormula: b.damageBonusFormula } : {}),
          ...(b.rollModeOverride ? { rollModeOverride: b.rollModeOverride } : {}),
          ...(typeof b.affectsChecks === 'boolean'
            ? { affectsChecks: b.affectsChecks }
            : {}),
          ...(typeof b.affectsAttacks === 'boolean'
            ? { affectsAttacks: b.affectsAttacks }
            : {}),
          ...(typeof b.affectsSaves === 'boolean'
            ? { affectsSaves: b.affectsSaves }
            : {}),
          ...(b.expiresOn ? { expiresOn: b.expiresOn } : {}),
        }));
      }
    }
    if (Array.isArray(sft.clockCategories) && sft.clockCategories.length > 0) {
      pubSft.clockCategories = sft.clockCategories
        .filter((c): c is string => typeof c === 'string')
        .map((c) => stripInlineSpoilers(c).trim().slice(0, 40))
        .filter(Boolean);
    }
    if (Object.keys(pubSft).length > 0) {
      out.systemFlavorAndTrackers = pubSft;
    }
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

// ---------------------------------------------------------------------------
// 6. Local HUD Layout & Local Terminology Storage (localStorage + IndexedDB)
// ---------------------------------------------------------------------------

const HUD_LS_PREFIX = 'gma_workspace_hud_v1:';
const TERM_LS_PREFIX = 'gma_workspace_terms_v1:';
const HUD_IDB_NAME = 'gma_workspace_architect_db';
const HUD_IDB_STORE = 'prefs';

const memoryHudStore = new Map<string, HudLayoutPrefs>();
const memoryTermStore = new Map<string, TerminologyMap>();

function openPrefsIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(HUD_IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(HUD_IDB_STORE)) {
          db.createObjectStore(HUD_IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbPutPref(key: string, value: unknown): Promise<void> {
  const db = await openPrefsIdb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(HUD_IDB_STORE, 'readwrite');
      tx.objectStore(HUD_IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore IDB write error in restricted environments
  }
}

export function buildHudScopeKey(
  campaignId: string | undefined,
  role: 'gm' | 'player',
  slotId?: string,
): string {
  return `${campaignId || 'standalone'}:${role}:${slotId || 'local'}`;
}

export function mergeHudLayoutPrefs(
  prev: HudLayoutPrefs | undefined | null,
  patch: HudLayoutPrefs | undefined | null,
): HudLayoutPrefs {
  const base: HudLayoutPrefs = {
    ...(prev ?? {}),
    widgets: { ...(prev?.widgets ?? {}) },
  };
  if (!patch) return base;
  if (patch.density) base.density = patch.density;
  if (patch.widgetOrder && patch.widgetOrder.length > 0) {
    base.widgetOrder = Array.from(new Set(patch.widgetOrder));
  }
  if (patch.widgets) {
    const nextWidgets = { ...(base.widgets ?? {}) };
    for (const wId of HUD_WIDGET_IDS) {
      if (patch.widgets[wId]) {
        nextWidgets[wId] = {
          ...(nextWidgets[wId] ?? {}),
          ...patch.widgets[wId],
        };
      }
    }
    base.widgets = nextWidgets;
  }
  return base;
}

export function loadLocalHudPrefs(scopeKey: string): HudLayoutPrefs | null {
  const fullKey = `${HUD_LS_PREFIX}${scopeKey}`;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(fullKey);
      if (raw) {
        const parsed = HudLayoutPrefsSchema.safeParse(JSON.parse(raw));
        if (parsed.success) {
          memoryHudStore.set(fullKey, parsed.data);
          return parsed.data;
        }
      }
    }
  } catch {
    // fallback to memory store
  }
  return memoryHudStore.get(fullKey) ?? null;
}

export function saveLocalHudPrefs(
  scopeKey: string,
  prefs: HudLayoutPrefs | null,
): void {
  const fullKey = `${HUD_LS_PREFIX}${scopeKey}`;
  if (prefs === null) {
    memoryHudStore.delete(fullKey);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(fullKey);
      }
    } catch {
      // ignore
    }
    void idbPutPref(fullKey, null);
  } else {
    memoryHudStore.set(fullKey, prefs);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(fullKey, JSON.stringify(prefs));
      }
    } catch {
      // ignore
    }
    void idbPutPref(fullKey, prefs);
  }

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(
      new CustomEvent(HUD_PREFS_EVENT_NAME, { detail: { scopeKey } }),
    );
  }
}

export function loadLocalTerminologyPrefs(scopeKey: string): TerminologyMap | null {
  const fullKey = `${TERM_LS_PREFIX}${scopeKey}`;
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(fullKey);
      if (raw) {
        const clean = sanitizeTerminologyMap(JSON.parse(raw), true);
        if (clean) {
          memoryTermStore.set(fullKey, clean);
          return clean;
        }
      }
    }
  } catch {
    // fallback
  }
  return memoryTermStore.get(fullKey) ?? null;
}

export function saveLocalTerminologyPrefs(
  scopeKey: string,
  terms: TerminologyMap | null,
): void {
  const fullKey = `${TERM_LS_PREFIX}${scopeKey}`;
  if (terms === null) {
    memoryTermStore.delete(fullKey);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(fullKey);
      }
    } catch {
      // ignore
    }
    void idbPutPref(fullKey, null);
  } else {
    memoryTermStore.set(fullKey, terms);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(fullKey, JSON.stringify(terms));
      }
    } catch {
      // ignore
    }
    void idbPutPref(fullKey, terms);
  }

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(
      new CustomEvent(HUD_PREFS_EVENT_NAME, { detail: { scopeKey } }),
    );
  }
}

export interface ResolvedHudWidgetItem {
  id: HudWidgetId;
  label: string;
  visible: boolean;
  pinnedTop: boolean;
  order: number;
}

export interface ResolvedHudLayout {
  density: HudDensity;
  orderedWidgets: ResolvedHudWidgetItem[];
  visibleWidgetIds: HudWidgetId[];
  pinnedTopWidgetIds: HudWidgetId[];
  isWidgetVisible: (id: HudWidgetId) => boolean;
  densitySpacingClass: string;
}

export function resolveEffectiveHudLayout(
  prefs: HudLayoutPrefs | null | undefined,
): ResolvedHudLayout {
  const density: HudDensity = prefs?.density ?? 'comfortable';
  const orderList = prefs?.widgetOrder ?? [];

  const items: ResolvedHudWidgetItem[] = HUD_WIDGET_IDS.map((id, defaultIdx) => {
    const w = prefs?.widgets?.[id];
    const explicitOrderIdx = orderList.indexOf(id);
    const baseOrder =
      typeof w?.order === 'number'
        ? w.order
        : explicitOrderIdx >= 0
          ? explicitOrderIdx
          : defaultIdx + 10;
    const pinnedTop = Boolean(w?.pinnedTop);
    return {
      id,
      label: HUD_WIDGET_LABELS[id],
      visible: w?.visible !== false,
      pinnedTop,
      order: pinnedTop ? baseOrder - 100 : baseOrder,
    };
  });

  items.sort((a, b) => a.order - b.order);

  const visibleSet = new Set(items.filter((i) => i.visible).map((i) => i.id));
  const densitySpacingClass =
    density === 'compact'
      ? 'space-y-2 text-xs'
      : density === 'spacious'
        ? 'space-y-6 text-sm'
        : 'space-y-4';

  return {
    density,
    orderedWidgets: items,
    visibleWidgetIds: items.filter((i) => i.visible).map((i) => i.id),
    pinnedTopWidgetIds: items
      .filter((i) => i.visible && i.pinnedTop)
      .map((i) => i.id),
    isWidgetVisible: (id: HudWidgetId) => visibleSet.has(id),
    densitySpacingClass,
  };
}

// ---------------------------------------------------------------------------
// 7. Safe Prompt Builder + Fence-Stripping Relay Parser + Chrome AI + NL Compiler
// ---------------------------------------------------------------------------

export interface ArchitectChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const WORKSPACE_ARCHITECT_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['reply', 'patch'],
  properties: {
    reply: { type: 'string' },
    patch: {
      type: 'object',
      additionalProperties: false,
      properties: {
        campaignMode: {
          type: 'object',
          additionalProperties: false,
          properties: {
            mode: { type: 'string', enum: ['standard', 'duet', 'solo', 'player'] },
            prepTargetOverrides: {
              type: 'object',
              additionalProperties: { type: 'number' },
            },
          },
        },
        systemFlavorAndTrackers: {
          type: 'object',
          additionalProperties: false,
          properties: {
            genre: { type: 'string' },
            toneTags: { type: 'array', items: { type: 'string' } },
            resourcePoolTemplates: {
              type: 'array',
              items: {
                type: 'object',
                required: ['name', 'max', 'rechargeOn'],
                additionalProperties: false,
                properties: {
                  name: { type: 'string' },
                  max: { type: 'number' },
                  rechargeOn: {
                    type: 'string',
                    enum: ['short', 'long', 'dawn', 'manual'],
                  },
                },
              },
            },
            conditionBuffPresets: {
              type: 'array',
              items: {
                type: 'object',
                required: ['name'],
                additionalProperties: false,
                properties: {
                  name: { type: 'string' },
                  description: { type: 'string' },
                  acBonus: { type: 'number' },
                  speedBonus: { type: 'number' },
                  saveBonusFormula: { type: 'string' },
                  attackBonusFormula: { type: 'string' },
                  checkBonusFormula: { type: 'string' },
                  rollModeOverride: {
                    type: 'string',
                    enum: ['normal', 'advantage', 'disadvantage'],
                  },
                  expiresOn: {
                    type: 'string',
                    enum: ['turn', 'round', 'shortRest', 'longRest', 'manual'],
                  },
                },
              },
            },
            clockCategories: { type: 'array', items: { type: 'string' } },
          },
        },
        terminologyMap: {
          type: 'object',
          additionalProperties: { type: 'string' },
        },
        hudLayoutPrefs: {
          type: 'object',
          additionalProperties: false,
          properties: {
            density: {
              type: 'string',
              enum: ['compact', 'comfortable', 'spacious'],
            },
            widgetOrder: {
              type: 'array',
              items: {
                type: 'string',
                enum: [
                  'initiative',
                  'rollFeed',
                  'clocks',
                  'audioNarration',
                  'actionEconomy',
                  'conspiracyBoard',
                ],
              },
            },
            widgets: {
              type: 'object',
              additionalProperties: {
                type: 'object',
                properties: {
                  visible: { type: 'boolean' },
                  order: { type: 'number' },
                  pinnedTop: { type: 'boolean' },
                },
              },
            },
          },
        },
      },
    },
    followUpOptions: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'label', 'promptReply'],
        additionalProperties: false,
        properties: {
          id: { type: 'string' },
          label: { type: 'string' },
          description: { type: 'string' },
          promptReply: { type: 'string' },
        },
      },
    },
  },
};

/**
 * Builds a strictly redacted, privacy-safe summary of current workspace settings
 * for LLM prompts. Never reads or includes GM secrets, NPCs, private notes,
 * hidden entities, or unowned PC details.
 */
export function buildSafeArchitectContextSummary(
  campaignName: string,
  campaignData: Record<string, any> | undefined,
  authority: WorkspaceAuthorityContext,
  currentHudPrefs?: HudLayoutPrefs | null,
): Record<string, unknown> {
  const canEditCampaign = hasCampaignEditAuthority(authority);
  const publicCfg = projectPublicWorkspaceConfig(campaignData);
  const ownedPcs = getOwnedPcsList(authority)
    .filter(isPublicVisibility)
    .map((p) => ({
      id: p.id,
      name: stripInlineSpoilers(String(p.name ?? 'Character')),
      resourcePools: Array.isArray(p.resourcePools)
        ? p.resourcePools.filter(isPublicVisibility).map((r: any) => ({
            name: stripInlineSpoilers(String(r.name ?? '')),
            max: Number(r.max) || 1,
            rechargeOn: r.rechargeOn || 'long',
          }))
        : [],
    }));

  if (!canEditCampaign) {
    // Player-safe context ONLY — zero campaign internals
    return {
      campaignName: stripInlineSpoilers(campaignName || 'Campaign'),
      authorityScope: 'player_local_and_owned_pc_only',
      ownedPcs,
      currentTerminology: publicCfg?.terminologyMap ?? {},
      currentHudPrefs: currentHudPrefs ?? { density: 'comfortable' },
    };
  }

  return {
    campaignName: campaignName || 'Campaign',
    authorityScope: 'gm_campaign_owner',
    currentMode:
      campaignData?.mode ?? (campaignData?.__soloMode ? 'duet' : 'standard'),
    currentGenre: campaignData?.genre ?? publicCfg?.systemFlavorAndTrackers?.genre ?? '',
    currentToneTags: Array.isArray(campaignData?.tone)
      ? campaignData.tone
      : publicCfg?.systemFlavorAndTrackers?.toneTags ?? [],
    currentPrepTargetOverrides: campaignData?.[OVERRIDES_STATE_KEY] ?? {},
    currentTerminology: publicCfg?.terminologyMap ?? {},
    currentResourceTemplates:
      publicCfg?.systemFlavorAndTrackers?.resourcePoolTemplates ?? [],
    currentClockCategories:
      publicCfg?.systemFlavorAndTrackers?.clockCategories ?? [],
    currentHudPrefs: currentHudPrefs ?? { density: 'comfortable' },
  };
}

export function buildArchitectSystemPrompt(
  authority: WorkspaceAuthorityContext,
): string {
  const canEditCampaign = hasCampaignEditAuthority(authority);
  return [
    'You are the GM Assistant Conversational Campaign & Table Customizer.',
    'Compile the user request into a strict JSON object matching { reply, patch, followUpOptions }.',
    canEditCampaign
      ? 'Authority: GM Campaign Owner. You may populate campaignMode (mode: standard|duet|solo|player, prepTargetOverrides for secrets, npcs, locations, monsters, scenes, factions, items, clocks, conflicts, facts), systemFlavorAndTrackers (genre, toneTags, resourcePoolTemplates [{name,max,rechargeOn}], conditionBuffPresets, clockCategories), terminologyMap (canonical keys: quests, dungeons, gold, npcs, locations, factions, secrets, clocks, encounters, monsters, items, sessions), and hudLayoutPrefs.'
      : 'Authority: Player Mode. Do NOT emit campaignMode. Limit changes strictly to hudLayoutPrefs, terminologyMap (local display), and systemFlavorAndTrackers.resourcePoolTemplates / conditionBuffPresets for the player’s own character sheet.',
    'Valid HUD widget IDs: initiative, rollFeed, clocks, audioNarration, actionEconomy, conspiracyBoard.',
    'Valid resourcePool rechargeOn values: short, long, dawn, manual.',
    'When any rule or scale choice is ambiguous, include 2 concise followUpOptions ("Option A: ..." and "Option B: ...") with clear promptReply strings.',
    'Return ONLY valid JSON with no markdown fences or commentary outside JSON.',
  ].join('\n');
}

export function buildArchitectRelayPrompt(
  userPrompt: string,
  history: ArchitectChatMessage[],
  campaignName: string,
  campaignData: Record<string, any> | undefined,
  authority: WorkspaceAuthorityContext,
  currentHudPrefs?: HudLayoutPrefs | null,
): string {
  const safeCtx = buildSafeArchitectContextSummary(
    campaignName,
    campaignData,
    authority,
    currentHudPrefs,
  );
  const recentHistory = history
    .slice(-4)
    .map((m) => `${m.role.toUpperCase()}: ${stripInlineSpoilers(m.content)}`)
    .join('\n');

  return [
    buildArchitectSystemPrompt(authority),
    '',
    '### Current Workspace Context (Redacted & Privacy-Safe)',
    JSON.stringify(safeCtx, null, 2),
    ...(recentHistory ? ['', '### Recent Conversation', recentHistory] : []),
    '',
    '### User Customization Request',
    hasCampaignEditAuthority(authority)
      ? userPrompt
      : stripInlineSpoilers(userPrompt),
    '',
    '### Required Output Schema',
    JSON.stringify(WORKSPACE_ARCHITECT_JSON_SCHEMA, null, 2),
  ].join('\n');
}

export function stripJsonCodeFences(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) return fenced[1].trim();
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }
  return trimmed;
}

/**
 * Parses and strictly validates an external LLM / Gemini copy-paste JSON response.
 */
export function parseArchitectRelayResponse(
  rawText: string,
  authority: WorkspaceAuthorityContext,
): {
  ok: boolean;
  turn?: ArchitectTurnResponse;
  validated?: ValidatedWorkspacePatch;
  error?: string;
} {
  const jsonStr = stripJsonCodeFences(rawText);
  if (!jsonStr) {
    return { ok: false, error: 'Empty response — paste the JSON output from Gemini.' };
  }
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonStr);
  } catch (err: any) {
    return {
      ok: false,
      error: `Invalid JSON syntax: ${err?.message || 'could not parse JSON'}`,
    };
  }

  const scrubbed = scrubUntrustedObject(parsedJson, {
    stripSpoilers: !hasCampaignEditAuthority(authority),
  }) as Record<string, unknown>;

  // Accept either `{ reply, patch, followUpOptions }` or a direct `CampaignWorkspacePatch` object
  const rawPatch =
    scrubbed && typeof scrubbed.patch === 'object' && scrubbed.patch !== null
      ? scrubbed.patch
      : scrubbed;
  const replyText =
    typeof scrubbed?.reply === 'string' && scrubbed.reply.trim()
      ? scrubbed.reply.trim().slice(0, 1500)
      : 'Compiled workspace configuration patch from pasted JSON.';

  const validated = validateWorkspacePatch(rawPatch, authority);
  if (!validated.ok) {
    return {
      ok: false,
      error: validated.errors.join('; ') || 'Patch failed schema validation.',
    };
  }

  const effectivePatch: CampaignWorkspacePatch = validated.canApplyToCampaign
    ? validated.campaignPatch
    : {
        ...(validated.localHudPrefs ? { hudLayoutPrefs: validated.localHudPrefs } : {}),
        ...(validated.localTerminologyMap
          ? { terminologyMap: validated.localTerminologyMap }
          : {}),
      };

  const followUps: FollowUpOptionChip[] = [];
  if (Array.isArray(scrubbed?.followUpOptions)) {
    for (const rawOpt of scrubbed.followUpOptions.slice(0, 4)) {
      const chipCheck = FollowUpOptionChipSchema.safeParse(rawOpt);
      if (chipCheck.success) followUps.push(chipCheck.data);
    }
  }

  return {
    ok: true,
    turn: {
      reply: replyText,
      patch: effectivePatch,
      ...(followUps.length > 0 ? { followUpOptions: followUps } : {}),
    },
    validated,
  };
}

// ---------------------------------------------------------------------------
// 8. Chrome Built-In `LanguageModel` On-Device AI Adapter
// ---------------------------------------------------------------------------

export async function isChromeLanguageModelAvailable(): Promise<boolean> {
  try {
    const g = globalThis as Record<string, any>;
    if (g.LanguageModel && typeof g.LanguageModel.availability === 'function') {
      const status = await g.LanguageModel.availability();
      return status === 'available' || status === 'downloadable' || status === 'readily';
    }
    if (g.ai?.languageModel && typeof g.ai.languageModel.capabilities === 'function') {
      const caps = await g.ai.languageModel.capabilities();
      return caps?.available === 'readily' || caps?.available === 'after-download';
    }
  } catch {
    return false;
  }
  return false;
}

export async function runChromeLanguageModelArchitect(
  userPrompt: string,
  history: ArchitectChatMessage[],
  campaignName: string,
  campaignData: Record<string, any> | undefined,
  authority: WorkspaceAuthorityContext,
  currentHudPrefs?: HudLayoutPrefs | null,
): Promise<{
  ok: boolean;
  turn?: ArchitectTurnResponse;
  validated?: ValidatedWorkspacePatch;
  error?: string;
}> {
  try {
    const g = globalThis as Record<string, any>;
    const systemPrompt = buildArchitectSystemPrompt(authority);
    const fullPrompt = buildArchitectRelayPrompt(
      userPrompt,
      history,
      campaignName,
      campaignData,
      authority,
      currentHudPrefs,
    );

    let session: any = null;
    if (g.LanguageModel && typeof g.LanguageModel.create === 'function') {
      session = await g.LanguageModel.create({ systemPrompt });
    } else if (g.ai?.languageModel && typeof g.ai.languageModel.create === 'function') {
      session = await g.ai.languageModel.create({ systemPrompt });
    } else {
      return { ok: false, error: 'Chrome LanguageModel API is not available.' };
    }

    try {
      const rawOutput: string = await session.prompt(fullPrompt);
      return parseArchitectRelayResponse(rawOutput, authority);
    } finally {
      if (typeof session?.destroy === 'function') {
        session.destroy();
      }
    }
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'On-device LanguageModel inference failed.',
    };
  }
}

// ---------------------------------------------------------------------------
// 9. Deterministic Natural-Language Compiler (Instant Free/Offline Fallback)
// ---------------------------------------------------------------------------

const KNOWN_TRACKER_DEFS: Array<{
  pattern: RegExp;
  name: string;
  defaultMax: number;
  rechargeOn: RechargeTiming;
}> = [
  { pattern: /\bsanity\b/i, name: 'Sanity', defaultMax: 10, rechargeOn: 'manual' },
  { pattern: /\bluck\b/i, name: 'Luck', defaultMax: 5, rechargeOn: 'long' },
  { pattern: /\bstress\b/i, name: 'Stress', defaultMax: 6, rechargeOn: 'long' },
  { pattern: /\bresolve\b/i, name: 'Resolve', defaultMax: 6, rechargeOn: 'short' },
  { pattern: /\bgrit\b/i, name: 'Grit', defaultMax: 4, rechargeOn: 'short' },
  { pattern: /\bammo(?:unition)?\b/i, name: 'Ammo', defaultMax: 10, rechargeOn: 'manual' },
  { pattern: /\bhumanity\b/i, name: 'Humanity', defaultMax: 10, rechargeOn: 'manual' },
  { pattern: /\bcorruption\b/i, name: 'Corruption', defaultMax: 6, rechargeOn: 'manual' },
  { pattern: /\bhope\b/i, name: 'Hope', defaultMax: 6, rechargeOn: 'long' },
  { pattern: /\bsupply\b/i, name: 'Supply', defaultMax: 5, rechargeOn: 'manual' },
  { pattern: /\bheat\b/i, name: 'Heat', defaultMax: 6, rechargeOn: 'manual' },
  { pattern: /\bmomentum\b/i, name: 'Momentum', defaultMax: 6, rechargeOn: 'short' },
  { pattern: /\bstrain\b/i, name: 'Strain', defaultMax: 8, rechargeOn: 'short' },
];

const GENRE_PATTERNS: Array<{
  pattern: RegExp;
  genre: string;
  tones: string[];
  clocks: string[];
  buffs: ConditionBuffPreset[];
}> = [
  {
    pattern: /\b(cosmic horror|lovecraft(?:ian)?|eldritch|cthulhu|mythos)\b/i,
    genre: 'Cosmic Horror Mystery',
    tones: ['Cosmic Dread', 'Investigative', 'fragile-sanity'],
    clocks: ['Investigation', 'Cosmic Dread', 'Cult Ritual'],
    buffs: [
      {
        name: 'Shaken',
        description: 'Rattled by unnatural revelation',
        rollModeOverride: 'disadvantage',
        affectsChecks: true,
        expiresOn: 'shortRest',
      },
      {
        name: 'Steeled Nerves',
        saveBonusFormula: '1d4',
        affectsSaves: true,
        expiresOn: 'longRest',
      },
    ],
  },
  {
    pattern: /\b(cyberpunk|neon|sprawl|netrunner|megacorp)\b/i,
    genre: 'Cyberpunk Thriller',
    tones: ['High-Tech Low-Life', 'Noir', 'Corporate Intrigue'],
    clocks: ['Corp Alert', 'ICE Trace', 'Street Heat'],
    buffs: [
      {
        name: 'Overclocked Reflexes',
        acBonus: 2,
        speedBonus: 10,
        expiresOn: 'shortRest',
      },
      {
        name: 'System Glitch',
        rollModeOverride: 'disadvantage',
        affectsChecks: true,
        expiresOn: 'round',
      },
    ],
  },
  {
    pattern: /\b(sci-?fi|space opera|starship|galactic|exoplanet)\b/i,
    genre: 'Sci-Fi Frontier',
    tones: ['Speculative', 'Deep Space', 'Tactical'],
    clocks: ['Hull Integrity', 'Sector Patrol', 'Anomaly Research'],
    buffs: [
      {
        name: 'Zero-G Stabilizers',
        acBonus: 1,
        checkBonusFormula: '1d4',
        affectsChecks: true,
        expiresOn: 'shortRest',
      },
    ],
  },
  {
    pattern: /\b(mystery|noir|detective|investigation|gumshoe|whodunit)\b/i,
    genre: 'Investigative Mystery',
    tones: ['Noir', 'Clue-Driven', 'Suspenseful'],
    clocks: ['Investigation', 'Trail Goes Cold', 'Suspect Alert'],
    buffs: [
      {
        name: 'Keen Deduction',
        checkBonusFormula: '1d4',
        affectsChecks: true,
        expiresOn: 'shortRest',
      },
    ],
  },
  {
    pattern: /\b(heist|scoundrels|blades|caper|thieves)\b/i,
    genre: 'Scoundrel Heist',
    tones: ['Daring', 'Clock-Driven', 'High Stakes'],
    clocks: ['Alert Level', 'Vault Lock', 'Heat'],
    buffs: [
      {
        name: 'Flashback Edge',
        rollModeOverride: 'advantage',
        affectsChecks: true,
        expiresOn: 'turn',
      },
    ],
  },
  {
    pattern: /\b(grimdark|gritty|survival|dark fantasy)\b/i,
    genre: 'Gritty Dark Fantasy',
    tones: ['Grim', 'Perilous', 'Resource-Scarce'],
    clocks: ['Torch / Light', 'Omen', 'Attrition'],
    buffs: [
      {
        name: 'Lingering Wound',
        speedBonus: -10,
        expiresOn: 'longRest',
      },
    ],
  },
];

const WIDGET_MATCHERS: Array<{ id: HudWidgetId; pattern: RegExp }> = [
  { id: 'clocks', pattern: /\b(clocks?|progress clocks?)\b/i },
  {
    id: 'conspiracyBoard',
    pattern: /\b(conspiracy(?:\s+board)?|investigation\s+board|lore\s+graph|clue\s+board|evidence\s+board)\b/i,
  },
  { id: 'initiative', pattern: /\b(initiative(?:\s+hud|\s+tracker)?|turn\s+order)\b/i },
  { id: 'rollFeed', pattern: /\b(roll\s+feed|dice\s+feed|dice\s+log|roll\s+log)\b/i },
  { id: 'audioNarration', pattern: /\b(audio|music|narration(?:\s+feed)?|soundtrack|playlist)\b/i },
  { id: 'actionEconomy', pattern: /\b(action\s+economy|combat\s+bar|turn\s+actions?)\b/i },
];

/**
 * Deterministically compiles natural-language customization instructions into a
 * validated `ArchitectTurnResponse` + `ValidatedWorkspacePatch`, complete with
 * contextual `Option A / Option B` ambiguity chips.
 */
export function compileNaturalLanguageArchitectTurn(
  userPrompt: string,
  authority: WorkspaceAuthorityContext,
): {
  turn: ArchitectTurnResponse;
  validated: ValidatedWorkspacePatch;
} {
  const text = userPrompt.trim();
  const canEditCampaign = hasCampaignEditAuthority(authority);

  const rawPatch: Record<string, any> = {};
  const followUpOptions: FollowUpOptionChip[] = [];
  const summaryParts: string[] = [];

  // 1. Detect Campaign Mode & Prep Target Counts
  let detectedMode: CampaignModeOption | undefined;
  let twoPlayerAmbiguous = false;

  if (/\bsolo\b|\b1\s*player\b|\bsingle[- ]player\b|\bjournaling\b/i.test(text)) {
    detectedMode = 'solo';
  } else if (/\bduet\b|\b1[- ]on[- ]1\b|\bone[- ]on[- ]one\b/i.test(text)) {
    detectedMode = 'duet';
  } else if (/\b(2[- ]player|two[- ]player)\b/i.test(text)) {
    detectedMode = 'duet';
    twoPlayerAmbiguous = true;
  } else if (/\bstandard\s+(?:mode|scale|prep|party)\b|\bfull\s+party\b/i.test(text)) {
    detectedMode = 'standard';
  } else if (/\bswitch\s+to\s+player\s+mode\b/i.test(text)) {
    detectedMode = 'player';
  }

  const prepOverrides: Record<string, number> = {};
  const prepCountRegexes: Array<{ key: PrepTargetKey; rx: RegExp }> = [
    { key: 'secrets', rx: /\b(\d{1,2})\s+(?:secrets?|clues?|leads?)\b|\b(?:secrets?|clues?)\s*(?:to|=|:)\s*(\d{1,2})\b/i },
    { key: 'npcs', rx: /\b(\d{1,2})\s+npcs?\b|\bnpcs?\s*(?:to|=|:)\s*(\d{1,2})\b/i },
    { key: 'locations', rx: /\b(\d{1,2})\s+(?:locations?|sites?|dungeons?)\b|\b(?:locations?|sites?|dungeons?)\s*(?:to|=|:)\s*(\d{1,2})\b/i },
    { key: 'monsters', rx: /\b(\d{1,2})\s+(?:encounters?|monsters?|threats?)\b|\b(?:encounters?|monsters?)\s*(?:to|=|:)\s*(\d{1,2})\b/i },
    { key: 'scenes', rx: /\b(\d{1,2})\s+scenes?\b|\bscenes?\s*(?:to|=|:)\s*(\d{1,2})\b/i },
    { key: 'clocks', rx: /\b(\d{1,2})\s+clocks?\b|\bclocks?\s*(?:to|=|:)\s*(\d{1,2})\b/i },
    { key: 'factions', rx: /\b(\d{1,2})\s+factions?\b|\bfactions?\s*(?:to|=|:)\s*(\d{1,2})\b/i },
    { key: 'items', rx: /\b(\d{1,2})\s+(?:items?|loot|relics?)\b|\bitems?\s*(?:to|=|:)\s*(\d{1,2})\b/i },
  ];
  for (const { key, rx } of prepCountRegexes) {
    const m = text.match(rx);
    const numStr = m?.[1] || m?.[2];
    if (numStr) {
      prepOverrides[key] = clampInt(Number(numStr), 0, 99);
    }
  }

  if (detectedMode || Object.keys(prepOverrides).length > 0) {
    rawPatch.campaignMode = {
      ...(detectedMode ? { mode: detectedMode } : {}),
      ...(Object.keys(prepOverrides).length > 0
        ? { prepTargetOverrides: prepOverrides }
        : {}),
    };
    if (canEditCampaign) {
      if (detectedMode) summaryParts.push(`switched mode to **${detectedMode}**`);
      if (Object.keys(prepOverrides).length > 0) {
        summaryParts.push(
          `updated prep targets (${Object.entries(prepOverrides)
            .map(([k, v]) => `${k}: ${v}`)
            .join(', ')})`,
        );
      }
    }
  }

  // 2. Detect Genre, Tone Tags, Resource Pools, Buff Presets & Clock Categories
  const toneTags: string[] = [];
  const clockCategories: string[] = [];
  const buffPresets: ConditionBuffPreset[] = [];
  let detectedGenre: string | undefined;

  for (const g of GENRE_PATTERNS) {
    if (g.pattern.test(text)) {
      if (!detectedGenre) detectedGenre = g.genre;
      toneTags.push(...g.tones);
      clockCategories.push(...g.clocks);
      buffPresets.push(...g.buffs);
    }
  }

  const resourcePools: ResourcePoolTemplate[] = [];
  let sanityAmbiguous = false;
  for (const def of KNOWN_TRACKER_DEFS) {
    if (def.pattern.test(text)) {
      // Check if an explicit max was given near the tracker name, e.g. "Sanity (100)" or "Sanity 100" or "d100 Sanity"
      const explicitMaxMatch =
        text.match(new RegExp(`${def.name}\\s*(?:\\(|max\\s*|=|:)?\\s*(\\d{1,3})`, 'i')) ||
        (def.name === 'Sanity' && /\bd100\b/i.test(text) ? [null, '99'] : null);
      const maxVal = explicitMaxMatch?.[1]
        ? clampInt(Number(explicitMaxMatch[1]), 1, 999)
        : def.defaultMax;

      let recharge: RechargeTiming = def.rechargeOn;
      if (new RegExp(`${def.name}[^.,;]*short\\s+rest`, 'i').test(text)) recharge = 'short';
      else if (new RegExp(`${def.name}[^.,;]*long\\s+rest`, 'i').test(text)) recharge = 'long';
      else if (new RegExp(`${def.name}[^.,;]*dawn`, 'i').test(text)) recharge = 'dawn';
      else if (new RegExp(`${def.name}[^.,;]*manual`, 'i').test(text)) recharge = 'manual';

      if (def.name === 'Sanity' && !explicitMaxMatch?.[1]) {
        sanityAmbiguous = true;
      }

      resourcePools.push({
        name: def.name,
        max: maxVal,
        rechargeOn: recharge,
      });
    }
  }

  // Generic custom tracker pattern: e.g. `add Ki (max 8) tracker` or `add Favor tracker`
  const customTrackerRx =
    /\badd\s+([A-Z][a-zA-Z0-9_-]{1,24})(?:\s*\(\s*(?:max\s*)?(\d{1,3})\s*\))?\s+(?:tracker|pool|resource)/g;
  let customMatch: RegExpExecArray | null;
  while ((customMatch = customTrackerRx.exec(text)) !== null) {
    const cName = customMatch[1].trim();
    if (
      ! ['a', 'an', 'the', 'custom', 'pc', 'my'].includes(cName.toLowerCase()) &&
      !resourcePools.some((p) => p.name.toLowerCase() === cName.toLowerCase())
    ) {
      resourcePools.push({
        name: cName,
        max: customMatch[2] ? clampInt(Number(customMatch[2]), 1, 999) : 6,
        rechargeOn: 'long',
      });
    }
  }

  if (
    detectedGenre ||
    toneTags.length > 0 ||
    resourcePools.length > 0 ||
    buffPresets.length > 0 ||
    clockCategories.length > 0
  ) {
    rawPatch.systemFlavorAndTrackers = {
      ...(detectedGenre ? { genre: detectedGenre } : {}),
      ...(toneTags.length > 0 ? { toneTags: Array.from(new Set(toneTags)) } : {}),
      ...(resourcePools.length > 0 ? { resourcePoolTemplates: resourcePools } : {}),
      ...(buffPresets.length > 0 ? { conditionBuffPresets: buffPresets } : {}),
      ...(clockCategories.length > 0
        ? { clockCategories: Array.from(new Set(clockCategories)) }
        : {}),
    };
    if (detectedGenre && canEditCampaign) {
      summaryParts.push(`configured **${detectedGenre}** flavor & clock categories`);
    }
    if (resourcePools.length > 0) {
      summaryParts.push(
        `added **${resourcePools.map((r) => `${r.name} (${r.max})`).join(' & ')}** tracker${resourcePools.length > 1 ? 's' : ''}`,
      );
    }
  }

  // 3. Detect Terminology Overrides (`terminologyMap`)
  const terminologyMap: TerminologyMap = {};

  // Slash-list form: e.g. `rename Quests / Dungeons / Gold to Cases / Sites / Credits`
  const slashRenameRx =
    /\b(?:rename|change|map|replace)\s+["']?([a-zA-Z]+(?:\s*\/\s*[a-zA-Z]+)+)["']?\s+(?:to|as|into|->)\s+["']?([a-zA-Z ]+(?:\s*\/\s*[a-zA-Z ]+)+)["']?/i;
  const slashMatch = text.match(slashRenameRx);
  if (slashMatch) {
    const fromParts = slashMatch[1].split('/').map((s) => s.trim());
    const toParts = slashMatch[2].split('/').map((s) => s.trim());
    for (let i = 0; i < Math.min(fromParts.length, toParts.length); i++) {
      const k = normalizeTerminologyKey(fromParts[i]);
      if (k && toParts[i]) terminologyMap[k] = toParts[i];
    }
  }

  // Pairwise forms: `rename Gold to Cash and Quests to Leads`, `Gold -> Credits`, `call Quests Cases`
  const renameLeadClauseRx =
    /\b(?:rename|change|call|relabel|map)\s+([^.;!]+?)(?=(?:[.;!]|$|\b(?:and\s+)?(?:pin|hide|show|switch|set\s+up|add|use)\b))/gi;
  let leadClauseMatch: RegExpExecArray | null;
  const pairSegmentRx =
    /["']?(quests?|dungeons?|gold|coins?|currency|npcs?|locations?|factions?|secrets?|clues?|clocks?|encounters?|monsters?|items?|loot|sessions?)["']?\s+(?:to|as|into|->)\s+["']?([A-Za-z][A-Za-z0-9 -]{1,28}?)["']?(?=(?:\s*(?:,|;|and\b|&|$)))/gi;
  while ((leadClauseMatch = renameLeadClauseRx.exec(text)) !== null) {
    const subClause = leadClauseMatch[1];
    pairSegmentRx.lastIndex = 0;
    let pairMatch: RegExpExecArray | null;
    while ((pairMatch = pairSegmentRx.exec(subClause)) !== null) {
      const srcKey = normalizeTerminologyKey(pairMatch[1]);
      const destLabel = pairMatch[2].trim();
      if (
        srcKey &&
        destLabel &&
        !/^(?:the\s+)?(?:top|bottom|left|right|front|back)\b/i.test(destLabel)
      ) {
        terminologyMap[srcKey] = destLabel;
      }
    }
  }

  // Also support standalone arrow shorthand: `Gold -> Credits`
  const arrowPairRx =
    /\b(quests?|dungeons?|gold|coins?|currency|npcs?|locations?|factions?|secrets?|clues?|clocks?|encounters?|monsters?|items?|loot|sessions?)\s*->\s*([A-Za-z][A-Za-z0-9 -]{1,24}?)(?=(?:\s*(?:,|;|and\b|&|\.|!|$)))/gi;
  let arrowMatch: RegExpExecArray | null;
  while ((arrowMatch = arrowPairRx.exec(text)) !== null) {
    const srcKey = normalizeTerminologyKey(arrowMatch[1]);
    const destLabel = arrowMatch[2].trim();
    if (srcKey && destLabel) {
      terminologyMap[srcKey] = destLabel;
    }
  }

  if (Object.keys(terminologyMap).length > 0) {
    rawPatch.terminologyMap = terminologyMap;
    summaryParts.push(
      `renamed ${Object.entries(terminologyMap)
        .map(([k, v]) => `${DEFAULT_TERMINOLOGY_LABELS[k as CanonicalTerminologyKey] || k} → **${v}**`)
        .join(', ')}`,
    );
  }

  // 4. Detect HUD Layout Preferences (`hudLayoutPrefs`)
  const hudPrefs: HudLayoutPrefs = {};
  if (/\bcompact\b|\bdense\b|\btight\s+(?:hud|layout)\b/i.test(text)) {
    hudPrefs.density = 'compact';
  } else if (/\bspacious\b|\brelaxed\b|\broomy\b/i.test(text)) {
    hudPrefs.density = 'spacious';
  } else if (/\bcomfortable\b|\bdefault\s+density\b/i.test(text)) {
    hudPrefs.density = 'comfortable';
  }

  const widgetsMap: NonNullable<HudLayoutPrefs['widgets']> = {};
  const pinnedIds: HudWidgetId[] = [];

  // Clause-level detection for pin/top vs hide/remove vs show
  const clauses = text.split(/[,;.]|\band\s+(?=(?:pin|move|put|hide|disable|remove|show|enable)\b)/i);
  for (const clause of clauses) {
    const isPinClause = /\b(pin|top|first|prioritize|front)\b/i.test(clause);
    const isHideClause = /\b(hide|disable|turn\s+off|collapse|mute\s+widget|remove\s+widget)\b/i.test(clause);
    const isShowClause = /\b(show|enable|unhide|display)\b/i.test(clause);

    if (!isPinClause && !isHideClause && !isShowClause) continue;

    for (const wm of WIDGET_MATCHERS) {
      if (wm.pattern.test(clause)) {
        if (isHideClause) {
          widgetsMap[wm.id] = { ...(widgetsMap[wm.id] ?? {}), visible: false, pinnedTop: false };
        } else if (isPinClause) {
          if (!pinnedIds.includes(wm.id)) pinnedIds.push(wm.id);
          widgetsMap[wm.id] = {
            ...(widgetsMap[wm.id] ?? {}),
            visible: true,
            pinnedTop: true,
            order: pinnedIds.indexOf(wm.id),
          };
        } else if (isShowClause) {
          widgetsMap[wm.id] = { ...(widgetsMap[wm.id] ?? {}), visible: true };
        }
      }
    }
  }

  if (pinnedIds.length > 0) {
    hudPrefs.widgetOrder = [
      ...pinnedIds,
      ...HUD_WIDGET_IDS.filter((id) => !pinnedIds.includes(id)),
    ];
    summaryParts.push(
      `pinned **${pinnedIds.map((id) => HUD_WIDGET_LABELS[id]).join(' + ')}** to the top of the HUD`,
    );
  }
  if (Object.keys(widgetsMap).length > 0) {
    hudPrefs.widgets = widgetsMap;
    const hiddenNames = Object.entries(widgetsMap)
      .filter(([, v]) => v?.visible === false)
      .map(([k]) => HUD_WIDGET_LABELS[k as HudWidgetId]);
    if (hiddenNames.length > 0) {
      summaryParts.push(`hid **${hiddenNames.join(', ')}**`);
    }
  }
  if (hudPrefs.density) {
    summaryParts.push(`set HUD density to **${hudPrefs.density}**`);
  }
  if (Object.keys(hudPrefs).length > 0) {
    rawPatch.hudLayoutPrefs = hudPrefs;
  }

  // 4b. Detect Workflow Ceilings, 5–60m Block Durations, Sticky Channels & House Rules
  const wfPatch: Record<string, any> = {};
  const blockDurMatch =
    text.match(
      /\b(?:prep\s+|session\s+|focus\s+|default\s+)?block\s+durations?\s*(?:to|=|:|of)?\s*(\d{1,3})\s*(?:m|min|mins|minutes?)?\b/i,
    ) ||
    text.match(
      /\b(?:set|change|use)\s+(\d{1,3})\s*(?:m|min|mins|minutes?)\s+(?:prep\s+|focus\s+|capacity\s+)?blocks?\b/i,
    );
  if (blockDurMatch?.[1]) {
    const mins = Number(blockDurMatch[1]);
    if (mins >= 5 && mins <= 60) {
      wfPatch.blockDurationMinutes = mins;
      if (canEditCampaign) summaryParts.push(`set block duration to **${mins}m**`);
    }
  }

  const cruiseMatch = text.match(
    /\bcruise\s+(?:capacity\s+)?ceiling\s*(?:to|=|:|of)?\s*(\d{1,2})(?:\s+blocks?)?\b/i,
  );
  if (cruiseMatch?.[1]) {
    const blocks = Number(cruiseMatch[1]);
    if (blocks >= 1 && blocks <= 24) {
      wfPatch.cruiseCeilingBlocks = blocks;
      if (canEditCampaign) summaryParts.push(`set Cruise ceiling to **${blocks} blocks**`);
    }
  }

  const stickyRx =
    /\b(?:move|set|pin|promote|make|assign)\s+["']?([A-Za-z][A-Za-z0-9_ -]{1,24}?)["']?\s+(?:to|as|into)\s+(?:a\s+)?sticky\s+channel\b/gi;
  const parsedStickyChannels: WorkflowChannelPatch[] = [];
  let stickyHit: RegExpExecArray | null;
  while ((stickyHit = stickyRx.exec(text)) !== null) {
    const cand = stickyHit[1].trim();
    const matchedChannel = WORKSPACE_CHANNEL_OPTIONS.find(
      (opt) => opt.toLowerCase() === cand.toLowerCase(),
    );
    if (matchedChannel) {
      parsedStickyChannels.push({ key: matchedChannel, sticky: true });
    }
  }
  if (parsedStickyChannels.length > 0) {
    wfPatch.channels = parsedStickyChannels;
    if (canEditCampaign) {
      summaryParts.push(
        `moved **${parsedStickyChannels.map((c) => c.key).join(', ')}** to sticky channel`,
      );
    }
  }
  if (Object.keys(wfPatch).length > 0) {
    rawPatch.workflow = wfPatch;
  }

  if (/\b(?:house\s*rules?|table\s*rules?|homebrew\s*rules?|custom\s+rule)\b/i.test(text)) {
    const isDisableRule = /\b(?:disable|turn\s+off|deactivate)\b/i.test(text);
    if (/\bflank(?:ing)?\b/i.test(text)) {
      rawPatch.houseRules = [
        {
          id: 'rule_flanking',
          title: 'Flanking Tactical Advantage',
          category: 'combat',
          ruleText:
            'When two allied creatures stand on opposite sides of an enemy within melee reach, melee attacks against that target gain +2 to hit (or advantage per table option).',
          mechanicalSummary: '+2 melee attack bonus (or advantage) while flanking',
          enabled: !isDisableRule,
          op: isDisableRule ? 'disable' : 'upsert',
        },
      ];
      if (canEditCampaign) {
        summaryParts.push(
          `${isDisableRule ? 'disabled' : 'added'} **Flanking Tactical Advantage** house rule`,
        );
      }
    } else {
      const topicMatch = text.match(
        /\b(?:house|table|custom)\s*rule\s+(?:for|about|on|called)\s+([^:.;!]+?)(?:\s+in\s+this\s+campaign)?(?:\s*[:—-]\s*(.+))?$/i,
      );
      const rawTitle = (topicMatch?.[1] || 'Custom House Rule')
        .replace(/\s+in\s+this\s+campaign$/i, '')
        .trim()
        .slice(0, 64);
      const ruleBody =
        topicMatch?.[2]?.trim() ||
        `Custom campaign house rule governing ${rawTitle.toLowerCase()}.`;
      rawPatch.houseRules = [
        {
          id: makeSlugId('rule', rawTitle),
          title: rawTitle.replace(/\b\w/g, (c) => c.toUpperCase()),
          category: 'custom',
          ruleText: ruleBody.slice(0, 480),
          enabled: !isDisableRule,
          op: isDisableRule ? 'disable' : 'upsert',
        },
      ];
      if (canEditCampaign) {
        summaryParts.push(`added house rule **${rawTitle}**`);
      }
    }
  }

  // 5. Build Clickable Option A / Option B Follow-up Chips for Ambiguous Rules
  if (sanityAmbiguous) {
    followUpOptions.push(
      {
        id: 'opt_sanity_d100',
        label: 'Option A: d100 Sanity (Max 99, Manual Recovery)',
        description: 'Classic investigative horror percentile Sanity pool.',
        promptReply: 'Use percentile Sanity with max 99 and manual recovery.',
        patchOverride: {
          systemFlavorAndTrackers: {
            resourcePoolTemplates: [
              { name: 'Sanity', max: 99, rechargeOn: 'manual' },
            ],
          },
        },
      },
      {
        id: 'opt_sanity_pulp10',
        label: 'Option B: 10-Pip Sanity (Long Rest Recovery)',
        description: 'Fast pulp/5e-style 10-point Sanity pool recovering on Long Rest.',
        promptReply: 'Use 10-pip Sanity that recharges on a Long Rest.',
        patchOverride: {
          systemFlavorAndTrackers: {
            resourcePoolTemplates: [
              { name: 'Sanity', max: 10, rechargeOn: 'long' },
            ],
          },
        },
      },
    );
  } else if (twoPlayerAmbiguous && canEditCampaign) {
    followUpOptions.push(
      {
        id: 'opt_scale_duet',
        label: 'Option A: Duet Prep Scale (1 GM + 1 Player)',
        description: 'Tighter scene, NPC, and encounter targets tuned for 1-on-1 play.',
        promptReply: 'Switch to Duet prep scale (1 GM + 1 Player).',
        patchOverride: {
          campaignMode: { mode: 'duet' },
        },
      },
      {
        id: 'opt_scale_standard_2pc',
        label: 'Option B: Standard Mode with 2-PC Prep Targets',
        description: 'Keep Standard party mode with 4 Secrets, 3 NPCs, and 2 Encounters.',
        promptReply: 'Use Standard mode with 4 secrets, 3 NPCs, and 2 encounters.',
        patchOverride: {
          campaignMode: {
            mode: 'standard',
            prepTargetOverrides: { secrets: 4, npcs: 3, monsters: 2 },
          },
        },
      },
    );
  } else {
    // Provide helpful Option A / Option B HUD density & layout refinement chips
    followUpOptions.push(
      {
        id: 'opt_hud_compact',
        label: 'Option A: Switch Table HUD to Compact Density',
        description: 'Tighter spacing for laptop or split-screen Run/Play views.',
        promptReply: 'Make the table HUD compact density.',
        patchOverride: {
          hudLayoutPrefs: { density: 'compact' },
        },
      },
      {
        id: 'opt_hud_focus',
        label: 'Option B: Focus Mode (Hide Audio & Roll Feed)',
        description: 'Keep Clocks, Initiative, and Action Economy front and center.',
        promptReply: 'Hide Audio and Roll Feed widgets in the HUD.',
        patchOverride: {
          hudLayoutPrefs: {
            widgets: {
              audioNarration: { visible: false },
              rollFeed: { visible: false },
            },
          },
        },
      },
    );
  }

  const validated = validateWorkspacePatch(rawPatch, authority);
  const effectivePatch: CampaignWorkspacePatch = validated.canApplyToCampaign
    ? validated.campaignPatch
    : {
        ...(validated.localHudPrefs ? { hudLayoutPrefs: validated.localHudPrefs } : {}),
        ...(validated.localTerminologyMap
          ? { terminologyMap: validated.localTerminologyMap }
          : {}),
        ...(Object.keys(validated.pcWritebacks).length > 0 &&
        rawPatch.systemFlavorAndTrackers?.resourcePoolTemplates
          ? {
              systemFlavorAndTrackers: {
                resourcePoolTemplates:
                  rawPatch.systemFlavorAndTrackers.resourcePoolTemplates,
                ...(rawPatch.systemFlavorAndTrackers.conditionBuffPresets
                  ? {
                      conditionBuffPresets:
                        rawPatch.systemFlavorAndTrackers.conditionBuffPresets,
                    }
                  : {}),
              },
            }
          : {}),
      };

  let reply: string;
  if (summaryParts.length > 0) {
    const scopeNote = !canEditCampaign
      ? ' (scoped strictly to your local HUD and owned character sheet)'
      : '';
    reply = `Ready to apply: ${summaryParts.join('; ')}${scopeNote}. Review the diff preview below or pick an option chip to refine.`;
  } else {
    reply = canEditCampaign
      ? 'Tell me how you want to tailor your campaign mode, prep counts, custom PC trackers (like Sanity, Luck, or Stress), terminology (e.g., Gold → Credits), or Run HUD layout.'
      : 'Tell me how you want to customize your local Play HUD widgets, terminology labels, or custom trackers on your character sheet.';
  }

  return {
    turn: {
      reply,
      patch: effectivePatch,
      followUpOptions: followUpOptions.slice(0, 3),
    },
    validated,
  };
}
