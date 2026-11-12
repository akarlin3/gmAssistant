// Universal VTT & Encounter Deterministic Importer.
//
// Accepts and normalizes JSON and Markdown/text exports from:
//   1. Foundry VTT (Actor, Item, Scene/Wall, and JournalEntry JSON exports)
//   2. Roll20 / 5etools / Open5e / Kobold+ (Monster statblocks, Encounter JSONs,
//      and standard Markdown / Homebrewery statblock paste)
//   3. D&D Beyond (Character & Encounter JSON schemas)
//
// SECURITY INVARIANT (Default-Private GM Imports):
// Every GM-imported NPC, Location, Monster, Trap, Encounter Combatant, Item, and Map
// defaults to `Private` (`player_visible: false`, `hidden: true`, `visibleToPlayers: false`,
// `entityVisibility = { mode: 'private' }`) so importing external campaign packs
// NEVER leaks statblocks, AC, exact HP, traps, or spoilers into `/player` projections.

import type * as Y from 'yjs';
import { applyJsonPatch, getRoot, yMapToJson } from '@/lib/crdt/yjs-adapter';
import { evaluateCharacterSheet } from '@/lib/characterEvaluator';
import { emptyPc, makePcId, normalizePc } from '@/lib/pc/factory';
import { abilityMod, makeCombatantId, type Combatant } from '@/lib/initiative';
import {
  BLANK_CANVAS_HEIGHT,
  BLANK_CANVAS_WIDTH,
  makeDefaultLayer,
  newId,
  type CampaignMap,
  type MapMarker,
  type MapTokenPin,
  type MapTrapPin,
} from '@/lib/maps/types';
import { initPlayerMode } from '@/lib/playerMode/migration';
import type { CampaignItem, PlayerConfig } from '@/lib/playerMode/types';
import { captureVaultSnapshot, type VaultSnapshot } from '@/lib/snapshotVault';
import {
  getSrdMonsterBySlugOrName,
  monsterSizeToTokenGridSize,
  type MonsterSize,
  type SrdMonster,
  type SrdMonsterAction,
  type SrdMonsterTrait,
} from '@/lib/srdCompendium';
import {
  ABILITY_NAMES,
  type AbilityName,
  type Attack,
  type InventoryItem,
  type PcClass,
  type PlayerCharacter,
  type SkillName,
} from '@/lib/pc/types';

export type VttSourceFormat =
  | 'foundry-actor'
  | 'foundry-item'
  | 'foundry-scene'
  | 'foundry-journal'
  | 'foundry-bundle'
  | 'ddb-character'
  | 'ddb-encounter'
  | 'open5e-monster'
  | '5etools-bestiary'
  | 'roll20-export'
  | 'kobold-encounter'
  | 'markdown-statblock'
  | 'unknown';

export interface ImportedNpcRecord {
  id: string;
  name: string;
  archetype: string;
  appearance: string;
  goal: string;
  flaw: string;
  notes: string;
  player_visible: false;
  isPublic: false;
  visibility: { scope: 'private' };
}

export interface ImportedLocationRecord {
  id: string;
  name: string;
  type: string;
  description: string;
  aspects: string[];
  secrets: string;
  player_visible: false;
  isPublic: false;
  visibility: { scope: 'private' };
}

export interface ImportedMonsterRecord extends SrdMonster {
  homebrew: true;
  player_visible: false;
  hidden: true;
}

export interface VttImportPreview {
  format: VttSourceFormat;
  formatLabel: string;
  warnings: string[];
  pcs: PlayerCharacter[];
  npcs: ImportedNpcRecord[];
  monsters: ImportedMonsterRecord[];
  combatants: Combatant[];
  locations: ImportedLocationRecord[];
  maps: CampaignMap[];
  items: CampaignItem[];
  secrets: string[];
}

export interface VttImportSelection {
  includePcs?: boolean;
  includeNpcs?: boolean;
  includeMonsters?: boolean;
  includeCombatants?: boolean;
  includeLocations?: boolean;
  includeMaps?: boolean;
  includeItems?: boolean;
  includeSecrets?: boolean;
}

export const FORMAT_LABELS: Record<VttSourceFormat, string> = {
  'foundry-actor': 'Foundry VTT Actor JSON',
  'foundry-item': 'Foundry VTT Item JSON',
  'foundry-scene': 'Foundry VTT Scene & Walls JSON',
  'foundry-journal': 'Foundry VTT Journal Export',
  'foundry-bundle': 'Foundry VTT Adventure / Compendium JSON',
  'ddb-character': 'D&D Beyond Character JSON',
  'ddb-encounter': 'D&D Beyond Encounter JSON',
  'open5e-monster': 'Open5e Monster Statblock JSON',
  '5etools-bestiary': '5etools Bestiary JSON',
  'roll20-export': 'Roll20 Character / Monster JSON',
  'kobold-encounter': 'Kobold+ / Encounter Builder JSON',
  'markdown-statblock': 'Markdown / Homebrewery 5e Statblock',
  unknown: 'Unrecognized Export',
};

function makeDeterministicId(prefix: string, name: string, index: number): string {
  const slug =
    (name || 'entry')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32) || 'entry';
  return `${prefix}-${slug}-${index + 1}`;
}

export function stripHtmlAndVttTags(raw: string | undefined | null): string {
  if (!raw || typeof raw !== 'string') return '';
  return raw
    // Strip 5etools inline tags like {@atk mw}, {@hit 5}, {@damage 2d6 + 3}, {@dc 15}, {@condition prone}
    .replace(/\{@atk\s+mw\}/gi, 'Melee Weapon Attack:')
    .replace(/\{@atk\s+rw\}/gi, 'Ranged Weapon Attack:')
    .replace(/\{@atk\s+ms\}/gi, 'Melee Spell Attack:')
    .replace(/\{@atk\s+rs\}/gi, 'Ranged Spell Attack:')
    .replace(/\{@hit\s+([+-]?\d+)\}/gi, (_, n: string) => `${Number(n) >= 0 ? `+${Number(n)}` : n} to hit`)
    .replace(/\{@h\}/gi, 'Hit: ')
    .replace(/\{@dc\s+(\d+)\}/gi, 'DC $1')
    .replace(/\{@(?:damage|dice|scaledamage|autodice)\s+([^|}]+)(?:\|[^}]*)?\}/gi, '$1')
    .replace(/\{@[a-z0-9]+\s+([^|}]+)(?:\|[^}]*)?\}/gi, '$1')
    // Strip Foundry @UUID[...] / @Compendium[...] links
    .replace(/@(?:UUID|Compendium|Actor|Item|JournalEntry|Scene)\[[^\]]+\]\{([^}]+)\}/gi, '$1')
    .replace(/@(?:UUID|Compendium|Actor|Item|JournalEntry|Scene)\[([^\]]+)\]/gi, '$1')
    // Convert block HTML tags to newlines and strip remaining HTML tags
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(?:p|div|li|h[1-6]|tr)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseCrNumeric(crRaw: unknown): { cr: string; crNumeric: number; xp: number } {
  const CR_XP: Record<string, number> = {
    '0': 10,
    '1/8': 25,
    '1/4': 50,
    '1/2': 100,
    '1': 200,
    '2': 450,
    '3': 700,
    '4': 1100,
    '5': 1800,
    '6': 2300,
    '7': 2900,
    '8': 3900,
    '9': 5000,
    '10': 5900,
    '11': 7200,
    '12': 8400,
    '13': 10000,
    '14': 11500,
    '15': 13000,
    '16': 15000,
    '17': 18000,
    '18': 20000,
    '19': 22000,
    '20': 25000,
    '21': 33000,
  };
  if (typeof crRaw === 'number') {
    if (Math.abs(crRaw - 0.125) < 0.01) return { cr: '1/8', crNumeric: 0.125, xp: 25 };
    if (Math.abs(crRaw - 0.25) < 0.01) return { cr: '1/4', crNumeric: 0.25, xp: 50 };
    if (Math.abs(crRaw - 0.5) < 0.01) return { cr: '1/2', crNumeric: 0.5, xp: 100 };
    const s = String(Math.max(0, Math.round(crRaw)));
    return { cr: s, crNumeric: Number(s), xp: CR_XP[s] ?? 200 };
  }
  if (typeof crRaw === 'string') {
    const trimmed = crRaw.trim();
    if (trimmed === '1/8' || trimmed === '0.125') return { cr: '1/8', crNumeric: 0.125, xp: 25 };
    if (trimmed === '1/4' || trimmed === '0.25') return { cr: '1/4', crNumeric: 0.25, xp: 50 };
    if (trimmed === '1/2' || trimmed === '0.5') return { cr: '1/2', crNumeric: 0.5, xp: 100 };
    const n = parseFloat(trimmed);
    if (!Number.isNaN(n)) {
      const key = String(Math.round(n));
      return { cr: key, crNumeric: n, xp: CR_XP[key] ?? 200 };
    }
  }
  if (crRaw && typeof crRaw === 'object' && 'cr' in (crRaw as any)) {
    return parseCrNumeric((crRaw as any).cr);
  }
  return { cr: '1', crNumeric: 1, xp: 200 };
}

