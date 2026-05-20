// Discriminated union of save actions emitted by SummonModal.
//
// Why a union: different generator kinds produce different shapes the parent
// needs to fold into the campaign. Deterministic generators emit a full
// GeneratorResult (which the parent routes through applyGeneratorResultToData
// for locations, or string-flattens for magic items). AI generators produce
// one entity at a time and emit per-item add actions.

import type { EntityRef, GeneratorResult } from './types';
import { applyGeneratorResultToData } from './save';

// Loose shape mirroring the /api/generate-monster response (kept inline so we
// don't reach into MonsterScaler.tsx for its private type).
export type ScaledMonsterPayload = {
  name: string;
  sourceMonster: string;
  scalingNote: string;
  cr: string;
  size: string;
  type: string;
  alignment: string;
  ac: string;
  hp: string;
  speed: string;
  abilities: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  savingThrows: string;
  skills: string;
  damageResistances: string;
  damageImmunities: string;
  conditionImmunities: string;
  senses: string;
  languages: string;
  traits: { name: string; description: string }[];
  actions: { name: string; description: string }[];
  legendaryActions: { name: string; description: string }[];
};

export type GeneratedNamePayload = {
  first: string;
  last: string;
  firstCulture: string;
  lastCulture: string;
};

export type GeneratedLocationPayload = {
  name: string;
  type: string;
  culture: string;
  blurb: string;
};

export type SummonSaveAction =
  | { type: 'generator-result'; result: GeneratorResult }
  | { type: 'add-npc-from-name'; name: GeneratedNamePayload }
  | { type: 'add-location-from-ai'; loc: GeneratedLocationPayload }
  | { type: 'add-monster-scaled'; scaled: ScaledMonsterPayload };

function rid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

function coinsToString(c: { cp: number; sp: number; ep: number; gp: number; pp: number }): string {
  return (['pp', 'gp', 'ep', 'sp', 'cp'] as const)
    .map((k) => (c[k] > 0 ? `${c[k]} ${k}` : ''))
    .filter(Boolean)
    .join(', ');
}

// Treasure hoards and trinkets save as STRING entries (matching the existing
// prep-section ListField shape) rather than StructuredItem objects. The full
// structured result still lives in data.generationsHistory for downstream use.
function treasureHoardToStrings(r: Extract<GeneratorResult, { kind: 'treasure-hoard' }>): string[] {
  const lines: string[] = [];
  const summary: string[] = [];
  const coins = coinsToString(r.coins);
  if (coins) summary.push(`Coins: ${coins}`);
  if (r.gems.length) summary.push(`Gems: ${r.gems.map((g) => `${g.name} (${g.value} gp)`).join('; ')}`);
  if (r.artObjects.length) summary.push(`Art: ${r.artObjects.map((a) => `${a.name} (${a.value} gp)`).join('; ')}`);
  if (summary.length) lines.push(`Treasure Hoard (CR ${r.inputs.crTier}) — ${summary.join(' · ')}`);
  for (const mi of r.magicItems) {
    const note = mi.note ? ` — ${mi.note}` : '';
    lines.push(`${mi.name} (${mi.rarity} ${mi.category})${note}`);
  }
  return lines;
}

function trinketToStrings(r: Extract<GeneratorResult, { kind: 'trinket' }>): string[] {
  return r.trinkets.map((t) => (t.hook ? `${t.description} — ${t.hook}` : t.description));
}

// ScaledMonster → HomebrewMonster (Monster shape used by data.homebrewMonsters)
function parseFirstNumber(s: string): number {
  const m = s.match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : 0;
}

function parseSpeed(s: string): Record<string, number | boolean> {
  // "30 ft., fly 60 ft. (hover)" → { walk: 30, fly: 60, hover: true }
  const out: Record<string, number | boolean> = { walk: 30 };
  if (!s) return out;
  let consumed = false;
  s.split(',').forEach((part) => {
    const p = part.trim().toLowerCase();
    if (!p) return;
    if (p.includes('hover')) out.hover = true;
    const numMatch = p.match(/-?\d+/);
    if (!numMatch) return;
    const num = Number(numMatch[0]);
    const named = p.match(/(burrow|climb|fly|swim)/);
    if (named) {
      out[named[1]] = num;
    } else {
      out.walk = num;
      consumed = true;
    }
  });
  if (!consumed && !('walk' in out)) out.walk = 30;
  return out;
}

const CR_VALUE: Record<string, number> = {
  '0': 0, '1/8': 0.125, '1/4': 0.25, '1/2': 0.5,
};
function crToValue(label: string): number {
  if (label in CR_VALUE) return CR_VALUE[label];
  const n = Number(label);
  return Number.isFinite(n) ? n : 0;
}

