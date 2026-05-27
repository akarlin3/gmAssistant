// PC construction + normalization. `normalizePc` is the read-side guard: PCs
// come back from Firestore as untyped JSON, so we coerce every field to its
// declared shape (fail-safe defaults) before the UI or integrations touch it.

import { proficiencyBonusForLevel } from './derived';
import {
  ABILITY_NAMES,
  PC_CAP,
  SPELL_SLOT_LEVELS,
  type AbilityName,
  type Attack,
  type DeathSaveCount,
  type ExhaustionLevel,
  type FeatureEntry,
  type InventoryItem,
  type PcClass,
  type PlayerCharacter,
  type SkillName,
  type SpellSlot,
  type SpellSlotLevel,
} from './types';
import { SKILL_ABILITIES } from './skills';

export function makePcId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyPc(): PlayerCharacter {
  return {
    id: makePcId(),
    name: '',
    level: 1,
    classes: [],
    race: '',
    background: '',
    alignment: '',
    abilities: { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    proficiencies: {
      savingThrows: [],
      skills: [],
      languages: [],
      tools: [],
      armor: [],
      weapons: [],
    },
    proficiencyBonus: 2,
    hp: { current: 0, max: 0, temp: 0 },
    hitDice: { dieSize: 8, max: 1, used: 0 },
    ac: 10,
    initiativeMod: 0,
    speed: 30,
    conditions: [],
    exhaustion: 0,
    deathSaves: { successes: 0, failures: 0 },
    inventory: [],
    attacks: [],
    features: [],
    notes: '',
    goals: [],
    bonds: [],
    ideals: [],
    flaws: [],
  };
}

// Shallow top-level merge over a fresh PC. Handy for tests and for seeding a PC
// from a partial (e.g. the parser mapper) without re-listing every field.
export function makePc(partial: Partial<PlayerCharacter> = {}): PlayerCharacter {
  return { ...emptyPc(), ...partial };
}

// ---- normalization helpers ---------------------------------------------

const asStr = (v: unknown, fb = ''): string =>
  typeof v === 'string' ? v : v === null || v === undefined ? fb : String(v);

const asNum = (v: unknown, fb = 0): number => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : fb;
  }
  return fb;
};

const asStrArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => asStr(x)).filter((x) => x.length > 0) : [];

const clampInt = (v: unknown, lo: number, hi: number, fb: number): number => {
  const n = Math.round(asNum(v, fb));
  return Math.max(lo, Math.min(hi, n));
};

const VALID_ABILITIES = new Set<string>(ABILITY_NAMES);
const VALID_SKILLS = new Set<string>(Object.keys(SKILL_ABILITIES));

function normAbilities(v: unknown): Record<AbilityName, number> {
  const o = (v as Record<string, unknown>) || {};
  const out = {} as Record<AbilityName, number>;
  for (const a of ABILITY_NAMES) out[a] = clampInt(o[a], 1, 30, 10);
  return out;
}

function normClasses(v: unknown): PcClass[] {
  if (!Array.isArray(v)) return [];
  return v.map((c) => {
    const o = (c as Record<string, unknown>) || {};
    return {
      name: asStr(o.name),
      level: clampInt(o.level, 1, 20, 1),
      ...(o.subclass ? { subclass: asStr(o.subclass) } : {}),
    };
  });
}

function normInventory(v: unknown): InventoryItem[] {
  if (!Array.isArray(v)) return [];
  return v.map((it) => {
    const o = (it as Record<string, unknown>) || {};
    return {
      id: asStr(o.id) || makePcId(),
      name: asStr(o.name),
      qty: clampInt(o.qty, 0, 99999, 1),
      ...(o.weight !== undefined ? { weight: asNum(o.weight) } : {}),
      ...(o.description !== undefined ? { description: asStr(o.description) } : {}),
      equipped: o.equipped === true,
    };
  });
}

function normAttacks(v: unknown): Attack[] {
  if (!Array.isArray(v)) return [];
  return v.map((a) => {
    const o = (a as Record<string, unknown>) || {};
    return {
      id: asStr(o.id) || makePcId(),
      name: asStr(o.name),
      attackBonus: Math.round(asNum(o.attackBonus)),
      damageExpr: asStr(o.damageExpr),
      damageType: asStr(o.damageType),
      range: asStr(o.range),
      ...(o.notes !== undefined ? { notes: asStr(o.notes) } : {}),
    };
  });
}

