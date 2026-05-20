// Maps prep sections to the generators that can populate them.
//
// Each section in CampaignEditor has a Summon affordance whose options are
// drawn from this map. The user's last-used generator per section is stored
// under `data.__lastUsedGenerator` and surfaces as the primary button label.
//
// Scope (initial ship): deterministic generators only. The AI-backed
// Names/Locations and the Sidekick/Monster builders live on separate tabs
// with different UIs and are not (yet) routed through the summon modal.

import type { EntityRef, GeneratorKind } from './types';

export type PrepSection = 'locations' | 'npcs' | 'magicItems' | 'monsters';

// Generators wired into the summon modal. A strict subset of GeneratorKind
// — only those whose `applyGeneratorResultToData` save path is implemented.
export type SummonableKind = Extract<
  GeneratorKind,
  'tavern' | 'dungeon' | 'settlement' | 'mundane-shop' | 'magic-shop' | 'treasure-hoard' | 'trinket'
>;

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
  ],
  // Reserved for future wiring (Sidekick + AI Names). Empty arrays render
  // no SummonButton so the section is unaffected.
  npcs: [],
  magicItems: [],
  monsters: [],
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

// Most generators produce multiple entities (e.g. tavern → location + owner
// NPC + patron NPCs). The "primary" entity is the one a user expects the
// post-save scroll to focus on. Save order in lib/generators/save.ts puts
// NPCs first for tavern/shop/settlement, so we cannot just take refs[0].
const PRIMARY_ENTITY_TYPE: Record<SummonableKind, EntityRef['entityType']> = {
  tavern: 'location',
  dungeon: 'location',
  settlement: 'location',
  'mundane-shop': 'location',
  'magic-shop': 'location',
  'treasure-hoard': 'item',
  trinket: 'item',
};

export function pickPrimaryRef(
  refs: EntityRef[],
  kind: SummonableKind,
): EntityRef | null {
  const preferred = PRIMARY_ENTITY_TYPE[kind];
  return refs.find((r) => r.entityType === preferred) ?? refs[0] ?? null;
}
