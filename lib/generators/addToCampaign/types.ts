// Shared types and helpers for the addToCampaign bridge.

import type { ChangeEvent } from '../../sessionEvents';

// ── Destinations ─────────────────────────────────────────────────────────────

export type CampaignDestKey =
  | 'locations'
  | 'npcs'
  | 'monsters'
  | 'items'
  | 'treasure'
  | 'facts'
  | 'scenes'
  | 'secrets'
  | 'session-log'; // virtual dest: appends a ChangeEvent to __sessionChangeEvents

export const DEST_LABEL: Record<CampaignDestKey, string> = {
  locations: 'Locations',
  npcs: 'NPCs',
  monsters: 'Monsters',
  items: 'Magic Items',
  treasure: 'Treasure',
  facts: 'Setting Facts',
  scenes: 'Potential Scenes',
  secrets: 'Secrets & Clues',
  'session-log': 'Session Log (live)',
};

// ── Selectable items ─────────────────────────────────────────────────────────
// An "item" is one row the user can tick in the picker. Generators that return
// a single thing (settlement, dungeon, tavern, shops) expose exactly one item.
// Batched generators (names, trinkets, tavern-name, AI locations) expose one
// item per element.

export type SelectableItem = {
  id: string; // stable within one result (eg `${result.id}:0`)
  label: string; // shown next to the checkbox
  // Opaque payload used by the per-kind handler to shape the destination row.
  payload: unknown;
};

// ── Destination row shapes ───────────────────────────────────────────────────

export type LocationRow = {
  name: string;
  type: string;
  aspects: [string, string, string];
  factions: string;
};

export type NpcRow = {
  name: string;
  type: string;
  faction: string;
  archetype: string;
  goal: string;
  method: string;
};

// The value a mapper produces for a single (kind, dest, item). `null` means the
// item doesn't fit the destination and the caller skips it.
export type MappedRow = LocationRow | NpcRow | ChangeEvent | string | null;

// ── Per-kind handler ─────────────────────────────────────────────────────────
// One handler per LogKind. `itemsFor` explodes a generator payload into the
// picker rows; `map` shapes a chosen item into the destination row.

export type KindHandler = {
  allowed: readonly CampaignDestKey[];
  defaultDest: CampaignDestKey;
  itemsFor: (payload: unknown) => SelectableItem[];
  map: (dest: CampaignDestKey, item: SelectableItem) => MappedRow;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

export function safeStr(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

export function joinClean(parts: (string | undefined | null)[], sep = ' · '): string {
  return parts.filter((p): p is string => typeof p === 'string' && p.length > 0).join(sep);
}

export function emptyAspects(): [string, string, string] {
  return ['', '', ''];
}

export function formatSegueText(p: Record<string, unknown>): string {
  const title = safeStr(p.title);
  const readAloud = safeStr(p.readAloud);
  if (title && readAloud) return `${title} — ${readAloud}`;
  return title || readAloud;
}

// Names / Locations log payloads live in their tab files — we duck-type here
// so this lib doesn't depend on UI modules.
export type NamesLogPayload = {
  firstCulture: string;
  lastCulture: string;
  gender: string;
  names: { first: string; last: string; firstCulture: string; lastCulture: string }[];
};

export type LocationsLogPayload = {
  locationType: string;
  culture: string;
  locations: { name: string; type: string; culture: string; blurb: string }[];
};