function normFeatures(v: unknown): FeatureEntry[] {
  if (!Array.isArray(v)) return [];
  return v.map((f) => {
    const o = (f as Record<string, unknown>) || {};
    const uses = o.uses as Record<string, unknown> | undefined;
    return {
      id: asStr(o.id) || makePcId(),
      name: asStr(o.name),
      source: asStr(o.source),
      description: asStr(o.description),
      ...(uses
        ? {
            uses: {
              max: clampInt(uses.max, 0, 9999, 1),
              used: clampInt(uses.used, 0, 9999, 0),
              refresh: uses.refresh === 'short' ? 'short' : 'long',
            },
          }
        : {}),
    };
  });
}

function normSpellSlots(
  v: unknown,
): Partial<Record<SpellSlotLevel, SpellSlot>> | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const out: Partial<Record<SpellSlotLevel, SpellSlot>> = {};
  let any = false;
  for (const lvl of SPELL_SLOT_LEVELS) {
    const slot = o[lvl] as Record<string, unknown> | undefined;
    if (slot && typeof slot === 'object') {
      out[lvl] = {
        max: clampInt(slot.max, 0, 99, 0),
        used: clampInt(slot.used, 0, 99, 0),
      };
      any = true;
    }
  }
  return any ? out : undefined;
}

export function normalizePc(input: unknown): PlayerCharacter {
  const base = emptyPc();
  if (!input || typeof input !== 'object') return base;
  const o = input as Record<string, unknown>;

  const ds = (o.deathSaves as Record<string, unknown>) || {};
  const hp = (o.hp as Record<string, unknown>) || {};
  const hd = (o.hitDice as Record<string, unknown>) || {};
  const prof = (o.proficiencies as Record<string, unknown>) || {};

  const savingThrows = asStrArr(prof.savingThrows).filter((x) =>
    VALID_ABILITIES.has(x),
  ) as AbilityName[];
  const skills = asStrArr(prof.skills).filter((x) =>
    VALID_SKILLS.has(x),
  ) as SkillName[];

  const spellcastingAbility = asStr(o.spellcastingAbility);

  return {
    id: asStr(o.id) || base.id,
    name: asStr(o.name),
    level: clampInt(o.level, 1, 20, 1),
    classes: normClasses(o.classes),
    race: asStr(o.race),
    background: asStr(o.background),
    alignment: asStr(o.alignment),
    abilities: normAbilities(o.abilities),
    proficiencies: {
      savingThrows,
      skills,
      languages: asStrArr(prof.languages),
      tools: asStrArr(prof.tools),
      armor: asStrArr(prof.armor),
      weapons: asStrArr(prof.weapons),
    },
    proficiencyBonus: clampInt(o.proficiencyBonus, 0, 10, 2),
    hp: {
      current: clampInt(hp.current, -999, 9999, 0),
      max: clampInt(hp.max, 0, 9999, 0),
      temp: clampInt(hp.temp, 0, 9999, 0),
    },
    hitDice: {
      dieSize: clampInt(hd.dieSize, 1, 100, 8),
      max: clampInt(hd.max, 0, 99, 1),
      used: clampInt(hd.used, 0, 99, 0),
    },
    ac: clampInt(o.ac, 0, 99, 10),
    initiativeMod: Math.round(asNum(o.initiativeMod)),
    speed: clampInt(o.speed, 0, 999, 30),
    conditions: asStrArr(o.conditions),
    exhaustion: clampInt(o.exhaustion, 0, 6, 0) as ExhaustionLevel,
    deathSaves: {
      successes: clampInt(ds.successes, 0, 3, 0) as DeathSaveCount,
      failures: clampInt(ds.failures, 0, 3, 0) as DeathSaveCount,
    },
    ...(normSpellSlots(o.spellSlots) ? { spellSlots: normSpellSlots(o.spellSlots) } : {}),
    ...(Array.isArray(o.spellsKnown) ? { spellsKnown: asStrArr(o.spellsKnown) } : {}),
    ...(VALID_ABILITIES.has(spellcastingAbility)
      ? { spellcastingAbility: spellcastingAbility as AbilityName }
      : {}),
    inventory: normInventory(o.inventory),
    attacks: normAttacks(o.attacks),
    features: normFeatures(o.features),
    notes: asStr(o.notes),
    goals: asStrArr(o.goals),
    bonds: asStrArr(o.bonds),
    ideals: asStrArr(o.ideals),
    flaws: asStrArr(o.flaws),
  };
}

export function normalizePcs(input: unknown): PlayerCharacter[] {
  if (!Array.isArray(input)) return [];
  return input.map(normalizePc);
}

// Enforce the per-campaign cap, keeping the first PC_CAP entries.
export function capPcs(pcs: PlayerCharacter[]): PlayerCharacter[] {
  return pcs.length <= PC_CAP ? pcs : pcs.slice(0, PC_CAP);
}

export { proficiencyBonusForLevel };
