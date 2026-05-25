// Player Mode shared types. See docs/player-mode-audit.md §5 for the
// architecture these support: GM-published, client-computed projections read
// by unauthenticated players via an unguessable share token.

// Entity types that support field-level visibility. Items/monsters/treasure are
// plain string arrays (no fields to tag) and are intentionally excluded — see
// the audit's "Entity scope" decision.
export const PLAYER_ENTITY_TYPES = [
  'characters',
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
};

export type CampaignItem = {
  id: string;
  name: string;
  description?: string;
  assignedPlayerId?: string; // roster slotId
  playerVisibility?: 'name-only' | 'full';
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

