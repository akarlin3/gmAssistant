import {
  ABILITY_NAMES,
  SPELL_SLOT_LEVELS,
  type AbilityName,
  type PactMagicSlots,
  type PartyRole,
  type PcAuditNote,
  type PcClass,
  type PcDefensiveProfile,
  type PcDerivedStats,
  type PcEvaluation,
  type PcResourcePool,
  type PlayerCharacter,
  type SkillName,
  type SpellSlot,
  type SpellSlotLevel,
} from './pc/types';
import { emptyPc, makePcId, normalizePc } from './pc/factory';
import { abilityMod, proficiencyBonusForLevel, savingThrowBonus } from './pc/derived';
import { SKILL_ABILITIES } from './pc/skills';

// Standard 5e Full-Caster Spell Slot Table (Levels 1-20)
const FULL_CASTER_SLOTS: Record<number, number[]> = {
  1: [2],
  2: [3],
  3: [4, 2],
  4: [4, 3],
  5: [4, 3, 2],
  6: [4, 3, 3],
  7: [4, 3, 3, 1],
  8: [4, 3, 3, 2],
  9: [4, 3, 3, 3, 1],
  10: [4, 3, 3, 3, 2],
  11: [4, 3, 3, 3, 2, 1],
  12: [4, 3, 3, 3, 2, 1],
  13: [4, 3, 3, 3, 2, 1, 1],
  14: [4, 3, 3, 3, 2, 1, 1],
  15: [4, 3, 3, 3, 2, 1, 1, 1],
  16: [4, 3, 3, 3, 2, 1, 1, 1],
  17: [4, 3, 3, 3, 2, 1, 1, 1, 1],
  18: [4, 3, 3, 3, 3, 1, 1, 1, 1],
  19: [4, 3, 3, 3, 3, 2, 1, 1, 1],
  20: [4, 3, 3, 3, 3, 2, 2, 1, 1],
};

// Warlock Pact Magic Table (Levels 1-20 -> { slots, level })
const WARLOCK_PACT_TABLE: Record<number, { max: number; level: SpellSlotLevel }> = {
  1: { max: 1, level: 1 },
  2: { max: 2, level: 1 },
  3: { max: 2, level: 2 },
  4: { max: 2, level: 2 },
  5: { max: 2, level: 3 },
  6: { max: 2, level: 3 },
  7: { max: 2, level: 4 },
  8: { max: 2, level: 4 },
  9: { max: 2, level: 5 },
  10: { max: 2, level: 5 },
  11: { max: 3, level: 5 },
  12: { max: 3, level: 5 },
  13: { max: 3, level: 5 },
  14: { max: 3, level: 5 },
  15: { max: 3, level: 5 },
  16: { max: 3, level: 5 },
  17: { max: 4, level: 5 },
  18: { max: 4, level: 5 },
  19: { max: 4, level: 5 },
  20: { max: 4, level: 5 },
};

const CLASS_HIT_DIE: Record<string, number> = {
  barbarian: 12,
  fighter: 10,
  paladin: 10,
  ranger: 10,
  artificer: 8,
  bard: 8,
  cleric: 8,
  druid: 8,
  monk: 8,
  rogue: 8,
  warlock: 8,
  sorcerer: 6,
  wizard: 6,
};

const CLASS_SAVING_THROWS: Record<string, [AbilityName, AbilityName]> = {
  barbarian: ['STR', 'CON'],
  bard: ['DEX', 'CHA'],
  cleric: ['WIS', 'CHA'],
  druid: ['INT', 'WIS'],
  fighter: ['STR', 'CON'],
  monk: ['STR', 'DEX'],
  paladin: ['WIS', 'CHA'],
  ranger: ['STR', 'DEX'],
  rogue: ['DEX', 'INT'],
  sorcerer: ['CON', 'CHA'],
  warlock: ['WIS', 'CHA'],
  wizard: ['INT', 'WIS'],
  artificer: ['CON', 'INT'],
};

const CLASS_SPELLCASTING_ABILITY: Record<string, AbilityName> = {
  bard: 'CHA',
  cleric: 'WIS',
  druid: 'WIS',
  paladin: 'CHA',
  ranger: 'WIS',
  sorcerer: 'CHA',
  warlock: 'CHA',
  wizard: 'INT',
  artificer: 'INT',
};

const KNOWN_CONCENTRATION_SPELLS = new Set([
  'bane',
  'banishment',
  'Barkskin'.toLowerCase(),
  'bless',
  'blur',
  'call lightning',
  'cloud of daggers',
  'confusion',
  'conjure animals',
  'conjure elemental',
  'conjure woodland beings',
  'Compelled Duel'.toLowerCase(),
  'darkness',
  'detect magic',
  'enhance ability',
  'entangle',
  'faerie fire',
  'fear',
  'flaming sphere',
  'fly',
  'fog cloud',
  'globe of invulnerability',
  'greater invisibility',
  'guidance',
  'haste',
  'heat metal',
  'heroism',
  'hex',
  'hold monster',
  'hold person',
  "hunter's mark",
  'hunters mark',
  'hypnotic pattern',
  'invisibility',
  'levitate',
  'moonbeam',
  'pass without trace',
  'polymorph',
  'protection from evil and good',
  'shield of faith',
  'silence',
  'slow',
  'spike growth',
  'spirit guardians',
  'spiritual weapon', // 2024 rules
  'suggestion',
  'sunbeam',
  'telekinesis',
  'vampiric touch',
  'wall of fire',
  'wall of force',
  'wall of stone',
  'web',
  'witch bolt',
]);

