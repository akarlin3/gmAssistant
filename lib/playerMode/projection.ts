// Builds the redacted per-slot payload that the GM browser publishes to
// playerShares/{shareToken}/slots/{slotId}. This is the only thing players ever
// read, so redaction correctness here IS the security boundary for field-level
// privacy. Uses resolveVisibility for every decision.

import { DEFAULT_FIELD_VISIBILITY } from './fieldDefaults';
import { resolveVisibility } from './resolveVisibility';
import { redactSpoilers } from './spoilers';
import { edgeVisibleToSlot, effectiveWeight } from '@/lib/wiki/edges';
import type { EntityType, Relationship } from '@/lib/wiki/types';
import { projectPlayerMaps } from '@/lib/maps/playerProjection';
import { projectWorldClockForPlayers } from '@/lib/worldClock';
import {
  PLAYER_ENTITY_TYPES,
  normalizeItem,
  type CampaignItem,
  type CampaignWhisper,
  type EntityVisibility,
  type FieldPrivacyMap,
  type HandoutCard,
  type PlayerConfig,
  type PlayerEntity,
  type PlayerEntityType,
  type PlayerLogEntry,
  type PlayerModeData,
  type ProjectedHandoutCard,
  type ProjectedWhisper,
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
  'tokenPosition', 'mapPing', 'playerWhispers',
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
  // Bypasses redaction for PCs owned by the active player slot (except GM-only fields)
  if (
    entityType === 'pcs' &&
    entity.ownership &&
    typeof entity.ownership === 'object' &&
    (entity.ownership as any).ownerType === 'player' &&
    (entity.ownership as any).playerSlotId === slotId
  ) {
    const copy: Record<string, unknown> = { ...entity };
    delete copy.gmNotes;
    delete copy.gmSecrets;
    return copy;
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

// Map a projected (plural) player-entity collection key to the (singular)
// wiki EntityType used on edges, so we can test an edge endpoint against the
// set of entities actually projected to this slot.
const PLAYER_TYPE_TO_EDGE_TYPE: Record<PlayerEntityType, EntityType> = {
  characters: 'pc',
  pcs: 'pc',
  npcs: 'npc',
  locations: 'location',
  factions: 'faction',
  clocks: 'factionClock',
};

// Redact the campaign's graph edges for one slot. An edge is published only
// when BOTH (a) its own visibility admits the slot and (b) both endpoints were
// themselves projected to this slot — so an edge can never betray the
// existence of a hidden entity. Endpoints of a type that is never projected
// (secret, monster, magicItem, scene, …) therefore fail closed automatically.
// Suggested-but-unconfirmed edges are never published. GM-only fields (notes,
// visibility, customVisibleTo, timestamps) are stripped.
export function projectEdges(
  data: PlayerModeData,
  visibleEntityKeys: ReadonlySet<string>,
  slotId: string,
): SlotProjection['edges'] {
  const rels = data.relationships;
  if (!Array.isArray(rels)) return undefined;
  const out: NonNullable<SlotProjection['edges']> = [];
  for (const rel of rels as ReadonlyArray<Relationship>) {
    if (!rel || typeof rel !== 'object' || !rel.id) continue;
    // Review-queue edges (auto-suggested or derivation-proposed) are never
    // published — they aren't confirmed campaign content yet.
    if (rel.suggested || rel.proposed) continue;
    if (!edgeVisibleToSlot(rel.visibility, rel.customVisibleTo, slotId)) continue;
    const fromKey = `${rel.fromType}:${rel.fromId}`;
    const toKey = `${rel.toType}:${rel.toId}`;
    if (!visibleEntityKeys.has(fromKey) || !visibleEntityKeys.has(toKey)) continue;
    out.push({
      id: rel.id,
      fromType: rel.fromType,
      fromId: rel.fromId,
      toType: rel.toType,
      toId: rel.toId,
      kind: rel.kind,
      weight: effectiveWeight(rel),
    });
  }
  return out;
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

  // Set of `${edgeType}:${id}` for every entity actually projected to this
  // slot — the endpoint allowlist for edge redaction below.
  const visibleEntityKeys = new Set<string>();
  for (const type of PLAYER_ENTITY_TYPES) {
    const projected = entities[type];
    if (!projected) continue;
    const edgeType = PLAYER_TYPE_TO_EDGE_TYPE[type];
    for (const e of projected) {
      if (e && typeof e.id === 'string') visibleEntityKeys.add(`${edgeType}:${e.id}`);
    }
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
        name: redactSpoilers(normalized.name),
        description: normalized.description ? redactSpoilers(normalized.description) : undefined,
      });
    } else {
      projectedItems.push({
        id: normalized.id,
        name: redactSpoilers(normalized.name),
      });
    }
  }
  projectedItems.sort((a, b) => a.name.localeCompare(b.name));

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

  // Per-player whispers: strictly project ONLY whispers addressed to `slotId`
  // or authored by `slotId` (including outbound whispers on a PC owned by `slotId`).
  // Whispers addressed exclusively to Slot A NEVER appear in Slot B's projection,
  // and `toSlotIds` is stripped from the projected payload so co-recipients are never leaked.
  const whispers: ProjectedWhisper[] = [];
  const rawWhispers = Array.isArray(data.whispers) ? data.whispers : [];
  for (const w of rawWhispers as ReadonlyArray<CampaignWhisper>) {
    if (!w || typeof w !== 'object' || typeof w.id !== 'string' || typeof w.text !== 'string') continue;
    const toList = Array.isArray(w.toSlotIds) ? w.toSlotIds : [];
    const fromVal = w.from || 'gm';
    const addressedToSlot = toList.includes(slotId);
    const authoredBySlot = fromVal === slotId;
    if (!addressedToSlot && !authoredBySlot) continue;
    const tsVal = typeof w.timestamp === 'number' ? w.timestamp : typeof w.sentAtMs === 'number' ? w.sentAtMs : 0;
    const clean: ProjectedWhisper = {
      id: w.id,
      from: fromVal === 'gm' ? 'gm' : String(fromVal),
      text: redactSpoilers(w.text),
      timestamp: tsVal,
    };
    const labelVal = w.fromLabel || w.senderLabel;
    if (typeof labelVal === 'string' && labelVal) clean.fromLabel = labelVal;
    if (typeof w.entityId === 'string' && w.entityId) clean.entityId = w.entityId;
    const entName = w.entityName || w.entityLabel;
    if (typeof entName === 'string' && entName) clean.entityName = redactSpoilers(entName);
    const entCat = w.entityCategory || w.entityType;
    if (typeof entCat === 'string' && entCat) clean.entityCategory = entCat;
    whispers.push(clean);
  }

  // Also include outbound whispers authored by this slot on its own PC (`pc.playerWhispers`)
  const pcsArr = Array.isArray(data.pcs) ? data.pcs : [];
  const existingWhisperIds = new Set(whispers.map((w) => w.id));
  for (const pc of pcsArr) {
    if (!pc || typeof pc !== 'object') continue;
    const own = pc.ownership as { ownerType?: string; playerSlotId?: string } | undefined;
    if (own?.ownerType === 'player' && own.playerSlotId === slotId && Array.isArray((pc as any).playerWhispers)) {
      for (const pw of (pc as any).playerWhispers) {
        if (!pw || typeof pw !== 'object' || typeof pw.id !== 'string' || typeof pw.text !== 'string') continue;
        if (existingWhisperIds.has(pw.id)) continue;
        existingWhisperIds.add(pw.id);
        const clean: ProjectedWhisper = {
          id: pw.id,
          from: slotId,
          fromLabel: typeof pc.name === 'string' ? pc.name : undefined,
          text: pw.text,
          timestamp: typeof pw.timestamp === 'number' ? pw.timestamp : 0,
        };
        if (typeof pw.entityId === 'string' && pw.entityId) clean.entityId = pw.entityId;
        if (typeof pw.entityName === 'string' && pw.entityName) clean.entityName = pw.entityName;
        whispers.push(clean);
      }
    }
  }
  whispers.sort((a, b) => a.timestamp - b.timestamp);

  // Handout Gallery & Flash Handout Modal projection (redacted by visibility; GM notes stripped)
  const handoutGallery: ProjectedHandoutCard[] = [];
  let activeHandoutFlash: ProjectedHandoutCard | null = null;
  const rawHandouts = Array.isArray(data.handoutGallery) ? data.handoutGallery : [];
  const flashId = typeof data.activeHandoutFlashId === 'string' ? data.activeHandoutFlashId : null;

  for (const h of rawHandouts as ReadonlyArray<HandoutCard>) {
    if (!h || typeof h !== 'object' || typeof h.id !== 'string' || typeof h.title !== 'string') continue;
    const vis = h.visibility;
    // Default handout card visibility in handoutGallery is 'party' unless explicitly set to 'private' or 'custom'
    const visible = !vis
      ? true
      : vis.mode === 'party' || (vis.mode === 'custom' && (vis.allowedSlotIds ?? []).includes(slotId));
    if (!visible) continue;
    const card: ProjectedHandoutCard = {
      id: h.id,
      title: redactSpoilers(h.title),
      category: h.category || h.kind || 'lore',
    };
    const bodyText = typeof h.content === 'string' && h.content ? h.content : typeof h.body === 'string' ? h.body : '';
    if (bodyText) card.content = redactSpoilers(bodyText);
    if (typeof h.imageUrl === 'string' && h.imageUrl) card.imageUrl = h.imageUrl;
    if (typeof h.subtitle === 'string' && h.subtitle) card.subtitle = redactSpoilers(h.subtitle);
    if (h.style === 'parchment' || h.style === 'slate') card.style = h.style;
    const flashedTs = typeof h.flashedAt === 'number' ? h.flashedAt : typeof h.flashedAtMs === 'number' ? h.flashedAtMs : undefined;
    if (typeof flashedTs === 'number') card.flashedAt = flashedTs;
    handoutGallery.push(card);
    if ((flashId && h.id === flashId) || h.activeFlash === true) {
      activeHandoutFlash = card;
    }
  }

  // World Clock projection (only projected when worldClock.visibility === 'party')
  const worldClock = projectWorldClockForPlayers(data as Record<string, unknown>);

  return {
    campaignName,
    tokenVersion: config.tokenVersion,
    slotId,
    entities,
    handouts,
    sessionLog,
    updatedAtMs: nowMs,
    items: projectedItems,
    edges: projectEdges(data, visibleEntityKeys, slotId),
    planning,
    pcGoals: projectedGoals,
    maps,
    whispers,
    handoutGallery,
    activeHandoutFlash,
    ...(worldClock ? { worldClock } : {}),
    tableSafetyEnabled: config.tableSafetyEnabled === true,
    playlistUrl: data.__sessionPlaylist || '',
    playlistPlaying: !!data.__sessionPlaylistPlaying,
    playlistIndex: typeof data.__sessionPlaylistIndex === 'number' ? data.__sessionPlaylistIndex : 0,
    playlistAnchor: (() => {
      const a = data.__sessionPlaylistAnchor as
        | { positionSec?: number; anchorWallTimeMs?: number; playlistIndex?: number }
        | undefined;
      if (
        a &&
        typeof a.positionSec === 'number' &&
        typeof a.anchorWallTimeMs === 'number' &&
        typeof a.playlistIndex === 'number'
      ) {
        return {
          positionSec: a.positionSec,
          anchorWallTimeMs: a.anchorWallTimeMs,
          playlistIndex: a.playlistIndex,
        };
      }
      return undefined;
    })(),
  };
}
