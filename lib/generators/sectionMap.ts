// Maps prep sections to the generators that can populate them.
//
// Each section in CampaignEditor has a Summon affordance whose options are
// drawn from this map. The user's last-used generator per section is stored
// under `data.__lastUsedGenerator` and surfaces as the primary button label.

import type { EntityRef, GeneratorKind } from './types';

export type PrepSection = 'locations' | 'npcs' | 'magicItems' | 'monsters';

// Deterministic generators come straight from GeneratorKind. AI generators
// don't have a GeneratorResult shape and live as separate panels in the
// summon modal; we slot them in by widening the union.
export type AiKind = 'names-ai' | 'locations-ai' | 'monster-ai';
export type SummonableKind = GeneratorKind | AiKind;

export type GeneratorMeta = {
  kind: SummonableKind;
  label: string; // chooser label
  shortLabel: string; // primary-button label when this is last-used
  pro: boolean;
};

export const SECTION_GENERATORS: Record<PrepSection, GeneratorMeta[]> = {
  locations: [
    { kind: 'tavern', label: 'Tavern', shortLabel: 'Tavern', pro: false },
    { kind: 'dungeon', label: 'Dungeon', shortLabel: 'Dungeon', pro: false },
    { kind: 'settlement', label: 'Settlement', shortLabel: 'Settlement', pro: false },
    { kind: 'mundane-shop', label: 'Mundane Shop', shortLabel: 'Shop', pro: false },
    { kind: 'magic-shop', label: 'Magic Shop', shortLabel: 'Magic Shop', pro: false },
    { kind: 'locations-ai', label: 'AI Location (Pro)', shortLabel: 'AI Place', pro: true },
  ],
  npcs: [
    { kind: 'names-ai', label: 'AI Name (Pro)', shortLabel: 'AI Name', pro: true },
  ],
  magicItems: [
    { kind: 'treasure-hoard', label: 'Treasure Hoard', shortLabel: 'Hoard', pro: false },
    { kind: 'trinket', label: 'Trinket(s)', shortLabel: 'Trinket', pro: false },
  ],
  monsters: [
    { kind: 'monster-ai', label: 'AI Monster Scaler (Pro)', shortLabel: 'AI Monster', pro: true },
  ],
};

export type LastUsedMap = Partial<Record<PrepSection, SummonableKind>>;

export function getLastUsed(
  data: Record<string, unknown>,
  section: PrepSection,
): GeneratorMeta | null {
  const list = SECTION_GENERATORS[section];
  if (list.length === 0) return null;
  const last = (data.__lastUsedGenerator as LastUsedMap | undefined)?.[section];
  if (last) {
    const found = list.find((g) => g.kind === last);
    if (found) return found;
  }
  return list[0];
}

export function setLastUsed(
  data: Record<string, unknown>,
  section: PrepSection,
  kind: SummonableKind,
): Record<string, unknown> {
  const cur = (data.__lastUsedGenerator as LastUsedMap | undefined) ?? {};
  return { ...data, __lastUsedGenerator: { ...cur, [section]: kind } };
}

// Each generator's "primary" entity — the one a user expects post-save scroll
// to focus on. save.ts writes NPCs before locations for tavern/shop/settlement
// (so the location ref is not at refs[0]); the AI generators each produce a
// single entity type, so the choice is trivial there.
const PRIMARY_ENTITY_TYPE: Record<SummonableKind, EntityRef['entityType']> = {
  tavern: 'location',
  dungeon: 'location',
  settlement: 'location',
  'mundane-shop': 'location',
  'magic-shop': 'location',
  'treasure-hoard': 'item',
  trinket: 'item',
  'tavern-name': 'note',
  'names-ai': 'npc',
  'locations-ai': 'location',
  'monster-ai': 'note',
};

export function pickPrimaryRef(
  refs: EntityRef[],
  kind: SummonableKind,
): EntityRef | null {
  const preferred = PRIMARY_ENTITY_TYPE[kind];
  return refs.find((r) => r.entityType === preferred) ?? refs[0] ?? null;
}
