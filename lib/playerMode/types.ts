// Player Mode shared types. See docs/player-mode-audit.md §5 for the
// architecture these support: GM-published, client-computed projections read
// by unauthenticated players via an unguessable share token.

// Entity types that support field-level visibility. Items/monsters/treasure are
// plain string arrays (no fields to tag) and are intentionally excluded — see
// the audit's "Entity scope" decision.
export const PLAYER_ENTITY_TYPES = [
  'characters',
  'pcs',
  'npcs',
  'locations',
  'factions',
  'clocks',
] as const;

export type PlayerEntityType = (typeof PLAYER_ENTITY_TYPES)[number];

export function isPlayerEntityType(t: string): t is PlayerEntityType {
  return (PLAYER_ENTITY_TYPES as readonly string[]).includes(t);
}

export type FieldPrivacy = 'public' | 'private';

// Map of fieldName -> privacy. Sparse when used as an override.
export type FieldPrivacyMap = Record<string, FieldPrivacy>;

export type FieldVisibilityDefaults = Partial<Record<PlayerEntityType, FieldPrivacyMap>>;

export type VisibilityMode = 'private' | 'party' | 'custom';

export type EntityVisibility = {
  mode: VisibilityMode;
  // Used only when mode === 'custom'. Slot ids allowed to see the entity.
  allowedSlotIds?: string[];
  // Sparse per-instance overrides that win over the entity-type defaults.
  fieldOverrides?: FieldPrivacyMap;
};

export type RosterSlot = {
  slotId: string;
  displayName: string;
  color?: string;
  createdAtMs?: number;
};

// Per-campaign player-mode configuration. Stored at campaign.data.player.
export type PlayerConfig = {
  shareToken: string;
  tokenVersion: number;
  roster: RosterSlot[];
  fieldDefaults: FieldVisibilityDefaults;
  // entityVisibility[entityType][entityId] = EntityVisibility
  entityVisibility: Partial<Record<PlayerEntityType, Record<string, EntityVisibility>>>;
  // Whole-string handout visibility (handouts is a single string field).
  handouts?: EntityVisibility;
  // Premise & Worldbuilding visibility configs
  planningVisibility?: {
    pitch?: boolean;
    genre?: boolean;
    gWorld?: boolean[];
    gFNL?: boolean[];
    tone?: boolean[];
    lines?: boolean[];
    facts?: boolean[];
    secrets?: boolean[];
    conflicts?: boolean[];
  };
};

// The public meta doc at playerShares/{shareToken}. Read by the slot picker.
export type ShareMeta = {
  campaignId: string;
  campaignName: string;
  tokenVersion: number;
  roster: RosterSlot[];
};

// The redacted payload at playerShares/{shareToken}/slots/{slotId}.
export type SlotProjection = {
  campaignName: string;
  tokenVersion: number;
  slotId: string;
  // Redacted entities, keyed by entity type. Each entity always carries `id`
  // plus only the fields visible to this slot.
  entities: Partial<Record<PlayerEntityType, Array<Record<string, unknown>>>>;
  handouts: string | null;
  sessionLog: Array<Record<string, unknown>>;
  updatedAtMs: number;
  items?: Array<{ id: string; name: string; description?: string }>;
  // Project redacted planning/worldbuilding data
  planning?: {
    pitch?: string | null;
    genre?: string | null;
    gWorld?: string[];
    gFNL?: string[];
    tone?: string[];
    lines?: string[];
    facts?: string[];
    secrets?: string[];
    conflicts?: string[];
  };
  pcGoals?: Array<{
    text: string;
    timeframe?: string;
    success?: string;
    failure?: string;
    linked?: string;
    status?: string;
  }>;
  // Player-visible maps: only layers flagged visibleToPlayers, with GM-only
  // fields (marker notes, entity links, edge travel times) already stripped.
  maps?: import('@/lib/maps/playerProjection').PlayerMap[];
};

export type CampaignItem = {
  id: string;
  name: string;
  description?: string;
  assignedPlayerId?: string; // roster slotId
  playerVisibility?: 'name-only' | 'full';
};

// A redactable game entity: a stable string id plus arbitrary content fields.
// Field-level redaction (resolveVisibility) decides which fields reach players.
export type PlayerEntity = {
  id: string;
  [field: string]: unknown;
};

// A GM narration entry in the player log. `visibility` is GM-internal and is
// stripped before the entry is published to players.
export type PlayerLogEntry = {
  visibility?: EntityVisibility;
  [field: string]: unknown;
};

// The slice of a campaign's `data` blob that the projection pipeline reads.
// Modeling it explicitly is the security boundary's input contract: a field
// that isn't declared here can't be projected to a player by accident, which
// is what stops hidden GM notes from drifting into player views.
export type PlayerModeData = Partial<Record<PlayerEntityType, PlayerEntity[]>> & {
  player: PlayerConfig;
  handouts?: unknown;
  playerLog?: readonly PlayerLogEntry[];
  items?: ReadonlyArray<string | CampaignItem>;
  pcGoals?: readonly any[];
  maps?: unknown;
};

export function normalizeItem(it: string | Record<string, any>, index: number): CampaignItem {
  if (typeof it === 'string') {
    const parts = it.split(' — ');
    const name = parts[0] || '';
    const description = parts.slice(1).join(' — ') || '';
    return {
      id: `item_${index}`,
      name,
      description,
      playerVisibility: 'full'
    };
  }
  return {
    id: it.id || `item_${index}`,
    name: it.name || '',
    description: it.description || '',
    assignedPlayerId: it.assignedPlayerId,
    playerVisibility: it.playerVisibility || 'full'
  };
}