function normalizeMonsterSize(raw: unknown): MonsterSize {
  const s = String(raw || 'Medium').trim().toLowerCase();
  if (s === 't' || s.startsWith('tiny')) return 'Tiny';
  if (s === 's' || s.startsWith('small')) return 'Small';
  if (s === 'l' || s.startsWith('large')) return 'Large';
  if (s === 'h' || s.startsWith('huge')) return 'Huge';
  if (s === 'g' || s.startsWith('gargantuan')) return 'Gargantuan';
  return 'Medium';
}

function parseActionMechanicsFromText(name: string, rawDesc: string): SrdMonsterAction {
  const desc = stripHtmlAndVttTags(rawDesc);
  const hitMatch = desc.match(/([+-]\d+)\s+to\s+hit/i);
  const reachMatch = desc.match(/(?:reach|range)\s+([^.,]+?ft\.)/i);
  const dmgMatch = desc.match(
    /\((\d+d\d+(?:\s*[+-]\s*\d+)?)\)\s*([a-z]+)?\s*damage/i,
  ) || desc.match(/(\d+d\d+(?:\s*[+-]\s*\d+)?)\s+([a-z]+)\s+damage/i);
  const dcMatch = desc.match(
    /DC\s+(\d+)\s+(Strength|Dexterity|Constitution|Intelligence|Wisdom|Charisma|STR|DEX|CON|INT|WIS|CHA)/i,
  );

  const abilityMap: Record<string, AbilityName> = {
    strength: 'STR',
    str: 'STR',
    dexterity: 'DEX',
    dex: 'DEX',
    constitution: 'CON',
    con: 'CON',
    intelligence: 'INT',
    int: 'INT',
    wisdom: 'WIS',
    wis: 'WIS',
    charisma: 'CHA',
    cha: 'CHA',
  };

  const out: SrdMonsterAction = { name: name || 'Action', desc };
  if (hitMatch) out.attackBonus = parseInt(hitMatch[1], 10);
  if (reachMatch) out.reachOrRange = reachMatch[1].trim();
  if (dmgMatch) {
    out.damageFormula = dmgMatch[1].replace(/\s+/g, '');
    if (dmgMatch[2]) out.damageType = dmgMatch[2].toLowerCase();
  }
  if (dcMatch) {
    out.saveDc = parseInt(dcMatch[1], 10);
    out.saveAbility = abilityMap[dcMatch[2].toLowerCase()] || 'DEX';
    out.halfOnSave = /half as much/i.test(desc);
  }
  return out;
}

/**
 * Auto-detects the VTT or statblock format from a raw JSON or Markdown string.
 */
export function detectVttExportFormat(input: string): VttSourceFormat {
  const trimmed = (input || '').trim();
  if (!trimmed) return 'unknown';

  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    if (
      /armor\s+class/i.test(trimmed) ||
      /hit\s+points/i.test(trimmed) ||
      /\bchallenge\b/i.test(trimmed) ||
      /\bSTR\b[\s|]+\bDEX\b/i.test(trimmed)
    ) {
      return 'markdown-statblock';
    }
    return 'unknown';
  }

  try {
    const parsed = JSON.parse(trimmed);
    const obj = Array.isArray(parsed) ? parsed[0] : parsed;
    if (!obj || typeof obj !== 'object') return 'unknown';

    // D&D Beyond Character JSON (wrapped in { data: { stats, classes, ... } } or direct)
    const ddbCandidate = obj.data && typeof obj.data === 'object' && Array.isArray(obj.data.stats)
      ? obj.data
      : obj;
    if (
      Array.isArray(ddbCandidate.stats) &&
      Array.isArray(ddbCandidate.classes) &&
      ('baseHitPoints' in ddbCandidate || 'race' in ddbCandidate)
    ) {
      return 'ddb-character';
    }

    // D&D Beyond Encounter JSON
    if (
      (Array.isArray(obj.monsters) || (obj.encounter && Array.isArray(obj.encounter.monsters))) &&
      ('difficulty' in obj || 'campaign' in obj || 'players' in obj || obj.source === 'ddb-encounter')
    ) {
      return 'ddb-encounter';
    }

    // Foundry Bundle (actors / scenes / journal / items arrays)
    if (
      Array.isArray(obj.actors) ||
      Array.isArray(obj.scenes) ||
      Array.isArray(obj.journal) ||
      Array.isArray(obj.journals)
    ) {
      return 'foundry-bundle';
    }

    // Foundry Scene JSON
    if (
      ('walls' in obj || 'tokens' in obj || 'drawings' in obj) &&
      ('grid' in obj || 'width' in obj || 'background' in obj || ' navigation' in obj)
    ) {
      return 'foundry-scene';
    }

    // Foundry Journal JSON
    if (Array.isArray(obj.pages) || ('folder' in obj && typeof obj.content === 'string' && !('system' in obj))) {
      return 'foundry-journal';
    }

    // Foundry Actor or Item JSON
    if ('system' in obj || ('data' in obj && typeof obj.type === 'string' && ('items' in obj || 'effects' in obj))) {
      const fType = String(obj.type || '').toLowerCase();
      if (fType === 'npc' || fType === 'character' || Array.isArray(obj.items)) {
        return 'foundry-actor';
      }
      return 'foundry-item';
    }

    // 5etools Bestiary JSON
    if (
      Array.isArray(obj.monster) ||
      (('ac' in obj || 'hp' in obj) && ('str' in obj && 'dex' in obj && ('trait' in obj || 'action' in obj)))
    ) {
      return '5etools-bestiary';
    }

    // Open5e Monster JSON
    if (
      'armor_class' in obj ||
      'hit_points' in obj ||
      (Array.isArray(obj.results) && obj.results[0] && 'armor_class' in obj.results[0])
    ) {
      return 'open5e-monster';
    }

    // Roll20 JSON
    if (Array.isArray(obj.attribs) || (obj.character && Array.isArray(obj.character.attribs)) || 'schema_version' in obj) {
      return 'roll20-export';
    }

    // Kobold+ / Encounter JSON
    if (Array.isArray(obj.creatures) || Array.isArray(obj.monsters) || Array.isArray(obj.combatants)) {
      return 'kobold-encounter';
    }
  } catch {
    // Non-JSON that still looks like statblock
    if (/armor\s+class|hit\s+points/i.test(trimmed)) {
      return 'markdown-statblock';
    }
  }

  return 'unknown';
}

function emptyPreview(format: VttSourceFormat): VttImportPreview {
  return {
    format,
    formatLabel: FORMAT_LABELS[format],
    warnings: [],
    pcs: [],
    npcs: [],
    monsters: [],
    combatants: [],
    locations: [],
    maps: [],
    items: [],
    secrets: [],
  };
}

function monsterToPrivateCombatant(monster: SrdMonster, index: number, count = 1): Combatant[] {
  const list: Combatant[] = [];
  const dexMod = abilityMod(monster.abilities?.DEX ?? 10);
  for (let c = 0; c < count; c++) {
    const label = count > 1 ? `${monster.name} ${c + 1}` : `${monster.name} 1`;
    list.push({
      id: makeDeterministicId('cmb', `${monster.name}-${index}`, c),
      name: label,
      initiative: 10 + dexMod,
      hp: { current: Math.max(1, monster.hp), max: Math.max(1, monster.hp), temp: 0 },
      ac: monster.ac,
      conditions: [],
      side: 'enemy',
      sourceMonsterId: monster.id,
      notes: `CR ${monster.cr} · ${monster.speed}`,
      hidden: true,
      revealed: false,
      player_visible: false,
    });
  }
  return list;
}

// ---- 1. Foundry VTT Parsers ------------------------------------------------

