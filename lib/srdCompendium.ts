// Offline-First 5e SRD 5.1 Compendium & Statblock Instantiation Engine.
//
// Attribution (CC-BY-4.0):
// This work includes material taken from the System Reference Document 5.1 ("SRD 5.1")
// by Wizards of the Coast LLC and available at https://dnd.wizards.com/resources/systems-reference-document.
// The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International License
// available at https://creativecommons.org/licenses/by/4.0/legalcode.

import spellsRaw from '@/lib/srd/spells.json';
import conditionsRaw from '@/lib/srd/conditions.json';
import {
  SRD_CORE_MONSTERS,
  type MonsterSize,
  type SrdMonster,
  type SrdMonsterAction,
  type SrdMonsterTrait,
} from '@/lib/srd/monsters-core';
import {
  SRD_MAGIC_ITEMS,
  type MagicItemCategory,
  type MagicItemRarity,
  type SrdMagicItem,
} from '@/lib/srd/magic-items';
import { evaluateCharacterSheet } from '@/lib/characterEvaluator';
import { abilityMod, makeCombatantId, type Combatant } from '@/lib/initiative';
import { newId, type MapTokenPin } from '@/lib/maps/types';
import type {
  AbilityName,
  Attack,
  InventoryItem,
  PartyLootItem,
  PlayerCharacter,
} from '@/lib/pc/types';

export {
  SRD_CORE_MONSTERS,
  SRD_MAGIC_ITEMS,
  type MonsterSize,
  type SrdMonster,
  type SrdMonsterAction,
  type SrdMonsterTrait,
  type MagicItemCategory,
  type MagicItemRarity,
  type SrdMagicItem,
};

export const SRD_CC_BY_4_ATTRIBUTION =
  'Includes material from the System Reference Document 5.1 ("SRD 5.1") by Wizards of the Coast LLC, licensed under CC-BY-4.0.';

export type SrdCompendiumCategory = 'monster' | 'spell' | 'condition' | 'item';

export interface SrdAoeSpec {
  shape: 'cone' | 'sphere' | 'cube' | 'line';
  sizeFt: number;
}

export interface SrdSpellEntry {
  id: string;
  slug: string;
  name: string;
  level: number;
  school: string;
  classes: string[];
  ritual: boolean;
  concentration: boolean;
  castingTime: string;
  range: string;
  components: string[];
  material: string | null;
  duration: string;
  description: string[];
  higherLevel: string[];
  damageFormula?: string;
  damageType?: string;
  healingFormula?: string;
  saveAbility?: AbilityName;
  halfOnSave?: boolean;
  isSpellAttack?: boolean;
  scalingSummary?: string;
  aoe?: SrdAoeSpec;
}

export interface SrdConditionEntry {
  id: string;
  slug: string;
  name: string;
  bullets: string[];
}

export type SrdCompendiumItem =
  | { category: 'monster'; id: string; name: string; subtitle: string; monster: SrdMonster }
  | { category: 'spell'; id: string; name: string; subtitle: string; spell: SrdSpellEntry }
  | { category: 'condition'; id: string; name: string; subtitle: string; condition: SrdConditionEntry }
  | { category: 'item'; id: string; name: string; subtitle: string; item: SrdMagicItem };

export interface SrdSearchFilters {
  category?: SrdCompendiumCategory | 'all';
  minCr?: number;
  maxCr?: number;
  spellLevel?: number | 'all';
  school?: string;
  concentrationOnly?: boolean;
  rarity?: MagicItemRarity | 'all';
  limit?: number;
  extraMonsters?: ReadonlyArray<SrdMonster>;
}

const ABILITY_WORD_TO_CODE: Record<string, AbilityName> = {
  strength: 'STR',
  dexterity: 'DEX',
  constitution: 'CON',
  intelligence: 'INT',
  wisdom: 'WIS',
  charisma: 'CHA',
};

const DAMAGE_TYPES = [
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
] as const;

