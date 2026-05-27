// Builds the redacted per-slot payload that the GM browser publishes to
// playerShares/{shareToken}/slots/{slotId}. This is the only thing players ever
// read, so redaction correctness here IS the security boundary for field-level
// privacy. Uses resolveVisibility for every decision.

import { DEFAULT_FIELD_VISIBILITY } from './fieldDefaults';
import { resolveVisibility } from './resolveVisibility';
import { projectPlayerMaps } from '@/lib/maps/playerProjection';
import {
  PLAYER_ENTITY_TYPES,
  normalizeItem,
  type CampaignItem,
  type EntityVisibility,
  type FieldPrivacyMap,
  type PlayerConfig,
  type PlayerEntity,
  type PlayerEntityType,
  type PlayerLogEntry,
  type PlayerModeData,
  type ShareMeta,
  type SlotProjection,
} from './types';

// Fields on a player-log entry that are GM-internal and must not be published
// to players (the `visibility` record reveals who-can-see info).
const PLAYER_LOG_INTERNAL_FIELDS = new Set(['visibility']);

// Fields on an entity that are structural/non-content and should never be
// surfaced as player-visible content (but `id` is always kept for keying).
const STRUCTURAL_FIELDS = new Set([
  'isSidekick', 'sidekickClass', 'sidekickSpellList', 'sidekickBase',
  'sidekickLevel', 'gestalt', 'pointBuy', 'isPublic',
]);

// Compiled once at module load: the candidate content fields per entity type,
// derived from the canonical field-privacy schema. Iterating this static list
// instead of Object.keys(entity) on every entity avoids per-entity reflection
// in the hot publish loop. Privacy is still resolved per field downstream, so
// listing a private field here is harmless — it just gets filtered out.
const ENTITY_CONTENT_FIELDS: Record<PlayerEntityType, readonly string[]> =
  Object.freeze(
    Object.fromEntries(
      PLAYER_ENTITY_TYPES.map((type) => [
        type,
        Object.freeze(
          Object.keys(DEFAULT_FIELD_VISIBILITY[type]).filter(
            (k) => k !== 'id' && !STRUCTURAL_FIELDS.has(k),
          ),
        ),
      ]),
    ),
  ) as Record<PlayerEntityType, readonly string[]>;

// The fields to consider for an entity: the static schema list plus any
// per-instance override keys (sparse, so the spread only runs when overrides
// exist). Override keys are unioned in so a GM flipping a non-default field to
// public still surfaces it, matching the prior Object.keys(entity) behavior.
function candidateFields(
  entityType: PlayerEntityType,
  overrides: FieldPrivacyMap | undefined,
): readonly string[] {
  const base = ENTITY_CONTENT_FIELDS[entityType];
  if (!overrides) return base;
  const extra = Object.keys(overrides).filter(
    (k) => k !== 'id' && !STRUCTURAL_FIELDS.has(k) && !base.includes(k),
  );
  return extra.length ? [...base, ...extra] : base;
}

function redactEntity(
  entity: PlayerEntity,
  entityType: PlayerEntityType,
  config: PlayerConfig,
  slotId: string,
): Record<string, unknown> | null {
  // Bypasses redaction for PCs owned by the active player slot
  if (
    entityType === 'pcs' &&
    entity.ownership &&
    typeof entity.ownership === 'object' &&
    (entity.ownership as any).ownerType === 'player' &&
    (entity.ownership as any).playerSlotId === slotId
  ) {
    return { ...entity };
  }

  const visibility: EntityVisibility | undefined =
    config.entityVisibility?.[entityType]?.[entity.id];
  const { entityVisible, visibleFields } = resolveVisibility({
    entityType,
    visibility,
    slotId,
    defaults: config.fieldDefaults,
    fields: candidateFields(entityType, visibility?.fieldOverrides) as string[],
  });
  if (!entityVisible) return null;
  const out: Record<string, unknown> = { id: entity.id };
  // Only emit fields actually present on the instance, so a public-by-default
  // field that this entity simply doesn't carry isn't published as undefined.
  for (const field of visibleFields) {
    if (Object.prototype.hasOwnProperty.call(entity, field)) {
      out[field] = entity[field];
    }
  }
  return out;
}

function redactLogEntry(entry: PlayerLogEntry): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entry)) {
    if (!PLAYER_LOG_INTERNAL_FIELDS.has(k)) out[k] = v;
  }
  return out;
}

// Group items by their assigned roster slot once, so each slot's projection is
// an O(1) lookup instead of a full scan of data.items. Built once and reused
// across every slot when publishing (see publishProjections).
export type ItemsBySlot = Map<string, CampaignItem[]>;

export function indexItemsBySlot(
  items: ReadonlyArray<string | CampaignItem> | undefined,
): ItemsBySlot {
  const bySlot: ItemsBySlot = new Map();
  if (!Array.isArray(items)) return bySlot;
  items.forEach((it, index) => {
    const normalized = normalizeItem(it, index);
    const slot = normalized.assignedPlayerId;
    if (!slot) return;
    const bucket = bySlot.get(slot);
    if (bucket) bucket.push(normalized);
    else bySlot.set(slot, [normalized]);
  });
  return bySlot;
}

