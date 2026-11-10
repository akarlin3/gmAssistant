'use client';

import React, { useMemo, useState } from 'react';
import {
  Dices,
  Sparkles,
  Shield,
  TrendingUp,
  UserPlus,
  ChevronRight,
  ChevronLeft,
  Check,
  X,
} from 'lucide-react';
import { evaluateCharacterSheet } from '@/lib/characterEvaluator';
import { mergeUploadedCharacterSheet } from '@/lib/characterMerge';
import { abilityMod, proficiencyBonusForLevel } from '@/lib/pc/derived';
import { emptyPc, makePcId } from '@/lib/pc/factory';
import { SKILL_ABILITY } from '@/lib/pc/skills';
import {
  ABILITY_NAMES,
  SPELL_SLOT_LEVELS,
  type AbilityName,
  type Attack,
  type FeatureEntry,
  type InventoryItem,
  type PactMagicSlots,
  type PcClass,
  type PcResourcePool,
  type PlayerCharacter,
  type SkillName,
  type SpellSlot,
  type SpellSlotLevel,
} from '@/lib/pc/types';
import {
  POINT_BUY_BUDGET,
  POINT_BUY_MAX_SCORE,
  POINT_BUY_MIN_SCORE,
  canAdjustScore,
  computeRemainingPoints,
} from '@/lib/pointBuy';

// ---- Pure SRD 5e Reference Data & State Transition Helpers -----------------

export const SRD_CLASSES: ReadonlyArray<{
  name: string;
  hitDie: 6 | 8 | 10 | 12;
  primarySaves: [AbilityName, AbilityName];
  casterProgression: 'full' | 'half' | 'third' | 'pact' | 'none';
  spellcastingAbility?: AbilityName;
  defaultSubclasses: string[];
  startingEquipment: string[];
  startingSpells?: string[];
  classResources?: (level: number, abilities: Record<AbilityName, number>) => PcResourcePool[];
}> = [
  {
    name: 'Barbarian',
    hitDie: 12,
    primarySaves: ['STR', 'CON'],
    casterProgression: 'none',
    defaultSubclasses: ['Path of the Berserker', 'Path of the Totem Warrior', 'Path of Wild Magic'],
    startingEquipment: ['Greataxe', '2 Handaxes', 'Explorer\'s Pack', '4 Javelins'],
    classResources: (lvl) => [
      {
        id: 'pool-rage',
        name: 'Rage',
        current: lvl >= 17 ? 6 : lvl >= 12 ? 5 : lvl >= 6 ? 4 : lvl >= 3 ? 3 : 2,
        max: lvl >= 17 ? 6 : lvl >= 12 ? 5 : lvl >= 6 ? 4 : lvl >= 3 ? 3 : 2,
        rechargeOn: 'long',
      },
    ],
  },
  {
    name: 'Bard',
    hitDie: 8,
    primarySaves: ['DEX', 'CHA'],
    casterProgression: 'full',
    spellcastingAbility: 'CHA',
    defaultSubclasses: ['College of Lore', 'College of Valor', 'College of Eloquence'],
    startingEquipment: ['Rapier', 'Diplomat\'s Pack', 'Lute', 'Leather Armor', 'Dagger'],
    startingSpells: ['Vicious Mockery (Cantrip)', 'Healing Word (Lv 1)', 'Faerie Fire [C] (Lv 1)', 'Bane [C] (Lv 1)'],
    classResources: (lvl, ab) => [
      {
        id: 'pool-bardic-inspiration',
        name: 'Bardic Inspiration',
        current: Math.max(1, abilityMod(ab.CHA)),
        max: Math.max(1, abilityMod(ab.CHA)),
        rechargeOn: lvl >= 5 ? 'short' : 'long',
      },
    ],
  },
  {
    name: 'Cleric',
    hitDie: 8,
    primarySaves: ['WIS', 'CHA'],
    casterProgression: 'full',
    spellcastingAbility: 'WIS',
    defaultSubclasses: ['Life Domain', 'Light Domain', 'Tempest Domain', 'Trickery Domain'],
    startingEquipment: ['Mace', 'Scale Mail', 'Shield', 'Holy Symbol', 'Priest\'s Pack'],
    startingSpells: ['Guidance [C] (Cantrip)', 'Sacred Flame (Cantrip)', 'Bless [C] (Lv 1)', 'Cure Wounds (Lv 1)', 'Shield of Faith [C] (Lv 1)'],
    classResources: (lvl) =>
      lvl >= 2
        ? [
            {
              id: 'pool-channel-divinity',
              name: 'Channel Divinity',
              current: lvl >= 18 ? 3 : lvl >= 6 ? 2 : 1,
              max: lvl >= 18 ? 3 : lvl >= 6 ? 2 : 1,
              rechargeOn: 'short',
            },
          ]
        : [],
  },
  {
    name: 'Druid',
    hitDie: 8,
    primarySaves: ['INT', 'WIS'],
    casterProgression: 'full',
    spellcastingAbility: 'WIS',
    defaultSubclasses: ['Circle of the Land', 'Circle of the Moon', 'Circle of Stars'],
    startingEquipment: ['Wooden Shield', 'Scimitar', 'Leather Armor', 'Explorer\'s Pack', 'Druidic Focus'],
    startingSpells: ['Produce Flame (Cantrip)', 'Guidance [C] (Cantrip)', 'Entangle [C] (Lv 1)', 'Healing Word (Lv 1)', 'Faerie Fire [C] (Lv 1)'],
    classResources: (lvl) =>
      lvl >= 2
        ? [
            {
              id: 'pool-wild-shape',
              name: 'Wild Shape',
              current: 2,
              max: 2,
              rechargeOn: 'short',
            },
          ]
        : [],
  },
  {
    name: 'Fighter',
    hitDie: 10,
    primarySaves: ['STR', 'CON'],
    casterProgression: 'none',
    defaultSubclasses: ['Champion', 'Battle Master', 'Eldritch Knight'],
    startingEquipment: ['Chain Mail', 'Longsword', 'Shield', 'Light Crossbow', 'Dungeoneer\'s Pack'],
    classResources: (lvl) => [
      {
        id: 'pool-second-wind',
        name: 'Second Wind',
        current: 1,
        max: 1,
        rechargeOn: 'short',
      },
      ...(lvl >= 2
        ? [
            {
              id: 'pool-action-surge',
              name: 'Action Surge',
              current: lvl >= 17 ? 2 : 1,
              max: lvl >= 17 ? 2 : 1,
              rechargeOn: 'short' as const,
            },
          ]
        : []),
    ],
  },
  {
    name: 'Monk',
    hitDie: 8,
    primarySaves: ['STR', 'DEX'],
    casterProgression: 'none',
    defaultSubclasses: ['Way of the Open Hand', 'Way of Shadow', 'Way of Mercy'],
    startingEquipment: ['Shortsword', 'Dungeoneer\'s Pack', '10 Darts'],
    classResources: (lvl) =>
      lvl >= 2
        ? [
            {
              id: 'pool-ki-points',
              name: 'Ki / Focus Points',
              current: lvl,
              max: lvl,
              rechargeOn: 'short',
            },
          ]
        : [],
  },
  {
    name: 'Paladin',
    hitDie: 10,
    primarySaves: ['WIS', 'CHA'],
    casterProgression: 'half',
    spellcastingAbility: 'CHA',
    defaultSubclasses: ['Oath of Devotion', 'Oath of Vengeance', 'Oath of the Ancients'],
    startingEquipment: ['Chain Mail', 'Longsword', 'Shield', '5 Javelins', 'Priest\'s Pack', 'Holy Symbol'],
    startingSpells: ['Bless [C] (Lv 1)', 'Shield of Faith [C] (Lv 1)', 'Cure Wounds (Lv 1)'],
    classResources: (lvl) => [
      {
        id: 'pool-lay-on-hands',
        name: 'Lay on Hands Pool',
        current: lvl * 5,
        max: lvl * 5,
        rechargeOn: 'long',
      },
      ...(lvl >= 3
        ? [
            {
              id: 'pool-channel-divinity-paladin',
              name: 'Channel Divinity',
              current: 1,
              max: 1,
              rechargeOn: 'short' as const,
            },
          ]
        : []),
    ],
  },
  {
    name: 'Ranger',
    hitDie: 10,
    primarySaves: ['STR', 'DEX'],
    casterProgression: 'half',
    spellcastingAbility: 'WIS',
    defaultSubclasses: ['Hunter', 'Gloom Stalker', 'Beast Master'],
    startingEquipment: ['Scale Mail', '2 Shortswords', 'Longbow', 'Quiver of 20 Arrows', 'Explorer\'s Pack'],
    startingSpells: ['Hunter\'s Mark [C] (Lv 1)', 'Cure Wounds (Lv 1)'],
  },
  {
    name: 'Rogue',
    hitDie: 8,
    primarySaves: ['DEX', 'INT'],
    casterProgression: 'none',
    defaultSubclasses: ['Thief', 'Assassin', 'Arcane Trickster', 'Swashbuckler'],
    startingEquipment: ['Rapier', 'Shortbow', 'Burglar\'s Pack', 'Leather Armor', '2 Daggers', 'Thieves\' Tools'],
  },
  {
    name: 'Sorcerer',
    hitDie: 6,
    primarySaves: ['CON', 'CHA'],
    casterProgression: 'full',
    spellcastingAbility: 'CHA',
    defaultSubclasses: ['Draconic Bloodline', 'Wild Magic', 'Aberrant Mind'],
    startingEquipment: ['Light Crossbow', 'Arcane Focus', 'Dungeoneer\'s Pack', '2 Daggers'],
    startingSpells: ['Fire Bolt (Cantrip)', 'Mage Hand (Cantrip)', 'Shield (Lv 1)', 'Magic Missile (Lv 1)'],
    classResources: (lvl) =>
      lvl >= 2
        ? [
            {
              id: 'pool-sorcery-points',
              name: 'Sorcery Points',
              current: lvl,
              max: lvl,
              rechargeOn: 'long',
            },
          ]
        : [],
  },
  {
    name: 'Warlock',
    hitDie: 8,
    primarySaves: ['WIS', 'CHA'],
    casterProgression: 'pact',
    spellcastingAbility: 'CHA',
    defaultSubclasses: ['The Fiend', 'The Archfey', 'The Great Old One', 'The Hexblade'],
    startingEquipment: ['Light Crossbow', 'Arcane Focus', 'Scholar\'s Pack', 'Leather Armor', '2 Daggers'],
    startingSpells: ['Eldritch Blast (Cantrip)', 'Hex [C] (Lv 1)', 'Armor of Agathys (Lv 1)'],
  },
  {
    name: 'Wizard',
    hitDie: 6,
    primarySaves: ['INT', 'WIS'],
    casterProgression: 'full',
    spellcastingAbility: 'INT',
    defaultSubclasses: ['School of Evocation', 'School of Abjuration', 'School of Divination'],
    startingEquipment: ['Quarterstaff', 'Arcane Focus', 'Scholar\'s Pack', 'Spellbook'],
    startingSpells: ['Fire Bolt (Cantrip)', 'Mage Hand (Cantrip)', 'Mage Armor (Lv 1)', 'Shield (Lv 1)', 'Magic Missile (Lv 1)'],
    classResources: () => [
      {
        id: 'pool-arcane-recovery',
        name: 'Arcane Recovery',
        current: 1,
        max: 1,
        rechargeOn: 'long',
      },
    ],
  },
];