function parseSpellMechanics(raw: {
  index: string;
  name: string;
  level: number;
  school: string;
  classes: string[];
  ritual: boolean;
  concentration: boolean;
  casting_time: string;
  range: string;
  components: string[];
  material: string | null;
  duration: string;
  desc: string[];
  higher_level: string[];
}): SrdSpellEntry {
  const fullText = [...(raw.desc || []), ...(raw.higher_level || [])].join(' ');
  const descOnly = (raw.desc || []).join(' ');

  // Save ability extraction
  let saveAbility: AbilityName | undefined;
  const saveMatch = descOnly.match(
    /\b(strength|dexterity|constitution|intelligence|wisdom|charisma)\s+saving\s+throw/i,
  );
  if (saveMatch) {
    saveAbility = ABILITY_WORD_TO_CODE[saveMatch[1].toLowerCase()];
  }

  const halfOnSave = /half as much damage on a successful/i.test(descOnly);
  const isSpellAttack = /\b(melee|ranged)\s+spell\s+attack\b/i.test(descOnly);

  // Damage formula extraction (e.g., "take 8d6 fire damage" or "takes 1d10 fire damage")
  let damageFormula: string | undefined;
  let damageType: string | undefined;
  const typedDmgMatch = descOnly.match(
    new RegExp(
      `(\\d+d\\d+(?:\\s*[+-]\\s*\\d+)?)\\s+(${DAMAGE_TYPES.join('|')})\\s+damage`,
      'i',
    ),
  );
  if (typedDmgMatch) {
    damageFormula = typedDmgMatch[1].replace(/\s+/g, '');
    damageType = typedDmgMatch[2].toLowerCase();
  } else if (raw.index === 'magic-missile') {
    damageFormula = '3d4+3';
    damageType = 'force';
  }

  // Healing formula extraction
  let healingFormula: string | undefined;
  const healMatch = descOnly.match(
    /regains?\s+(?:a number of\s+)?(?:hit points\s+equal to\s+)?(\d+d\d+(?:\s*\+\s*\d+)?)/i,
  );
  if (healMatch) {
    healingFormula = healMatch[1].replace(/\s+/g, '');
  }

  // Scaling summary extraction
  let scalingSummary: string | undefined;
  if (raw.higher_level && raw.higher_level.length > 0) {
    scalingSummary = raw.higher_level[0];
  } else {
    const cantripScale = (raw.desc || []).find((p) =>
      /increases by \d+d\d+ when you reach 5th level|more than one beam when you reach higher levels/i.test(p),
    );
    if (cantripScale) scalingSummary = cantripScale;
  }

  // AoE extraction
  let aoe: SrdAoeSpec | undefined;
  const sphereMatch = descOnly.match(/(\d+)-foot(?:-radius)?\s+sphere/i) || descOnly.match(/(\d+)-foot\s+radius/i);
  const coneMatch = descOnly.match(/(\d+)-foot\s+cone/i);
  const cubeMatch = descOnly.match(/(\d+)-foot\s+(?:cube|square)/i);
  const lineMatch =
    descOnly.match(/line\s+(\d+)\s+feet\s+long/i) || descOnly.match(/(\d+)-foot(?:-long)?\s+line/i);

  if (coneMatch) {
    aoe = { shape: 'cone', sizeFt: parseInt(coneMatch[1], 10) };
  } else if (sphereMatch) {
    aoe = { shape: 'sphere', sizeFt: parseInt(sphereMatch[1], 10) };
  } else if (cubeMatch) {
    aoe = { shape: 'cube', sizeFt: parseInt(cubeMatch[1], 10) };
  } else if (lineMatch) {
    aoe = { shape: 'line', sizeFt: parseInt(lineMatch[1], 10) };
  }

  void fullText;

  return {
    id: `srd-spell-${raw.index}`,
    slug: raw.index,
    name: raw.name,
    level: raw.level,
    school: raw.school,
    classes: raw.classes || [],
    ritual: Boolean(raw.ritual),
    concentration: Boolean(raw.concentration),
    castingTime: raw.casting_time,
    range: raw.range,
    components: raw.components || [],
    material: raw.material ?? null,
    duration: raw.duration,
    description: raw.desc || [],
    higherLevel: raw.higher_level || [],
    ...(damageFormula ? { damageFormula } : {}),
    ...(damageType ? { damageType } : {}),
    ...(healingFormula ? { healingFormula } : {}),
    ...(saveAbility ? { saveAbility } : {}),
    ...(halfOnSave ? { halfOnSave: true } : {}),
    ...(isSpellAttack ? { isSpellAttack: true } : {}),
    ...(scalingSummary ? { scalingSummary } : {}),
    ...(aoe ? { aoe } : {}),
  };
}

export const SRD_SPELLS: readonly SrdSpellEntry[] = Object.freeze(
  (spellsRaw as Array<any>).map(parseSpellMechanics),
);

