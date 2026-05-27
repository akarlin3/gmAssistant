// Idempotent initialization of player-mode config on a campaign's `data` blob.
// Safe to run repeatedly: it only fills in what's missing. Returns a new data
// object plus a `changed` flag so callers can skip the Firestore write when
// nothing was added.

import { cloneDefaultFieldVisibility } from './fieldDefaults';
import { makeEntityId, makeShareToken } from './share';
import {
  type EntityVisibility,
  type PlayerConfig,
  type PlayerEntityType,
} from './types';

// Object-entity arrays that need stable ids backfilled. `characters` already
// carry ids (lib/character-schema.ts), so they're not listed here.
const ID_BACKFILL_TYPES: PlayerEntityType[] = ['npcs', 'locations', 'factions', 'clocks'];

type AnyData = Record<string, any>;

export type InitResult = { data: AnyData; changed: boolean };

export function initPlayerMode(input: AnyData | null | undefined): InitResult {
  // Deep-ish clone of the parts we touch. We avoid structuredClone to keep this
  // usable in every runtime; arrays of entities are shallow-cloned per element.
  const data: AnyData = { ...(input ?? {}) };
  let changed = false;

  // 1. Backfill entity ids on object arrays.
  for (const type of ID_BACKFILL_TYPES) {
    const arr = data[type];
    if (!Array.isArray(arr)) continue;
    const next = arr.map((e: any) => {
      if (e && typeof e === 'object' && !Array.isArray(e)) {
        if (typeof e.id === 'string' && e.id) return e;
        changed = true;
        return { ...e, id: makeEntityId() };
      }
      return e;
    });
    data[type] = next;
  }

  // 2. Ensure a player config exists.
  const existing: Partial<PlayerConfig> | undefined = data.player;
  const config: PlayerConfig = {
    shareToken: existing?.shareToken || makeShareToken(),
    tokenVersion: typeof existing?.tokenVersion === 'number' ? existing.tokenVersion : 1,
    roster: Array.isArray(existing?.roster) ? existing!.roster : [],
    fieldDefaults: existing?.fieldDefaults ?? cloneDefaultFieldVisibility(),
    entityVisibility: existing?.entityVisibility ?? {},
    handouts: existing?.handouts,
    planningVisibility: existing?.planningVisibility ?? {},
  };
  if (!existing || !existing.shareToken || typeof existing.tokenVersion !== 'number'
      || !existing.fieldDefaults || !existing.entityVisibility) {
    changed = true;
  }

  // 3. Migrate legacy `isPublic` flags (npcs/locations) into entityVisibility.
  //    Only seed an entry when one doesn't already exist, so GM edits win.
  for (const type of ['npcs', 'locations'] as PlayerEntityType[]) {
    const arr = data[type];
    if (!Array.isArray(arr)) continue;
    const bucket: Record<string, EntityVisibility> = config.entityVisibility[type] ?? {};
    for (const e of arr) {
      if (!e || typeof e !== 'object' || !e.id) continue;
      if (bucket[e.id]) continue;
      if (e.isPublic === true) {
        bucket[e.id] = { mode: 'party' };
        changed = true;
      }
    }
    if (Object.keys(bucket).length > 0) config.entityVisibility[type] = bucket;
  }

  data.player = config;
  return { data, changed };
}
