// Campaign Wiki — typed cross-entity relationship model. A Relationship links
// any two campaign entities (NPC → Faction, Item → Location, …) with a typed
// `kind`. Symmetric kinds (allyOf/enemyOf/related) are stored once and rendered
// on both sides via lib/wiki/lookup.ts. The full array lives at
// `data.relationships` on the campaign doc (no Pro gating; free feature).

export type EntityType =
  | 'npc'
  | 'faction'
  | 'location'
  | 'secret'
  | 'pc'
  | 'monster'
  | 'magicItem'
  | 'factionClock'
  | 'scene'
  | 'potentialScene'
  | 'fantasticLocation';

export type RelationshipKind =
  | 'memberOf'
  | 'leaderOf'
  | 'locatedAt'
  | 'knows'
  | 'allyOf'
  | 'enemyOf'
  | 'related'
  | 'owns'
  | 'protects'
  | 'wants'
  | 'fears'
  | 'parentOf'
  | 'mentorOf'
  | 'createdBy'
  | 'hiddenAt';

// Player-mode redaction mode for an edge. Mirrors the entity visibility model
// (lib/playerMode/resolveVisibility.ts): fail-closed — absent ⇒ treated as
// `private`, so an un-tagged edge never reaches a player projection.
export type EdgeVisibility = 'private' | 'party' | 'custom';

export type Relationship = {
  id: string;
  fromType: EntityType;
  fromId: string;
  toType: EntityType;
  toId: string;
  kind: RelationshipKind;
  notes?: string;
  createdAt: number;
  /** true if auto-suggested by the scanner but not yet user-confirmed */
  suggested?: boolean;

  // ── Edge-as-data fields (node-graph foundation, CP1) ──────────────────────
  // These augment the existing relationship into a graph edge. All optional so
  // every pre-existing relationship remains a valid edge with sensible defaults
  // (weight ⇒ kind default, visibility ⇒ private, updatedAt ⇒ createdAt).
  /**
   * Normalized 0..1 strength. Optional: categorical kinds (memberOf, locatedAt)
   * may omit it; defaultWeightForKind() supplies a read-time default. The
   * Living-World faction engine keeps its own −10..+10 stance separately and is
   * not folded in here.
   */
  weight?: number;
  /** Player-mode redaction. Absent ⇒ 'private' (fail-closed). */
  visibility?: EdgeVisibility;
  /** Roster slot ids allowed to see this edge when visibility === 'custom'. */
  customVisibleTo?: string[];
  /** Last-modified wall-clock ms. Absent ⇒ falls back to createdAt. */
  updatedAt?: number;
};