export const SRD_CONDITIONS: readonly SrdConditionEntry[] = Object.freeze(
  (conditionsRaw as Array<{ index: string; name: string; desc: string[] }>).map((c) => ({
    id: `srd-condition-${c.index}`,
    slug: c.index,
    name: c.name,
    bullets: c.desc || [],
  })),
);

interface IndexedEntry {
  entry: SrdCompendiumItem;
  nameLower: string;
  tokens: string[];
  haystack: string;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+/]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function buildStaticIndex(): IndexedEntry[] {
  const list: IndexedEntry[] = [];

  for (const m of SRD_CORE_MONSTERS) {
    const subtitle = `CR ${m.cr} · ${m.size} ${m.type} · AC ${m.ac} · HP ${m.hp}`;
    const haystack = [
      m.name,
      m.type,
      m.size,
      `cr ${m.cr}`,
      ...m.traits.map((t) => t.name),
      ...m.actions.map((a) => a.name),
    ]
      .join(' ')
      .toLowerCase();
    list.push({
      entry: { category: 'monster', id: m.id, name: m.name, subtitle, monster: m },
      nameLower: m.name.toLowerCase(),
      tokens: tokenize(haystack),
      haystack,
    });
  }

  for (const s of SRD_SPELLS) {
    const lvlLabel = s.level === 0 ? 'Cantrip' : `Level ${s.level}`;
    const concTag = s.concentration ? ' · Concentration' : '';
    const dmgTag = s.damageFormula ? ` · ${s.damageFormula} ${s.damageType ?? ''}`.trimEnd() : '';
    const subtitle = `${lvlLabel} ${s.school}${concTag}${dmgTag}`;
    const haystack = [
      s.name,
      s.school,
      lvlLabel,
      ...s.classes,
      s.damageType ?? '',
      s.saveAbility ?? '',
      s.concentration ? 'concentration' : '',
      s.ritual ? 'ritual' : '',
    ]
      .join(' ')
      .toLowerCase();
    list.push({
      entry: { category: 'spell', id: s.id, name: s.name, subtitle, spell: s },
      nameLower: s.name.toLowerCase(),
      tokens: tokenize(haystack),
      haystack,
    });
  }

  for (const item of SRD_MAGIC_ITEMS) {
    const attuneTag = item.requiresAttunement ? ' · Attunement' : '';
    const subtitle = `${item.rarity} ${item.category}${attuneTag}`;
    const haystack = [item.name, item.category, item.rarity, item.description]
      .join(' ')
      .toLowerCase();
    list.push({
      entry: { category: 'item', id: item.id, name: item.name, subtitle, item },
      nameLower: item.name.toLowerCase(),
      tokens: tokenize(haystack),
      haystack,
    });
  }

  for (const cond of SRD_CONDITIONS) {
    const subtitle = cond.bullets[0]?.replace(/^-\s*/, '').slice(0, 72) || '5e SRD Condition';
    const haystack = [cond.name, ...cond.bullets].join(' ').toLowerCase();
    list.push({
      entry: { category: 'condition', id: cond.id, name: cond.name, subtitle, condition: cond },
      nameLower: cond.name.toLowerCase(),
      tokens: tokenize(haystack),
      haystack,
    });
  }

  return list;
}

const STATIC_INDEX: readonly IndexedEntry[] = Object.freeze(buildStaticIndex());

/**
 * Fast, offline-indexed search across SRD Monsters, Spells, Magic Items, and Conditions.
 */
