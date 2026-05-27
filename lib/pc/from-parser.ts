// Maps the character-sheet parser's freeform output (the legacy string-based
// `Character` from lib/character-schema) into a structured PlayerCharacter, so
// a parsed sheet becomes a first-class PC rather than a freeform note.
//
// The parser emits strings for everything, so this is best-effort coercion:
// numbers are parsed, class/level is split, and the freeform skill/save blobs
// are scanned for known SRD names to seed proficiencies.

import type { Character } from '../character-schema';
import { proficiencyBonusForLevel } from './derived';
import { emptyPc, makePcId } from './factory';
import { SKILL_ABILITIES } from './skills';
import {
  ABILITY_NAMES,
  type AbilityName,
  type Attack,
  type FeatureEntry,
  type InventoryItem,
  type PcClass,
  type PlayerCharacter,
  type SkillName,
} from './types';

function num(s: string | undefined, fb = 0): number {
  if (!s) return fb;
  const m = s.match(/-?\d+/);
  return m ? parseInt(m[0], 10) : fb;
}

// "Fighter 3 / Wizard 2 (Evocation)" -> [{name:'Fighter',level:3}, ...]
function parseClasses(classLevel: string): PcClass[] {
  if (!classLevel || !classLevel.trim()) return [];
  return classLevel
    .split(/[/,]/)
    .map((seg) => seg.trim())
    .filter(Boolean)
    .map((seg) => {
      const subMatch = seg.match(/\(([^)]+)\)/);
      const subclass = subMatch ? subMatch[1].trim() : undefined;
      const noParen = seg.replace(/\([^)]*\)/, '').trim();
      const lvlMatch = noParen.match(/(\d+)\s*$/);
      const level = lvlMatch ? parseInt(lvlMatch[1], 10) : 1;
      const name = noParen.replace(/\d+\s*$/, '').trim() || 'Unknown';
      return { name, level, ...(subclass ? { subclass } : {}) };
    });
}

function splitLines(s: string | undefined): string[] {
  if (!s) return [];
  return s
    .split(/[\n;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function splitList(s: string | undefined): string[] {
  if (!s) return [];
  return s
    .split(/[\n,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

// Scan a freeform blob (e.g. "Athletics +5, Stealth +7") for known skill names.
function scanSkills(blob: string | undefined): SkillName[] {
  if (!blob) return [];
  const lower = blob.toLowerCase();
  return (Object.keys(SKILL_ABILITIES) as SkillName[]).filter((sk) =>
    lower.includes(sk.toLowerCase()),
  );
}

function scanSaves(blob: string | undefined): AbilityName[] {
  if (!blob) return [];
  const upper = blob.toUpperCase();
  return ABILITY_NAMES.filter((a) => upper.includes(a));
}

function mapAttacks(attacks: Character['attacks']): Attack[] {
  if (!Array.isArray(attacks)) return [];
  return attacks
    .filter((a) => a && (a.name || a.damage))
    .map((a) => ({
      id: makePcId(),
      name: a.name || 'Attack',
      attackBonus: num(a.bonus),
      damageExpr: (a.damage || '').trim(),
      damageType: '',
      range: '',
      ...(a.notes ? { notes: a.notes } : {}),
    }));
}

function mapFeatures(features: string | undefined): FeatureEntry[] {
  return splitLines(features).map((line) => ({
    id: makePcId(),
    name: line,
    source: '',
    description: '',
  }));
}

function mapInventory(equipment: string | undefined): InventoryItem[] {
  return splitList(equipment).map((name) => ({
    id: makePcId(),
    name,
    qty: 1,
  }));
}

export function mapParsedToPc(parsed: Character): PlayerCharacter {
  const base = emptyPc();
  const classes = parseClasses(parsed.classLevel);
  const totalLevel =
    classes.reduce((s, c) => s + c.level, 0) || num(parsed.experience, 0) || 1;
  const level = Math.max(1, Math.min(20, totalLevel || 1));

  const abilities = {
    STR: num(parsed.abilities?.str, 10),
    DEX: num(parsed.abilities?.dex, 10),
    CON: num(parsed.abilities?.con, 10),
    INT: num(parsed.abilities?.int, 10),
    WIS: num(parsed.abilities?.wis, 10),
    CHA: num(parsed.abilities?.cha, 10),
  };

  const hpMax = num(parsed.hpMax) || num(parsed.hp) || 0;
  const profBonus = num(parsed.profBonus) || proficiencyBonusForLevel(level);
  const spellAbility = (parsed.spellcasting?.ability || '').toUpperCase().slice(0, 3);

  const spellsKnown = splitList(parsed.spells);

  const notesParts = [parsed.notes, parsed.appearance, parsed.backstory].filter(
    (x) => x && x.trim(),
  );

  return {
    ...base,
    id: makePcId(),
    name: parsed.name || 'Unnamed',
    level,
    classes: classes.length ? classes : [],
    race: parsed.race || '',
    background: parsed.background || '',
    alignment: parsed.alignment || '',
    abilities,
    proficiencies: {
      savingThrows: scanSaves(parsed.saves),
      skills: scanSkills(parsed.skills),
      languages: splitList(parsed.languages),
      tools: [],
      armor: [],
      weapons: [],
    },
    proficiencyBonus: profBonus,
    hp: { current: num(parsed.hp) || hpMax, max: hpMax, temp: 0 },
    hitDice: { dieSize: num(parsed.hitDice?.split('d')[1]) || 8, max: level, used: 0 },
    ac: num(parsed.ac, 10),
    initiativeMod: num(parsed.initiative, 0),
    speed: num(parsed.speed, 30),
    ...(spellsKnown.length ? { spellsKnown } : {}),
    ...(ABILITY_NAMES.includes(spellAbility as AbilityName)
      ? { spellcastingAbility: spellAbility as AbilityName }
      : {}),
    inventory: mapInventory(parsed.equipment),
    attacks: mapAttacks(parsed.attacks),
    features: mapFeatures(parsed.features),
    notes: notesParts.join('\n\n'),
    goals: [],
    bonds: splitLines(parsed.bonds),
    ideals: splitLines(parsed.ideals),
    flaws: splitLines(parsed.flaws),
  };
}