function parseFoundryActor(actor: Record<string, any>, idx: number, out: VttImportPreview): void {
  const sys = (actor.system ?? actor.data ?? {}) as Record<string, any>;
  const actorType = String(actor.type || 'npc').toLowerCase();
  const name = String(actor.name || `Imported Actor ${idx + 1}`).trim();

  const readAbil = (k: string): number => {
    const entry = sys.abilities?.[k] ?? sys.abilities?.[k.toUpperCase()];
    if (typeof entry === 'number') return entry;
    if (entry && typeof entry.value === 'number') return entry.value;
    return 10;
  };

  const abilities: Record<AbilityName, number> = {
    STR: readAbil('str'),
    DEX: readAbil('dex'),
    CON: readAbil('con'),
    INT: readAbil('int'),
    WIS: readAbil('wis'),
    CHA: readAbil('cha'),
  };

  const acRaw = sys.attributes?.ac;
  const ac =
    typeof acRaw === 'number'
      ? acRaw
      : typeof acRaw?.value === 'number'
        ? acRaw.value
        : typeof acRaw?.flat === 'number'
          ? acRaw.flat
          : 12;

  const hpRaw = sys.attributes?.hp;
  const hpMax =
    typeof hpRaw?.max === 'number' && hpRaw.max > 0
      ? hpRaw.max
      : typeof hpRaw === 'number' && hpRaw > 0
        ? hpRaw
        : 10;
  const hpCur =
    typeof hpRaw?.value === 'number' ? Math.max(0, Math.min(hpMax, hpRaw.value)) : hpMax;
  const hpTemp = typeof hpRaw?.temp === 'number' && hpRaw.temp > 0 ? hpRaw.temp : 0;
  const hitDice = String(hpRaw?.formula || '2d8');

  const walkSpeed =
    typeof sys.attributes?.movement?.walk === 'number'
      ? sys.attributes.movement.walk
      : typeof sys.attributes?.speed?.value === 'number'
        ? sys.attributes.speed.value
        : 30;

  const itemsArr: Array<Record<string, any>> = Array.isArray(actor.items) ? actor.items : [];

  if (actorType === 'character') {
    const base = { ...emptyPc(), name };
    const classes: PcClass[] = [];
    const inventory: InventoryItem[] = [];
    const attacks: Attack[] = [];
    const spellsKnown: string[] = [];

    for (let i = 0; i < itemsArr.length; i++) {
      const it = itemsArr[i];
      const iSys = (it.system ?? it.data ?? {}) as Record<string, any>;
      const iType = String(it.type || '').toLowerCase();
      const iName = String(it.name || `Item ${i + 1}`);

      if (iType === 'class') {
        classes.push({
          name: iName,
          level: Math.max(1, Number(iSys.levels ?? 1)),
          ...(iSys.subclass ? { subclass: String(iSys.subclass) } : {}),
        });
      } else if (iType === 'spell') {
        spellsKnown.push(iName);
      } else if (iType === 'weapon') {
        const dmgParts = iSys.damage?.parts;
        const firstFormula =
          Array.isArray(dmgParts) && Array.isArray(dmgParts[0]) ? String(dmgParts[0][0]) : '1d8';
        const firstType =
          Array.isArray(dmgParts) && Array.isArray(dmgParts[0]) && dmgParts[0][1]
            ? String(dmgParts[0][1])
            : 'slashing';
        const bonus = Number(iSys.attackBonus || 0) + abilityMod(abilities.STR) + 2;
        attacks.push({
          id: makeDeterministicId('atk', iName, i),
          name: iName,
          attackBonus: Number.isFinite(bonus) ? bonus : 4,
          damageExpr: firstFormula.replace(/@mod/gi, String(abilityMod(abilities.STR))),
          damageType: firstType,
          range: iSys.range?.value ? `${iSys.range.value} ft.` : '5 ft.',
        });
        inventory.push({
          id: makeDeterministicId('inv', iName, i),
          name: iName,
          qty: Math.max(1, Number(iSys.quantity ?? 1)),
          weight: Number(iSys.weight ?? 2),
          equipped: Boolean(iSys.equipped ?? true),
          attuned: Boolean(iSys.attunement === 2 || iSys.attuned === true),
        });
      } else if (['equipment', 'consumable', 'loot', 'tool', 'backpack'].includes(iType)) {
        inventory.push({
          id: makeDeterministicId('inv', iName, i),
          name: iName,
          qty: Math.max(1, Number(iSys.quantity ?? 1)),
          weight: Number(iSys.weight ?? 1),
          description: stripHtmlAndVttTags(iSys.description?.value),
          equipped: Boolean(iSys.equipped),
          attuned: Boolean(iSys.attunement === 2 || iSys.attuned === true),
        });
      }
    }

    const totalLevel =
      classes.length > 0
        ? classes.reduce((s, c) => s + c.level, 0)
        : Math.max(1, Number(sys.details?.level ?? 1));

    const pc = evaluateCharacterSheet(
      normalizePc({
        ...base,
        id: makePcId(),
        name,
        level: Math.min(20, Math.max(1, totalLevel)),
        classes: classes.length > 0 ? classes : [{ name: 'Fighter', level: totalLevel }],
        race: String(sys.details?.race?.name ?? sys.details?.race ?? 'Humanoid'),
        background: String(sys.details?.background?.name ?? sys.details?.background ?? ''),
        alignment: String(sys.details?.alignment ?? ''),
        abilities,
        ac,
        speed: walkSpeed,
        hp: { current: hpCur, max: hpMax, temp: hpTemp },
        inventory,
        attacks,
        spellsKnown,
        notes: stripHtmlAndVttTags(sys.details?.biography?.value),
        ownership: { ownerType: 'dm' },
      }),
    );
    out.pcs.push(pc);
    return;
  }

  // Foundry NPC -> Private Monster Statblock + Private NPC + Private Combatant
  const crInfo = parseCrNumeric(sys.details?.cr ?? 1);
  const traits: SrdMonsterTrait[] = [];
  const actions: SrdMonsterAction[] = [];

  for (const it of itemsArr) {
    const iSys = (it.system ?? it.data ?? {}) as Record<string, any>;
    const iType = String(it.type || '').toLowerCase();
    const iName = String(it.name || 'Ability');
    const desc = stripHtmlAndVttTags(iSys.description?.value || '');
    const activation = String(iSys.activation?.type || '').toLowerCase();

    if (iType === 'weapon' || activation === 'action' || activation === 'bonus' || activation === 'reaction') {
      const parsedAct = parseActionMechanicsFromText(iName, desc);
      const dmgParts = iSys.damage?.parts;
      if (!parsedAct.damageFormula && Array.isArray(dmgParts) && Array.isArray(dmgParts[0])) {
        parsedAct.damageFormula = String(dmgParts[0][0]).replace(/\s+/g, '');
        if (dmgParts[0][1]) parsedAct.damageType = String(dmgParts[0][1]);
      }
      if (typeof iSys.save?.dc === 'number' && iSys.save?.ability) {
        parsedAct.saveDc = iSys.save.dc;
        const ab = String(iSys.save.ability).toUpperCase() as AbilityName;
        if (ABILITY_NAMES.includes(ab)) parsedAct.saveAbility = ab;
      }
      actions.push(parsedAct);
    } else {
      traits.push({ name: iName, desc: desc || iName });
    }
  }

  const resistances: string[] = Array.isArray(sys.traits?.dr?.value)
    ? sys.traits.dr.value.map(String)
    : [];
  const immunities: string[] = Array.isArray(sys.traits?.di?.value)
    ? sys.traits.di.value.map(String)
    : [];
  const vulnerabilities: string[] = Array.isArray(sys.traits?.dv?.value)
    ? sys.traits.dv.value.map(String)
    : [];

  const monster: ImportedMonsterRecord = {
    id: makeDeterministicId('mon', name, idx),
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name,
    size: normalizeMonsterSize(sys.traits?.size),
    type: String(sys.details?.type?.value || sys.details?.type || 'creature'),
    alignment: String(sys.details?.alignment || 'unaligned'),
    ac,
    hp: hpMax,
    hitDice,
    speed: `${walkSpeed} ft.`,
    abilities,
    damageResistances: resistances,
    damageImmunities: immunities,
    damageVulnerabilities: vulnerabilities,
    senses: 'passive Perception 10',
    languages: Array.isArray(sys.traits?.languages?.value)
      ? sys.traits.languages.value.join(', ')
      : 'Common',
    cr: crInfo.cr,
    crNumeric: crInfo.crNumeric,
    xp: crInfo.xp,
    traits,
    actions,
    homebrew: true,
    player_visible: false,
    hidden: true,
  };

  out.monsters.push(monster);
  out.combatants.push(...monsterToPrivateCombatant(monster, idx, 1));

  const bio = stripHtmlAndVttTags(sys.details?.biography?.value);
  out.npcs.push({
    id: makeDeterministicId('npc', name, idx),
    name,
    archetype: `CR ${crInfo.cr} ${monster.type}`,
    appearance: bio.slice(0, 180),
    goal: '',
    flaw: '',
    notes: bio,
    player_visible: false,
    isPublic: false,
    visibility: { scope: 'private' },
  });
}