export function searchSrdCompendium(
  query: string,
  filters: SrdSearchFilters = {},
): SrdCompendiumItem[] {
  const qLower = (query || '').trim().toLowerCase();
  const qTokens = tokenize(qLower);
  const categoryFilter = filters.category && filters.category !== 'all' ? filters.category : null;
  const limit = filters.limit ?? 60;

  let pool: ReadonlyArray<IndexedEntry> = STATIC_INDEX;
  if (filters.extraMonsters && filters.extraMonsters.length > 0) {
    const extras: IndexedEntry[] = filters.extraMonsters.map((m) => {
      const subtitle = `CR ${m.cr} · ${m.size} ${m.type} · AC ${m.ac} · HP ${m.hp}`;
      const haystack = `${m.name} ${m.type} ${m.size} cr ${m.cr}`.toLowerCase();
      return {
        entry: { category: 'monster', id: m.id, name: m.name, subtitle, monster: m },
        nameLower: m.name.toLowerCase(),
        tokens: tokenize(haystack),
        haystack,
      };
    });
    pool = [...extras, ...STATIC_INDEX];
  }

  const scored: Array<{ entry: SrdCompendiumItem; score: number }> = [];

  for (const item of pool) {
    const { entry } = item;
    if (categoryFilter && entry.category !== categoryFilter) continue;

    if (entry.category === 'monster') {
      if (typeof filters.minCr === 'number' && entry.monster.crNumeric < filters.minCr) continue;
      if (typeof filters.maxCr === 'number' && entry.monster.crNumeric > filters.maxCr) continue;
    } else if (entry.category === 'spell') {
      if (typeof filters.spellLevel === 'number' && entry.spell.level !== filters.spellLevel) {
        continue;
      }
      if (filters.school && entry.spell.school.toLowerCase() !== filters.school.toLowerCase()) {
        continue;
      }
      if (filters.concentrationOnly && !entry.spell.concentration) continue;
    } else if (entry.category === 'item') {
      if (filters.rarity && filters.rarity !== 'all' && entry.item.rarity !== filters.rarity) {
        continue;
      }
    }

    if (qTokens.length === 0) {
      scored.push({ entry, score: 1 });
      continue;
    }

    let score = 0;
    if (item.nameLower === qLower) {
      score += 200;
    } else if (item.nameLower.startsWith(qLower)) {
      score += 120;
    } else if (item.nameLower.includes(qLower)) {
      score += 80;
    }

    let matchedAllTokens = true;
    for (const qt of qTokens) {
      if (item.nameLower.includes(qt)) {
        score += 35;
      } else if (item.tokens.some((t) => t.startsWith(qt))) {
        score += 18;
      } else if (item.haystack.includes(qt)) {
        score += 10;
      } else {
        matchedAllTokens = false;
        break;
      }
    }

    if (matchedAllTokens && score > 0) {
      scored.push({ entry, score });
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.entry.name.localeCompare(b.entry.name);
  });

  return scored.slice(0, limit).map((s) => s.entry);
}

export function getSrdMonsterBySlugOrName(query: string): SrdMonster | undefined {
  const q = query.trim().toLowerCase();
  return SRD_CORE_MONSTERS.find(
    (m) => m.slug === q || m.id.toLowerCase() === q || m.name.toLowerCase() === q,
  );
}

export function getSrdSpellBySlugOrName(query: string): SrdSpellEntry | undefined {
  const q = query.trim().toLowerCase();
  return SRD_SPELLS.find(
    (s) => s.slug === q || s.id.toLowerCase() === q || s.name.toLowerCase() === q,
  );
}

export function getSrdMagicItemBySlugOrName(query: string): SrdMagicItem | undefined {
  const q = query.trim().toLowerCase();
  return SRD_MAGIC_ITEMS.find(
    (i) => i.slug === q || i.id.toLowerCase() === q || i.name.toLowerCase() === q,
  );
}

export function getSrdConditionBySlugOrName(query: string): SrdConditionEntry | undefined {
  const q = query.trim().toLowerCase();
  return SRD_CONDITIONS.find(
    (c) => c.slug === q || c.id.toLowerCase() === q || c.name.toLowerCase() === q,
  );
}

/**
 * Rolls an SRD hit dice formula (e.g., "2d6", "7d10+21", "2d6-2"), clamping to >= 1 HP.
 */
export function rollHitPointsFormula(
  hitDiceFormula: string,
  fallbackHp = 10,
  rng: () => number = Math.random,
): number {
  const cleaned = (hitDiceFormula || '').replace(/\s+/g, '');
  const match = cleaned.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (!match) return Math.max(1, Math.round(fallbackHp));
  const count = parseInt(match[1], 10);
  const sides = parseInt(match[2], 10);
  const mod = match[3] ? parseInt(match[3], 10) : 0;
  if (count <= 0 || sides <= 0) return Math.max(1, Math.round(fallbackHp));

  let total = mod;
  for (let i = 0; i < count; i++) {
    total += Math.floor(rng() * sides) + 1;
  }
  return Math.max(1, total);
}