export type EvaluatedPlayerCharacter = PlayerCharacter & {
  pc: EvaluatedPlayerCharacter;
  evaluation: PcEvaluation;
  derivedStats: PcDerivedStats;
  spellSlots: NonNullable<PlayerCharacter['spellSlots']> & {
    some: (predicate: (slot: { level: number; max: number; used: number }) => boolean) => boolean;
    find: (predicate: (slot: { level: number; max: number; used: number }) => boolean) => { level: number; max: number; used: number } | undefined;
    map: <T>(fn: (slot: { level: number; max: number; used: number }) => T) => T[];
    filter: (predicate: (slot: { level: number; max: number; used: number }) => boolean) => Array<{ level: number; max: number; used: number }>;
  };
  resourcePools: PcResourcePool[];
  currency: NonNullable<PlayerCharacter['currency']>;
  spellsKnown: string[];
  // Flat convenience aliases for callers/tests
  currentHp: number;
  maxHp: number;
  tempHp: number;
  abilityModifiers: Record<AbilityName, number>;
  passivePerception: number;
  passiveInvestigation: number;
  passiveInsight: number;
  spellSaveDc: number | null;
  spellAttackBonus: number | null;
  carryingCapacity: number;
};

function normalizeClassKey(name: string): string {
  return name.trim().toLowerCase();
}

function parseClassString(rawClass: string, fallbackLevel = 1): PcClass[] {
  if (!rawClass || !rawClass.trim()) return [];
  const parts = rawClass
    .split(/[/|,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const out: PcClass[] = [];
  for (const part of parts) {
    // Match e.g. "Fighter (Battle Master) 5" or "Paladin 6" or "Level 3 Rogue"
    const m1 = part.match(/^([A-Za-z\s-]+?)(?:\s*\(([^)]+)\))?\s+(\d{1,2})$/);
    if (m1) {
      out.push({
        name: m1[1].trim(),
        ...(m1[2] ? { subclass: m1[2].trim() } : {}),
        level: Math.max(1, Math.min(20, parseInt(m1[3], 10))),
      });
      continue;
    }
    const m2 = part.match(/^(?:Lv\.?|Level)\s*(\d{1,2})\s+([A-Za-z\s-]+?)(?:\s*\(([^)]+)\))?$/i);
    if (m2) {
      out.push({
        name: m2[2].trim(),
        ...(m2[3] ? { subclass: m2[3].trim() } : {}),
        level: Math.max(1, Math.min(20, parseInt(m2[1], 10))),
      });
      continue;
    }
    const m3 = part.match(/^([A-Za-z\s-]+?)(?:\s*\(([^)]+)\))?$/);
    if (m3) {
      out.push({
        name: m3[1].trim(),
        ...(m3[2] ? { subclass: m3[2].trim() } : {}),
        level: Math.max(1, Math.min(20, fallbackLevel)),
      });
    }
  }
  return out;
}

function computeSkillBonusWithExpertise(
  pc: PlayerCharacter,
  skill: SkillName,
): number {
  const ability = SKILL_ABILITIES[skill];
  const mod = abilityMod(pc.abilities[ability]);
  const isProficient = pc.proficiencies.skills.includes(skill);
  const isExpert = (pc.skillExpertise ?? []).includes(skill);
  if (isExpert) return mod + pc.proficiencyBonus * 2;
  if (isProficient) return mod + pc.proficiencyBonus;
  // Check Jack of All Trades (Bard 2+)
  const bardLevel = pc.classes
    .filter((c) => normalizeClassKey(c.name).includes('bard'))
    .reduce((acc, c) => acc + c.level, 0);
  if (bardLevel >= 2) {
    return mod + Math.floor(pc.proficiencyBonus / 2);
  }
  return mod;
}

function inferSpellcastingAbility(pc: PlayerCharacter): AbilityName | undefined {
  if (pc.spellcastingAbility && ABILITY_NAMES.includes(pc.spellcastingAbility)) {
    return pc.spellcastingAbility;
  }
  for (const cls of pc.classes) {
    const key = normalizeClassKey(cls.name);
    for (const [k, ab] of Object.entries(CLASS_SPELLCASTING_ABILITY)) {
      if (key.includes(k)) return ab;
    }
    const sub = (cls.subclass ?? '').toLowerCase();
    if (sub.includes('eldritch knight') || sub.includes('arcane trickster')) {
      return 'INT';
    }
  }
  if ((pc.spellsKnown && pc.spellsKnown.length > 0) || (pc.spellSlots && Object.keys(pc.spellSlots).length > 0)) {
    // Pick highest mental stat
    const mentals: AbilityName[] = ['INT', 'WIS', 'CHA'];
    return mentals.reduce((best, cur) =>
      pc.abilities[cur] > pc.abilities[best] ? cur : best,
    );
  }
  return undefined;
}