function parseFoundryItem(item: Record<string, any>, idx: number, out: VttImportPreview): void {
  const sys = (item.system ?? item.data ?? {}) as Record<string, any>;
  const name = String(item.name || `Imported Item ${idx + 1}`).trim();
  const desc = stripHtmlAndVttTags(sys.description?.value || '');
  // Strictly unassigned (`assignedPlayerId` omitted) so it remains GM-private until granted
  out.items.push({
    id: makeDeterministicId('item', name, idx),
    name,
    description: desc || `${item.type || 'Item'}`,
    playerVisibility: 'name-only',
  });
}

function parseFoundryScene(scene: Record<string, any>, idx: number, out: VttImportPreview): void {
  const name = String(scene.name || `Imported Scene ${idx + 1}`).trim();
  const width = typeof scene.width === 'number' && scene.width > 0 ? scene.width : BLANK_CANVAS_WIDTH;
  const height = typeof scene.height === 'number' && scene.height > 0 ? scene.height : BLANK_CANVAS_HEIGHT;
  const imgUrl =
    typeof scene.background?.src === 'string'
      ? scene.background.src
      : typeof scene.img === 'string'
        ? scene.img
        : undefined;

  // GM Private Layer by default (`visibleToPlayers: false`)
  const gmLayer = makeDefaultLayer(0);
  gmLayer.name = 'GM Imported Layer';
  gmLayer.visibleToPlayers = false;

  const tokensRaw: Array<Record<string, any>> = Array.isArray(scene.tokens) ? scene.tokens : [];
  const tokens: MapTokenPin[] = [];
  const traps: MapTrapPin[] = [];

  for (let i = 0; i < tokensRaw.length; i++) {
    const t = tokensRaw[i];
    const tx = typeof t.x === 'number' ? Math.max(0, Math.min(1, t.x / width)) : 0.5;
    const ty = typeof t.y === 'number' ? Math.max(0, Math.min(1, t.y / height)) : 0.5;
    const tName = String(t.name || `Token ${i + 1}`);
    if (/trap|hazard/i.test(tName) || t.isTrap === true) {
      traps.push({
        id: makeDeterministicId('trap', tName, i),
        label: tName,
        x: tx,
        y: ty,
        dc: typeof t.dc === 'number' ? t.dc : 14,
        damage: typeof t.damage === 'string' ? t.damage : '2d6',
        notes: 'Imported from Foundry Scene',
      });
    } else {
      tokens.push({
        id: makeDeterministicId('tok', tName, i),
        label: tName,
        x: tx,
        y: ty,
        size: typeof t.width === 'number' && t.width > 0 ? Math.min(3, t.width) : 1,
        color: '#ef4444',
        visibility: 'private', // Strict default-private invariant
        gmNotes: t.hidden ? 'Hidden Foundry token' : 'Imported Foundry token',
      });
    }
  }

  const markers: MapMarker[] = [];
  const notesRaw: Array<Record<string, any>> = Array.isArray(scene.notes) ? scene.notes : [];
  for (let i = 0; i < notesRaw.length; i++) {
    const n = notesRaw[i];
    const nx = typeof n.x === 'number' ? Math.max(0, Math.min(1, n.x / width)) : 0.5;
    const ny = typeof n.y === 'number' ? Math.max(0, Math.min(1, n.y / height)) : 0.5;
    markers.push({
      id: makeDeterministicId('mkr', n.text || 'Pin', i),
      x: nx,
      y: ny,
      layerId: gmLayer.id,
      label: String(n.text || n.label || `Scene Pin ${i + 1}`),
      notes: stripHtmlAndVttTags(n.notes || ''),
    });
  }

  const wallsCount = Array.isArray(scene.walls) ? scene.walls.length : 0;
  const gridDistance =
    typeof scene.grid?.distance === 'number'
      ? `${scene.grid.distance} ${scene.grid.units || 'ft'}/sq`
      : '5 ft/sq';

  const map: CampaignMap = {
    id: makeDeterministicId('map', name, idx),
    name,
    type: 'dungeon',
    ...(imgUrl ? { imageUrl: imgUrl } : {}),
    width,
    height,
    layers: [gmLayer],
    markers,
    tokens,
    traps,
    fogEnabled: true,
    fogRevealedRegions: [],
    gmMapNotes: `Imported Foundry Scene (${gridDistance}, ${wallsCount} wall segments).`,
    createdAt: Date.now(),
  };

  out.maps.push(map);
}

function parseFoundryJournal(journal: Record<string, any>, idx: number, out: VttImportPreview): void {
  const title = String(journal.name || `Journal Entry ${idx + 1}`).trim();
  const pages: Array<Record<string, any>> = Array.isArray(journal.pages) ? journal.pages : [];

  if (pages.length > 0) {
    for (let i = 0; i < pages.length; i++) {
      const p = pages[i];
      const pTitle = String(p.name || `${title} (${i + 1})`).trim();
      const body = stripHtmlAndVttTags(p.text?.content ?? p.text?.markdown ?? p.content ?? '');
      out.locations.push({
        id: makeDeterministicId('loc', pTitle, idx * 100 + i),
        name: pTitle,
        type: 'Journal Lore',
        description: body,
        aspects: [title],
        secrets: body.slice(0, 240),
        player_visible: false,
        isPublic: false,
        visibility: { scope: 'private' },
      });
    }
  } else {
    const body = stripHtmlAndVttTags(journal.content || '');
    out.locations.push({
      id: makeDeterministicId('loc', title, idx),
      name: title,
      type: 'Journal Lore',
      description: body,
      aspects: [],
      secrets: body.slice(0, 240),
      player_visible: false,
      isPublic: false,
      visibility: { scope: 'private' },
    });
  }
}

// ---- 2. Open5e / 5etools / Roll20 / Kobold+ / Markdown Parsers -------------

