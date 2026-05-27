// First-class Player Character (PC) sheet types. PCs live in the campaign blob
// at `data.pcs` (array, capped at PC_CAP). They are distinct from the legacy
// freeform `data.characters` notes — a PC is a structured, mechanically-aware
// entity that Scene Mode, Session Mode, the character parser, and Player Mode
// all read from.

export type AbilityName = 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA';

export const ABILITY_NAMES: readonly AbilityName[] = [
  'STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA',
];

export type SkillName =
  | 'Acrobatics' | 'Animal Handling' | 'Arcana' | 'Athletics' | 'Deception'
  | 'History' | 'Insight' | 'Intimidation' | 'Investigation' | 'Medicine'
  | 'Nature' | 'Perception' | 'Performance' | 'Persuasion' | 'Religion'
  | 'Sleight of Hand' | 'Stealth' | 'Survival';

export type SrdCondition = string;

export type SpellSlotLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export const SPELL_SLOT_LEVELS: readonly SpellSlotLevel[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9,
];

export type SpellSlot = { max: number; used: number };

export type PcClass = { name: string; level: number; subclass?: string };

export type InventoryItem = {
  id: string;
  name: string;
  qty: number;
  weight?: number;
  description?: string;
  equipped?: boolean;
};

export type Attack = {
  id: string;
  name: string;
  attackBonus: number;
  damageExpr: string; // "1d8+3"
  damageType: string; // "slashing"
  range: string; // "5 ft." or "150/600 ft."
  notes?: string;
};

export type RefreshKind = 'short' | 'long';

export type FeatureEntry = {
  id: string;
  name: string;
  source: string; // "Fighter 3", "Background", "Race"
  description: string;
  uses?: { max: number; used: number; refresh: RefreshKind };
};

export type PcProficiencies = {
  savingThrows: AbilityName[];
  skills: SkillName[];
  languages: string[];
  tools: string[];
  armor: string[];
  weapons: string[];
};

export type DeathSaveCount = 0 | 1 | 2 | 3;
export type ExhaustionLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type PlayerCharacter = {
  id: string;
  name: string;
  level: number; // 1-20
  classes: PcClass[];
  race: string;
  background: string;
  alignment?: string;

  abilities: Record<AbilityName, number>;
  proficiencies: PcProficiencies;
  proficiencyBonus: number; // auto-computed but stored for override

  hp: { current: number; max: number; temp: number };
  hitDice: { dieSize: number; max: number; used: number };
  ac: number;
  initiativeMod: number; // defaults to DEX mod; overridable
  speed: number;

  conditions: SrdCondition[];
  exhaustion: ExhaustionLevel;
  deathSaves: { successes: DeathSaveCount; failures: DeathSaveCount };

  spellSlots?: Partial<Record<SpellSlotLevel, SpellSlot>>;
  spellsKnown?: string[];
  spellcastingAbility?: AbilityName;

  inventory: InventoryItem[];
  attacks: Attack[];
  features: FeatureEntry[];

  notes: string;
  goals: string[];
  bonds: string[];
  ideals: string[];
  flaws: string[];
};

export const PC_CAP = 6;