export function synthesizeSpellSlotsForClasses(
  classes: PcClass[],
): {
  spellSlots?: Partial<Record<SpellSlotLevel, SpellSlot>>;
  pactSlots?: PactMagicSlots;
} {
  let effectiveCasterLevel = 0;
  let singleClassCasterType: 'full' | 'half' | 'third' | 'artificer' | null = null;
  let casterClassCount = 0;
  let warlockLevel = 0;

  for (const cls of classes) {
    const key = normalizeClassKey(cls.name);
    const sub = (cls.subclass ?? '').toLowerCase();
    const lvl = Math.max(1, Math.min(20, cls.level || 1));

    if (key.includes('warlock')) {
      warlockLevel += lvl;
      continue;
    }

    if (
      key.includes('bard') ||
      key.includes('cleric') ||
      key.includes('druid') ||
      key.includes('sorcerer') ||
      key.includes('wizard')
    ) {
      effectiveCasterLevel += lvl;
      singleClassCasterType = 'full';
      casterClassCount++;
    } else if (key.includes('artificer')) {
      effectiveCasterLevel += Math.ceil(lvl / 2);
      singleClassCasterType = 'artificer';
      casterClassCount++;
    } else if (key.includes('paladin') || key.includes('ranger')) {
      if (lvl >= 2) {
        effectiveCasterLevel += Math.floor(lvl / 2);
        singleClassCasterType = 'half';
        casterClassCount++;
      }
    } else if (
      sub.includes('eldritch knight') ||
      sub.includes('arcane trickster')
    ) {
      if (lvl >= 3) {
        effectiveCasterLevel += Math.floor(lvl / 3);
        singleClassCasterType = 'third';
        casterClassCount++;
      }
    }
  }

  // Single-class half/third caster rounding adjustments per 5e rules
  if (casterClassCount === 1 && classes.length === 1) {
    const lvl = classes[0].level;
    if (singleClassCasterType === 'half' && lvl >= 2) {
      effectiveCasterLevel = Math.ceil(lvl / 2);
    } else if (singleClassCasterType === 'third' && lvl >= 3) {
      effectiveCasterLevel = Math.ceil(lvl / 3);
    }
  }

  effectiveCasterLevel = Math.min(20, effectiveCasterLevel);
  const slotCounts = effectiveCasterLevel > 0 ? FULL_CASTER_SLOTS[effectiveCasterLevel] : undefined;
  let spellSlots: Partial<Record<SpellSlotLevel, SpellSlot>> | undefined;

  if (slotCounts && slotCounts.length > 0) {
    spellSlots = {};
    slotCounts.forEach((max, idx) => {
      const slotLevel = (idx + 1) as SpellSlotLevel;
      if (max > 0 && SPELL_SLOT_LEVELS.includes(slotLevel)) {
        spellSlots![slotLevel] = { max, used: 0 };
      }
    });
  }

  let pactSlots: PactMagicSlots | undefined;
  if (warlockLevel > 0) {
    const clampedWarlock = Math.min(20, warlockLevel);
    const entry = WARLOCK_PACT_TABLE[clampedWarlock];
    if (entry) {
      pactSlots = { level: entry.level, max: entry.max, used: 0 };
    }
  }

  return { spellSlots, pactSlots };
}