export function buildShareMeta(
  campaignId: string,
  data: PlayerModeData,
  campaignName: string,
): ShareMeta {
  const config: PlayerConfig = data.player;
  return {
    campaignId,
    campaignName,
    tokenVersion: config.tokenVersion,
    roster: config.roster ?? [],
  };
}

export function buildSlotProjection(
  data: PlayerModeData,
  campaignName: string,
  slotId: string,
  nowMs: number = Date.now(),
  itemsBySlot: ItemsBySlot = indexItemsBySlot(data.items),
): SlotProjection {
  const config: PlayerConfig = data.player;
  const entities: SlotProjection['entities'] = {};

  for (const type of PLAYER_ENTITY_TYPES) {
    const arr = data[type];
    if (!Array.isArray(arr)) continue;
    const redacted: Array<Record<string, unknown>> = [];
    for (const e of arr) {
      if (!e || typeof e !== 'object' || !e.id) continue;
      const r = redactEntity(e, type, config, slotId);
      if (r) redacted.push(r);
    }
    if (redacted.length > 0) entities[type] = redacted;
  }

  // Handouts: a single string gated by its own visibility record.
  let handouts: string | null = null;
  const handoutVis = config.handouts;
  if (typeof data.handouts === 'string' && data.handouts.trim()) {
    const visible = handoutVis?.mode === 'party'
      || (handoutVis?.mode === 'custom' && (handoutVis.allowedSlotIds ?? []).includes(slotId));
    if (visible) handouts = data.handouts;
  }

  // Player narration feed (data.playerLog): include entries whose visibility
  // allows this slot, oldest→newest, with the internal visibility field stripped.
  const sessionLog: Array<Record<string, unknown>> = [];
  const logs = Array.isArray(data.playerLog) ? data.playerLog : [];
  for (const entry of logs) {
    if (!entry || typeof entry !== 'object') continue;
    const vis: EntityVisibility | undefined = entry.visibility;
    const visible = !vis
      ? false
      : vis.mode === 'party'
        || (vis.mode === 'custom' && (vis.allowedSlotIds ?? []).includes(slotId));
    if (visible) sessionLog.push(redactLogEntry(entry));
  }

  // Project assigned items for this slot via the prebuilt index (O(1) lookup).
  const projectedItems: Array<{ id: string; name: string; description?: string }> = [];
  for (const normalized of itemsBySlot.get(slotId) ?? []) {
    if (normalized.playerVisibility === 'full') {
      projectedItems.push({
        id: normalized.id,
        name: normalized.name,
        description: normalized.description,
      });
    } else {
      projectedItems.push({
        id: normalized.id,
        name: normalized.name,
      });
    }
  }

  // Project planning & worldbuilding aspects redacted by planningVisibility choices.
  const pv = config.planningVisibility ?? {};
  const planning: SlotProjection['planning'] = {
    pitch: pv.pitch && typeof (data as any).pitch === 'string' && (data as any).pitch.trim() ? (data as any).pitch : null,
    genre: pv.genre && typeof (data as any).genre === 'string' && (data as any).genre.trim() ? (data as any).genre : null,
    gWorld: (Array.isArray((data as any).gWorld) ? (data as any).gWorld : []).filter((_: any, i: number) => !!pv.gWorld?.[i]),
    gFNL: (Array.isArray((data as any).gFNL) ? (data as any).gFNL : []).filter((_: any, i: number) => !!pv.gFNL?.[i]),
    tone: (Array.isArray((data as any).tone) ? (data as any).tone : []).filter((_: any, i: number) => !!pv.tone?.[i]),
    lines: (Array.isArray((data as any).lines) ? (data as any).lines : []).filter((_: any, i: number) => !!pv.lines?.[i]),
    facts: (Array.isArray((data as any).facts) ? (data as any).facts : []).filter((_: any, i: number) => !!pv.facts?.[i]),
    secrets: (Array.isArray((data as any).secrets) ? (data as any).secrets : []).filter((_: any, i: number) => !!pv.secrets?.[i]),
    conflicts: (Array.isArray((data as any).conflicts) ? (data as any).conflicts : []).filter((_: any, i: number) => !!pv.conflicts?.[i]),
  };

  // Project PC goals that the GM has flagged as public/shared.
  const rawGoals = data.pcGoals;
  const projectedGoals = Array.isArray(rawGoals)
    ? rawGoals
        .filter((g: any) => g && g.isPublic === true && typeof g.text === 'string' && g.text.trim())
        .map((g: any) => ({
          text: g.text,
          timeframe: g.timeframe,
          success: g.success,
          failure: g.failure,
          linked: g.linked,
          status: g.status,
        }))
    : [];

  // Player-visible maps: layer-filtered, GM-only fields stripped. The same for
  // every slot (visibility is per-layer, not per-slot), so this is cheap to
  // recompute per slot and avoids threading another precomputed value through.
  // Pass the whole blob so readMaps normalizes historical/partial map docs.
  const maps = projectPlayerMaps(data as Record<string, unknown>);

  return {
    campaignName,
    tokenVersion: config.tokenVersion,
    slotId,
    entities,
    handouts,
    sessionLog,
    updatedAtMs: nowMs,
    items: projectedItems,
    planning,
    pcGoals: projectedGoals,
    maps,
    playlistUrl: (data as any).__sessionPlaylist || '',
    playlistPlaying: !!(data as any).__sessionPlaylistPlaying,
  };
}