function parseOpen5eMonster(raw: Record<string, any>, idx: number, out: VttImportPreview): void {
  const name = String(raw.name || `Monster ${idx + 1}`).trim();
  const crInfo = parseCrNumeric(raw.challenge_rating ?? raw.cr ?? 1);
  const abilities: Record<AbilityName, number> = {
    STR: Number(raw.strength ?? 10),
    DEX: Number(raw.dexterity ?? 10),
    CON: Number(raw.constitution ?? 10),
    INT: Number(raw.intelligence ?? 10),
    WIS: Number(raw.wisdom ?? 10),
    CHA: Number(raw.charisma ?? 10),
  };

  const traits: SrdMonsterTrait[] = Array.isArray(raw.special_abilities)
    ? raw.special_abilities.map((t: any) => ({
        name: String(t.name || 'Trait'),
        desc: stripHtmlAndVttTags(t.desc || ''),
      }))
    : [];

  const actions: SrdMonsterAction[] = Array.isArray(raw.actions)
    ? raw.actions.map((a: any) => {
        const parsed = parseActionMechanicsFromText(String(a.name || 'Action'), String(a.desc || ''));
        if (typeof a.attack_bonus === 'number') parsed.attackBonus = a.attack_bonus;
        if (typeof a.damage_dice === 'string') {
          const bonus = typeof a.damage_bonus === 'number' && a.damage_bonus !== 0
            ? (a.damage_bonus > 0 ? `+${a.damage_bonus}` : `${a.damage_bonus}`)
            : '';
          parsed.damageFormula = `${a.damage_dice.replace(/\s+/g, '')}${bonus}`;
        }
        return parsed;
      })
    : [];

  const speedStr =
    typeof raw.speed === 'string'
      ? raw.speed
      : raw.speed && typeof raw.speed === 'object'
        ? Object.entries(raw.speed)
            .map(([k, v]) => (k === 'walk' ? `${v} ft.` : `${k} ${v} ft.`))
            .join(', ')
        : '30 ft.';

  const splitList = (val: unknown): string[] =>
    typeof val === 'string' && val.trim()
      ? val
          .split(/[,;]/)
          .map((s) => s.trim())
          .filter(Boolean)
      : Array.isArray(val)
        ? val.map(String)
        : [];

  const monster: ImportedMonsterRecord = {
    id: makeDeterministicId('mon', name, idx),
    slug: String(raw.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-')),
    name,
    size: normalizeMonsterSize(raw.size),
    type: String(raw.type || 'creature'),
    alignment: String(raw.alignment || 'unaligned'),
    ac: Number(raw.armor_class ?? 12),
    acDesc: typeof raw.armor_desc === 'string' ? raw.armor_desc : undefined,
    hp: Math.max(1, Number(raw.hit_points ?? 10)),
    hitDice: String(raw.hit_dice || '2d8'),
    speed: speedStr,
    abilities,
    damageVulnerabilities: splitList(raw.damage_vulnerabilities),
    damageResistances: splitList(raw.damage_resistances),
    damageImmunities: splitList(raw.damage_immunities),
    senses: String(raw.senses || 'passive Perception 10'),
    languages: String(raw.languages || '—'),
    cr: crInfo.cr,
    crNumeric: crInfo.crNumeric,
    xp: crInfo.xp,
    traits,
    actions,
    homebrew: true,
    player_visible: false,
    hidden: true,
  };

  out.monsters.push(monster);
  out.combatants.push(...monsterToPrivateCombatant(monster, idx, 1));
}

function parse5eToolsMonster(raw: Record<string, any>, idx: number, out: VttImportPreview): void {
  const name = String(raw.name || `5etools Monster ${idx + 1}`).trim();
  const crInfo = parseCrNumeric(raw.cr ?? 1);
  const acEntry = Array.isArray(raw.ac) ? raw.ac[0] : raw.ac;
  const ac =
    typeof acEntry === 'number'
      ? acEntry
      : typeof acEntry?.ac === 'number'
        ? acEntry.ac
        : 12;
  const hp =
    typeof raw.hp?.average === 'number'
      ? raw.hp.average
      : typeof raw.hp === 'number'
        ? raw.hp
        : 10;
  const hitDice = String(raw.hp?.formula || '2d8');
  const speed =
    typeof raw.speed?.walk === 'number'
      ? `${raw.speed.walk} ft.`
      : typeof raw.speed === 'string'
        ? raw.speed
        : '30 ft.';

  const joinEntries = (entries: unknown): string => {
    if (typeof entries === 'string') return stripHtmlAndVttTags(entries);
    if (Array.isArray(entries)) {
      return entries
        .map((e) => (typeof e === 'string' ? stripHtmlAndVttTags(e) : joinEntries((e as any)?.entries)))
        .filter(Boolean)
        .join(' ');
    }
    return '';
  };

  const traits: SrdMonsterTrait[] = Array.isArray(raw.trait)
    ? raw.trait.map((t: any) => ({
        name: stripHtmlAndVttTags(String(t.name || 'Trait')),
        desc: joinEntries(t.entries),
      }))
    : [];

  const actions: SrdMonsterAction[] = Array.isArray(raw.action)
    ? raw.action.map((a: any) =>
        parseActionMechanicsFromText(
          stripHtmlAndVttTags(String(a.name || 'Action')),
          joinEntries(a.entries),
        ),
      )
    : [];

  const monster: ImportedMonsterRecord = {
    id: makeDeterministicId('mon', name, idx),
    slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name,
    size: normalizeMonsterSize(Array.isArray(raw.size) ? raw.size[0] : raw.size),
    type: typeof raw.type === 'string' ? raw.type : String(raw.type?.type || 'creature'),
    alignment: Array.isArray(raw.alignment) ? raw.alignment.join(' ') : 'unaligned',
    ac,
    hp: Math.max(1, hp),
    hitDice,
    speed,
    abilities: {
      STR: Number(raw.str ?? 10),
      DEX: Number(raw.dex ?? 10),
      CON: Number(raw.con ?? 10),
      INT: Number(raw.int ?? 10),
      WIS: Number(raw.wis ?? 10),
      CHA: Number(raw.cha ?? 10),
    },
    senses: Array.isArray(raw.senses) ? raw.senses.join(', ') : 'passive Perception 10',
    languages: Array.isArray(raw.languages) ? raw.languages.join(', ') : '—',
    cr: crInfo.cr,
    crNumeric: crInfo.crNumeric,
    xp: crInfo.xp,
    traits,
    actions,
    homebrew: true,
    player_visible: false,
    hidden: true,
  };

  out.monsters.push(monster);
  out.combatants.push(...monsterToPrivateCombatant(monster, idx, 1));
}

function parseRoll20Export(raw: Record<string, any>, idx: number, out: VttImportPreview): void {
  const char = (raw.character ?? raw) as Record<string, any>;
  const name = String(char.name || `Roll20 Actor ${idx + 1}`).trim();
  const attribs: Array<{ name: string; current?: any; max?: any }> = Array.isArray(char.attribs)
    ? char.attribs
    : [];

  const getAttr = (key: string): string => {
    const found = attribs.find((a) => String(a.name || '').toLowerCase() === key.toLowerCase());
    return found && found.current !== undefined ? String(found.current) : '';
  };

  const isNpc = getAttr('npc') === '1' || Boolean(getAttr('npc_ac')) || Boolean(getAttr('npc_challenge'));
  const abilities: Record<AbilityName, number> = {
    STR: Number(getAttr('strength') || getAttr('strength_base') || 10),
    DEX: Number(getAttr('dexterity') || getAttr('dexterity_base') || 10),
    CON: Number(getAttr('constitution') || getAttr('constitution_base') || 10),
    INT: Number(getAttr('intelligence') || getAttr('intelligence_base') || 10),
    WIS: Number(getAttr('wisdom') || getAttr('wisdom_base') || 10),
    CHA: Number(getAttr('charisma') || getAttr('charisma_base') || 10),
  };

  const hpEntry = attribs.find((a) => a.name === 'hp');
  const hpMax = Number(hpEntry?.max || hpEntry?.current || getAttr('npc_hpformula') || 12) || 12;
  const ac = Number(getAttr('npc_ac') || getAttr('ac') || 12) || 12;

  if (isNpc) {
    const crInfo = parseCrNumeric(getAttr('npc_challenge') || 1);
    const monster: ImportedMonsterRecord = {
      id: makeDeterministicId('mon', name, idx),
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name,
      size: 'Medium',
      type: getAttr('npc_type') || 'creature',
      alignment: 'unaligned',
      ac,
      hp: Math.max(1, hpMax),
      hitDice: getAttr('npc_hpformula') || '2d8',
      speed: getAttr('npc_speed') || '30 ft.',
      abilities,
      senses: getAttr('npc_senses') || 'passive Perception 10',
      languages: getAttr('npc_languages') || '—',
      cr: crInfo.cr,
      crNumeric: crInfo.crNumeric,
      xp: crInfo.xp,
      traits: [],
      actions: [],
      homebrew: true,
      player_visible: false,
      hidden: true,
    };
    out.monsters.push(monster);
    out.combatants.push(...monsterToPrivateCombatant(monster, idx, 1));
  } else {
    const lvl = Math.max(1, Number(getAttr('level') || 1));
    const clsName = getAttr('class') || 'Adventurer';
    const pc = evaluateCharacterSheet(
      normalizePc({
        ...emptyPc(),
        id: makePcId(),
        name,
        level: lvl,
        classes: [{ name: clsName, level: lvl }],
        race: getAttr('race') || 'Humanoid',
        background: getAttr('background') || '',
        abilities,
        ac,
        hp: { current: hpMax, max: hpMax, temp: 0 },
        ownership: { ownerType: 'dm' },
      }),
    );
    out.pcs.push(pc);
  }
}

function parseEncounterJson(raw: Record<string, any>, out: VttImportPreview): void {
  const encRoot = (raw.encounter ?? raw) as Record<string, any>;
  const list: Array<Record<string, any>> =
    (Array.isArray(encRoot.creatures) && encRoot.creatures) ||
    (Array.isArray(encRoot.monsters) && encRoot.monsters) ||
    (Array.isArray(encRoot.combatants) && encRoot.combatants) ||
    [];

  list.forEach((entry, idx) => {
    const name = String(entry.name || entry.slug || `Creature ${idx + 1}`).trim();
    const count = Math.max(1, Math.min(20, Number(entry.count ?? entry.quantity ?? entry.qty ?? 1)));
    const srdMatch = getSrdMonsterBySlugOrName(name);

    if (srdMatch) {
      out.combatants.push(...monsterToPrivateCombatant(srdMatch, idx, count));
      return;
    }

    const crInfo = parseCrNumeric(entry.cr ?? entry.challenge_rating ?? 1);
    const hp = Math.max(1, Number(entry.hp ?? entry.maximumHitPoints ?? entry.hit_points ?? 15));
    const ac = Number(entry.ac ?? entry.armor_class ?? 13);

    const customMonster: ImportedMonsterRecord = {
      id: makeDeterministicId('mon', name, idx),
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name,
      size: normalizeMonsterSize(entry.size),
      type: String(entry.type || 'creature'),
      alignment: 'unaligned',
      ac,
      hp,
      hitDice: String(entry.hitDice || entry.hit_dice || '2d8'),
      speed: '30 ft.',
      abilities: { STR: 12, DEX: 12, CON: 12, INT: 10, WIS: 10, CHA: 10 },
      senses: 'passive Perception 10',
      languages: '—',
      cr: crInfo.cr,
      crNumeric: crInfo.crNumeric,
      xp: crInfo.xp,
      traits: [],
      actions: [],
      homebrew: true,
      player_visible: false,
      hidden: true,
    };
    out.monsters.push(customMonster);
    out.combatants.push(...monsterToPrivateCombatant(customMonster, idx, count));
  });
}

/**
 * Parses 1 or more Markdown / Homebrewery / plain-text 5e Monster Statblocks.
 */
export function parseMarkdownStatblocks(markdown: string, out: VttImportPreview): void {
  const cleanedInput = (markdown || '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/^\s*>\s?/, ''))
    .join('\n');

  // Split multiple statblocks separated by `___` before a `## ` heading if multiple exist
  const rawBlocks = cleanedInput
    .split(/\n(?=##\s+[^\n]+\n\*?(?:Tiny|Small|Medium|Large|Huge|Gargantuan)\b)/i)
    .map((b) => b.trim())
    .filter(Boolean);

  rawBlocks.forEach((block, idx) => {
    const lines = block
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !/^_{3,}$|^-{3,}$/.test(l));
    if (lines.length === 0) return;

    // Heading / Name
    const firstHeading = lines.find((l) => /^#{1,4}\s+/.test(l));
    const rawName = firstHeading
      ? firstHeading.replace(/^#{1,4}\s+/, '').replace(/\*+/g, '').trim()
      : lines[0].replace(/\*+/g, '').trim();
    const name = rawName || `Statblock Monster ${idx + 1}`;

    // Size / Type / Alignment line
    const sizeTypeMatch = block.match(
      /\b(Tiny|Small|Medium|Large|Huge|Gargantuan)\s+([a-zA-Z ()-]+?)(?:,\s*([^\n*]+))?(?:\*|\n|$)/i,
    );
    const size = normalizeMonsterSize(sizeTypeMatch?.[1]);
    const mType = sizeTypeMatch?.[2]?.trim() || 'creature';
    const alignment = sizeTypeMatch?.[3]?.trim() || 'unaligned';

    // AC, HP, Speed, Challenge
    const acMatch = block.match(/\*?\*?Armor\s+Class\*?\*?[:\s]+(\d+)(?:\s*\(([^)]+)\))?/i);
    const hpMatch = block.match(/\*?\*?Hit\s+Points\*?\*?[:\s]+(\d+)(?:\s*\(([^)]+)\))?/i);
    const speedMatch = block.match(/\*?\*?Speed\*?\*?[:\s]+([^\n*]+)/i);
    const crMatch = block.match(/\*?\*?Challenge\*?\*?[:\s]+([0-9/]+)/i);

    const ac = acMatch ? parseInt(acMatch[1], 10) : 12;
    const hp = hpMatch ? Math.max(1, parseInt(hpMatch[1], 10)) : 12;
    const hitDice = hpMatch?.[2]?.replace(/\s+/g, '') || '2d8';
    const speed = speedMatch ? speedMatch[1].trim() : '30 ft.';
    const crInfo = parseCrNumeric(crMatch?.[1] ?? '1');

    // Ability Scores (Markdown table `|15 (+2)|14 (+2)|...` or inline `STR 15 (+2) DEX 14 (+2)...`)
    const abilities: Record<AbilityName, number> = {
      STR: 10,
      DEX: 10,
      CON: 10,
      INT: 10,
      WIS: 10,
      CHA: 10,
    };

    const tableRowMatch = block.match(
      /\|\s*(\d+)\s*\([+-]?\d+\)\s*\|\s*(\d+)\s*\([+-]?\d+\)\s*\|\s*(\d+)\s*\([+-]?\d+\)\s*\|\s*(\d+)\s*\([+-]?\d+\)\s*\|\s*(\d+)\s*\([+-]?\d+\)\s*\|\s*(\d+)\s*\([+-]?\d+\)\s*\|/,
    );
    if (tableRowMatch) {
      abilities.STR = parseInt(tableRowMatch[1], 10);
      abilities.DEX = parseInt(tableRowMatch[2], 10);
      abilities.CON = parseInt(tableRowMatch[3], 10);
      abilities.INT = parseInt(tableRowMatch[4], 10);
      abilities.WIS = parseInt(tableRowMatch[5], 10);
      abilities.CHA = parseInt(tableRowMatch[6], 10);
    } else {
      for (const ab of ABILITY_NAMES) {
        const inlineAb = block.match(new RegExp(`\\b${ab}\\b[:\\s|]*(\\d+)`, 'i'));
        if (inlineAb) abilities[ab] = parseInt(inlineAb[1], 10);
      }
    }

    const resistMatch = block.match(/\*?\*?Damage\s+Resistances\*?\*?[:\s]+([^\n]+)/i);
    const immuneMatch = block.match(/\*?\*?Damage\s+Immunities\*?\*?[:\s]+([^\n]+)/i);
    const sensesMatch = block.match(/\*?\*?Senses\*?\*?[:\s]+([^\n]+)/i);
    const langMatch = block.match(/\*?\*?Languages\*?\*?[:\s]+([^\n]+)/i);

    // Split Traits vs Actions section
    const actionsSplit = block.split(/###\s*Actions\b|\nActions\s*\n/i);
    const preActionsText = actionsSplit[0] || '';
    const actionsText = actionsSplit[1]?.split(/###\s*(?:Legendary|Reactions|Bonus)/i)[0] || '';

    const extractNamedBlocks = (section: string): Array<{ name: string; desc: string }> => {
      const results: Array<{ name: string; desc: string }> = [];
      const regex = /\*{2,3}([^*.]+?)\.\*{2,3}\s*([\s\S]*?)(?=\n\*{2,3}[^*.]+?\.\*{2,3}|$)/g;
      let m: RegExpExecArray | null;
      while ((m = regex.exec(section)) !== null) {
        const bName = m[1].trim();
        if (
          /^(Armor Class|Hit Points|Speed|Skills|Saving Throws|Senses|Languages|Challenge|Damage )/i.test(
            bName,
          )
        ) {
          continue;
        }
        results.push({ name: bName, desc: m[2].replace(/\s+/g, ' ').trim() });
      }
      return results;
    };

    const traits: SrdMonsterTrait[] = extractNamedBlocks(preActionsText);
    const actions: SrdMonsterAction[] = extractNamedBlocks(actionsText).map((a) =>
      parseActionMechanicsFromText(a.name, a.desc),
    );

    const monster: ImportedMonsterRecord = {
      id: makeDeterministicId('mon', name, idx),
      slug: name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name,
      size,
      type: mType,
      alignment,
      ac,
      ...(acMatch?.[2] ? { acDesc: acMatch[2].trim() } : {}),
      hp,
      hitDice,
      speed,
      abilities,
      ...(resistMatch
        ? {
            damageResistances: resistMatch[1]
              .split(/[,;]/)
              .map((s) => s.trim())
              .filter(Boolean),
          }
        : {}),
      ...(immuneMatch
        ? {
            damageImmunities: immuneMatch[1]
              .split(/[,;]/)
              .map((s) => s.trim())
              .filter(Boolean),
          }
        : {}),
      senses: sensesMatch ? sensesMatch[1].trim() : 'passive Perception 10',
      languages: langMatch ? langMatch[1].trim() : '—',
      cr: crInfo.cr,
      crNumeric: crInfo.crNumeric,
      xp: crInfo.xp,
      traits,
      actions,
      homebrew: true,
      player_visible: false,
      hidden: true,
    };

    out.monsters.push(monster);
    out.combatants.push(...monsterToPrivateCombatant(monster, idx, 1));
  });
}

// ---- 3. D&D Beyond Character Parser ----------------------------------------

function parseDdbCharacter(raw: Record<string, any>, out: VttImportPreview): void {
  const d = (raw.data && typeof raw.data === 'object' ? raw.data : raw) as Record<string, any>;
  const name = String(d.name || 'D&D Beyond Hero').trim();

  // DDB Stat IDs: 1=STR, 2=DEX, 3=CON, 4=INT, 5=WIS, 6=CHA
  const statIdToAbility: Record<number, AbilityName> = {
    1: 'STR',
    2: 'DEX',
    3: 'CON',
    4: 'INT',
    5: 'WIS',
    6: 'CHA',
  };

  const abilities: Record<AbilityName, number> = {
    STR: 10,
    DEX: 10,
    CON: 10,
    INT: 10,
    WIS: 10,
    CHA: 10,
  };

  if (Array.isArray(d.stats)) {
    for (const s of d.stats) {
      const ab = statIdToAbility[Number(s.id)];
      if (ab && typeof s.value === 'number') abilities[ab] = s.value;
    }
  }
  if (Array.isArray(d.bonusStats)) {
    for (const s of d.bonusStats) {
      const ab = statIdToAbility[Number(s.id)];
      if (ab && typeof s.value === 'number') abilities[ab] += s.value;
    }
  }
  if (Array.isArray(d.overrideStats)) {
    for (const s of d.overrideStats) {
      const ab = statIdToAbility[Number(s.id)];
      if (ab && typeof s.value === 'number') abilities[ab] = s.value;
    }
  }

  const classes: PcClass[] = Array.isArray(d.classes)
    ? d.classes.map((c: any) => ({
        name: String(c.definition?.name || c.name || 'Adventurer'),
        level: Math.max(1, Number(c.level ?? 1)),
        ...(c.subclassDefinition?.name ? { subclass: String(c.subclassDefinition.name) } : {}),
      }))
    : [{ name: 'Fighter', level: 1 }];

  const totalLevel = Math.min(
    20,
    Math.max(
      1,
      classes.reduce((sum, c) => sum + c.level, 0),
    ),
  );

  const conMod = abilityMod(abilities.CON);
  const baseHp = Number(d.baseHitPoints ?? 10) + Number(d.bonusHitPoints ?? 0);
  const maxHp = Math.max(
    1,
    typeof d.overrideHitPoints === 'number' ? d.overrideHitPoints : baseHp + conMod * totalLevel,
  );
  const removedHp = Math.max(0, Number(d.removedHitPoints ?? 0));
  const curHp = Math.max(0, maxHp - removedHp);
  const tempHp = Math.max(0, Number(d.temporaryHitPoints ?? 0));

  const inventory: InventoryItem[] = [];
  const attacks: Attack[] = [];
  let armorAc = 0;
  let shieldBonus = 0;

  if (Array.isArray(d.inventory)) {
    d.inventory.forEach((entry: any, i: number) => {
      const def = entry.definition || entry;
      const itemName = String(def.name || `Item ${i + 1}`);
      const equipped = Boolean(entry.equipped);
      const isAttuned = Boolean(entry.isAttuned);

      inventory.push({
        id: makeDeterministicId('inv', itemName, i),
        name: itemName,
        qty: Math.max(1, Number(entry.quantity ?? 1)),
        weight: Number(def.weight ?? 1),
        description: stripHtmlAndVttTags(def.description || def.snippet || ''),
        equipped,
        attuned: isAttuned,
      });

      if (equipped && typeof def.armorClass === 'number') {
        if (def.armorTypeId === 4 || /shield/i.test(itemName)) {
          shieldBonus = Math.max(shieldBonus, def.armorClass);
        } else {
          armorAc = Math.max(armorAc, def.armorClass);
        }
      }

      if (def.damage?.diceString) {
        const mod = abilityMod(abilities.STR);
        const prof = 2 + Math.floor((totalLevel - 1) / 4);
        attacks.push({
          id: makeDeterministicId('atk', itemName, i),
          name: itemName,
          attackBonus: prof + mod,
          damageExpr: `${def.damage.diceString}${mod >= 0 ? `+${mod}` : mod}`,
          damageType: String(def.damageType || 'slashing').toLowerCase(),
          range: def.range ? `${def.range} ft.` : '5 ft.',
        });
      }
    });
  }

  const spellsKnown: string[] = [];
  if (Array.isArray(d.classSpells)) {
    for (const cs of d.classSpells) {
      if (Array.isArray(cs.spells)) {
        for (const sp of cs.spells) {
          const sName = sp.definition?.name || sp.name;
          if (sName && !spellsKnown.includes(sName)) spellsKnown.push(String(sName));
        }
      }
    }
  }

  const dexMod = abilityMod(abilities.DEX);
  const computedAc =
    typeof d.armorClass === 'number'
      ? d.armorClass
      : armorAc > 0
        ? (armorAc >= 16 ? armorAc : armorAc + Math.min(2, dexMod)) + shieldBonus
        : 10 + dexMod + shieldBonus;

  const skills: SkillName[] = [];
  const saves: AbilityName[] = [];
  const allMods: any[] = d.modifiers && typeof d.modifiers === 'object'
    ? Object.values(d.modifiers).flat()
    : [];
  for (const mod of allMods) {
    if (!mod || mod.type !== 'proficiency') continue;
    const friendly = String(mod.friendlySubtypeName || '');
    if (friendly.endsWith('Saving Throws')) {
      const word = friendly.split(' ')[0].toLowerCase();
      const map: Record<string, AbilityName> = {
        strength: 'STR',
        dexterity: 'DEX',
        constitution: 'CON',
        intelligence: 'INT',
        wisdom: 'WIS',
        charisma: 'CHA',
      };
      if (map[word] && !saves.includes(map[word])) saves.push(map[word]);
    }
  }

  const pc = evaluateCharacterSheet(
    normalizePc({
      ...emptyPc(),
      id: makePcId(),
      name,
      level: totalLevel,
      classes,
      race: String(d.race?.fullName || d.race?.baseName || d.race || 'Humanoid'),
      background: String(d.background?.definition?.name || d.background || ''),
      abilities,
      proficiencies: {
        savingThrows: saves,
        skills,
        languages: ['Common'],
        tools: [],
        armor: [],
        weapons: [],
      },
      ac: computedAc,
      speed: Number(d.race?.weightSpeeds?.normal?.walk ?? 30),
      hp: { current: curHp, max: maxHp, temp: tempHp },
      inventory,
      attacks,
      spellsKnown,
      currency: d.currencies
        ? {
            cp: Number(d.currencies.cp ?? 0),
            sp: Number(d.currencies.sp ?? 0),
            ep: Number(d.currencies.ep ?? 0),
            gp: Number(d.currencies.gp ?? 0),
            pp: Number(d.currencies.pp ?? 0),
          }
        : undefined,
      ownership: { ownerType: 'dm' },
    }),
  );

  out.pcs.push(pc);
}

/**
 * Deterministically parses any supported VTT JSON or Markdown export into a
 * normalized `VttImportPreview` without mutating campaign state.
 */
export function parseVttExport(rawInput: string): VttImportPreview {
  const format = detectVttExportFormat(rawInput);
  const preview = emptyPreview(format);

  if (format === 'unknown') {
    preview.warnings.push(
      'Could not auto-detect export schema. Paste Foundry VTT, D&D Beyond, Open5e, 5etools, Roll20, Kobold+ JSON, or a 5e Markdown statblock.',
    );
    return preview;
  }

  if (format === 'markdown-statblock') {
    parseMarkdownStatblocks(rawInput, preview);
    return preview;
  }

  let parsed: any;
  try {
    parsed = JSON.parse(rawInput);
  } catch (err: any) {
    preview.warnings.push(`Invalid JSON syntax: ${err?.message || 'parse error'}`);
    return preview;
  }

  const asList = (v: any): any[] => (Array.isArray(v) ? v : [v]);

  switch (format) {
    case 'foundry-actor':
      asList(parsed).forEach((a, i) => parseFoundryActor(a, i, preview));
      break;
    case 'foundry-item':
      asList(parsed).forEach((it, i) => parseFoundryItem(it, i, preview));
      break;
    case 'foundry-scene':
      asList(parsed).forEach((sc, i) => parseFoundryScene(sc, i, preview));
      break;
    case 'foundry-journal':
      asList(parsed).forEach((jn, i) => parseFoundryJournal(jn, i, preview));
      break;
    case 'foundry-bundle': {
      if (Array.isArray(parsed.actors)) {
        parsed.actors.forEach((a: any, i: number) => parseFoundryActor(a, i, preview));
      }
      if (Array.isArray(parsed.items)) {
        parsed.items.forEach((it: any, i: number) => parseFoundryItem(it, i, preview));
      }
      if (Array.isArray(parsed.scenes)) {
        parsed.scenes.forEach((sc: any, i: number) => parseFoundryScene(sc, i, preview));
      }
      const journals = parsed.journal ?? parsed.journals;
      if (Array.isArray(journals)) {
        journals.forEach((jn: any, i: number) => parseFoundryJournal(jn, i, preview));
      }
      break;
    }
    case 'ddb-character':
      asList(parsed).forEach((ch) => parseDdbCharacter(ch, preview));
      break;
    case 'ddb-encounter':
    case 'kobold-encounter':
      parseEncounterJson(parsed, preview);
      break;
    case 'open5e-monster': {
      const list = Array.isArray(parsed.results) ? parsed.results : asList(parsed);
      list.forEach((m: any, i: number) => parseOpen5eMonster(m, i, preview));
      break;
    }
    case '5etools-bestiary': {
      const list = Array.isArray(parsed.monster) ? parsed.monster : asList(parsed);
      list.forEach((m: any, i: number) => parse5eToolsMonster(m, i, preview));
      break;
    }
    case 'roll20-export':
      asList(parsed).forEach((r, i) => parseRoll20Export(r, i, preview));
      break;
  }

  return preview;
}

export interface ApplyVttImportOptions {
  campaignId: string;
  campaignName: string;
  currentState: Record<string, any>;
  preview: VttImportPreview;
  selection?: VttImportSelection;
  captureSnapshot?: boolean;
  yDoc?: Y.Doc;
}

export interface ApplyVttImportResult {
  nextState: Record<string, any>;
  snapshot: VaultSnapshot | null;
  importedCounts: {
    pcs: number;
    npcs: number;
    monsters: number;
    combatants: number;
    locations: number;
    maps: number;
    items: number;
  };
}

/**
 * Merges a `VttImportPreview` into campaign state (and optionally a live Yjs `Y.Doc`),
 * capturing a pre-import safety snapshot to `snapshotVault` and strictly setting
 * `Private` visibility across all GM-imported entities, tokens, maps, and combatants.
 */
export function applyVttImportToCampaign(opts: ApplyVttImportOptions): ApplyVttImportResult {
  const {
    campaignId,
    campaignName,
    currentState,
    preview,
    selection = {},
    captureSnapshot = true,
    yDoc,
  } = opts;

  let snapshot: VaultSnapshot | null = null;
  if (captureSnapshot) {
    snapshot = captureVaultSnapshot({
      campaignId,
      campaignName,
      state: currentState,
      reason: 'json_import',
      label: `Pre-VTT Import (${preview.formatLabel})`,
    });
  }

  const { data: initialized } = initPlayerMode(
    JSON.parse(JSON.stringify(currentState || {})) as Record<string, any>,
  );
  const next: Record<string, any> = { ...initialized };
  const playerCfg: PlayerConfig = {
    ...next.player,
    entityVisibility: {
      ...(next.player?.entityVisibility || {}),
      pcs: { ...(next.player?.entityVisibility?.pcs || {}) },
      npcs: { ...(next.player?.entityVisibility?.npcs || {}) },
      locations: { ...(next.player?.entityVisibility?.locations || {}) },
    },
  };

  const counts = {
    pcs: 0,
    npcs: 0,
    monsters: 0,
    combatants: 0,
    locations: 0,
    maps: 0,
    items: 0,
  };

  if (selection.includePcs !== false && preview.pcs.length > 0) {
    const existingPcs = Array.isArray(next.pcs) ? [...next.pcs] : [];
    for (const pc of preview.pcs) {
      const privatePc: PlayerCharacter = {
        ...pc,
        ownership: { ownerType: 'dm' },
      };
      existingPcs.push(privatePc);
      playerCfg.entityVisibility.pcs![privatePc.id] = { mode: 'private' };
      counts.pcs++;
    }
    next.pcs = existingPcs;
  }

  if (selection.includeNpcs !== false && preview.npcs.length > 0) {
    const existingNpcs = Array.isArray(next.npcs) ? [...next.npcs] : [];
    for (const npc of preview.npcs) {
      const privateNpc: ImportedNpcRecord = {
        ...npc,
        player_visible: false,
        isPublic: false,
        visibility: { scope: 'private' },
      };
      existingNpcs.push(privateNpc);
      playerCfg.entityVisibility.npcs![privateNpc.id] = { mode: 'private' };
      counts.npcs++;
    }
    next.npcs = existingNpcs;
  }

  if (selection.includeLocations !== false && preview.locations.length > 0) {
    const existingLocs = Array.isArray(next.locations) ? [...next.locations] : [];
    for (const loc of preview.locations) {
      const privateLoc: ImportedLocationRecord = {
        ...loc,
        player_visible: false,
        isPublic: false,
        visibility: { scope: 'private' },
      };
      existingLocs.push(privateLoc);
      playerCfg.entityVisibility.locations![privateLoc.id] = { mode: 'private' };
      counts.locations++;
    }
    next.locations = existingLocs;
  }

  if (selection.includeMonsters !== false && preview.monsters.length > 0) {
    const existingHb = Array.isArray(next.homebrewMonsters) ? [...next.homebrewMonsters] : [];
    for (const m of preview.monsters) {
      existingHb.push({
        slug: m.slug,
        name: m.name,
        size: m.size,
        type: m.type,
        alignment: m.alignment,
        armor_class: m.ac,
        armor_desc: m.acDesc,
        hit_points: m.hp,
        hit_dice: m.hitDice,
        speed: m.speed,
        strength: m.abilities.STR,
        dexterity: m.abilities.DEX,
        constitution: m.abilities.CON,
        intelligence: m.abilities.INT,
        wisdom: m.abilities.WIS,
        charisma: m.abilities.CHA,
        damage_vulnerabilities: (m.damageVulnerabilities || []).join(', '),
        damage_resistances: (m.damageResistances || []).join(', '),
        damage_immunities: (m.damageImmunities || []).join(', '),
        senses: m.senses,
        languages: m.languages,
        challenge_rating: m.cr,
        cr: m.crNumeric,
        special_abilities: m.traits,
        actions: m.actions,
        homebrew: true,
        player_visible: false,
        hidden: true,
      });
      counts.monsters++;
    }
    next.homebrewMonsters = existingHb;
  }

  if (selection.includeCombatants !== false && preview.combatants.length > 0) {
    const rawInit =
      next.__initiative && typeof next.__initiative === 'object'
        ? { ...next.__initiative }
        : { combatants: [], round: 1, activeIndex: 0, log: [] };
    const existingCombatants: Combatant[] = Array.isArray(rawInit.combatants)
      ? [...rawInit.combatants]
      : [];

    for (const c of preview.combatants) {
      existingCombatants.push({
        ...c,
        hidden: true,
        revealed: false,
        player_visible: false,
      });
      counts.combatants++;
    }
    rawInit.combatants = existingCombatants;
    next.__initiative = rawInit;

    // Also place matching private tokens onto the active or newly imported map if present
    if (Array.isArray(next.maps) && next.maps.length > 0) {
      const firstMap = { ...next.maps[0] };
      const mapTokens: MapTokenPin[] = Array.isArray(firstMap.tokens) ? [...firstMap.tokens] : [];
      preview.combatants.forEach((c, idx) => {
        const matchedMon = preview.monsters.find((m) => m.id === c.sourceMonsterId);
        mapTokens.push({
          id: newId('tok'),
          label: c.name,
          x: Math.min(0.92, 0.25 + (idx % 6) * 0.06),
          y: Math.min(0.9, 0.3 + Math.floor(idx / 6) * 0.08),
          size: monsterSizeToTokenGridSize(matchedMon?.size),
          color: '#ef4444',
          visibility: 'private',
          gmNotes: c.notes,
        });
      });
      firstMap.tokens = mapTokens;
      next.maps = [firstMap, ...next.maps.slice(1)];
    }
  }

  if (selection.includeMaps !== false && preview.maps.length > 0) {
    const existingMaps: CampaignMap[] = Array.isArray(next.maps) ? [...next.maps] : [];
    for (const m of preview.maps) {
      // Enforce Default-Private on imported map layers & tokens
      const privateMap: CampaignMap = {
        ...m,
        layers: m.layers.map((l) => ({ ...l, visibleToPlayers: false })),
        tokens: (m.tokens || []).map((t) => ({ ...t, visibility: 'private' as const })),
        fogEnabled: true,
        fogRevealedRegions: [],
      };
      existingMaps.push(privateMap);
      counts.maps++;
    }
    next.maps = existingMaps.slice(0, 20);
  }

  if (selection.includeItems !== false && preview.items.length > 0) {
    const existingItems = Array.isArray(next.items) ? [...next.items] : [];
    for (const it of preview.items) {
      const privateItem: CampaignItem = {
        id: it.id,
        name: it.name,
        description: it.description,
        playerVisibility: 'name-only',
        // assignedPlayerId intentionally omitted so item remains GM-private
      };
      existingItems.push(privateItem);
      counts.items++;
    }
    next.items = existingItems;
  }

  if (selection.includeSecrets !== false && preview.secrets.length > 0) {
    const existingSecrets = Array.isArray(next.secrets) ? [...next.secrets] : [];
    next.secrets = [...existingSecrets, ...preview.secrets];
  }

  next.player = playerCfg;

  if (yDoc) {
    applyJsonPatch(yDoc, next, 'vtt-import');
    return {
      nextState: yMapToJson(getRoot(yDoc)),
      snapshot,
      importedCounts: counts,
    };
  }

  return {
    nextState: next,
    snapshot,
    importedCounts: counts,
  };
}