export function synthesizeClassResourcePools(
  pc: PlayerCharacter,
): PcResourcePool[] {
  const existingPools = Array.isArray(pc.resourcePools) ? [...pc.resourcePools] : [];
  const byNormName = new Map<string, PcResourcePool>();
  for (const pool of existingPools) {
    byNormName.set(pool.name.trim().toLowerCase(), pool);
  }

  const ensurePool = (
    id: string,
    name: string,
    max: number,
    rechargeOn: PcResourcePool['rechargeOn'],
    initialCurrent?: number,
  ) => {
    if (max <= 0) return;
    const norm = name.trim().toLowerCase();
    const existing = byNormName.get(norm) || existingPools.find((p) => p.id === id);
    if (existing) {
      if (existing.max <= 0) {
        existing.max = max;
        existing.current = initialCurrent ?? max;
      }
      return;
    }
    const created: PcResourcePool = {
      id,
      name,
      current: initialCurrent !== undefined ? Math.max(0, Math.min(max, initialCurrent)) : max,
      max,
      rechargeOn,
    };
    existingPools.push(created);
    byNormName.set(norm, created);
  };

  for (const cls of pc.classes) {
    const key = normalizeClassKey(cls.name);
    const lvl = Math.max(1, Math.min(20, cls.level || 1));

    if (key.includes('fighter')) {
      ensurePool('res-second-wind', 'Second Wind', 1, 'short');
      if (lvl >= 2) {
        ensurePool('res-action-surge', 'Action Surge', lvl >= 17 ? 2 : 1, 'short');
      }
      if (lvl >= 9) {
        const indom = lvl >= 17 ? 3 : lvl >= 13 ? 2 : 1;
        ensurePool('res-indomitable', 'Indomitable', indom, 'long');
      }
    }

    if (key.includes('barbarian')) {
      const rages =
        lvl >= 20 ? 99 : lvl >= 17 ? 6 : lvl >= 12 ? 5 : lvl >= 6 ? 4 : lvl >= 3 ? 3 : 2;
      ensurePool('res-rage', 'Rage', rages, 'long');
    }

    if (key.includes('monk') && lvl >= 2) {
      ensurePool('res-focus-points', 'Focus / Ki Points', lvl, 'short');
    }

    if (key.includes('bard')) {
      const chaMod = Math.max(1, abilityMod(pc.abilities.CHA));
      ensurePool(
        'res-bardic-inspiration',
        'Bardic Inspiration',
        chaMod,
        lvl >= 5 ? 'short' : 'long',
      );
    }

    if (key.includes('cleric') && lvl >= 2) {
      const cdMax = lvl >= 18 ? 3 : lvl >= 6 ? 2 : 1;
      ensurePool('res-channel-divinity', 'Channel Divinity', cdMax, 'short');
    }

    if (key.includes('paladin')) {
      ensurePool('res-lay-on-hands', 'Lay on Hands', lvl * 5, 'long');
      if (lvl >= 3) {
        ensurePool('res-channel-divinity', 'Channel Divinity', 1, 'short');
      }
    }

    if (key.includes('wizard')) {
      ensurePool('res-arcane-recovery', 'Arcane Recovery', 1, 'long');
    }

    if (key.includes('sorcerer') && lvl >= 2) {
      ensurePool('res-sorcery-points', 'Sorcery Points', lvl, 'long');
    }

    if (key.includes('druid') && lvl >= 2) {
      ensurePool('res-wild-shape', 'Wild Shape', 2, 'short');
    }
  }

  // Also check explicit feature names for any resources if class wasn't matched or from feats
  for (const feat of pc.features) {
    const fName = feat.name.trim();
    const fLower = fName.toLowerCase();
    if (feat.uses && feat.uses.max > 0) {
      ensurePool(
        `res-feat-${fLower.replace(/[^a-z0-9]+/g, '-')}`,
        fName,
        feat.uses.max,
        feat.uses.refresh === 'short' ? 'short' : 'long',
        Math.max(0, feat.uses.max - (feat.uses.used || 0)),
      );
    } else if (fLower.includes('action surge')) {
      ensurePool('res-action-surge', 'Action Surge', 1, 'short');
    } else if (fLower.includes('second wind')) {
      ensurePool('res-second-wind', 'Second Wind', 1, 'short');
    } else if (fLower === 'rage' || fLower.startsWith('rage ')) {
      ensurePool('res-rage', 'Rage', 2, 'long');
    } else if (fLower.includes('ki points') || fLower.includes('focus points') || fLower === 'ki') {
      ensurePool('res-focus-points', 'Focus / Ki Points', Math.max(2, pc.level), 'short');
    } else if (fLower.includes('bardic inspiration')) {
      ensurePool('res-bardic-inspiration', 'Bardic Inspiration', Math.max(1, abilityMod(pc.abilities.CHA)), pc.level >= 5 ? 'short' : 'long');
    } else if (fLower.includes('channel divinity')) {
      ensurePool('res-channel-divinity', 'Channel Divinity', 1, 'short');
    } else if (fLower.includes('lay on hands')) {
      ensurePool('res-lay-on-hands', 'Lay on Hands', pc.level * 5, 'long');
    } else if (fLower.includes('arcane recovery')) {
      ensurePool('res-arcane-recovery', 'Arcane Recovery', 1, 'long');
    } else if (fLower.includes('lucky')) {
      ensurePool('res-lucky', 'Luck Points', 3, 'long');
    }
  }

  // Always synthesize Hit Dice pool for unified resource tracking
  const hdMax = Math.max(1, pc.hitDice.max || pc.level || 1);
  const hdCurrent = Math.max(0, hdMax - (pc.hitDice.used || 0));
  ensurePool('res-hit-dice', 'Hit Dice', hdMax, 'long', hdCurrent);

  return existingPools;
}