export const SRD_SPECIES = [
  'Human',
  'Elf (High / Wood / Drow)',
  'Dwarf (Hill / Mountain)',
  'Halfling',
  'Dragonborn',
  'Gnome',
  'Half-Elf',
  'Half-Orc',
  'Tiefling',
];

export const SRD_BACKGROUNDS = [
  'Acolyte',
  'Charlatan',
  'Criminal',
  'Entertainer',
  'Folk Hero',
  'Guild Artisan',
  'Hermit',
  'Noble',
  'Outlander',
  'Sage',
  'Soldier',
  'Urchin',
];

export const STANDARD_ARRAY: readonly number[] = [15, 14, 13, 12, 10, 8];

export const SRD_FEATS: ReadonlyArray<{
  name: string;
  description: string;
  hpPerLevelBonus?: number;
  initiativeBonus?: number;
  speedBonus?: number;
}> = [
  {
    name: 'Alert',
    description: '+5 bonus to Initiative; cannot be surprised while conscious.',
    initiativeBonus: 5,
  },
  {
    name: 'Tough',
    description: 'Your hit point maximum increases by an amount equal to twice your level (+2 HP/level).',
    hpPerLevelBonus: 2,
  },
  {
    name: 'War Caster',
    description: 'Advantage on CON saves to maintain Concentration; somatic components with hands full.',
  },
  {
    name: 'Resilient',
    description: 'Gain proficiency in a chosen saving throw.',
  },
  {
    name: 'Lucky',
    description: '3 Luck Points per Long Rest to reroll d20s.',
  },
  {
    name: 'Mobile',
    description: 'Your speed increases by 10 feet; Dash ignores difficult terrain.',
    speedBonus: 10,
  },
  {
    name: 'Fey Touched',
    description: 'Learn Misty Step and one 1st-level divination or enchantment spell.',
  },
];

