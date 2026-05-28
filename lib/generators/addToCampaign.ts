// Bridge from generator results / log entries → campaign data lists.
//
// The "Save to log" affordance is the inbox for generator output; this module
// is the outbox — it converts a generator payload into selectable items, and
// each item into the shape of a campaign list entry (locations / npcs /
// monsters / items / treasure / facts / scenes / secrets).
//
// Each generator declares which destinations it allows and what the default
// destination is. The UI shows the picker, lets the user select a subset of
// items, and then calls `mapItem(dest, item)` for each one before appending.
//
// This file is the stable public entry point. The per-LogKind logic lives in
// `addToCampaign/handlers.ts`, keyed by a handler table; shared types and
// helpers live in `addToCampaign/types.ts`.

import type { LogKind } from './log';
import type { ChangeEvent } from '../sessionEvents';
import type { GeneratorResult } from './types';
import { HANDLERS } from './addToCampaign/handlers';
import {
  joinClean,
  safeStr,
  type CampaignDestKey,
  type KindHandler,
  type LocationRow,
  type MappedRow,
  type NpcRow,
  type SelectableItem,
} from './addToCampaign/types';

// Re-export the public types and the destination labels.
export {
  DEST_LABEL,
  type CampaignDestKey,
  type SelectableItem,
  type LocationRow,
  type NpcRow,
} from './addToCampaign/types';

// ── Lookups ──────────────────────────────────────────────────────────────────

function handlerFor(kind: LogKind): KindHandler | null {
  return HANDLERS[kind];
}

export function defaultDestFor(kind: LogKind): CampaignDestKey | null {
  return handlerFor(kind)?.defaultDest ?? null;
}

export function allowedDestsFor(kind: LogKind): readonly CampaignDestKey[] {
  return handlerFor(kind)?.allowed ?? [];
}

export function itemsFor(kind: LogKind, payload: unknown): SelectableItem[] {
  return handlerFor(kind)?.itemsFor(payload) ?? [];
}

// ── Mapping ──────────────────────────────────────────────────────────────────

// The `monsters` destination historically shaped any payload into a monster
// line regardless of LogKind (the picker only ever routes monster kinds here,
// but `mapItem` is public). Preserve that universal behavior here.
function monsterRow(kind: LogKind, item: SelectableItem): string {
  const m = item.payload as {
    name?: string;
    cr?: string;
    challenge_rating?: string;
    type?: string;
    scalingNote?: string;
  };
  const cr = m.cr || m.challenge_rating || '';
  const head = joinClean([safeStr(m.name), cr ? `CR ${cr}` : '', safeStr(m.type)]);
  const tail = kind === 'monster-scale' && m.scalingNote ? ` — ${m.scalingNote}` : '';
  return head + tail;
}

// Convert one selectable item into the row shape for the destination.
// Returns null for items that don't fit the destination (caller skips them).
export function mapItem(
  kind: LogKind,
  dest: CampaignDestKey,
  item: SelectableItem,
): LocationRow | NpcRow | ChangeEvent | string | null {
  if (dest === 'monsters') return monsterRow(kind, item);
  const handler = handlerFor(kind);
  if (!handler) return null;
  return handler.map(dest, item) as MappedRow;
}

// ── Top-level appender ──────────────────────────────────────────────────────

export type CampaignDataPatch = { key: CampaignDestKey; value: unknown[] };

export function buildPatch(
  current: unknown,
  kind: LogKind,
  dest: CampaignDestKey,
  items: SelectableItem[],
): { patch: CampaignDataPatch; added: number } {
  const existing = Array.isArray(current) ? (current as unknown[]) : [];
  const additions: unknown[] = [];
  for (const item of items) {
    const row = mapItem(kind, dest, item);
    if (row === null || row === '') continue;
    additions.push(row);
  }
  return {
    patch: { key: dest, value: [...existing, ...additions] },
    added: additions.length,
  };
}

export function itemsForResult(result: GeneratorResult): SelectableItem[] {
  return itemsFor(result.kind as LogKind, result);
}
