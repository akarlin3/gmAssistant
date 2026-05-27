// Top-level navigation structure for the campaign editor.
//
// The editor splits into four modes: Plan (campaign-level work), Prep
// (next-session checklist), Run (table-side tools), and Library (browse
// generators & reference). Each mode owns a set of sub-views. State persists
// in `data.__mode` / `data.__subview` so users return to wherever they left.
//
// LEGACY_TAB_MAP migrates state from older tab-only layouts where a single
// `__tab` field stored one of ~16 flat tab IDs.

export type Mode = 'plan' | 'prep' | 'organize' | 'run' | 'library' | 'oracle';

// Some Plan subviews are done WITH the players at the table (Session −1
// collaborative worldbuilding, Session 0 character creation); others are
// the DM's solo prep work (givens, faction clocks, mid-campaign audits,
// ending). Tagging the subview lets ModeNav cluster them visually so the
// "is this a player-facing session or solo prep?" answer is obvious at a
// glance. Subviews without an audience tag are rendered ungrouped.
export type Audience = 'solo' | 'together';

export type ModeSubview = {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly audience?: Audience;
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
      { id: 'pitch',  label: 'Premise',    description: 'Hook, givens, and six truths',                         audience: 'solo' },
      { id: 'worldbuild',  label: 'Worldbuild',      description: 'Session −1 collaborative worldbuilding with players',  audience: 'together' },
      { id: 'party',  label: 'Party',      description: 'First-class PC sheets, Session 0 character creation, and goals', audience: 'together' },
    ],
  },
  prep: {
    label: 'Prep',
    description: 'The Lazy DM 8-step checklist for the next session',
    emphasis: 'primary',
    subviews: [
      { id: 'flow',   label: 'Flow',   description: 'The 8-step prep checklist' },
      { id: 'wizard', label: 'Wizard', description: 'Guided prep walkthrough' },
      { id: 'clocks', label: 'Clocks',        description: 'Faction clocks & tracking', audience: 'solo' },
      { id: 'arc',    label: 'Arc Planning',  description: 'Mid-campaign audits & PC goals', audience: 'solo' },
      { id: 'ending', label: 'Ending',        description: 'Threads & campaign wrap checklist', audience: 'solo' },
    ],
  },
  organize: {
    label: 'Organize',
    description: 'Manage players and sessions',
    emphasis: 'primary',
    subviews: [
      { id: 'players', label: 'Players',   description: 'Share a read-only view with your players',             audience: 'solo' },
      { id: 'log',     label: 'Sessions', description: 'Session log archive' },
    ],
  },
  run: {
    label: 'Run',
    description: 'Table-side tools and session capture',
    emphasis: 'primary',
    subviews: [
      { id: 'session', label: 'Session',  description: 'Active session — prep cards, scratchpad, initiative' },
      { id: 'scene',   label: 'Scene Mode', description: 'Run a location turn-by-turn with AI-driven NPCs (Pro)' },
      { id: 'assistant', label: 'Assistant', description: 'Persistent AI agent that reads your whole campaign and proposes content you approve (Pro)' },
      { id: 'maps',    label: 'Maps',     description: 'Maps with markers, layers, pointcrawls, and AI generation' },
      { id: 'lookup',  label: 'Lookup',   description: 'Quick reference: NPCs, locations, secrets, factions' },
      { id: 'logged',  label: 'Logged',   description: 'Every logged library item at the time' },
      { id: 'dice',    label: 'Dice',     description: 'Dice roller' },
      { id: 'spells',  label: 'Spells',   description: 'Spell reference' },
      { id: 'dmref',   label: 'DM Ref',   description: 'Rules reference' },
      { id: 'chase',   label: 'Chase',    description: 'Chase tracker' },
    ],
  },
  library: {
    label: 'Library',
    description: 'Browse generators, vivify content, reference tools',
    emphasis: 'muted',
    subviews: [
      { id: 'generators', label: 'Generators', description: 'Tavern, dungeon, settlement, shops, hoards' },
      { id: 'monsters',   label: 'Monsters',   description: 'Homebrew monster builder' },
      { id: 'traps',      label: 'Traps',      description: 'Trap builder' },
      { id: 'vivify',     label: 'Vivify',     description: 'AI prose for prep elements' },
      { id: 'pointbuy',   label: 'Point-Buy',  description: 'D&D 5e ability-score calculator' },
      { id: 'hazards',    label: 'Hazards',    description: 'Physics-grounded environmental damage & structural calculator' },
      { id: 'logistics',  label: 'Logistics',  description: 'Strict encumbrance, containers, and currency tracking' },
      { id: 'web',        label: 'NPC Web',    description: 'Visual relationship graph of NPCs and the party' },
      { id: 'wiki',       label: 'Wiki',       description: 'Cross-linked entity graph — every NPC, faction, location, secret and how they connect' },
      { id: 'livingworld', label: 'Living World', description: 'Tick the world forward between sessions — faction clocks, downtime, NPC agendas, and a "While You Were Away" briefing' },
      { id: 'factions',   label: 'Faction Sim', description: 'Grand-strategy faction simulation — territories, influence, and tick-based moves' },
    ],
  },
  oracle: {
    label: 'Oracle',
    description: 'Wells Oracle — ask the world a question and complicate scenes',
    emphasis: 'muted',
    subviews: [
      { id: 'wells', label: 'Wells Oracle', description: 'Ask the oracle questions and complicate scenes' }
    ],
  },
};

export const MODE_ORDER: readonly Mode[] = ['plan', 'prep', 'organize', 'run', 'library', 'oracle'];

// Old single-tab IDs that may live in stored state (or in legacy code paths)
// — map them to the new (mode, subview) pair so users land somewhere sensible.
export const LEGACY_TAB_MAP: Record<string, { mode: Mode; subview: string }> = {
  prep:        { mode: 'prep',    subview: 'flow' },
  ref:         { mode: 'plan',    subview: 'worldbuild' },
  track:       { mode: 'prep',    subview: 'clocks' },
  down:        { mode: 'plan',    subview: 'worldbuild' },
  dice:        { mode: 'run',     subview: 'dice' },
  spells:      { mode: 'run',     subview: 'spells' },
  generators:  { mode: 'library', subview: 'generators' },
  names:       { mode: 'library', subview: 'generators' },
  locations:   { mode: 'library', subview: 'generators' },
  monsters:    { mode: 'library', subview: 'monsters' },
  vivify:      { mode: 'library', subview: 'vivify' },
  traps:       { mode: 'library', subview: 'traps' },
  dmref:       { mode: 'run',     subview: 'dmref' },
  chase:       { mode: 'run',     subview: 'chase' },
  log:         { mode: 'organize', subview: 'log' },
  pointbuy:    { mode: 'library', subview: 'pointbuy' },
};

// Some intermediate mode-aware layouts placed Generators/Vivify inside Prep.
// Remap those (mode, subview) pairs forward into Library.
export const LEGACY_SUBVIEW_REMAP: Record<string, { mode: Mode; subview: string }> = {
  'prep:generate': { mode: 'library', subview: 'generators' },
  'prep:vivify':   { mode: 'library', subview: 'vivify' },
  'prep:names':    { mode: 'library', subview: 'generators' },
  'prep:locations':{ mode: 'library', subview: 'generators' },
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
      if (isValidSubview(m, sv)) {
        if (m === 'plan' && sv === 'pcs') {
          return { mode: m, subview: 'party' };
        }
        return { mode: m, subview: sv };
      }
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
