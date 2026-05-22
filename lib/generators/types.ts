// Shared types for the Generators Suite.
//
// Each generator produces a typed `GeneratorResult` whose `kind` discriminates
// the payload shape. Results are immutable values — re-rolling produces a new
// result with a new id and (optionally) a new seed.

export type GenericId = string;

export type CoinPurse = {
  cp: number;
  sp: number;
  ep: number;
  gp: number;
  pp: number;
};

// ── Items ───────────────────────────────────────────────────────────────────
// Structured replacement for the legacy `data.items: string[]`. Existing
// legacy string entries continue to render via a typeof check at the call site;
// they are not migrated destructively.

export type ItemRarity =
  | 'mundane'
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'very rare'
  | 'legendary';

export type ItemCategory =
  | 'weapon'
  | 'armor'
  | 'wondrous'
  | 'potion'
  | 'scroll'
  | 'ring'
  | 'rod'
  | 'staff'
  | 'wand'
  | 'gear'
  | 'tool'
  | 'trinket'
  | 'gem'
  | 'art';

export type StructuredItem = {
  id: GenericId;
  name: string;
  category: ItemCategory;
  rarity: ItemRarity;
  cost?: { amount: number; currency: keyof CoinPurse }; // optional — magic items often priceless
  attunement?: boolean;
  description?: string;
  source: string; // e.g. "generator:treasure-hoard", "generator:trinket", "manual"
};

// ── Locations ────────────────────────────────────────────────────────────────
// Legacy locations live as `{ name, type, aspects, factions }`. New typed
// locations add `subtype` + `details`. Both shapes coexist; UIs that read the
// new fields default sensibly when absent.

export type LocationSubtype =
  | 'tavern'
  | 'dungeon'
  | 'settlement'
  | 'wilderness'
  | 'shop'
  | 'other';

export type MenuItem = { name: string; price: string; kind: 'food' | 'drink' | 'lodging' };
export type PatronRef = { name: string; descriptor: string; npcId?: GenericId };
export type NotableRef = { name: string; role: string; npcId?: GenericId };

export type TavernDetails = {
  atmosphere: string;
  vibe: string;
  menu: MenuItem[];
  patrons: PatronRef[];
  rumors: string[];
  owner: { name: string; descriptor: string; npcId?: GenericId };
};

export type DungeonRoomKind =
  | 'empty'
  | 'monster'
  | 'trap'
  | 'hazard'
  | 'treasure'
  | 'feature'
  | 'puzzle';

export type DungeonExitDirection = 'N' | 'S' | 'E' | 'W';

export type DungeonExit = {
  id: string;
  direction: DungeonExitDirection;
  type: string;
  state?: string;
  toRoomIndex: number | null;
};

export type DungeonRoom = {
  index: number;
  name: string;
  contents: string;
  dressing: string;
  // Optional map-layer fields. Existing saved dungeons predate these and
  // simply omit them; the SVG map view auto-lays-out as a fallback.
  kind?: DungeonRoomKind;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  exits?: DungeonExit[];
};

export type DungeonDetails = {
  size: 'small' | 'medium' | 'large' | 'sprawling';
  theme: string;
  challengeTier: string;
  rooms: DungeonRoom[];
  hazards: string[];
  inhabitants: string[];
};

export type SettlementDetails = {
  population: number;
  sizeClass: SettlementSizeClass;
  government: string;
  economy: string;
  notables: NotableRef[];
  hooks: string[];
  region?: string;
};

export type SettlementSizeClass =
  | 'thorp'
  | 'hamlet'
  | 'village'
  | 'town'
  | 'small city'
  | 'large city'
  | 'metropolis';

export type ShopDetails = {
  shopKind: 'mundane' | 'magic';
  shopType: string; // smith, alchemist, curio shop, hedge wizard, etc.
  settlementSize: SettlementSizeClass;
  owner: { name: string; descriptor: string; npcId?: GenericId };
  inventory: ShopInventoryEntry[];
  hours?: string;
  rumor?: string;
};