// Full caster spell slot table (levels 1..20 -> [lv1..lv9])
const FULL_CASTER_SLOTS: ReadonlyArray<readonly number[]> = [
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
];

export function getDefaultHitDieForClass(className: string): 6 | 8 | 10 | 12 {
  const match = SRD_CLASSES.find(
    (c) => c.name.toLowerCase() === className.trim().toLowerCase()
  );
  return match?.hitDie ?? 8;
}

export function getFixedHpAverageForHitDie(hitDie: number): number {
  return Math.floor(hitDie / 2) + 1;
}

export function getStandardSpellSlotsForClasses(
  classes: readonly PcClass[]
): {
  spellSlots: Partial<Record<SpellSlotLevel, SpellSlot>> | undefined;
  pactSlots: PactMagicSlots | undefined;
} {
  let effectiveCasterLevel = 0;
  let warlockLevel = 0;

  for (const cls of classes) {
    const def = SRD_CLASSES.find(
      (c) => c.name.toLowerCase() === cls.name.trim().toLowerCase()
    );
    if (!def) continue;
    if (def.casterProgression === 'full') {
      effectiveCasterLevel += cls.level;
    } else if (def.casterProgression === 'half' && cls.level >= 2) {
      effectiveCasterLevel += Math.ceil(cls.level / 2);
    } else if (def.casterProgression === 'third' && cls.level >= 3) {
      effectiveCasterLevel += Math.floor(cls.level / 3);
    } else if (def.casterProgression === 'pact') {
      warlockLevel += cls.level;
    }
  }

  let spellSlots: Partial<Record<SpellSlotLevel, SpellSlot>> | undefined;
  if (effectiveCasterLevel >= 1) {
    const idx = Math.min(20, Math.max(1, effectiveCasterLevel)) - 1;
    const row = FULL_CASTER_SLOTS[idx];
    const out: Partial<Record<SpellSlotLevel, SpellSlot>> = {};
    row.forEach((maxSlots, i) => {
      const lvl = (i + 1) as SpellSlotLevel;
      if (maxSlots > 0 && SPELL_SLOT_LEVELS.includes(lvl)) {
        out[lvl] = { max: maxSlots, used: 0 };
      }
    });
    if (Object.keys(out).length > 0) spellSlots = out;
  }

  let pactSlots: PactMagicSlots | undefined;
  if (warlockLevel >= 1) {
    const slotLevel = Math.min(5, Math.ceil(warlockLevel / 2)) as SpellSlotLevel;
    const max =
      warlockLevel >= 17 ? 4 : warlockLevel >= 11 ? 3 : warlockLevel >= 2 ? 2 : 1;
    pactSlots = {
      level: slotLevel,
      slotLevel,
      max,
      used: 0,
    };
  }

  return { spellSlots, pactSlots };
}

export function roll4d6DropLowest(rng: () => number = Math.random): {
  rolls: [number, number, number, number];
  droppedIndex: number;
  total: number;
} {
  const rolls: [number, number, number, number] = [
    Math.floor(rng() * 6) + 1,
    Math.floor(rng() * 6) + 1,
    Math.floor(rng() * 6) + 1,
    Math.floor(rng() * 6) + 1,
  ];
  let minVal = rolls[0];
  let droppedIndex = 0;
  for (let i = 1; i < 4; i++) {
    if (rolls[i] < minVal) {
      minVal = rolls[i];
      droppedIndex = i;
    }
  }
  const total = rolls.reduce((sum, v, i) => (i === droppedIndex ? sum : sum + v), 0);
  return { rolls, droppedIndex, total };
}

export interface CreateCharacterWizardInput {
  id?: string;
  name: string;
  player?: string;
  race: string;
  background: string;
  alignment?: string;
  className: string;
  subclass?: string;
  level?: number;
  abilities: Record<AbilityName, number>;
  savingThrows?: AbilityName[];
  skills?: SkillName[];
  equipmentNames?: string[];
  spellsKnown?: string[];
  startingGold?: number;
  ownership?: PlayerCharacter['ownership'];
}

/**
 * Pure builder that constructs a full, mechanically-evaluated `PlayerCharacter`
 * from the guided Create Character wizard inputs.
 */
export function buildNewCharacterFromWizard(
  input: CreateCharacterWizardInput
): PlayerCharacter {
  const base = emptyPc();
  const level = Math.max(1, Math.min(20, Math.trunc(input.level ?? 1)));
  const classDef =
    SRD_CLASSES.find((c) => c.name.toLowerCase() === input.className.trim().toLowerCase()) ??
    SRD_CLASSES[4]; // Fighter fallback

  const hitDie = classDef.hitDie;
  const conMod = abilityMod(input.abilities.CON ?? 10);
  const dexMod = abilityMod(input.abilities.DEX ?? 10);

  // Level 1 gets max hit die + CON mod; subsequent levels get fixed average + CON mod
  const level1Hp = Math.max(1, hitDie + conMod);
  const higherLevelsHp =
    level > 1
      ? (level - 1) * Math.max(1, getFixedHpAverageForHitDie(hitDie) + conMod)
      : 0;
  const maxHp = level1Hp + higherLevelsHp;

  const classes: PcClass[] = [
    {
      name: classDef.name,
      level,
      ...(input.subclass ? { subclass: input.subclass } : {}),
    },
  ];

  const { spellSlots, pactSlots } = getStandardSpellSlotsForClasses(classes);
  const resourcePools = classDef.classResources
    ? classDef.classResources(level, input.abilities)
    : [];

  const equipmentNames =
    input.equipmentNames && input.equipmentNames.length > 0
      ? input.equipmentNames
      : classDef.startingEquipment;

  const inventory: InventoryItem[] = equipmentNames.map((name, idx) => ({
    id: `inv-init-${idx + 1}`,
    name,
    qty: 1,
    equipped: idx < 3,
    sharedWithGm: true,
  }));

  // Estimate starting AC based on equipment
  const eqLower = equipmentNames.join(' ').toLowerCase();
  let ac = 10 + dexMod;
  if (eqLower.includes('chain mail')) {
    ac = 16;
  } else if (eqLower.includes('scale mail')) {
    ac = 14 + Math.min(2, dexMod);
  } else if (eqLower.includes('leather armor')) {
    ac = 11 + dexMod;
  } else if (classDef.name === 'Barbarian') {
    ac = 10 + dexMod + conMod;
  } else if (classDef.name === 'Monk') {
    ac = 10 + dexMod + abilityMod(input.abilities.WIS ?? 10);
  }
  if (eqLower.includes('shield')) {
    ac += 2;
  }

  const profBonus = proficiencyBonusForLevel(level);
  const strMod = abilityMod(input.abilities.STR ?? 10);
  const primaryMeleeMod = Math.max(strMod, dexMod);

  const attacks: Attack[] = [
    {
      id: 'atk-primary-1',
      name: equipmentNames[0] || 'Weapon Strike',
      attackBonus: primaryMeleeMod + profBonus,
      damageExpr: `1d8${primaryMeleeMod >= 0 ? `+${primaryMeleeMod}` : primaryMeleeMod}`,
      damageType: 'slashing',
      range: '5 ft.',
    },
  ];

  const spellsKnown =
    input.spellsKnown && input.spellsKnown.length > 0
      ? input.spellsKnown
      : classDef.startingSpells ?? [];

  const rawPc: PlayerCharacter = {
    ...base,
    id: input.id || makePcId(),
    name: input.name.trim() || 'New Adventurer',
    ...(input.player ? { player: input.player } : {}),
    level,
    classes,
    race: input.race || 'Human',
    background: input.background || 'Folk Hero',
    alignment: input.alignment || 'Neutral Good',
    abilities: { ...input.abilities },
    proficiencies: {
      savingThrows:
        input.savingThrows && input.savingThrows.length > 0
          ? [...input.savingThrows]
          : [...classDef.primarySaves],
      skills: input.skills ? [...input.skills] : ['Perception', 'Athletics'],
      languages: ['Common'],
      tools: [],
      armor: [],
      weapons: [],
    },
    proficiencyBonus: profBonus,
    hp: { current: maxHp, max: maxHp, temp: 0 },
    hitDice: { dieSize: hitDie, max: level, used: 0 },
    ac,
    initiativeMod: dexMod,
    speed: 30,
    ...(spellSlots ? { spellSlots } : {}),
    ...(pactSlots ? { pactSlots } : {}),
    ...(spellsKnown.length > 0 ? { spellsKnown } : {}),
    ...(classDef.spellcastingAbility
      ? { spellcastingAbility: classDef.spellcastingAbility }
      : {}),
    ...(resourcePools.length > 0 ? { resourcePools } : {}),
    inventory,
    currency: { cp: 0, sp: 0, ep: 0, gp: input.startingGold ?? 15, pp: 0 },
    attacks,
    features: [
      {
        id: 'feat-bg-1',
        name: `${input.background || 'Adventurer'} Feature`,
        source: input.background || 'Background',
        description: `Background feature from ${input.background || 'Folk Hero'}.`,
      },
    ],
    ...(input.ownership ? { ownership: input.ownership } : {}),
  };

  return evaluateCharacterSheet(rawPc);
}

