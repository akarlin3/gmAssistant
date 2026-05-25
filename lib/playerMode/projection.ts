// Builds the redacted per-slot payload that the GM browser publishes to
// playerShares/{shareToken}/slots/{slotId}. This is the only thing players ever
// read, so redaction correctness here IS the security boundary for field-level
// privacy. Uses resolveVisibility for every decision.

import { resolveVisibility } from './resolveVisibility';
import {
  PLAYER_ENTITY_TYPES,
  normalizeItem,
  type EntityVisibility,
  type PlayerConfig,
  type PlayerEntityType,
  type ShareMeta,
  type SlotProjection,
} from './types';

type AnyData = Record<string, any>;

// Fields on a player-log entry that are GM-internal and must not be published
// to players (the `visibility` record reveals who-can-see info).
const PLAYER_LOG_INTERNAL_FIELDS = new Set(['visibility']);

// Fields on an entity that are structural/non-content and should never be
// surfaced as player-visible content (but `id` is always kept for keying).
const STRUCTURAL_FIELDS = new Set([
  'isSidekick', 'sidekickClass', 'sidekickSpellList', 'sidekickBase',
  'sidekickLevel', 'gestalt', 'pointBuy', 'isPublic',
]);

function entityFields(entity: AnyData): string[] {
  return Object.keys(entity).filter((k) => k !== 'id' && !STRUCTURAL_FIELDS.has(k));
}

function redactEntity(
  entity: AnyData,
  entityType: PlayerEntityType,
  config: PlayerConfig,
  slotId: string,
): Record<string, unknown> | null {
  const visibility: EntityVisibility | undefined =
    config.entityVisibility?.[entityType]?.[entity.id];
  const { entityVisible, visibleFields } = resolveVisibility({
    entityType,
    visibility,
    slotId,
    defaults: config.fieldDefaults,
    fields: entityFields(entity),
  });
  if (!entityVisible) return null;
  const out: Record<string, unknown> = { id: entity.id };
  for (const field of visibleFields) out[field] = entity[field];
  return out;
}

function redactLogEntry(entry: AnyData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entry)) {
    if (!PLAYER_LOG_INTERNAL_FIELDS.has(k)) out[k] = v;
  }
  return out;
}

export function buildShareMeta(campaignId: string, data: AnyData, campaignName: string): ShareMeta {
  const config: PlayerConfig = data.player;
  return {
    campaignId,
    campaignName,
    tokenVersion: config.tokenVersion,
    roster: config.roster ?? [],
  };
}

export function buildSlotProjection(
  data: AnyData,
  campaignName: string,
  slotId: string,
  nowMs: number = Date.now(),
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

  // Project assigned items for this slot
  const projectedItems: Array<{ id: string; name: string; description?: string }> = [];
  if (Array.isArray(data.items)) {
    data.items.forEach((it: any, index: number) => {
      const normalized = normalizeItem(it, index);
      if (normalized.assignedPlayerId === slotId) {
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
    });
  }

  return {
    campaignName,
    tokenVersion: config.tokenVersion,
    slotId,
    entities,
    handouts,
    sessionLog,
    updatedAtMs: nowMs,
    items: projectedItems,
  };
}