export function scaledMonsterToHomebrew(s: ScaledMonsterPayload): Record<string, unknown> {
  const slug = `hb-${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
  return {
    slug,
    name: s.name || 'Unnamed Monster',
    size: s.size || 'Medium',
    type: s.type || 'humanoid',
    subtype: '',
    alignment: s.alignment || 'unaligned',
    armor_class: parseFirstNumber(s.ac) || 10,
    armor_desc: s.ac,
    hit_points: parseFirstNumber(s.hp) || 1,
    hit_dice: s.hp,
    speed: parseSpeed(s.speed),
    strength: s.abilities.str,
    dexterity: s.abilities.dex,
    constitution: s.abilities.con,
    intelligence: s.abilities.int,
    wisdom: s.abilities.wis,
    charisma: s.abilities.cha,
    strength_save: null,
    dexterity_save: null,
    constitution_save: null,
    intelligence_save: null,
    wisdom_save: null,
    charisma_save: null,
    skills: {},
    damage_vulnerabilities: '',
    damage_resistances: s.damageResistances || '',
    damage_immunities: s.damageImmunities || '',
    condition_immunities: s.conditionImmunities || '',
    senses: s.senses || '',
    languages: s.languages || '',
    challenge_rating: s.cr,
    cr: crToValue(s.cr),
    actions: s.actions.map((a) => ({ name: a.name, desc: a.description })),
    bonus_actions: [],
    reactions: [],
    legendary_desc: '',
    legendary_actions: s.legendaryActions.map((a) => ({ name: a.name, desc: a.description })),
    special_abilities: s.traits.map((a) => ({ name: a.name, desc: a.description })),
    desc: s.scalingNote || '',
    source: 'generator:monster-ai',
    homebrew: true,
  };
}

export function applySummonAction(
  inputData: Record<string, unknown>,
  action: SummonSaveAction,
): { next: Record<string, unknown>; refs: EntityRef[] } {
  if (action.type === 'generator-result') {
    const r = action.result;
    // Treasure/Trinket use the legacy string-array prep shape (data.items),
    // which the existing ListField renders. Sidestep StructuredItem to keep
    // the prep section consistent.
    if (r.kind === 'treasure-hoard' || r.kind === 'trinket') {
      const lines = r.kind === 'treasure-hoard' ? treasureHoardToStrings(r) : trinketToStrings(r);
      const cur = Array.isArray(inputData.items) ? (inputData.items as unknown[]) : [];
      const startIndex = cur.length;
      const items = [...cur, ...lines];
      const refs: EntityRef[] = lines.map((_, i) => ({
        entityType: 'item',
        entityKey: 'items',
        entityId: `items-${startIndex + i}`,
        entityIndex: startIndex + i,
      }));
      return { next: { ...inputData, items }, refs };
    }
    // Locations + shops + tavern + settlement → structured pipeline.
    const { data, saved } = applyGeneratorResultToData(inputData, r);
    return { next: data, refs: saved.refs };
  }

  if (action.type === 'add-npc-from-name') {
    const full = [action.name.first, action.name.last].filter(Boolean).join(' ');
    const cultureTag = action.name.firstCulture === action.name.lastCulture
      ? action.name.firstCulture
      : [action.name.firstCulture, action.name.lastCulture].filter(Boolean).join(' / ');
    const id = rid('npc');
    const npc = {
      id,
      name: full,
      type: '',
      faction: '',
      archetype: cultureTag,
      goal: '',
      method: '',
      source: 'generator:names-ai',
    };
    const cur = Array.isArray(inputData.npcs) ? (inputData.npcs as unknown[]) : [];
    const next = { ...inputData, npcs: [...cur, npc] };
    return {
      next,
      refs: [{ entityType: 'npc', entityKey: 'npcs', entityId: id, entityIndex: cur.length }],
    };
  }

  if (action.type === 'add-location-from-ai') {
    const id = rid('loc');
    const typeLabel = action.loc.type || 'Wilderness Landmark';
    const aspects: [string, string, string] = action.loc.blurb
      ? [action.loc.blurb, '', '']
      : ['', '', ''];
    const loc = {
      id,
      name: action.loc.name,
      type: typeLabel,
      subtype: 'other',
      aspects,
      factions: '',
      source: 'generator:locations-ai',
    };
    const cur = Array.isArray(inputData.locations) ? (inputData.locations as unknown[]) : [];
    const next = { ...inputData, locations: [...cur, loc] };
    return {
      next,
      refs: [{ entityType: 'location', entityKey: 'locations', entityId: id, entityIndex: cur.length }],
    };
  }

  if (action.type === 'add-monster-scaled') {
    const s = action.scaled;
    const homebrew = scaledMonsterToHomebrew(s);
    const curMonsters = Array.isArray(inputData.monsters) ? (inputData.monsters as unknown[]) : [];
    const monsterLine = `${s.name} — CR ${s.cr} — scaled from ${s.sourceMonster}`;
    const newMonsters = [...curMonsters, monsterLine];
    const monsterIndex = curMonsters.length;
    const curHomebrew = Array.isArray(inputData.homebrewMonsters)
      ? (inputData.homebrewMonsters as unknown[])
      : [];
    const next = {
      ...inputData,
      monsters: newMonsters,
      homebrewMonsters: [...curHomebrew, homebrew],
    };
    // The primary entity for the toast is the prep-section monster string;
    // homebrew bestiary entry is the secondary "Note" so the toast counts it.
    return {
      next,
      refs: [
        {
          entityType: 'note',
          entityKey: 'monsters',
          entityId: `monsters-${monsterIndex}`,
          entityIndex: monsterIndex,
        },
        {
          entityType: 'note',
          entityKey: 'homebrewMonsters',
          entityId: String((homebrew as { slug: string }).slug),
          entityIndex: curHomebrew.length,
        },
      ],
    };
  }

  return { next: inputData, refs: [] };
}