export interface LevelUpWizardInput {
  targetClassName?: string; // Defaults to primary class, or multiclass if new
  subclass?: string;
  hpGainMethod: 'fixed' | 'roll';
  rolledHitDieValue?: number; // Raw die roll (1..hitDie) before CON mod
  asiOrFeatChoice?:
    | { type: 'asi'; bonuses: Partial<Record<AbilityName, number>> }
    | { type: 'feat'; featName: string }
    | { type: 'none' };
  newSpellsLearned?: string[];
  newFeatures?: FeatureEntry[];
}

/**
 * Pure Level-Up state transition that steps a `PlayerCharacter` up +1 level,
 * calculates HP increase, updates unlocked Spell Slots & Class Resource pools,
 * applies ASI or Feat choices, and commits via `mergeUploadedCharacterSheet`
 * semantics so mid-session `damageTaken`, `tempHp`, `conditions`, spent slots,
 * and private notes remain 100% intact.
 */
export function applyLevelUpWizardTransition(
  existingPc: PlayerCharacter,
  input: LevelUpWizardInput
): PlayerCharacter {
  const currentTotalLevel = Math.max(1, existingPc.level || 1);
  if (currentTotalLevel >= 20) {
    return evaluateCharacterSheet({ ...existingPc });
  }
  const nextTotalLevel = currentTotalLevel + 1;

  // 1. Update class levels (single-class or multiclass)
  const targetClass =
    input.targetClassName?.trim() ||
    existingPc.classes[0]?.name ||
    'Fighter';
  const existingClasses = existingPc.classes.length > 0
    ? existingPc.classes.map((c) => ({ ...c }))
    : [{ name: targetClass, level: currentTotalLevel }];

  const matchIdx = existingClasses.findIndex(
    (c) => c.name.trim().toLowerCase() === targetClass.toLowerCase()
  );

  let nextClasses: PcClass[];
  if (matchIdx >= 0) {
    nextClasses = existingClasses.map((c, idx) =>
      idx === matchIdx
        ? {
            ...c,
            level: c.level + 1,
            ...(input.subclass ? { subclass: input.subclass } : {}),
          }
        : c
    );
  } else {
    nextClasses = [
      ...existingClasses,
      {
        name: targetClass,
        level: 1,
        ...(input.subclass ? { subclass: input.subclass } : {}),
      },
    ];
  }

  // 2. Apply ASI or Feat choice to abilities
  const nextAbilities: Record<AbilityName, number> = { ...existingPc.abilities };
  const addedFeatures: FeatureEntry[] = [...(existingPc.features ?? [])];
  let extraHpBonus = 0;
  let extraSpeedBonus = 0;
  let extraInitBonus = 0;

  if (input.asiOrFeatChoice?.type === 'asi' && input.asiOrFeatChoice.bonuses) {
    for (const ability of ABILITY_NAMES) {
      const inc = input.asiOrFeatChoice.bonuses[ability] ?? 0;
      if (inc > 0) {
        nextAbilities[ability] = Math.min(20, (nextAbilities[ability] ?? 10) + inc);
      }
    }
    addedFeatures.push({
      id: `asi-lv-${nextTotalLevel}`,
      name: `Ability Score Improvement (Lv ${nextTotalLevel})`,
      source: `${targetClass}`,
      description: Object.entries(input.asiOrFeatChoice.bonuses)
        .filter(([, v]) => (v ?? 0) > 0)
        .map(([k, v]) => `+${v} ${k}`)
        .join(', '),
    });
  } else if (input.asiOrFeatChoice?.type === 'feat' && input.asiOrFeatChoice.featName) {
    const chosenFeatName = input.asiOrFeatChoice.featName;
    const featDef = SRD_FEATS.find(
      (f) => f.name.toLowerCase() === chosenFeatName.toLowerCase()
    );
    addedFeatures.push({
      id: `feat-lv-${nextTotalLevel}`,
      name: featDef?.name ?? chosenFeatName,
      source: `Feat (Lv ${nextTotalLevel})`,
      description: featDef?.description ?? 'Custom Feat gained on level up.',
    });
    if (featDef?.hpPerLevelBonus) {
      extraHpBonus += featDef.hpPerLevelBonus * nextTotalLevel;
    }
    if (featDef?.speedBonus) {
      extraSpeedBonus += featDef.speedBonus;
    }
    if (featDef?.initiativeBonus) {
      extraInitBonus += featDef.initiativeBonus;
    }
  }

  if (input.newFeatures && input.newFeatures.length > 0) {
    addedFeatures.push(...input.newFeatures);
  }

  // 3. Calculate HP increase (including retroactive +1/level if CON modifier increased)
  const prevConMod = abilityMod(existingPc.abilities?.CON ?? 10);
  const nextConMod = abilityMod(nextAbilities.CON ?? 10);
  const retroactiveConHp = Math.max(0, (nextConMod - prevConMod) * currentTotalLevel);

  const hitDie = getDefaultHitDieForClass(targetClass);
  const dieRoll =
    input.hpGainMethod === 'roll' && typeof input.rolledHitDieValue === 'number'
      ? Math.max(1, Math.min(hitDie, Math.trunc(input.rolledHitDieValue)))
      : getFixedHpAverageForHitDie(hitDie);

  const hpGainForNewLevel = Math.max(1, dieRoll + nextConMod);
  const nextMaxHp =
    (existingPc.hp?.max ?? existingPc.maxHp ?? 10) +
    hpGainForNewLevel +
    retroactiveConHp +
    extraHpBonus;

  // 4. Calculate newly unlocked Spell Slots, Pact Slots, and Class Resource Pools
  const { spellSlots: unlockedSpellSlots, pactSlots: unlockedPactSlots } =
    getStandardSpellSlotsForClasses(nextClasses);

  // Merge existing spellSlots with newly unlocked maxes
  const nextSpellSlots: Partial<Record<SpellSlotLevel, SpellSlot>> = {
    ...(existingPc.spellSlots ?? {}),
  };
  if (unlockedSpellSlots) {
    for (const lvl of SPELL_SLOT_LEVELS) {
      const unlocked = unlockedSpellSlots[lvl];
      if (unlocked) {
        const prev = nextSpellSlots[lvl];
        nextSpellSlots[lvl] = {
          max: Math.max(prev?.max ?? 0, unlocked.max),
          used: prev?.used ?? 0,
        };
      }
    }
  }

  // Recompute class resource pools for new class levels
  const nextResourcePools: PcResourcePool[] = [...(existingPc.resourcePools ?? [])];
  for (const cls of nextClasses) {
    const classDef = SRD_CLASSES.find(
      (c) => c.name.toLowerCase() === cls.name.trim().toLowerCase()
    );
    if (classDef?.classResources) {
      const freshPools = classDef.classResources(cls.level, nextAbilities);
      for (const fp of freshPools) {
        const existingIdx = nextResourcePools.findIndex(
          (p) => p.id === fp.id || p.name.toLowerCase() === fp.name.toLowerCase()
        );
        if (existingIdx >= 0) {
          const prevPool = nextResourcePools[existingIdx];
          const maxDelta = Math.max(0, fp.max - prevPool.max);
          nextResourcePools[existingIdx] = {
            ...prevPool,
            max: Math.max(prevPool.max, fp.max),
            current: prevPool.current + maxDelta,
            rechargeOn: fp.rechargeOn,
          };
        } else {
          nextResourcePools.push(fp);
        }
      }
    }
  }

  const nextSpellsKnown = Array.from(
    new Set([...(existingPc.spellsKnown ?? []), ...(input.newSpellsLearned ?? [])])
  );

  // Build the incoming leveled-up character sheet and commit via mergeUploadedCharacterSheet
  // so mid-session damageTaken, tempHp, conditions, spent slots/resources, and private notes
  // remain 100% intact!
  const incomingSheet: PlayerCharacter = {
    ...existingPc,
    level: nextTotalLevel,
    classes: nextClasses,
    abilities: nextAbilities,
    proficiencyBonus: proficiencyBonusForLevel(nextTotalLevel),
    hp: {
      ...existingPc.hp,
      max: nextMaxHp,
      current: nextMaxHp, // mergeUploadedCharacterSheet subtracts existing damageTaken from incoming.max!
    },
    hitDice: {
      dieSize: existingPc.hitDice?.dieSize || hitDie,
      max: nextTotalLevel,
      used: existingPc.hitDice?.used ?? 0,
    },
    speed: (existingPc.speed || 30) + extraSpeedBonus,
    initiativeMod:
      (existingPc.initiativeMod ?? abilityMod(existingPc.abilities?.DEX ?? 10)) +
      (abilityMod(nextAbilities.DEX) - abilityMod(existingPc.abilities?.DEX ?? 10)) +
      extraInitBonus,
    ...(Object.keys(nextSpellSlots).length > 0 ? { spellSlots: nextSpellSlots } : {}),
    ...(unlockedPactSlots
      ? {
          pactSlots: {
            ...unlockedPactSlots,
            used: existingPc.pactSlots?.used ?? 0,
          },
        }
      : existingPc.pactSlots
        ? { pactSlots: existingPc.pactSlots }
        : {}),
    ...(nextResourcePools.length > 0 ? { resourcePools: nextResourcePools } : {}),
    ...(nextSpellsKnown.length > 0 ? { spellsKnown: nextSpellsKnown } : {}),
    features: addedFeatures,
  };

  return mergeUploadedCharacterSheet(existingPc, incomingSheet);
}