export type ShopInventoryEntry = {
  name: string;
  category: ItemCategory;
  rarity: ItemRarity;
  price: string;
  note?: string;
};

export type StructuredLocation = {
  id: GenericId;
  name: string;
  type: string; // legacy freeform type still echoed for back-compat with LocationsTab
  subtype: LocationSubtype;
  aspects?: [string, string, string]; // legacy carry-through, optional in new locations
  factions?: string;
  details?: TavernDetails | DungeonDetails | SettlementDetails | ShopDetails;
  source: string;
};

// ── NPCs ─────────────────────────────────────────────────────────────────────
// Legacy NPC `archetype` field is already taken (villain-archetype free text).
// Use `tier` for the minor/full discriminator. Minor NPCs are lightweight
// (no goal/method/ability scores) and pollute the campaign list less.

export type NpcTier = 'minor' | 'full';

export type StructuredNpc = {
  id: GenericId;
  name: string;
  type?: string; // 'Ally' | 'Villain' | 'Patron' | 'Rival' | 'Neutral' (free text, legacy)
  faction?: string;
  tier: NpcTier;
  descriptor?: string; // minor NPC one-liner
  // full-NPC fields (legacy)
  archetype?: string;
  goal?: string;
  method?: string;
  appearance?: string;
  abilities?: string;
  talent?: string;
  mannerism?: string;
  interactions?: string;
  knowledge?: string;
  ideal?: string;
  bond?: string;
  flaw?: string;
  source: string;
};

// ── Generator results ────────────────────────────────────────────────────────

export type TreasureHoardResult = {
  kind: 'treasure-hoard';
  id: GenericId;
  seed: number;
  inputs: {
    crTier: '0-4' | '5-10' | '11-16' | '17+';
    hoardType: 'Individual Treasure' | 'Treasure Hoard';
  };
  coins: CoinPurse;
  gems: { name: string; value: number }[];
  artObjects: { name: string; value: number }[];
  magicItems: { name: string; rarity: ItemRarity; category: ItemCategory; note?: string }[];
  enhancementNote?: string; // AI-enhanced narrative summary, if applied
  enhanced: boolean;
};

export type TrinketResult = {
  kind: 'trinket';
  id: GenericId;
  seed: number;
  inputs: { count: number };
  trinkets: { description: string; hook?: string }[]; // hook is added by AI enhance
  enhanced: boolean;
};

export type MundaneShopResult = {
  kind: 'mundane-shop';
  id: GenericId;
  seed: number;
  inputs: {
    shopType: string;
    settlementSize: SettlementSizeClass;
  };
  shopName: string;
  owner: { name: string; descriptor: string };
  inventory: ShopInventoryEntry[];
  hours: string;
  rumor?: string;
  enhanced: boolean;
};

export type MagicShopResult = {
  kind: 'magic-shop';
  id: GenericId;
  seed: number;
  inputs: {
    maxRarity: Exclude<ItemRarity, 'mundane'>;
    settlementSize: SettlementSizeClass;
    archetype: 'curio shop' | 'hedge wizard' | 'black market' | 'temple';
  };
  shopName: string;
  owner: { name: string; descriptor: string };
  inventory: ShopInventoryEntry[];
  enhanced: boolean;
};

export type TavernResult = {
  kind: 'tavern';
  id: GenericId;
  seed: number;
  inputs: {
    settlementSize: SettlementSizeClass;
    vibe: 'rough' | 'cozy' | 'upscale' | 'seedy' | 'themed';
    themeKeyword?: string;
  };
  name: string;
  details: TavernDetails;
  enhanced: boolean;
};

export type TavernNameResult = {
  kind: 'tavern-name';
  id: GenericId;
  seed: number;
  inputs: { count: number };
  names: string[];
  enhanced: boolean;
};

