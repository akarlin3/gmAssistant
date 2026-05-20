// Book-grounded prep targets with solo adaptations.
// Single source of truth shared by CampaignEditor (per-section TargetBar) and
// the pre-session PrepWizard (Ready-for-Session summary + gate).
//
// Per-campaign overrides live at `data.__prepTargetOverrides` and tune the
// `standard` (group) and `solo` counts independently. See `resolveTarget`.

export type PrepTargetKey =
  | 'gWorld' | 'gFNL' | 'lines'
  | 'facts' | 'factions' | 'conflicts'
  | 'pcGoals'
  | 'scenes' | 'secrets' | 'locations' | 'npcs' | 'monsters' | 'items'
  | 'clocks';

export type PrepTargetSpec = {
  standard: number;
  solo: number;
  label: string;
  source: string;
};

export const TARGETS: Record<PrepTargetKey, PrepTargetSpec> = {
  // CCD ch. 1 — Givens
  gWorld:    { standard: 10, solo: 5,  label: 'World Facts',         source: 'CCD ch. 1' },
  gFNL:      { standard: 5,  solo: 3,  label: 'Required Entities',   source: 'CCD ch. 1' },
  // Safety tools are personal — 0 by default, users can raise if they want
  // a hard checklist before starting.
  lines:     { standard: 0,  solo: 0,  label: 'Content Lines',       source: 'Safety tools' },

  // CCD ch. 2 — Session −1
  facts:     { standard: 15, solo: 8,  label: 'Setting Facts',       source: 'CCD ch. 2' },
  factions:  { standard: 4,  solo: 3,  label: 'Factions',            source: 'CCD ch. 2 (3-4 min)' },
  conflicts: { standard: 3,  solo: 2,  label: 'Active Conflicts',    source: 'CCD ch. 2' },

  // Proactive Roleplaying ch. 1
  pcGoals:   { standard: 3,  solo: 3,  label: 'PC Goals',            source: 'PR ch. 1 (3 concurrent)' },

  // Lazy DM ch. 4-8 — per-session
  scenes:    { standard: 5,  solo: 4,  label: 'Potential Scenes',    source: 'Lazy DM ch. 4 (1-2/hr)' },
  secrets:   { standard: 10, solo: 8,  label: 'Secrets & Clues',     source: 'Lazy DM ch. 6 (shoot for 10)' },
  locations: { standard: 4,  solo: 3,  label: 'Fantastic Locations', source: 'Lazy DM ch. 7 (1-2/hr)' },
  npcs:      { standard: 4,  solo: 3,  label: 'Important NPCs',      source: 'Lazy DM ch. 8' },
  monsters:  { standard: 4,  solo: 3,  label: 'Relevant Monsters',   source: 'Lazy DM ch. 9' },
  items:     { standard: 2,  solo: 2,  label: 'Magic Item Rewards',  source: 'Lazy DM ch. 10' },

  // CCD ch. 6 — Faction tracking
  clocks:    { standard: 4,  solo: 3,  label: 'Active Faction Clocks', source: 'CCD ch. 6' },
};

export const ALL_TARGET_KEYS: PrepTargetKey[] = Object.keys(TARGETS) as PrepTargetKey[];

export type PrepTargetOverride = { standard?: number; solo?: number };
export type PrepTargetOverrides = Partial<Record<PrepTargetKey, PrepTargetOverride>>;

export const OVERRIDES_STATE_KEY = '__prepTargetOverrides';

function clampCount(n: unknown): number | undefined {
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined;
  const i = Math.floor(n);
  if (i < 0) return 0;
  if (i > 99) return 99;
  return i;
}

// Pulls the effective count for one key in one mode, honoring per-campaign
// overrides when present. Pass `undefined` for overrides to get the book
// default — used by tests and by the modal's "Reset to default" preview.
export function resolveTarget(
  key: PrepTargetKey,
  mode: 'solo' | 'standard',
  overrides: PrepTargetOverrides | undefined,
): number {
  const spec = TARGETS[key];
  if (!spec) return 0;
  const override = overrides?.[key]?.[mode];
  const clamped = clampCount(override);
  return clamped ?? spec[mode];
}

