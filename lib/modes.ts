// Top-level navigation structure for the campaign editor.
//
// The editor splits into four modes: Plan (campaign-level work), Prep
// (next-session checklist), Run (table-side tools), and Library (browse
// generators & reference). Each mode owns a set of sub-views. State persists
// in `data.__mode` / `data.__subview` so users return to wherever they left.
//
// LEGACY_TAB_MAP migrates state from older tab-only layouts where a single
// `__tab` field stored one of ~16 flat tab IDs.

export type Mode = 'plan' | 'prep' | 'run' | 'library';

export type ModeSubview = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
};

export type ModeDef = {
  readonly label: string;
  readonly description: string;
  readonly emphasis: 'primary' | 'muted';
  readonly subviews: readonly ModeSubview[];
};

export const MODES: Record<Mode, ModeDef> = {
  plan: {
    label: 'Plan',
    description: 'Campaign-level work — premise, world, factions, characters',
    emphasis: 'primary',
    subviews: [
      { id: 'pitch',  label: 'Premise',    description: 'Hook, givens, and six truths' },
      { id: 'world',  label: 'World',      description: 'Setting facts, factions, reference notes, downtime' },
      { id: 'pcs',    label: 'Characters', description: 'PC sketches and goals' },
      { id: 'fronts', label: 'Fronts',     description: 'Faction clocks, audits, threads, ending' },
    ],
  },
  prep: {
    label: 'Prep',
    description: 'The Lazy DM 8-step checklist for the next session',
    emphasis: 'primary',
    subviews: [
      { id: 'flow',   label: 'Flow',   description: 'The 8-step prep checklist' },
      { id: 'wizard', label: 'Wizard', description: 'Guided prep walkthrough' },
    ],
  },
  run: {
    label: 'Run',
    description: 'Table-side tools and session capture',
    emphasis: 'primary',
    subviews: [
      { id: 'session', label: 'Session',  description: 'Active session — prep cards, scratchpad, initiative' },
      { id: 'lookup',  label: 'Lookup',   description: 'Quick reference: NPCs, locations, secrets, factions' },
      { id: 'dice',    label: 'Dice',     description: 'Dice roller' },
      { id: 'spells',  label: 'Spells',   description: 'Spell reference' },
      { id: 'dmref',   label: 'DM Ref',   description: 'Rules reference' },
      { id: 'chase',   label: 'Chase',    description: 'Chase tracker' },
      { id: 'log',     label: 'Sessions', description: 'Session log archive' },
    ],
  },
  library: {
    label: 'Library',
    description: 'Browse generators, vivify content, reference tools',
    emphasis: 'muted',
    subviews: [
      { id: 'generators', label: 'Generators', description: 'Tavern, dungeon, settlement, shops, hoards' },
      { id: 'names',      label: 'Names',      description: 'AI-generated names' },
      { id: 'locations',  label: 'Locations',  description: 'AI-generated locations' },
      { id: 'monsters',   label: 'Monsters',   description: 'Homebrew monster builder' },
      { id: 'traps',      label: 'Traps',      description: 'Trap builder' },
      { id: 'vivify',     label: 'Vivify',     description: 'AI prose for prep elements' },
      { id: 'pointbuy',   label: 'Point-Buy',  description: 'D&D 5e ability-score calculator' },
    ],
  },
};

export const MODE_ORDER: readonly Mode[] = ['plan', 'prep', 'run', 'library'];

// Old single-tab IDs that may live in stored state (or in legacy code paths)
// — map them to the new (mode, subview) pair so users land somewhere sensible.
export const LEGACY_TAB_MAP: Record<string, { mode: Mode; subview: string }> = {
  prep:        { mode: 'prep',    subview: 'flow' },
  ref:         { mode: 'plan',    subview: 'world' },
  track:       { mode: 'plan',    subview: 'fronts' },
  down:        { mode: 'plan',    subview: 'world' },
  dice:        { mode: 'run',     subview: 'dice' },
  spells:      { mode: 'run',     subview: 'spells' },
  generators:  { mode: 'library', subview: 'generators' },
  names:       { mode: 'library', subview: 'names' },
  locations:   { mode: 'library', subview: 'locations' },
  monsters:    { mode: 'library', subview: 'monsters' },
  vivify:      { mode: 'library', subview: 'vivify' },
  traps:       { mode: 'library', subview: 'traps' },
  dmref:       { mode: 'run',     subview: 'dmref' },
  chase:       { mode: 'run',     subview: 'chase' },
  log:         { mode: 'run',     subview: 'log' },
  pointbuy:    { mode: 'library', subview: 'pointbuy' },
};

// Some intermediate mode-aware layouts placed Generators/Vivify inside Prep.
// Remap those (mode, subview) pairs forward into Library.
export const LEGACY_SUBVIEW_REMAP: Record<string, { mode: Mode; subview: string }> = {
  'prep:generate': { mode: 'library', subview: 'generators' },
  'prep:vivify':   { mode: 'library', subview: 'vivify' },
  'prep:names':    { mode: 'library', subview: 'names' },
  'prep:locations':{ mode: 'library', subview: 'locations' },
  'prep:monsters': { mode: 'library', subview: 'monsters' },
  'prep:traps':    { mode: 'library', subview: 'traps' },
};

export function isMode(value: unknown): value is Mode {
  return typeof value === 'string' && value in MODES;
}

export function isValidSubview(mode: Mode, subview: unknown): subview is string {
  return typeof subview === 'string' && MODES[mode].subviews.some(s => s.id === subview);
}

export function defaultSubview(mode: Mode): string {
  return MODES[mode].subviews[0]?.id ?? '';
}

// Resolve initial mode/subview from a campaign-data blob. Honors `__mode` /
// `__subview` when present and valid; falls back through `__tab` (legacy) to
// the LEGACY_SUBVIEW_REMAP, and finally to Plan/Premise.
export function resolveInitialMode(data: Record<string, unknown> | null | undefined): {
  mode: Mode;
  subview: string;
} {
  if (data) {
    const m = data.__mode;
    const sv = data.__subview;
    if (isMode(m)) {
      const remapKey = `${m}:${typeof sv === 'string' ? sv : ''}`;
      const remapped = LEGACY_SUBVIEW_REMAP[remapKey];
      if (remapped) return remapped;
      if (isValidSubview(m, sv)) return { mode: m, subview: sv };
      return { mode: m, subview: defaultSubview(m) };
    }
    const legacy = data.__tab;
    if (typeof legacy === 'string' && LEGACY_TAB_MAP[legacy]) {
      return LEGACY_TAB_MAP[legacy];
    }
  }
  return { mode: 'plan', subview: defaultSubview('plan') };
}

// Flat (mode, subview) sequence — used by ←/→ arrow-key cycling, the command
// palette, and anywhere a stable global ordering of editor surfaces is needed.
export type ModeSubviewPair = { mode: Mode; subview: string; label: string; modeLabel: string };

export const ALL_SUBVIEWS: readonly ModeSubviewPair[] = MODE_ORDER.flatMap(m =>
  MODES[m].subviews.map(sv => ({
    mode: m,
    subview: sv.id,
    label: sv.label,
    modeLabel: MODES[m].label,
  })),
);