export type DungeonResult = {
  kind: 'dungeon';
  id: GenericId;
  seed: number;
  inputs: {
    size: 'small' | 'medium' | 'large' | 'sprawling';
    theme:
      | 'ruin'
      | 'lair'
      | 'tomb'
      | 'stronghold'
      | 'temple'
      | 'cave'
      | 'sewer'
      | 'manor'
      | 'mine'
      | 'ship'
      | 'woods'
      | 'swamp'
      | 'mountain'
      | 'frozen'
      | 'city';
    challengeTier: '0-4' | '5-10' | '11-16' | '17+';
  };
  name: string;
  hook?: string;
  details: DungeonDetails;
  enhanced: boolean;
};

export type SettlementResult = {
  kind: 'settlement';
  id: GenericId;
  seed: number;
  inputs: {
    sizeClass: SettlementSizeClass;
    region?: string;
    government?: string;
  };
  name: string;
  details: SettlementDetails;
  currentSituation?: string; // AI-enhanced narrative summary, if applied
  enhanced: boolean;
};

// ── Plot Segues — pure-AI generator (no curated tables) ────────────────────
// Output: 1-5 short narrative beats the DM can read at the table to bridge
// between scenes (bridge), twist the current one (complication), or end a
// session (cliffhanger). Every roll calls Claude — no deterministic shape.

export type PlotSegueType = 'bridge' | 'complication' | 'cliffhanger';
export type PlotSegueTone = 'gentle' | 'escalating' | 'dire';

export type PlotSegue = {
  title: string;     // 3-6 words, e.g. "A Knock at Midnight"
  readAloud: string; // 1-3 sentences for the table
  gmNote?: string;   // optional one-line mechanics or pacing cue
};

export type PlotSegueResult = {
  kind: 'plot-segue';
  id: GenericId;
  inputs: {
    segueType: PlotSegueType;
    count: number;
    tone: PlotSegueTone;
    currentScene: string;
  };
  segues: PlotSegue[];
  enhanced: true; // pure-AI generator is always "enhanced"
};

export type GeneratorResult =
  | TreasureHoardResult
  | TrinketResult
  | MundaneShopResult
  | MagicShopResult
  | TavernResult
  | TavernNameResult
  | DungeonResult
  | SettlementResult
  | PlotSegueResult;

export type GeneratorKind = GeneratorResult['kind'];

export type GenerationHistoryEntry = {
  id: GenericId;
  kind: GeneratorKind;
  seed?: number; // omitted for pure-AI results (plot-segue) which have no rng seed
  title: string;
  createdAtMs: number;
  result: GeneratorResult;
};

// ── Save-pipeline return shape ───────────────────────────────────────────────

export type EntityRef = {
  entityType: 'item' | 'location' | 'npc' | 'note';
  entityKey: string; // the `data.<key>` array
  entityId: GenericId;
  entityIndex: number;
};

export type SavePipelineResult = {
  refs: EntityRef[]; // one save can produce multiple entities (e.g. shop + owner NPC + items)
  historyEntryId: GenericId;
};

// ── Campaign context (for AI-enhance grounding) ─────────────────────────────
// Optional snapshot of the campaign's premise/theme fields, passed into the
// enhance endpoint so Claude can weave them into prose (rumors, hooks,
// descriptors) without changing deterministic data.

export type CampaignContext = {
  genre?: string;
  tone?: string[];
  pitch?: string;
  worldFacts?: string[];
  settingFacts?: string[];
  partyLevel?: number;
};

export function hasCampaignContext(c: CampaignContext | undefined | null): c is CampaignContext {
  if (!c) return false;
  return Boolean(
    (c.genre && c.genre.trim()) ||
      (c.tone && c.tone.length) ||
      (c.pitch && c.pitch.trim()) ||
      (c.worldFacts && c.worldFacts.length) ||
      (c.settingFacts && c.settingFacts.length) ||
      (c.partyLevel !== undefined && c.partyLevel > 0)
  );
}