function evaluatePartyRoles(pc: PlayerCharacter): PartyRole[] {
  const roles = new Set<PartyRole>();
  const classesLower = pc.classes.map((c) => normalizeClassKey(c.name));
  const skills = new Set(pc.proficiencies.skills);
  const spellsLower = (pc.spellsKnown ?? []).map((s) => s.toLowerCase());

  // Frontline: high AC (>=17), high CON/HP, or Barbarian/Fighter/Paladin
  if (
    pc.ac >= 17 ||
    classesLower.some((c) => c.includes('barbarian') || c.includes('fighter') || c.includes('paladin')) ||
    (pc.hp.max >= pc.level * 8 && abilityMod(pc.abilities.CON) >= 2)
  ) {
    roles.add('Frontline');
  }

  // Striker: Rogue, Ranger, Monk, Paladin, Fighter, Warlock, Barbarian, or multiple high-damage attacks
  if (
    classesLower.some((c) =>
      ['rogue', 'ranger', 'monk', 'paladin', 'fighter', 'barbarian', 'warlock'].some((k) =>
        c.includes(k),
      ),
    ) ||
    pc.attacks.length >= 2 ||
    spellsLower.some((s) =>
      ['eldritch blast', 'fireball', 'scorching ray', 'guiding bolt', "hunter's mark", 'hex'].some(
        (k) => s.includes(k),
      ),
    )
  ) {
    roles.add('Striker');
  }

  // Controller: Wizard, Sorcerer, Druid, Bard, or control spells
  if (
    classesLower.some((c) =>
      ['wizard', 'druid', 'sorcerer'].some((k) => c.includes(k)),
    ) ||
    spellsLower.some((s) =>
      [
        'web',
        'entangle',
        'hypnotic pattern',
        'hold person',
        'counterspell',
        'banishment',
        'wall of force',
        'slow',
        'spike growth',
        'faerie fire',
      ].some((k) => s.includes(k)),
    )
  ) {
    roles.add('Controller');
  }

  // Support: Cleric, Bard, Druid, Paladin, Artificer, or healing/buff spells
  if (
    classesLower.some((c) =>
      ['cleric', 'bard', 'druid', 'paladin', 'artificer'].some((k) => c.includes(k)),
    ) ||
    spellsLower.some((s) =>
      [
        'healing word',
        'cure wounds',
        'bless',
        'aid',
        'haste',
        'revivify',
        'lesser restoration',
        'shield of faith',
      ].some((k) => s.includes(k)),
    )
  ) {
    roles.add('Support');
  }

  // Utility: Rogue, Bard, Wizard, Artificer, Ranger, or >=4 skill proficiencies / ritual spells
  if (
    classesLower.some((c) =>
      ['rogue', 'bard', 'wizard', 'artificer', 'ranger'].some((k) => c.includes(k)),
    ) ||
    skills.size >= 4 ||
    (pc.proficiencies.tools ?? []).length >= 2
  ) {
    roles.add('Utility');
  }

  // Face: High CHA (mod >= 2) or Persuasion/Deception/Intimidation proficiency
  if (
    abilityMod(pc.abilities.CHA) >= 2 ||
    skills.has('Persuasion') ||
    skills.has('Deception') ||
    skills.has('Intimidation')
  ) {
    roles.add('Face');
  }

  if (roles.size === 0) {
    roles.add('Striker');
  }

  return Array.from(roles);
}

function evaluateDefensiveProfile(pc: PlayerCharacter): PcDefensiveProfile {
  const saveEntries = ABILITY_NAMES.map((ab) => ({
    ability: ab,
    bonus: savingThrowBonus(pc, ab),
  })).sort((a, b) => b.bonus - a.bonus);

  const fmtBonus = (n: number) => (n >= 0 ? `+${n}` : `${n}`);
  const strongestSaves = saveEntries
    .slice(0, 2)
    .map((s) => `${s.ability} ${fmtBonus(s.bonus)}`);
  const weakestSaves = saveEntries
    .slice(-2)
    .reverse()
    .map((s) => `${s.ability} ${fmtBonus(s.bonus)}`);

  const equippedArmor = pc.inventory
    .filter((i) => i.equipped)
    .map((i) => i.name);
  const armorHint =
    equippedArmor.find((n) =>
      /plate|chain|scale|leather|breastplate|mail|hide|shield|robe/i.test(n),
    ) || (abilityMod(pc.abilities.DEX) !== 0 ? `DEX ${fmtBonus(abilityMod(pc.abilities.DEX))}` : 'Base');
  const acSummary = `AC ${pc.ac} (${armorHint})`;

  const resistances = new Set<string>(pc.resistances ?? []);
  const immunities = new Set<string>(pc.immunities ?? []);
  const specialSenses = new Set<string>(pc.senses ?? []);

  const raceLower = (pc.race || '').toLowerCase();
  if (raceLower.includes('tiefling')) {
    resistances.add('Fire');
    specialSenses.add('Darkvision 60 ft.');
  }
  if (raceLower.includes('dwarf')) {
    resistances.add('Poison');
    specialSenses.add('Darkvision 60 ft.');
  }
  if (raceLower.includes('elf') || raceLower.includes('gnome') || raceLower.includes('half-orc')) {
    specialSenses.add(
      raceLower.includes('drow') || raceLower.includes('deep')
        ? 'Superior Darkvision 120 ft.'
        : 'Darkvision 60 ft.',
    );
  }
  if (raceLower.includes('elf')) {
    immunities.add('Magical Sleep');
  }
  if (raceLower.includes('aasimar')) {
    resistances.add('Necrotic');
    resistances.add('Radiant');
    specialSenses.add('Darkvision 60 ft.');
  }
  if (raceLower.includes('dragonborn')) {
    resistances.add('Draconic Ancestry Element');
  }

  for (const feat of pc.features) {
    const text = `${feat.name} ${feat.description}`.toLowerCase();
    if (text.includes('darkvision 120') || text.includes("devil's sight")) {
      specialSenses.add('Darkvision 120 ft.');
    } else if (text.includes('darkvision')) {
      specialSenses.add('Darkvision 60 ft.');
    }
    if (text.includes('blindsight')) specialSenses.add('Blindsight');
    if (text.includes('tremorsense')) specialSenses.add('Tremorsense');
    if (text.includes('truesight')) specialSenses.add('Truesight');
    if (text.includes('purity of body')) {
      immunities.add('Poison');
      immunities.add('Disease');
    }
    if (text.includes('divine health')) {
      immunities.add('Disease');
    }
  }

  return {
    acSummary,
    strongestSaves,
    weakestSaves,
    resistances: Array.from(resistances),
    immunities: Array.from(immunities),
    specialSenses: Array.from(specialSenses),
  };
}

