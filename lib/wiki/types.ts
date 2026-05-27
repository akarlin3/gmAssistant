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
};