export function monsterSizeToTokenGridSize(size: MonsterSize | string | undefined): number {
  switch ((size || '').toLowerCase()) {
    case 'large':
      return 1.5;
    case 'huge':
      return 2;
    case 'gargantuan':
      return 2.5;
    case 'tiny':
    case 'small':
      return 0.85;
    default:
      return 1;
  }
}

export interface InstantiateMonsterOptions {
  count?: number;
  rollHp?: boolean;
  /** Defaults to true (`Private` visibility) so GM-spawned monsters never leak to /player until revealed. */
  hidden?: boolean;
  numbered?: boolean;
  existingCombatants?: ReadonlyArray<Combatant>;
  existingTokens?: ReadonlyArray<MapTokenPin>;
  baseX?: number;
  baseY?: number;
  tokenColor?: string;
  rng?: () => number;
}

export interface InstantiatedMonsterSpawn {
  combatants: Combatant[];
  tokens: MapTokenPin[];
}

function nextAvailableNumberStart(
  baseName: string,
  existingCombatants: ReadonlyArray<Combatant>,
  existingTokens: ReadonlyArray<MapTokenPin>,
): number {
  const escaped = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped}(?:\\s+(\\d+))?$`, 'i');
  let maxSeen = 0;
  for (const c of existingCombatants) {
    const m = (c.name || '').trim().match(pattern);
    if (m) {
      maxSeen = Math.max(maxSeen, m[1] ? parseInt(m[1], 10) : 1);
    }
  }
  for (const t of existingTokens) {
    const m = (t.label || '').trim().match(pattern);
    if (m) {
      maxSeen = Math.max(maxSeen, m[1] ? parseInt(m[1], 10) : 1);
    }
  }
  return maxSeen + 1;
}

/**
 * Instantiates 1..N combatant tracker entries and matching TacticalMapStage tokens
 * from an SRD Monster. Defaults to `Private` (`hidden: true`, `visibility: 'private'`)
 * so GM encounter prep never leaks monster statblocks, AC, or exact HP to `/player`.
 */
export function instantiateMonsterCombatants(
  monster: SrdMonster,
  opts: InstantiateMonsterOptions = {},
): InstantiatedMonsterSpawn {
  const count = Math.max(1, Math.min(20, Math.trunc(opts.count ?? 1)));
  const rng = opts.rng ?? Math.random;
  const isHidden = opts.hidden ?? true;
  const existingCombatants = opts.existingCombatants ?? [];
  const existingTokens = opts.existingTokens ?? [];
  const startNum = nextAvailableNumberStart(monster.name, existingCombatants, existingTokens);
  const useNumbering = opts.numbered ?? (count > 1 || startNum > 1 || true);

  const baseX = typeof opts.baseX === 'number' ? Math.max(0.06, Math.min(0.94, opts.baseX)) : 0.5;
  const baseY = typeof opts.baseY === 'number' ? Math.max(0.08, Math.min(0.92, opts.baseY)) : 0.5;
  const dexMod = abilityMod(monster.abilities?.DEX ?? 10);
  const gridSize = monsterSizeToTokenGridSize(monster.size);

  const combatants: Combatant[] = [];
  const tokens: MapTokenPin[] = [];

  for (let i = 0; i < count; i++) {
    const seqNum = startNum + i;
    const displayName = useNumbering ? `${monster.name} ${seqNum}` : monster.name;
    const maxHp = opts.rollHp
      ? rollHitPointsFormula(monster.hitDice, monster.hp, rng)
      : Math.max(1, monster.hp);
    const initRoll = Math.floor(rng() * 20) + 1 + dexMod;
    const combatantId = makeCombatantId();

    const combatant: Combatant = {
      id: combatantId,
      name: displayName,
      initiative: initRoll,
      hp: { current: maxHp, max: maxHp, temp: 0 },
      ac: monster.ac,
      conditions: [],
      side: 'enemy',
      sourceMonsterId: monster.id,
      notes: `CR ${monster.cr} · ${monster.speed}`,
      hidden: isHidden,
      revealed: !isHidden,
      player_visible: !isHidden,
    };
    combatants.push(combatant);

    // Stagger multiple tokens cleanly on a 50px/1000 (=0.05) grid step
    const colOffset = (i % 4) * 0.055;
    const rowOffset = Math.floor(i / 4) * 0.08;
    const tx = Math.max(0.05, Math.min(0.95, baseX + colOffset));
    const ty = Math.max(0.06, Math.min(0.94, baseY + rowOffset));

    const token: MapTokenPin = {
      id: newId('tok'),
      label: displayName,
      x: tx,
      y: ty,
      size: gridSize,
      color: opts.tokenColor || '#ef4444',
      visibility: isHidden ? 'private' : 'party',
      gmNotes: `${monster.name} (CR ${monster.cr}, AC ${monster.ac}, HP ${maxHp}/${maxHp})`,
    };
    tokens.push(token);
  }

  return { combatants, tokens };
}

/**
 * Grants an SRD Spell to a PlayerCharacter:
 * - Adds to `spellsKnown` (deduplicated)
 * - Wires spell attack / damage / healing / save DC directly into `pc.attacks`
 * - Re-evaluates derived sheet stats via `evaluateCharacterSheet`
 */
export function grantSpellToPc(pc: PlayerCharacter, spell: SrdSpellEntry): PlayerCharacter {
  const evaluated = evaluateCharacterSheet(pc);
  const spellAtk =
    evaluated.spellAttackBonus ??
    evaluated.evaluation?.derivedStats.spellAttackBonus ??
    evaluated.proficiencyBonus + 2;
  const spellDc =
    evaluated.spellSaveDc ??
    evaluated.evaluation?.derivedStats.spellSaveDc ??
    8 + evaluated.proficiencyBonus + 2;

  const existingSpells = Array.isArray(pc.spellsKnown) ? [...pc.spellsKnown] : [];
  const hasSpell = existingSpells.some((s) => s.trim().toLowerCase() === spell.name.toLowerCase());
  const nextSpellsKnown = hasSpell ? existingSpells : [...existingSpells, spell.name];

  const existingAttacks = Array.isArray(pc.attacks) ? [...pc.attacks] : [];
  const hasAttackEntry = existingAttacks.some(
    (a) => a.name.trim().toLowerCase() === spell.name.toLowerCase(),
  );

  const shouldCreateAttackRow =
    Boolean(spell.damageFormula) ||
    Boolean(spell.healingFormula) ||
    Boolean(spell.isSpellAttack) ||
    Boolean(spell.saveAbility);

  if (shouldCreateAttackRow && !hasAttackEntry) {
    const tags: string[] = [];
    if (spell.level === 0) tags.push('Cantrip');
    else tags.push(`Lvl ${spell.level}`);
    if (spell.concentration) tags.push('Concentration');
    if (spell.saveAbility) {
      tags.push(`DC ${spellDc} ${spell.saveAbility} save${spell.halfOnSave ? ' (half)' : ''}`);
    }
    if (spell.aoe) {
      tags.push(`${spell.aoe.sizeFt}ft ${spell.aoe.shape}`);
    }

    const formula = spell.damageFormula || spell.healingFormula || '1d8';
    const dmgType = spell.damageType || (spell.healingFormula ? 'healing' : 'magical');
    const atkEntry: Attack = {
      id: `atk-spell-${spell.slug}-${Date.now().toString(36)}`,
      name: spell.name,
      attackBonus: spell.isSpellAttack ? spellAtk : 0,
      damageExpr: formula,
      damage: formula,
      damageType: dmgType,
      range: spell.range,
      notes: tags.join(' · '),
    };
    existingAttacks.push(atkEntry);
  }

  return evaluateCharacterSheet({
    ...pc,
    spellsKnown: nextSpellsKnown,
    attacks: existingAttacks,
    updatedAt: Date.now(),
  });
}

/**
 * Grants an SRD Magic Item to a PlayerCharacter:
 * - Appends or stacks into `pc.inventory`
 * - Wires weapon/wand/staff roll formulas & save DCs into `pc.attacks`
 * - Updates `attunedCount` (up to 3) and `ac` bonus if applicable
 */
export function grantMagicItemToPc(
  pc: PlayerCharacter,
  item: SrdMagicItem,
  opts: { equip?: boolean; attune?: boolean; qty?: number } = {},
): PlayerCharacter {
  const qty = Math.max(1, Math.trunc(opts.qty ?? 1));
  const equip = opts.equip ?? (item.category !== 'Potion' && item.category !== 'Scroll');
  const currentAttuned = pc.attunedCount ?? pc.inventory.filter((i) => i.attuned).length;
  const shouldAttune =
    Boolean(opts.attune ?? item.requiresAttunement) &&
    item.requiresAttunement &&
    currentAttuned < 3;

  const existingInv = Array.isArray(pc.inventory) ? [...pc.inventory] : [];
  const stackIdx =
    item.category === 'Potion' || item.category === 'Scroll'
      ? existingInv.findIndex((inv) => inv.name.trim().toLowerCase() === item.name.toLowerCase())
      : -1;

  if (stackIdx >= 0) {
    existingInv[stackIdx] = {
      ...existingInv[stackIdx],
      qty: (existingInv[stackIdx].qty || 1) + qty,
    };
  } else {
    const noteParts: string[] = [item.rarity, item.category];
    if (item.requiresAttunement) noteParts.push('Requires Attunement');
    if (item.saveAbility && item.saveDc) noteParts.push(`DC ${item.saveDc} ${item.saveAbility}`);
    if (item.charges) noteParts.push(`${item.charges} charges`);

    const invEntry: InventoryItem = {
      id: `inv-${item.slug}-${Date.now().toString(36)}`,
      name: item.name,
      qty,
      weight: item.weight ?? 1,
      description: item.description,
      equipped: equip,
      attuned: shouldAttune,
      notes: noteParts.join(' · '),
    };
    existingInv.push(invEntry);
  }

  const existingAttacks = Array.isArray(pc.attacks) ? [...pc.attacks] : [];
  const hasWeaponAttack = existingAttacks.some(
    (a) => a.name.trim().toLowerCase() === item.name.toLowerCase(),
  );

  if ((item.baseWeaponDamage || item.healingFormula) && !hasWeaponAttack) {
    const strMod = abilityMod(pc.abilities?.STR ?? 10);
    const dexMod = abilityMod(pc.abilities?.DEX ?? 10);
    const bestMartialMod = Math.max(strMod, dexMod);
    const isMartialWeapon = item.category === 'Weapon' || item.category === 'Staff';
    const itemBonus = item.attackBonus ?? 0;

    const totalAtkBonus = isMartialWeapon
      ? (pc.proficiencyBonus ?? 2) + bestMartialMod + itemBonus
      : itemBonus;

    let dmgFormula = item.baseWeaponDamage || item.healingFormula || '1d8';
    if (isMartialWeapon) {
      const flatBonus = bestMartialMod + itemBonus;
      if (flatBonus !== 0) {
        dmgFormula = `${dmgFormula}${flatBonus > 0 ? `+${flatBonus}` : flatBonus}`;
      }
    }
    if (item.extraDamageFormula) {
      dmgFormula = `${dmgFormula}+${item.extraDamageFormula}`;
    }

    const noteTags: string[] = [item.rarity];
    if (item.saveAbility && item.saveDc) {
      noteTags.push(`DC ${item.saveDc} ${item.saveAbility} save`);
    }
    if (item.charges) {
      noteTags.push(`${item.charges} charges`);
    }

    existingAttacks.push({
      id: `atk-item-${item.slug}-${Date.now().toString(36)}`,
      name: item.name,
      attackBonus: totalAtkBonus,
      damageExpr: dmgFormula,
      damage: dmgFormula,
      damageType: item.damageType || (item.healingFormula ? 'healing' : 'magical'),
      range: item.range || '5 ft.',
      notes: noteTags.join(' · '),
    });
  }

  const nextAttunedCount = Math.min(
    3,
    existingInv.filter((i) => i.attuned).length,
  );
  const acGain =
    equip && (!item.requiresAttunement || shouldAttune) && typeof item.acBonus === 'number'
      ? item.acBonus
      : 0;

  return evaluateCharacterSheet({
    ...pc,
    inventory: existingInv,
    attacks: existingAttacks,
    attunedCount: nextAttunedCount,
    ac: Math.max(1, (pc.ac || 10) + acGain),
    updatedAt: Date.now(),
  });
}

/**
 * Creates a structured PartyLootItem from an SRD Magic Item for `"Drop into Party Loot"`.
 */
export function createPartyLootFromItem(item: SrdMagicItem, qty = 1): PartyLootItem {
  const metaParts: string[] = [item.rarity, item.category];
  if (item.requiresAttunement) metaParts.push('Requires Attunement');
  if (item.saveDc && item.saveAbility) metaParts.push(`DC ${item.saveDc} ${item.saveAbility}`);
  return {
    id: `loot-${item.slug}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: item.name,
    qty: Math.max(1, Math.trunc(qty)),
    weight: item.weight ?? 1,
    notes: `${metaParts.join(' · ')} — ${item.description}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