function buildAuditNotes(
  pc: PlayerCharacter,
  rawInput: Record<string, unknown>,
  expectedProfBonus: number,
): PcAuditNote[] {
  const notes: PcAuditNote[] = [];

  // 1. Check Attunement Limit (>3 attuned items)
  const attunedItemsCount = pc.inventory.filter((i) => i.attuned).length;
  const reportedAttuned = typeof rawInput.attunedCount === 'number' ? rawInput.attunedCount : attunedItemsCount;
  const maxAttuned = Math.max(attunedItemsCount, reportedAttuned);
  if (maxAttuned > 3) {
    notes.push({
      id: 'audit-attunement-limit',
      severity: 'warning',
      category: 'attunement',
      message: `Character has ${maxAttuned} attuned items (standard 5e maximum is 3).`,
    });
  }

  // 2. Check Ability Modifier or Proficiency Bonus Math Discrepancies from raw input
  if (rawInput.abilityModifiers && typeof rawInput.abilityModifiers === 'object') {
    const rawMods = rawInput.abilityModifiers as Record<string, unknown>;
    for (const ab of ABILITY_NAMES) {
      if (typeof rawMods[ab] === 'number') {
        const expected = abilityMod(pc.abilities[ab]);
        if (rawMods[ab] !== expected) {
          notes.push({
            id: `audit-mod-${ab.toLowerCase()}`,
            severity: 'warning',
            category: 'math',
            message: `${ab} modifier discrepancy: sheet listed ${rawMods[ab] >= 0 ? `+${rawMods[ab]}` : rawMods[ab]}, but score ${pc.abilities[ab]} yields ${expected >= 0 ? `+${expected}` : expected}.`,
          });
        }
      }
    }
  }

  if (
    typeof rawInput.proficiencyBonus === 'number' &&
    rawInput.proficiencyBonus > 0 &&
    rawInput.proficiencyBonus !== expectedProfBonus
  ) {
    notes.push({
      id: 'audit-proficiency-bonus',
      severity: 'warning',
      category: 'proficiency',
      message: `Proficiency bonus listed as +${rawInput.proficiencyBonus}, auto-corrected to +${expectedProfBonus} for Level ${pc.level}.`,
    });
  }

  // 3. Check AC math discrepancy (e.g. unarmored AC lower than 10 + DEX mod when DEX mod > 0)
  const dexMod = abilityMod(pc.abilities.DEX);
  const hasArmorEquipped = pc.inventory.some(
    (i) => i.equipped && /armor|plate|chain|scale|leather|breastplate|mail|hide/i.test(i.name),
  );
  const unarmoredFloor = 10 + dexMod;
  if (!hasArmorEquipped && pc.ac > 0 && pc.ac < unarmoredFloor) {
    notes.push({
      id: 'audit-ac-math',
      severity: 'warning',
      category: 'math',
      message: `AC (${pc.ac}) is lower than unarmored baseline 10 + DEX (${unarmoredFloor}).`,
    });
  }

  // 4. Check Missing Concentration Tags on known concentration spells
  const untaggedConcSpells: string[] = [];
  for (const spell of pc.spellsKnown ?? []) {
    const clean = spell
      .replace(/\(.*?\)|\[.*?\]/g, '')
      .trim()
      .toLowerCase();
    const hasConcTag = /\(c\)|\[c\]|concentration/i.test(spell);
    if (KNOWN_CONCENTRATION_SPELLS.has(clean) && !hasConcTag) {
      untaggedConcSpells.push(spell);
    }
  }
  if (untaggedConcSpells.length > 0) {
    notes.push({
      id: 'audit-missing-concentration',
      severity: 'info',
      category: 'concentration',
      message: `Concentration spells without (C) tag: ${untaggedConcSpells.join(', ')}.`,
    });
  }

  return notes;
}

/**
 * Automatically evaluates a parsed or edited PC sheet:
 * 1. Computes & backfills derived stats (Ability Modifiers, Proficiency Bonus, Passive Senses, Spell Save DC, Spell Attack Bonus, Initiative, Carrying Capacity).
 * 2. Synthesizes standard & Pact Magic spell slots and trackable class resource pools.
 * 3. Produces a Tactical & Rules Audit (`evaluation`: `partyRoles`, `defensiveProfile`, `auditNotes`).
 */
