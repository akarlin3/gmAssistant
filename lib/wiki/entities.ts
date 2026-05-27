// Normalizes the heterogeneous campaign `data` blob into a uniform entity
// index the wiki can reason over. Some collections are arrays of objects with
// stable ids (npcs, factions, locations, characters, clocks — ids are
// backfilled by lib/playerMode/migration.ts); others are plain string arrays
// (secrets, monsters, scenes) with no identity at all. For the string kinds we
// synthesize a deterministic content-hash id, which matches how the rest of the
// codebase already identifies those entities (by their trimmed text). If the
// text is later edited the id changes and any relationship to it is treated as
// orphaned — an accepted tradeoff given there is nothing more stable to anchor
// to.

import type { EntityType } from './types';

export type WikiEntity = {
  type: EntityType;
  id: string;
  /** short display name */
  name: string;
  /** secondary searchable text (description, notes, …) */
  body: string;
};

export type EntityIndex = {
  entities: WikiEntity[];
  byKey: Map<string, WikiEntity>;
};

export function entityKey(type: EntityType, id: string): string {
  return `${type}:${id}`;
}

// djb2 → base36. Stable across runs for the same input. Used to give
// string-only entities a referenceable id.
export function stableStringId(text: string): string {
  const norm = text.trim().toLowerCase();
  let h = 5381;
  for (let i = 0; i < norm.length; i++) {
    h = ((h << 5) + h + norm.charCodeAt(i)) | 0;
  }
  return `s${(h >>> 0).toString(36)}`;
}

function truncate(text: string, n = 60): string {
  const t = text.trim().replace(/\s+/g, ' ');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function pushObjectArray(
  out: WikiEntity[],
  arr: unknown,
  type: EntityType,
  nameOf: (e: any) => string,
  bodyOf: (e: any) => string,
) {
  if (!Array.isArray(arr)) return;
  arr.forEach((e: any, i: number) => {
    if (!e || typeof e !== 'object') return;
    const id = typeof e.id === 'string' && e.id ? e.id : `${type}-${i}`;
    const name = nameOf(e).trim();
    if (!name) return;
    out.push({ type, id, name: truncate(name), body: bodyOf(e) });
  });
}

function pushStringArray(out: WikiEntity[], arr: unknown, type: EntityType) {
  if (!Array.isArray(arr)) return;
  const seen = new Set<string>();
  for (const raw of arr) {
    const text = str(raw).trim();
    if (!text) continue;
    const id = stableStringId(text);
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ type, id, name: truncate(text), body: text });
  }
}

// Magic items are stored as a mix of objects (with optional id) and bare
// strings, so they need bespoke handling.
function pushMagicItems(out: WikiEntity[], arr: unknown) {
  if (!Array.isArray(arr)) return;
  const seen = new Set<string>();
  arr.forEach((raw: any, i: number) => {
    if (typeof raw === 'string') {
      const text = raw.trim();
      if (!text) return;
      const id = stableStringId(text);
      if (seen.has(id)) return;
      seen.add(id);
      out.push({ type: 'magicItem', id, name: truncate(text), body: text });
      return;
    }
    if (raw && typeof raw === 'object') {
      const name = str(raw.name).trim();
      if (!name) return;
      const id = typeof raw.id === 'string' && raw.id ? raw.id : stableStringId(name) + `-${i}`;
      if (seen.has(id)) return;
      seen.add(id);
      out.push({ type: 'magicItem', id, name: truncate(name), body: str(raw.description) });
    }
  });
}

export function buildEntityIndex(data: Record<string, any> | null | undefined): EntityIndex {
  const d = data ?? {};
  const entities: WikiEntity[] = [];

  pushObjectArray(
    entities,
    d.npcs,
    'npc',
    (e) => str(e.name),
    (e) =>
      [e.archetype, e.goal, e.method, e.knowledge, e.bond, e.flaw]
        .map(str)
        .filter(Boolean)
        .join(' · '),
  );

  pushObjectArray(
    entities,
    d.factions,
    'faction',
    (e) => str(e.name),
    (e) => [e.identity, e.ideology, e.area].map(str).filter(Boolean).join(' · '),
  );

  pushObjectArray(
    entities,
    d.locations,
    'location',
    (e) => str(e.name),
    (e) =>
      [...(Array.isArray(e.aspects) ? e.aspects : []), e.factions]
        .map(str)
        .filter(Boolean)
        .join(' · '),
  );

  pushObjectArray(
    entities,
    d.characters,
    'pc',
    (e) => str(e.name),
    (e) =>
      [e.classLevel, e.race, e.background, e.backstory, e.notes]
        .map(str)
        .filter(Boolean)
        .join(' · '),
  );

  pushObjectArray(
    entities,
    d.clocks,
    'factionClock',
    (e) => str(e.text) || str(e.name),
    (e) => [e.faction, e.notes].map(str).filter(Boolean).join(' · '),
  );

  // Optional/future object collections — handled gracefully if absent.
  pushObjectArray(
    entities,
    d.fantasticLocations,
    'fantasticLocation',
    (e) => str(e.name),
    (e) => str(e.description),
  );

  pushMagicItems(entities, d.items);

  pushStringArray(entities, d.secrets, 'secret');
  pushStringArray(entities, d.monsters, 'monster');
  pushStringArray(entities, d.scenes, 'scene');
  pushStringArray(entities, d.potentialScenes, 'potentialScene');

  const byKey = new Map<string, WikiEntity>();
  for (const e of entities) byKey.set(entityKey(e.type, e.id), e);

  return { entities, byKey };
}

export function findEntity(
  index: EntityIndex,
  type: EntityType,
  id: string,
): WikiEntity | undefined {
  return index.byKey.get(entityKey(type, id));
}