export function getTarget(
  key: PrepTargetKey,
  soloMode: boolean,
  overrides?: PrepTargetOverrides,
): number {
  return resolveTarget(key, soloMode ? 'solo' : 'standard', overrides);
}

// Section/anchor id each target renders under, for the "Next Up" pill and
// command-palette navigation. "clocks" has no <Section> wrapper, so it points
// to an id we inject inside Phase 4.
export const SECTION_ID_BY_KEY: Record<PrepTargetKey, string> = {
  gWorld: 'g-world',
  gFNL: 'g-fnl',
  lines: 'g-lines',
  facts: 'facts',
  factions: 'factions',
  conflicts: 'conflicts',
  pcGoals: 'goals',
  scenes: 's3-scenes',
  secrets: 's4-secrets',
  locations: 's5-loc',
  npcs: 's6-npc',
  monsters: 's7-mon',
  items: 's8-rew',
  clocks: 'clocks',
};

export type PhaseId = 'p0' | 'p1' | 'p2' | 'p3' | 'p4';

export const PHASE_ID_BY_KEY: Record<PrepTargetKey, PhaseId> = {
  gWorld: 'p0', gFNL: 'p0', lines: 'p0',
  facts: 'p1', factions: 'p1', conflicts: 'p1',
  pcGoals: 'p2',
  scenes: 'p3', secrets: 'p3', locations: 'p3', npcs: 'p3', monsters: 'p3', items: 'p3',
  clocks: 'p4',
};

// Phase 0-4 keys in display order. Used by the pre-session gate to require
// foundational prep (Givens, Session −1, Session 0 goals, Faction clocks)
// alongside the per-session Lazy DM 8-step.
export const PHASE_GROUPS: Array<{ phase: PhaseId; title: string; keys: PrepTargetKey[] }> = [
  { phase: 'p0', title: 'Phase 0 · Givens',           keys: ['gWorld', 'gFNL', 'lines'] },
  { phase: 'p1', title: 'Phase 1 · Session −1',       keys: ['facts', 'factions', 'conflicts'] },
  { phase: 'p2', title: 'Phase 2 · Session 0',        keys: ['pcGoals'] },
  { phase: 'p3', title: 'Phase 3 · Per-Session Prep', keys: ['scenes', 'secrets', 'locations', 'npcs', 'monsters', 'items'] },
  { phase: 'p4', title: 'Phase 4 · Faction Clocks',   keys: ['clocks'] },
];

// Object-shape targets carry default values (e.g. `timeframe: 'short'`,
// `max: 6`) that are present even on a freshly-added blank row. Counting raw
// length would let those blanks satisfy targets — so we explicitly name the
// fields that have to be authored before a row counts as filled.
const FILLED_FIELDS: Partial<Record<PrepTargetKey, string[]>> = {
  factions:  ['name', 'identity', 'archetype', 'area', 'ideology', 'longGoal'],
  pcGoals:   ['text'],
  locations: ['name', 'type', 'aspects'],
  npcs:      ['name', 'archetype', 'goal', 'method'],
  clocks:    ['text', 'faction'],
};

function fieldHasContent(v: unknown): boolean {
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.some(x => typeof x === 'string' && x.trim().length > 0);
  return false;
}

export function isFilled(key: PrepTargetKey, item: unknown): boolean {
  if (typeof item === 'string') return item.trim().length > 0;
  if (!item || typeof item !== 'object') return false;
  const fields = FILLED_FIELDS[key];
  if (!fields) {
    // Unexpected shape — fall back to "any non-empty string field".
    return Object.values(item as Record<string, unknown>).some(fieldHasContent);
  }
  const obj = item as Record<string, unknown>;
  return fields.some(f => fieldHasContent(obj[f]));
}

export function countFilled(key: PrepTargetKey, items: unknown): number {
  if (!Array.isArray(items)) return 0;
  return items.filter(it => isFilled(key, it)).length;
}