export function evaluateCharacterSheet(
  inputPc: Partial<PlayerCharacter> | Record<string, unknown>,
): EvaluatedPlayerCharacter {
  const raw = (inputPc ?? {}) as Record<string, unknown>;
  const base = normalizePc({ ...emptyPc(), ...raw });

  // Parse classes if provided as string (e.g. `classLevel: "Fighter 5"` or `class: "Paladin"`)
  let classes = [...base.classes];
  if (classes.length === 0) {
    const rawClassStr =
      typeof raw.classLevel === 'string'
        ? raw.classLevel
        : typeof raw.class === 'string'
          ? raw.class
          : '';
    const rawClassStr2 = typeof raw.classLevel2 === 'string' ? raw.classLevel2 : '';
    const combined = [rawClassStr, rawClassStr2].filter(Boolean).join(' / ');
    if (combined) {
      classes = parseClassString(combined, typeof raw.level === 'number' ? raw.level : 1);
    }
  }

  // Compute total level from classes or explicit level
  const sumClassLevels = classes.reduce((sum, c) => sum + (c.level || 0), 0);
  const totalLevel = Math.max(
    1,
    Math.min(
      20,
      sumClassLevels > 0
        ? Math.max(sumClassLevels, typeof raw.level === 'number' ? raw.level : 1)
        : typeof raw.level === 'number'
          ? raw.level
          : base.level || 1,
    ),
  );

  // If single class level is smaller than totalLevel, sync it
  if (classes.length === 1 && classes[0].level < totalLevel) {
    classes[0] = { ...classes[0], level: totalLevel };
  }

  const expectedProfBonus = proficiencyBonusForLevel(totalLevel);

  // Backfill saving throw proficiencies from primary class if none specified
  let savingThrows = [...base.proficiencies.savingThrows];
  if (savingThrows.length === 0 && classes.length > 0) {
    const primaryKey = normalizeClassKey(classes[0].name);
    for (const [k, saves] of Object.entries(CLASS_SAVING_THROWS)) {
      if (primaryKey.includes(k)) {
        savingThrows = [...saves];
        break;
      }
    }
  }

  // Backfill Hit Dice from primary class if defaults weren't tailored
  let dieSize = base.hitDice.dieSize || 8;
  if (classes.length > 0 && (!raw.hitDice || !(raw.hitDice as Record<string, unknown>)?.dieSize)) {
    const primaryKey = normalizeClassKey(classes[0].name);
    for (const [k, d] of Object.entries(CLASS_HIT_DIE)) {
      if (primaryKey.includes(k)) {
        dieSize = d;
        break;
      }
    }
  }
  const hdMax =
    raw.hitDice && typeof (raw.hitDice as Record<string, unknown>).max === 'number' && (raw.hitDice as Record<string, unknown>).max as number > 0
      ? ((raw.hitDice as Record<string, unknown>).max as number)
      : totalLevel;
  const hdUsed = Math.max(0, Math.min(hdMax, base.hitDice.used || 0));

  // Resolve HP (support both hp.{current,max,temp} and flat currentHp/maxHp/tempHp)
  const rawHpObj = (raw.hp as Record<string, unknown>) || {};
  let maxHp =
    typeof rawHpObj.max === 'number' && rawHpObj.max > 0
      ? rawHpObj.max
      : typeof raw.maxHp === 'number' && raw.maxHp > 0
        ? raw.maxHp
        : typeof raw.hpMax === 'number' && raw.hpMax > 0
          ? raw.hpMax
          : base.hp.max;

  const conMod = abilityMod(base.abilities.CON);
  if (!maxHp || maxHp <= 0) {
    // Estimate standard 5e HP: max die at L1 + average die at L2..N
    const avgPerLvl = Math.floor(dieSize / 2) + 1;
    maxHp = Math.max(
      totalLevel,
      dieSize + conMod + (totalLevel - 1) * (avgPerLvl + conMod),
    );
  }

  const hasExplicitCurrentHp =
    typeof rawHpObj.current === 'number' || typeof raw.currentHp === 'number';
  const currentHp = hasExplicitCurrentHp
    ? Math.max(0, Math.min(maxHp, base.hp.current))
    : maxHp;
  const tempHp = Math.max(0, base.hp.temp);

  // Compute Ability Modifiers
  const abilityModifiers = {} as Record<AbilityName, number>;
  for (const ab of ABILITY_NAMES) {
    abilityModifiers[ab] = abilityMod(base.abilities[ab]);
  }

  // Initiative bonus backfill
  const rawInitProvided =
    typeof raw.initiativeMod === 'number' || typeof raw.initiative === 'number';
  const initiativeMod = rawInitProvided
    ? typeof raw.initiativeMod === 'number'
      ? raw.initiativeMod
      : Number(raw.initiative) || abilityModifiers.DEX
    : abilityModifiers.DEX;

  // AC backfill if missing/0
  const rawAcProvided = typeof raw.ac === 'number' && raw.ac > 0;
  const ac = rawAcProvided ? base.ac : Math.max(10, 10 + abilityModifiers.DEX);

  // Assemble working PC before skill/spell synthesis
  const workingPc: PlayerCharacter = {
    ...base,
    level: totalLevel,
    classes,
    proficiencyBonus: expectedProfBonus,
    proficiencies: {
      ...base.proficiencies,
      savingThrows,
    },
    hp: {
      current: currentHp,
      max: maxHp,
      temp: tempHp,
    },
    hitDice: {
      dieSize,
      max: hdMax,
      used: hdUsed,
    },
    ac,
    initiativeMod,
  };

  // Spellcasting Ability, Save DC & Attack Bonus
  const spellcastingAbility = inferSpellcastingAbility(workingPc);
  if (spellcastingAbility) {
    workingPc.spellcastingAbility = spellcastingAbility;
  }

  const spellSaveDc = spellcastingAbility
    ? 8 + expectedProfBonus + abilityModifiers[spellcastingAbility]
    : null;
  const spellAttackBonus = spellcastingAbility
    ? expectedProfBonus + abilityModifiers[spellcastingAbility]
    : null;

  // Synthesize Spell Slots & Pact Magic Slots
  const synthesizedSlots = synthesizeSpellSlotsForClasses(classes);
  if (!workingPc.spellSlots || Object.keys(workingPc.spellSlots).length === 0) {
    if (synthesizedSlots.spellSlots) {
      workingPc.spellSlots = synthesizedSlots.spellSlots;
    }
  } else if (synthesizedSlots.spellSlots) {
    // Backfill any missing slot levels from class progression
    const mergedSlots: Partial<Record<SpellSlotLevel, SpellSlot>> = {
      ...synthesizedSlots.spellSlots,
    };
    for (const lvl of SPELL_SLOT_LEVELS) {
      const existingSlot = workingPc.spellSlots[lvl];
      if (existingSlot && existingSlot.max > 0) {
        mergedSlots[lvl] = existingSlot;
      }
    }
    workingPc.spellSlots = mergedSlots;
  }

  if (!workingPc.pactSlots && synthesizedSlots.pactSlots) {
    workingPc.pactSlots = synthesizedSlots.pactSlots;
  }

  // Synthesize Class Resource Pools
  workingPc.resourcePools = synthesizeClassResourcePools(workingPc);

  // Attuned count sync
  const attunedFromInv = workingPc.inventory.filter((i) => i.attuned).length;
  workingPc.attunedCount = Math.min(
    3,
    Math.max(attunedFromInv, typeof raw.attunedCount === 'number' ? raw.attunedCount : 0),
  );

  // Passive Senses
  const hasObservant = workingPc.features.some((f) =>
    f.name.toLowerCase().includes('observant'),
  );
  const observantBonus = hasObservant ? 5 : 0;
  const passivePerception =
    10 + computeSkillBonusWithExpertise(workingPc, 'Perception') + observantBonus;
  const passiveInvestigation =
    10 + computeSkillBonusWithExpertise(workingPc, 'Investigation') + observantBonus;
  const passiveInsight = 10 + computeSkillBonusWithExpertise(workingPc, 'Insight');

  // Carrying Capacity (STR * 15, x2 for Powerful Build)
  const hasPowerfulBuild =
    /goliath|firbolg|bugbear|orc/i.test(workingPc.race) ||
    workingPc.features.some((f) => /powerful build|aspect of the beast.*bear/i.test(f.name));
  const carryingCapacity = workingPc.abilities.STR * 15 * (hasPowerfulBuild ? 2 : 1);

  const derivedStats: PcDerivedStats = {
    abilityModifiers,
    proficiencyBonus: expectedProfBonus,
    passivePerception,
    passiveInvestigation,
    passiveInsight,
    spellSaveDc,
    spellAttackBonus,
    initiativeBonus: initiativeMod,
    carryingCapacity,
  };

  const partyRoles = evaluatePartyRoles(workingPc);
  const defensiveProfile = evaluateDefensiveProfile(workingPc);
  const auditNotes = buildAuditNotes(workingPc, raw, expectedProfBonus);

  const evaluation: PcEvaluation = {
    partyRoles,
    defensiveProfile,
    auditNotes,
    derivedStats,
    evaluatedAt: Date.now(),
  };

  workingPc.evaluation = evaluation;
  if (defensiveProfile.resistances.length > 0 && !workingPc.resistances) {
    workingPc.resistances = defensiveProfile.resistances;
  }
  if (defensiveProfile.immunities.length > 0 && !workingPc.immunities) {
    workingPc.immunities = defensiveProfile.immunities;
  }
  if (defensiveProfile.specialSenses.length > 0 && !workingPc.senses) {
    workingPc.senses = defensiveProfile.specialSenses;
  }

  if (workingPc.pactSlots) {
    (workingPc.pactSlots as PactMagicSlots & { slotLevel?: number }).slotLevel =
      workingPc.pactSlots.level;
  }

  if (workingPc.spellSlots && typeof workingPc.spellSlots === 'object' && !Array.isArray(workingPc.spellSlots)) {
    const toGroupArray = () =>
      SPELL_SLOT_LEVELS.filter((lvl) => workingPc.spellSlots?.[lvl] && workingPc.spellSlots[lvl]!.max > 0).map(
        (lvl) => ({
          level: lvl,
          max: workingPc.spellSlots![lvl]!.max,
          used: workingPc.spellSlots![lvl]!.used,
        }),
      );
    for (const method of ['some', 'find', 'map', 'filter', 'forEach'] as const) {
      Object.defineProperty(workingPc.spellSlots, method, {
        value: (...args: unknown[]) => (toGroupArray() as any)[method](...args),
        enumerable: false,
        configurable: true,
        writable: true,
      });
    }
  }

  const result = {
    ...workingPc,
    evaluation,
    derivedStats,
    currentHp: workingPc.hp.current,
    maxHp: workingPc.hp.max,
    tempHp: workingPc.hp.temp,
    abilityModifiers,
    passivePerception,
    passiveInvestigation,
    passiveInsight,
    spellSaveDc,
    spellAttackBonus,
    carryingCapacity,
  } as EvaluatedPlayerCharacter;
  Object.defineProperty(result, 'pc', {
    value: result,
    enumerable: false,
    configurable: true,
    writable: true,
  });
  return result;
}
