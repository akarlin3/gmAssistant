// Loose payload shapes for logged generator entries.
//
// LogEntry.payload is `unknown` at the type level (generators write a variety
// of shapes). These interfaces describe the fields the renderer / formatters
// read; every field is optional so access stays guarded exactly as before.
// `asPayload` is a no-op narrowing cast that replaces the previous per-call
// `entry.payload as any`.

export type NamedDescriptor = {
  name?: string;
  descriptor?: string;
};

export type MenuItem = {
  name?: string;
  kind?: string;
  price?: string | number;
};

export type InventoryItem = {
  name?: string;
  price?: string | number;
  rarity?: string;
  note?: string;
};

export type GeneratedName = {
  first?: string;
  last?: string;
  firstCulture?: string;
  lastCulture?: string;
};

export type Trinket = {
  description?: string;
  hook?: string;
};

export type PlotSegue = {
  title?: string;
  readAloud?: string;
  gmNote?: string;
};

export type Valuable = {
  name?: string;
  value?: string | number;
};

export type MagicItem = {
  name?: string;
  rarity?: string;
  note?: string;
};

export type Coins = {
  pp?: number;
  gp?: number;
  ep?: number;
  sp?: number;
  cp?: number;
};

export type LocationPayload = {
  name?: string;
  type?: string;
  description?: string;
  aspects?: unknown[];
};

export type DungeonRoom = {
  index?: number;
  name?: string;
  kind?: string;
  contents?: string;
  dressing?: string;
};

export type MonsterAction = {
  name?: string;
  description?: string;
  desc?: string;
};

export type GeneratorInputs = {
  vibe?: string;
  settlementSize?: string;
  shopType?: string;
  archetype?: string;
  hoardType?: string;
  crTier?: string;
  theme?: string;
  challengeTier?: string;
};

/** Superset of every field the renderer / formatters touch. All optional. */
export type LogPayload = {
  name?: string;
  shopName?: string;
  hours?: string;
  rumor?: string;
  hook?: string;
  enhancementNote?: string;
  currentSituation?: string;
  seed?: number;
  inputs?: GeneratorInputs;
  details?: {
    atmosphere?: string;
    owner?: NamedDescriptor;
    menu?: MenuItem[];
    patrons?: NamedDescriptor[];
    rumors?: string[];
    sizeClass?: string;
    population?: number;
    region?: string;
    government?: string;
    economy?: string;
    notables?: { name?: string; role?: string }[];
    hooks?: string[];
    size?: string;
    rooms?: DungeonRoom[];
    hazards?: string[];
    inhabitants?: string[];
  };
  owner?: NamedDescriptor;
  inventory?: InventoryItem[];
  names?: (string | GeneratedName)[];
  trinkets?: Trinket[];
  segues?: PlotSegue[];
  location?: LocationPayload;
  coins?: Coins;
  gems?: Valuable[];
  artObjects?: Valuable[];
  magicItems?: MagicItem[];
  // monster
  monsterName?: string;
  challengeRating?: string | number;
  type?: string;
  stats?: Record<string, string | number>;
  actions?: MonsterAction[];
  // dice
  result?: string | number;
  breakdown?: string;
  // location-as-self fallback fields
  description?: string;
  aspects?: unknown[];
};

/** Narrow an entry payload (`unknown`) to the loose LogPayload shape. */
export function asPayload(payload: unknown): LogPayload {
  return (payload ?? {}) as LogPayload;
}