// ---- Interactive Modal Component -------------------------------------------

export interface CharacterWizardModalProps {
  open?: boolean;
  isOpen?: boolean;
  mode: 'create' | 'levelup' | 'levelUp';
  existingPc?: PlayerCharacter | null;
  onClose: () => void;
  onComplete?: (pc: PlayerCharacter) => void;
  onSave?: (pc: PlayerCharacter) => void;
  onCommit?: (pc: PlayerCharacter) => void;
}

type AbilityMethod = 'standard' | 'pointbuy' | 'roll4d6' | 'manual';

export function CharacterWizardModal({
  open,
  isOpen,
  mode,
  existingPc,
  onClose,
  onComplete,
  onSave,
  onCommit,
}: CharacterWizardModalProps) {
  const emitSavedPc = (pc: PlayerCharacter) => {
    onComplete?.(pc);
    onSave?.(pc);
    onCommit?.(pc);
  };
  // ---- Create Mode State ----
  const [step, setStep] = useState<number>(0);
  const [name, setName] = useState(existingPc?.name || '');
  const [playerName, setPlayerName] = useState(existingPc?.player || '');
  const [race, setRace] = useState(existingPc?.race || SRD_SPECIES[0]);
  const [background, setBackground] = useState(existingPc?.background || SRD_BACKGROUNDS[4]);
  const [alignment, setAlignment] = useState(existingPc?.alignment || 'Neutral Good');

  const [className, setClassName] = useState(existingPc?.classes?.[0]?.name || 'Fighter');
  const [subclass, setSubclass] = useState(existingPc?.classes?.[0]?.subclass || '');
  const [startLevel, setStartLevel] = useState<number>(1);

  const [abilityMethod, setAbilityMethod] = useState<AbilityMethod>('standard');
  const [abilities, setAbilities] = useState<Record<AbilityName, number>>({
    STR: 15,
    DEX: 14,
    CON: 13,
    INT: 12,
    WIS: 10,
    CHA: 8,
  });
  const [rolledArray, setRolledArray] = useState<
    Array<{ rolls: [number, number, number, number]; droppedIndex: number; total: number }>
  >([]);

  const selectedClassDef = useMemo(
    () => SRD_CLASSES.find((c) => c.name === className) ?? SRD_CLASSES[4],
    [className]
  );

  const [selectedSkills, setSelectedSkills] = useState<SkillName[]>([
    'Perception',
    'Athletics',
  ]);
  const [customEquipmentText, setCustomEquipmentText] = useState('');
  const [customSpellsText, setCustomSpellsText] = useState('');

  // ---- Level-Up Mode State ----
  const [levelUpClass, setLevelUpClass] = useState(
    existingPc?.classes?.[0]?.name || 'Fighter'
  );
  const [levelUpSubclass, setLevelUpSubclass] = useState(
    existingPc?.classes?.[0]?.subclass || ''
  );
  const [hpGainMethod, setHpGainMethod] = useState<'fixed' | 'roll'>('fixed');
  const [rolledHitDie, setRolledHitDie] = useState<number | null>(null);
  const [asiMode, setAsiMode] = useState<'none' | 'asi' | 'feat'>('none');
  const [asiAbility1, setAsiAbility1] = useState<AbilityName>('STR');
  const [asiAbility2, setAsiAbility2] = useState<AbilityName>('CON');
  const [selectedFeat, setSelectedFeat] = useState<string>(SRD_FEATS[0].name);
  const [newSpellInput, setNewSpellInput] = useState<string>('');

  const allSkills = useMemo(() => Object.keys(SKILL_ABILITY) as SkillName[], []);
  const pointBuyRemaining = useMemo(() => computeRemainingPoints(abilities), [abilities]);

  const handleRollAll4d6 = () => {
    const results = ABILITY_NAMES.map(() => roll4d6DropLowest());
    setRolledArray(results);
    const next: Record<AbilityName, number> = { ...abilities };
    ABILITY_NAMES.forEach((ab, idx) => {
      next[ab] = results[idx].total;
    });
    setAbilities(next);
  };

  const toggleSkill = (skill: SkillName) => {
    setSelectedSkills((prev) =>
      prev.includes(skill) ? prev.filter((s) => s !== skill) : [...prev, skill]
    );
  };

  const handleFinishCreate = () => {
    const eqList = customEquipmentText.trim()
      ? customEquipmentText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : selectedClassDef.startingEquipment;
    const spList = customSpellsText.trim()
      ? customSpellsText
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : selectedClassDef.startingSpells ?? [];

    const created = buildNewCharacterFromWizard({
      id: existingPc?.id,
      name: name.trim() || 'Adventurer',
      player: playerName.trim() || undefined,
      race,
      background,
      alignment,
      className,
      subclass: subclass.trim() || undefined,
      level: startLevel,
      abilities,
      savingThrows: [...selectedClassDef.primarySaves],
      skills: selectedSkills,
      equipmentNames: eqList,
      spellsKnown: spList,
      ownership: existingPc?.ownership,
    });
    emitSavedPc(created);
  };

  const handleFinishLevelUp = () => {
    if (!existingPc) return;
    const bonuses: Partial<Record<AbilityName, number>> = {};
    if (asiMode === 'asi') {
      bonuses[asiAbility1] = (bonuses[asiAbility1] ?? 0) + 1;
      bonuses[asiAbility2] = (bonuses[asiAbility2] ?? 0) + 1;
    }
    const newSpells = newSpellInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const updated = applyLevelUpWizardTransition(existingPc, {
      targetClassName: levelUpClass,
      subclass: levelUpSubclass.trim() || undefined,
      hpGainMethod,
      rolledHitDieValue: rolledHitDie ?? undefined,
      asiOrFeatChoice:
        asiMode === 'asi'
          ? { type: 'asi', bonuses }
          : asiMode === 'feat'
            ? { type: 'feat', featName: selectedFeat }
            : { type: 'none' },
      newSpellsLearned: newSpells,
    });
    emitSavedPc(updated);
  };

  if (open === false || isOpen === false) {
    return null;
  }

  if ((mode === 'levelup' || mode === 'levelUp') && existingPc) {
    const nextLevel = Math.min(20, (existingPc.level || 1) + 1);
    const hitDie = getDefaultHitDieForClass(levelUpClass);
    const fixedAvg = getFixedHpAverageForHitDie(hitDie);
    const conMod = abilityMod(existingPc.abilities?.CON ?? 10);
    const damageTaken = Math.max(0, (existingPc.hp?.max ?? 0) - (existingPc.hp?.current ?? 0));

    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
        <div
          className="w-full max-w-xl rounded-xl border border-amber-500/30 bg-zinc-900 p-5 text-zinc-100 shadow-2xl max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-amber-400" />
              <h2 className="text-lg font-bold text-amber-200">
                Level Up Wizard: {existingPc.name || 'Character'} (Lv {existingPc.level} → Lv {nextLevel})
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-4 text-sm">
            {/* Step 1: Class & Multiclass */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-amber-400">
                1. Class Progression (Single-Class or Multiclass)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Class Gaining +1 Level</label>
                  <select
                    value={levelUpClass}
                    onChange={(e) => setLevelUpClass(e.target.value)}
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-100"
                  >
                    {SRD_CLASSES.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.name} (d{c.hitDie})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-zinc-400 mb-1">Subclass / Archetype</label>
                  <input
                    type="text"
                    value={levelUpSubclass}
                    onChange={(e) => setLevelUpSubclass(e.target.value)}
                    placeholder="e.g. Battle Master, College of Lore"
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-100"
                  />
                </div>
              </div>
            </div>

            {/* Step 2: Hit Points Increase */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                2. Hit Point Increase (d{hitDie} + CON {conMod >= 0 ? `+${conMod}` : conMod})
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setHpGainMethod('fixed')}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    hpGainMethod === 'fixed'
                      ? 'border-emerald-500/60 bg-emerald-950/50 text-emerald-200'
                      : 'border-zinc-700 bg-zinc-900 text-zinc-300'
                  }`}
                >
                  Fixed Average: +{Math.max(1, fixedAvg + conMod)} HP ({fixedAvg} + {conMod})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setHpGainMethod('roll');
                    const r = Math.floor(Math.random() * hitDie) + 1;
                    setRolledHitDie(r);
                  }}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    hpGainMethod === 'roll'
                      ? 'border-amber-500/60 bg-amber-950/50 text-amber-200'
                      : 'border-zinc-700 bg-zinc-900 text-zinc-300'
                  }`}
                >
                  <Dices className="h-3.5 w-3.5" />
                  Roll 1d{hitDie}
                  {rolledHitDie !== null
                    ? `: Rolled ${rolledHitDie} (+${Math.max(1, rolledHitDie + conMod)} HP)`
                    : ''}
                </button>
              </div>
              {damageTaken > 0 && (
                <p className="text-[11px] text-zinc-400">
                  Mid-session state preserved: your current {damageTaken} damage taken, Temp HP, active conditions, and spent spell slots remain intact.
                </p>
              )}
            </div>

            {/* Step 3: ASI / Feat Picker */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
                3. Ability Score Improvement (ASI) or Feat
              </div>
              <div className="flex gap-2">
                {(['none', 'asi', 'feat'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setAsiMode(m)}
                    className={`rounded border px-2.5 py-1 text-xs font-medium ${
                      asiMode === m
                        ? 'border-indigo-500 bg-indigo-950/50 text-indigo-200'
                        : 'border-zinc-700 bg-zinc-900 text-zinc-400'
                    }`}
                  >
                    {m === 'none' ? 'No ASI this Level' : m === 'asi' ? '+2 / +1/+1 ASI' : 'Pick a Feat'}
                  </button>
                ))}
              </div>

              {asiMode === 'asi' && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">+1 Ability A</label>
                    <select
                      value={asiAbility1}
                      onChange={(e) => setAsiAbility1(e.target.value as AbilityName)}
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                    >
                      {ABILITY_NAMES.map((ab) => (
                        <option key={ab} value={ab}>
                          {ab} (Currently {existingPc.abilities[ab]})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">+1 Ability B</label>
                    <select
                      value={asiAbility2}
                      onChange={(e) => setAsiAbility2(e.target.value as AbilityName)}
                      className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs"
                    >
                      {ABILITY_NAMES.map((ab) => (
                        <option key={ab} value={ab}>
                          {ab} (Currently {existingPc.abilities[ab]})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {asiMode === 'feat' && (
                <div className="pt-1 space-y-1.5">
                  <select
                    value={selectedFeat}
                    onChange={(e) => setSelectedFeat(e.target.value)}
                    className="w-full rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs"
                  >
                    {SRD_FEATS.map((f) => (
                      <option key={f.name} value={f.name}>
                        {f.name} — {f.description}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Step 4: Newly Unlocked Spells */}
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-purple-400">
                4. Newly Unlocked Spells & Class Pools
              </div>
              <p className="text-xs text-zinc-400">
                Spell slots and class resource pools for Level {nextLevel} will be automatically unlocked and scaled.
              </p>
              <input
                type="text"
                value={newSpellInput}
                onChange={(e) => setNewSpellInput(e.target.value)}
                placeholder="Add new spells (comma-separated, e.g. Fireball (Lv 3), Haste [C] (Lv 3))"
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs text-zinc-100"
              />
            </div>
          </div>

          <div className="mt-5 flex items-center justify-end gap-2 border-t border-zinc-800 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleFinishLevelUp}
              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-1.5 text-xs font-bold text-zinc-950 hover:bg-amber-400"
            >
              <Check className="h-3.5 w-3.5" />
              Commit Level {nextLevel}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ---- Create Character Guided Multi-Step Modal ----
  const steps = [
    '1. Identity',
    '2. Class & Level',
    '3. Ability Scores',
    '4. Proficiencies',
    '5. Gear & Spells',
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl rounded-xl border border-indigo-500/30 bg-zinc-900 p-5 text-zinc-100 shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 pb-3 mb-4">
          <div className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-zinc-100">Guided Character Builder</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Stepper Indicator */}
        <div className="mb-4 flex flex-wrap gap-1.5">
          {steps.map((label, idx) => (
            <button
              key={label}
              type="button"
              onClick={() => setStep(idx)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                step === idx
                  ? 'bg-indigo-600 text-white'
                  : idx < step
                    ? 'bg-indigo-950/60 text-indigo-300 border border-indigo-500/30'
                    : 'bg-zinc-800 text-zinc-400'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Step 0: Identity, Species, Background */}
        {step === 0 && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Character Name *</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Seraphina Vance"
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Player Name</label>
                <input
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Species / Ancestry</label>
                <select
                  value={race}
                  onChange={(e) => setRace(e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-sm text-zinc-100"
                >
                  {SRD_SPECIES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Background</label>
                <select
                  value={background}
                  onChange={(e) => setBackground(e.target.value)}
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-sm text-zinc-100"
                >
                  {SRD_BACKGROUNDS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Alignment</label>
                <input
                  type="text"
                  value={alignment}
                  onChange={(e) => setAlignment(e.target.value)}
                  placeholder="Neutral Good"
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-sm text-zinc-100"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 1: Class & Level */}
        {step === 1 && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Class</label>
                <select
                  value={className}
                  onChange={(e) => {
                    setClassName(e.target.value);
                    const found = SRD_CLASSES.find((c) => c.name === e.target.value);
                    setSubclass(found?.defaultSubclasses[0] ?? '');
                  }}
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-sm text-zinc-100"
                >
                  {SRD_CLASSES.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name} (Hit Die d{c.hitDie})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Subclass / Archetype</label>
                <input
                  type="text"
                  value={subclass}
                  onChange={(e) => setSubclass(e.target.value)}
                  placeholder={selectedClassDef.defaultSubclasses[0]}
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-sm text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-xs text-zinc-400 mb-1">Starting Level (1–20)</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={startLevel}
                  onChange={(e) =>
                    setStartLevel(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)))
                  }
                  className="w-full rounded border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-sm text-zinc-100"
                />
              </div>
            </div>
            <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 text-xs text-zinc-300 space-y-1">
              <div>
                <span className="font-semibold text-indigo-300">{selectedClassDef.name}</span> — Hit Die:{' '}
                <span className="font-mono text-zinc-100">d{selectedClassDef.hitDie}</span> | Saving Throws:{' '}
                <span className="font-mono text-zinc-100">{selectedClassDef.primarySaves.join(', ')}</span>
              </div>
              <div>
                Suggested Archetypes: {selectedClassDef.defaultSubclasses.join(' • ')}
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Ability Scores */}
        {step === 2 && (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap gap-2">
              {(
                [
                  ['standard', 'Standard Array (15,14,13,12,10,8)'],
                  ['pointbuy', `27-Point Buy (${pointBuyRemaining}/${POINT_BUY_BUDGET} left)`],
                  ['roll4d6', '4d6 Drop Lowest Roller'],
                  ['manual', 'Manual Entry'],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setAbilityMethod(key);
                    if (key === 'standard') {
                      setAbilities({ STR: 15, DEX: 14, CON: 13, INT: 12, WIS: 10, CHA: 8 });
                    } else if (key === 'pointbuy') {
                      setAbilities({ STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 });
                    }
                  }}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                    abilityMethod === key
                      ? 'border-indigo-500 bg-indigo-950/60 text-indigo-200'
                      : 'border-zinc-700 bg-zinc-950 text-zinc-400'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {abilityMethod === 'roll4d6' && (
              <div className="flex items-center justify-between rounded-lg border border-amber-500/30 bg-amber-950/20 p-2.5 text-xs">
                <div className="text-amber-200">
                  Roll 6 sets of <span className="font-mono">4d6kh3</span> and assign them to your abilities.
                </div>
                <button
                  type="button"
                  onClick={handleRollAll4d6}
                  className="inline-flex items-center gap-1.5 rounded bg-amber-500 px-3 py-1 font-bold text-zinc-950 hover:bg-amber-400"
                >
                  <Dices className="h-3.5 w-3.5" />
                  Roll 4d6 Drop Lowest
                </button>
              </div>
            )}

            {rolledArray.length > 0 && abilityMethod === 'roll4d6' && (
              <div className="flex flex-wrap gap-2 text-xs">
                {rolledArray.map((r, i) => (
                  <span
                    key={i}
                    className="rounded border border-zinc-700 bg-zinc-950 px-2 py-1 font-mono text-zinc-200"
                  >
                    [{r.rolls.map((d, di) => (di === r.droppedIndex ? `(${d})` : d)).join(', ')}] ={' '}
                    <strong className="text-amber-300">{r.total}</strong>
                  </span>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
              {ABILITY_NAMES.map((ab) => {
                const score = abilities[ab] ?? 10;
                const mod = abilityMod(score);
                return (
                  <div
                    key={ab}
                    className="rounded-lg border border-zinc-800 bg-zinc-950 p-2.5 text-center space-y-1.5"
                  >
                    <div className="text-xs font-bold text-zinc-400">{ab}</div>
                    {abilityMethod === 'pointbuy' ? (
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          disabled={score <= POINT_BUY_MIN_SCORE}
                          onClick={() =>
                            setAbilities((prev) => ({
                              ...prev,
                              [ab]: Math.max(POINT_BUY_MIN_SCORE, score - 1),
                            }))
                          }
                          className="h-6 w-6 rounded bg-zinc-800 text-xs font-bold disabled:opacity-40"
                        >
                          -
                        </button>
                        <span className="font-mono text-base font-bold text-zinc-100">{score}</span>
                        <button
                          type="button"
                          disabled={
                            score >= POINT_BUY_MAX_SCORE || !canAdjustScore(abilities, ab, 1)
                          }
                          onClick={() =>
                            setAbilities((prev) => ({
                              ...prev,
                              [ab]: Math.min(POINT_BUY_MAX_SCORE, score + 1),
                            }))
                          }
                          className="h-6 w-6 rounded bg-zinc-800 text-xs font-bold disabled:opacity-40"
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <input
                        type="number"
                        min={1}
                        max={30}
                        value={score}
                        onChange={(e) =>
                          setAbilities((prev) => ({
                            ...prev,
                            [ab]: Math.max(1, Math.min(30, parseInt(e.target.value, 10) || 10)),
                          }))
                        }
                        className="w-full rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-center font-mono text-base font-bold text-zinc-100"
                      />
                    )}
                    <div className="text-xs font-mono text-indigo-300">
                      {mod >= 0 ? `+${mod}` : mod}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Step 3: Skill & Save Proficiencies */}
        {step === 3 && (
          <div className="space-y-3 text-sm">
            <div className="text-xs text-zinc-400">
              Saving Throw Proficiencies ({selectedClassDef.name}):{' '}
              <span className="font-semibold text-zinc-200">
                {selectedClassDef.primarySaves.join(', ')}
              </span>
            </div>
            <div>
              <div className="text-xs font-semibold text-zinc-300 mb-2">
                Select Skill Proficiencies ({selectedSkills.length} selected)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-56 overflow-y-auto pr-1">
                {allSkills.map((skill) => {
                  const active = selectedSkills.includes(skill);
                  return (
                    <button
                      key={skill}
                      type="button"
                      onClick={() => toggleSkill(skill)}
                      className={`flex items-center justify-between rounded border px-2.5 py-1.5 text-left text-xs transition ${
                        active
                          ? 'border-indigo-500/60 bg-indigo-950/50 text-indigo-200 font-medium'
                          : 'border-zinc-800 bg-zinc-950 text-zinc-400 hover:border-zinc-700'
                      }`}
                    >
                      <span>{skill}</span>
                      <span className="text-[10px] opacity-70">{SKILL_ABILITY[skill]}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Starting Equipment & Spells */}
        {step === 4 && (
          <div className="space-y-3 text-sm">
            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Starting Equipment (leave blank to use {selectedClassDef.name} package)
              </label>
              <input
                type="text"
                value={customEquipmentText}
                onChange={(e) => setCustomEquipmentText(e.target.value)}
                placeholder={selectedClassDef.startingEquipment.join(', ')}
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">
                Known / Prepared Spells (comma-separated; tag [C] for Concentration)
              </label>
              <input
                type="text"
                value={customSpellsText}
                onChange={(e) => setCustomSpellsText(e.target.value)}
                placeholder={
                  (selectedClassDef.startingSpells ?? []).join(', ') ||
                  'e.g. Bless [C] (Lv 1), Healing Word (Lv 1)'
                }
                className="w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-100"
              />
            </div>
            <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-3 text-xs text-emerald-200 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                Ready to Evaluate & Save
              </div>
              <div>
                {name.trim() || 'Adventurer'} • Lv {startLevel} {race} {className} ({background})
              </div>
            </div>
          </div>
        )}

        {/* Footer Navigation */}
        <div className="mt-5 flex items-center justify-between border-t border-zinc-800 pt-3">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            className="inline-flex items-center gap-1 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-zinc-800 disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <div className="flex items-center gap-2">
            {step < steps.length - 1 ? (
              <button
                type="button"
                onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))}
                className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
              >
                Next
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleFinishCreate}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-4 py-1.5 text-xs font-bold text-zinc-950 hover:bg-emerald-400"
              >
                <Shield className="h-3.5 w-3.5" />
                Create Character
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default CharacterWizardModal;

