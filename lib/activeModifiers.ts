import {
  ABILITY_NAMES,
  type AbilityName,
  type ActiveBuff,
  type BuffExpiryTrigger,
  type PlayerCharacter,
  type SkillName,
} from './pc/types';
import {
  abilityMod,
  initiativeBonus as calcBaseInitiative,
  savingThrowBonus as calcBaseSave,
  skillBonus as calcBaseSkill,
} from './pc/derived';
import { SKILL_ABILITY } from './pc/skills';

export type RollMode = 'normal' | 'advantage' | 'disadvantage';

export interface PresetBuffDefinition extends Omit<ActiveBuff, 'id'> {
  id: string;
  presetKey: string;
  description: string;
  badgeColor?: string;
}

export const PRESET_BUFFS: readonly PresetBuffDefinition[] = [
  {
    id: 'bless',
    presetKey: 'bless',
    name: 'Bless',
    attackBonusFormula: '+1d4',
    saveBonusFormula: '+1d4',
    affectsAttacks: true,
    affectsSaves: 'all',
    expiresOn: 'round',
    description: '+1d4 to Attack Rolls and Saving Throws',
  },
  {
    id: 'bane',
    presetKey: 'bane',
    name: 'Bane',
    attackBonusFormula: '-1d4',
    saveBonusFormula: '-1d4',
    affectsAttacks: true,
    affectsSaves: 'all',
    expiresOn: 'round',
    description: '-1d4 to Attack Rolls and Saving Throws',
  },
  {
    id: 'guidance',
    presetKey: 'guidance',
    name: 'Guidance',
    checkBonusFormula: '+1d4',
    affectsChecks: true,
    expiresOn: 'turn',
    description: '+1d4 to Ability & Skill Checks',
  },
  {
    id: 'shield',
    presetKey: 'shield',
    name: 'Shield (+5 AC)',
    acBonus: 5,
    expiresOn: 'round',
    description: '+5 AC until start of next turn',
  },
  {
    id: 'rage',
    presetKey: 'rage',
    name: 'Rage',
    damageBonusFormula: '+2',
    rollModeOverride: 'advantage',
    affectsChecks: false,
    affectsSaves: ['STR'],
    expiresOn: 'shortRest',
    description: 'Advantage on STR checks/saves, +2 melee damage, B/P/S resistance',
  },
  {
    id: 'haste',
    presetKey: 'haste',
    name: 'Haste',
    acBonus: 2,
    speedMultiplier: 2,
    affectsSaves: ['DEX'],
    rollModeOverride: 'advantage',
    expiresOn: 'round',
    description: '+2 AC, doubled Speed, Advantage on DEX saves',
  },
  {
    id: 'mage-armor',
    presetKey: 'mage-armor',
    name: 'Mage Armor',
    mageArmor: true,
    acBonus: 3,
    expiresOn: 'longRest',
    description: 'Base AC becomes 13 + DEX modifier (or +3 unarmored AC)',
  },
  {
    id: 'bardic-inspiration',
    presetKey: 'bardic-inspiration',
    name: 'Bardic Inspiration',
    checkBonusFormula: '+1d6',
    attackBonusFormula: '+1d6',
    saveBonusFormula: '+1d6',
    affectsChecks: true,
    affectsAttacks: true,
    affectsSaves: 'all',
    expiresOn: 'turn',
    description: '+1d6 to one Ability Check, Attack Roll, or Saving Throw',
  },
  {
    id: 'cover-half',
    presetKey: 'cover-half',
    name: 'Cover +2',
    acBonus: 2,
    saveBonusFormula: '+2',
    affectsSaves: ['DEX'],
    expiresOn: 'turn',
    description: 'Half Cover: +2 bonus to AC and DEX saving throws',
  },
  {
    id: 'cover-three-quarters',
    presetKey: 'cover-three-quarters',
    name: 'Cover +5',
    acBonus: 5,
    saveBonusFormula: '+5',
    affectsSaves: ['DEX'],
    expiresOn: 'turn',
    description: 'Three-Quarters Cover: +5 bonus to AC and DEX saving throws',
  },
];

export function createBuffFromPreset(presetKeyOrName: string): ActiveBuff {
  const normalized = presetKeyOrName.trim().toLowerCase();
  const preset = PRESET_BUFFS.find(
    (p) =>
      p.presetKey.toLowerCase() === normalized ||
      p.name.toLowerCase() === normalized ||
      p.name.toLowerCase().startsWith(normalized)
  );
  if (preset) {
    const { presetKey, description: _desc, badgeColor: _color, ...rest } = preset;
    return {
      ...rest,
      presetKey,
      id: `buff-${presetKey}`,
    };
  }
  return {
    id: `buff-custom-${Date.now().toString(36)}`,
    name: presetKeyOrName.trim() || 'Custom Buff',
    expiresOn: 'manual',
  };
}

export interface RollResolutionContext {
  rollMode: RollMode;
  bonusFormulas: string[];
  flatBonusDelta: number;
  reasons: string[];
}

export interface EffectiveCharacterStats {
  baseAc: number;
  ac: number;
  effectiveAc: number;
  acDelta: number;
  acSummary: string;
  acReasons: string[];

  baseSpeed: number;
  speed: number;
  effectiveSpeed: number;
  speedDelta: number;
  speedSummary: string;
  speedReasons: string[];

  baseMaxHp: number;
  effectiveMaxHp: number;
  maxHpSummary: string;

  initiative: number;
  effectiveInitiative: number;
  initiativeMod: number;
  initiativeRollContext: RollResolutionContext;

  abilityChecks: Record<
    AbilityName,
    {
      baseMod: number;
      effectiveMod: number;
      rollMode: RollMode;
      bonusFormulas: string[];
      reasons: string[];
      summary: string;
    }
  >;

  savingThrows: Record<
    AbilityName,
    {
      baseMod: number;
      effectiveMod: number;
      rollMode: RollMode;
      bonusFormulas: string[];
      reasons: string[];
      summary: string;
    }
  >;

  skills: Record<
    SkillName,
    {
      baseMod: number;
      effectiveMod: number;
      rollMode: RollMode;
      bonusFormulas: string[];
      reasons: string[];
      summary: string;
    }
  >;

  attackRollContext: RollResolutionContext;
  attackBonusDice: string[];
  saveBonusDice: string[];
  attackRollMode: RollMode;
  damageBonusFormulas: string[];
  statusBadges: string[];
  summaryBadges: string[];
  abilityModifiers: Record<string, number>;
  savingThrowModifiers: Record<string, number>;
  skillModifiers: Record<string, number>;
  isIncapacitated: boolean;
  isDeadFromExhaustion: boolean;
}

const ZERO_SPEED_CONDITIONS = new Set([
  'grappled',
  'restrained',
  'paralyzed',
  'petrified',
  'stunned',
  'unconscious',
]);

const INCAPACITATED_CONDITIONS = new Set([
  'incapacitated',
  'paralyzed',
  'petrified',
  'stunned',
  'unconscious',
]);

function parsePureFlatNumber(formula: string | undefined): number | null {
  if (!formula) return null;
  const trimmed = formula.trim();
  if (/^[+-]?\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }
  return null;
}

function normalizeSignedFormula(formula: string): string {
  const trimmed = formula.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('+') || trimmed.startsWith('-')) return trimmed;
  return `+${trimmed}`;
}

export function combineRollModes(modes: RollMode[]): RollMode {
  let hasAdv = false;
  let hasDis = false;
  for (const m of modes) {
    if (m === 'advantage') hasAdv = true;
    if (m === 'disadvantage') hasDis = true;
  }
  if (hasAdv && hasDis) return 'normal';
  if (hasAdv) return 'advantage';
  if (hasDis) return 'disadvantage';
  return 'normal';
}

function stripParentheticalBonus(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*/g, '').trim() || name;
}

/**
 * Pure, non-destructive calculation of effective character statistics layered
 * with active conditions, exhaustion (levels 1-6), and activeBuffs.
 * Never mutates the input `pc`.
 */
export function computeEffectiveCharacterStats(pc: PlayerCharacter): EffectiveCharacterStats {
  const baseAc = typeof pc.ac === 'number' && Number.isFinite(pc.ac) ? pc.ac : 10;
  const baseSpeed = typeof pc.speed === 'number' && Number.isFinite(pc.speed) ? pc.speed : 30;
  const baseMaxHp =
    typeof pc.hp?.max === 'number' && Number.isFinite(pc.hp.max)
      ? pc.hp.max
      : typeof pc.maxHp === 'number' && Number.isFinite(pc.maxHp)
        ? pc.maxHp
        : 10;

  const activeConditions = Array.isArray(pc.conditions)
    ? pc.conditions.map((c) => String(c).trim()).filter(Boolean)
    : [];
  const condLower = new Set(activeConditions.map((c) => c.toLowerCase()));
  const exhaustion =
    typeof pc.exhaustion === 'number' && Number.isFinite(pc.exhaustion)
      ? Math.max(0, Math.min(6, Math.trunc(pc.exhaustion)))
      : 0;
  const activeBuffs: ActiveBuff[] = Array.isArray(pc.activeBuffs) ? pc.activeBuffs : [];

  const getAbilityScore = (ability: AbilityName): number => {
    const abils = (pc.abilities ?? {}) as Record<string, number>;
    const val = abils[ability] ?? abils[ability.toLowerCase()];
    return typeof val === 'number' && Number.isFinite(val) ? val : 10;
  };

  // 1. AC calculation
  let effectiveAc = baseAc;
  const acReasons: string[] = [];
  const dexMod = abilityMod(getAbilityScore('DEX'));

  for (const buff of activeBuffs) {
    if (!buff) continue;
    const shortName = stripParentheticalBonus(buff.name);
    if (buff.mageArmor || buff.name.toLowerCase() === 'mage armor') {
      const mageArmorAc = 13 + dexMod;
      if (mageArmorAc > effectiveAc) {
        const diff = mageArmorAc - effectiveAc;
        effectiveAc = mageArmorAc;
        acReasons.push(`+${diff} ${shortName}`);
      } else if (typeof buff.acBonus === 'number' && buff.acBonus !== 0 && baseAc <= 10 + dexMod) {
        effectiveAc += buff.acBonus;
        acReasons.push(`${buff.acBonus > 0 ? `+${buff.acBonus}` : buff.acBonus} ${shortName}`);
      }
      continue;
    }
    if (typeof buff.acBonus === 'number' && buff.acBonus !== 0) {
      effectiveAc += buff.acBonus;
      const sign = buff.acBonus > 0 ? `+${buff.acBonus}` : `${buff.acBonus}`;
      acReasons.push(`${sign} ${shortName}`);
    }
  }

  const acDelta = effectiveAc - baseAc;
  const acSummary =
    acReasons.length > 0 ? `AC ${effectiveAc} (${acReasons.join(', ')})` : `AC ${effectiveAc}`;

  // 2. Speed calculation
  let effectiveSpeed = baseSpeed;
  const speedReasons: string[] = [];

  for (const buff of activeBuffs) {
    if (!buff) continue;
    if (typeof buff.speedBonus === 'number' && buff.speedBonus !== 0) {
      effectiveSpeed += buff.speedBonus;
      const sign = buff.speedBonus > 0 ? `+${buff.speedBonus}` : `${buff.speedBonus}`;
      speedReasons.push(`${sign} ft ${stripParentheticalBonus(buff.name)}`);
    }
    if (typeof buff.speedMultiplier === 'number' && buff.speedMultiplier > 0 && buff.speedMultiplier !== 1) {
      effectiveSpeed = Math.floor(effectiveSpeed * buff.speedMultiplier);
      speedReasons.push(`x${buff.speedMultiplier} ${stripParentheticalBonus(buff.name)}`);
    }
  }

  if (exhaustion >= 2 && exhaustion < 5) {
    effectiveSpeed = Math.floor(effectiveSpeed * 0.5);
    speedReasons.push(`Halved [Exhaustion ${exhaustion}]`);
  }

  const zeroSpeedTrigger = activeConditions.find((c) => ZERO_SPEED_CONDITIONS.has(c.toLowerCase()));
  if (zeroSpeedTrigger) {
    effectiveSpeed = 0;
    speedReasons.push(`[${zeroSpeedTrigger}]`);
  } else if (exhaustion >= 5) {
    effectiveSpeed = 0;
    speedReasons.push(`[Exhaustion ${exhaustion}]`);
  } else if ( activeBuffs.some((b) => b?.speedMultiplier === 0) ) {
    const zeroBuff = activeBuffs.find((b) => b?.speedMultiplier === 0);
    effectiveSpeed = 0;
    if (zeroBuff) speedReasons.push(`[${stripParentheticalBonus(zeroBuff.name)}]`);
  }

  effectiveSpeed = Math.max(0, effectiveSpeed);
  const speedDelta = effectiveSpeed - baseSpeed;
  const speedSummary =
    speedReasons.length > 0
      ? `Speed ${effectiveSpeed} ft ${speedReasons.join(' ')}`
      : `Speed ${effectiveSpeed} ft`;

  // 3. Max HP calculation (Exhaustion >= 4 halves max HP)
  let effectiveMaxHp = baseMaxHp;
  let maxHpSummary = `${baseMaxHp}`;
  if (exhaustion >= 4) {
    effectiveMaxHp = Math.max(1, Math.floor(baseMaxHp / 2));
    maxHpSummary = `${effectiveMaxHp} (Halved [Exhaustion ${exhaustion}])`;
  }

  // 4. Ability Checks & Skills
  const checkConditionDisadvantageReasons: string[] = [];
  if (condLower.has('poisoned')) checkConditionDisadvantageReasons.push('Poisoned');
  if (condLower.has('frightened')) checkConditionDisadvantageReasons.push('Frightened');
  if (exhaustion >= 1) checkConditionDisadvantageReasons.push(`Exhaustion ${exhaustion}`);

  const buildCheckContextForAbility = (ability: AbilityName): {
    rollMode: RollMode;
    bonusFormulas: string[];
    flatDelta: number;
    reasons: string[];
  } => {
    const modes: RollMode[] = [];
    const reasons: string[] = [];
    const bonusFormulas: string[] = [];
    let flatDelta = 0;

    if (checkConditionDisadvantageReasons.length > 0) {
      modes.push('disadvantage');
      for (const r of checkConditionDisadvantageReasons) {
        reasons.push(`Disadvantage on Checks [${r}]`);
      }
    }

    for (const buff of activeBuffs) {
      if (!buff) continue;
      const buffLower = buff.name.toLowerCase();
      // Rage grants Advantage on STR checks
      if (buffLower === 'rage' && ability === 'STR') {
        modes.push('advantage');
        reasons.push('Advantage [Rage]');
      } else if (buff.affectsChecks && buff.rollModeOverride && buff.rollModeOverride !== 'normal') {
        modes.push(buff.rollModeOverride);
        reasons.push(
          `${buff.rollModeOverride === 'advantage' ? 'Advantage' : 'Disadvantage'} [${stripParentheticalBonus(buff.name)}]`
        );
      }

      if (buff.checkBonusFormula) {
        const normalized = normalizeSignedFormula(buff.checkBonusFormula);
        const flat = parsePureFlatNumber(normalized);
        if (flat !== null) {
          flatDelta += flat;
        }
        bonusFormulas.push(normalized);
        reasons.push(`${normalized} [${stripParentheticalBonus(buff.name)}]`);
      }
    }

    return {
      rollMode: combineRollModes(modes),
      bonusFormulas,
      flatDelta,
      reasons,
    };
  };

  const abilityChecks = {} as EffectiveCharacterStats['abilityChecks'];
  const abilityModifiers: Record<string, number> = {};
  for (const ability of ABILITY_NAMES) {
    const baseMod = abilityMod(getAbilityScore(ability));
    const ctx = buildCheckContextForAbility(ability);
    const effectiveMod = baseMod + ctx.flatDelta;
    abilityChecks[ability] = {
      baseMod,
      effectiveMod,
      rollMode: ctx.rollMode,
      bonusFormulas: ctx.bonusFormulas,
      reasons: ctx.reasons,
      summary: ctx.reasons.join(', '),
    };
    abilityModifiers[ability] = effectiveMod;
    abilityModifiers[ability.toLowerCase()] = effectiveMod;
  }

  const skills = {} as EffectiveCharacterStats['skills'];
  const skillModifiers: Record<string, number> = {};
  for (const [skillKey, ability] of Object.entries(SKILL_ABILITY) as [SkillName, AbilityName][]) {
    const baseMod = calcBaseSkill(pc, skillKey);
    const ctx = buildCheckContextForAbility(ability);
    const effectiveMod = baseMod + ctx.flatDelta;
    skills[skillKey] = {
      baseMod,
      effectiveMod,
      rollMode: ctx.rollMode,
      bonusFormulas: ctx.bonusFormulas,
      reasons: ctx.reasons,
      summary: ctx.reasons.join(', '),
    };
    skillModifiers[skillKey] = effectiveMod;
  }

  // 5. Saving Throws
  const savingThrows = {} as EffectiveCharacterStats['savingThrows'];
  const savingThrowModifiers: Record<string, number> = {};
  for (const ability of ABILITY_NAMES) {
    const baseMod = calcBaseSave(pc, ability);
    const modes: RollMode[] = [];
    const reasons: string[] = [];
    const bonusFormulas: string[] = [];
    let flatDelta = 0;

    if (exhaustion >= 3) {
      modes.push('disadvantage');
      reasons.push(`Disadvantage on Saves [Exhaustion ${exhaustion}]`);
    }
    if (ability === 'DEX' && condLower.has('restrained')) {
      modes.push('disadvantage');
      reasons.push('Disadvantage on DEX Saves [Restrained]');
    }
    if (
      (ability === 'STR' || ability === 'DEX') &&
      (condLower.has('paralyzed') || condLower.has('stunned') || condLower.has('petrified') || condLower.has('unconscious'))
    ) {
      modes.push('disadvantage');
      reasons.push('Auto-Fail/Disadvantage on STR/DEX Saves [Incapacitated]');
    }

    for (const buff of activeBuffs) {
      if (!buff) continue;
      const appliesToSave =
        buff.affectsSaves === 'all' ||
        (Array.isArray(buff.affectsSaves) && buff.affectsSaves.includes(ability)) ||
        (!buff.affectsSaves && Boolean(buff.saveBonusFormula));

      if (!appliesToSave) continue;

      if (buff.rollModeOverride && buff.rollModeOverride !== 'normal') {
        modes.push(buff.rollModeOverride);
        reasons.push(
          `${buff.rollModeOverride === 'advantage' ? 'Advantage' : 'Disadvantage'} [${stripParentheticalBonus(buff.name)}]`
        );
      }

      if (buff.saveBonusFormula) {
        const normalized = normalizeSignedFormula(buff.saveBonusFormula);
        const flat = parsePureFlatNumber(normalized);
        if (flat !== null) {
          flatDelta += flat;
        }
        bonusFormulas.push(normalized);
        reasons.push(`${normalized} [${stripParentheticalBonus(buff.name)}]`);
      }
    }

    const effSaveMod = baseMod + flatDelta;
    savingThrows[ability] = {
      baseMod,
      effectiveMod: effSaveMod,
      rollMode: combineRollModes(modes),
      bonusFormulas,
      reasons,
      summary: reasons.join(', '),
    };
    savingThrowModifiers[ability] = effSaveMod;
    savingThrowModifiers[ability.toLowerCase()] = effSaveMod;
  }

  // 6. Attacks & Damage
  const attackModes: RollMode[] = [];
  const attackReasons: string[] = [];
  const attackBonusFormulas: string[] = [];
  let attackFlatDelta = 0;
  const damageBonusFormulas: string[] = [];

  for (const cond of ['poisoned', 'frightened', 'blinded', 'restrained', 'prone']) {
    if (condLower.has(cond)) {
      const label = cond.charAt(0).toUpperCase() + cond.slice(1);
      attackModes.push('disadvantage');
      attackReasons.push(`Disadvantage on Attacks [${label}]`);
    }
  }
  if (exhaustion >= 3) {
    attackModes.push('disadvantage');
    attackReasons.push(`Disadvantage on Attacks [Exhaustion ${exhaustion}]`);
  }
  if (condLower.has('invisible')) {
    attackModes.push('advantage');
    attackReasons.push('Advantage on Attacks [Invisible]');
  }

  for (const buff of activeBuffs) {
    if (!buff) continue;
    const appliesToAttack =
      buff.affectsAttacks === true || Boolean(buff.attackBonusFormula);
    if (appliesToAttack) {
      if (buff.rollModeOverride && buff.rollModeOverride !== 'normal') {
        attackModes.push(buff.rollModeOverride);
        attackReasons.push(
          `${buff.rollModeOverride === 'advantage' ? 'Advantage' : 'Disadvantage'} [${stripParentheticalBonus(buff.name)}]`
        );
      }
      if (buff.attackBonusFormula) {
        const normalized = normalizeSignedFormula(buff.attackBonusFormula);
        const flat = parsePureFlatNumber(normalized);
        if (flat !== null) {
          attackFlatDelta += flat;
        }
        attackBonusFormulas.push(normalized);
        attackReasons.push(`${normalized} [${stripParentheticalBonus(buff.name)}]`);
      }
    }
    if (buff.damageBonusFormula) {
      damageBonusFormulas.push(normalizeSignedFormula(buff.damageBonusFormula));
    }
  }

  const dexCheck = abilityChecks.DEX;
  const baseInit = calcBaseInitiative(pc);
  const initiativeRollContext: RollResolutionContext = {
    rollMode: dexCheck.rollMode,
    bonusFormulas: [...dexCheck.bonusFormulas],
    flatBonusDelta: dexCheck.effectiveMod - dexCheck.baseMod,
    reasons: [...dexCheck.reasons],
  };

  // 7. Consolidated Status Badges for UI headers
  const statusBadges: string[] = [];
  if (acReasons.length > 0) statusBadges.push(acSummary);
  if (speedReasons.length > 0) statusBadges.push(speedSummary);
  if (checkConditionDisadvantageReasons.length > 0) {
    statusBadges.push(`Disadvantage on Checks [${checkConditionDisadvantageReasons.join(', ')}]`);
  }
  if (exhaustion >= 3) {
    statusBadges.push(`Disadvantage on Attacks & Saves [Exhaustion ${exhaustion}]`);
  }
  if (exhaustion >= 4) {
    statusBadges.push(`Max HP Halved [Exhaustion ${exhaustion}]`);
  }
  for (const buff of activeBuffs) {
    if (!buff) continue;
    if (buff.attackBonusFormula || buff.saveBonusFormula || buff.checkBonusFormula) {
      const formula = buff.attackBonusFormula || buff.saveBonusFormula || buff.checkBonusFormula;
      statusBadges.push(`${stripParentheticalBonus(buff.name)} (${formula})`);
    }
  }

  const isIncapacitated = activeConditions.some((c) => INCAPACITATED_CONDITIONS.has(c.toLowerCase()));

  const combinedAttackRollMode = combineRollModes(attackModes);
  const normalizeDiceToken = (f: string) => f.trim().replace(/^\+/, '');

  return {
    baseAc,
    ac: effectiveAc,
    effectiveAc,
    acDelta,
    acSummary,
    acReasons,
    baseSpeed,
    speed: effectiveSpeed,
    effectiveSpeed,
    speedDelta,
    speedSummary,
    speedReasons,
    baseMaxHp,
    effectiveMaxHp,
    maxHpSummary,
    initiative: baseInit + initiativeRollContext.flatBonusDelta,
    effectiveInitiative: baseInit + initiativeRollContext.flatBonusDelta,
    initiativeMod: baseInit + initiativeRollContext.flatBonusDelta,
    initiativeRollContext,
    abilityChecks,
    savingThrows,
    skills,
    attackRollContext: {
      rollMode: combinedAttackRollMode,
      bonusFormulas: attackBonusFormulas,
      flatBonusDelta: attackFlatDelta,
      reasons: attackReasons,
    },
    attackBonusDice: attackBonusFormulas.map(normalizeDiceToken),
    saveBonusDice: (savingThrows.STR?.bonusFormulas ?? []).map(normalizeDiceToken),
    attackRollMode: combinedAttackRollMode,
    damageBonusFormulas,
    statusBadges,
    summaryBadges: statusBadges,
    abilityModifiers,
    savingThrowModifiers,
    skillModifiers,
    isIncapacitated,
    isDeadFromExhaustion: exhaustion >= 6,
  };
}

/**
 * Filters out buffs that expire on the given trigger.
 * - 'turn' clears buffs with expiresOn === 'turn'
 * - 'round' clears buffs with expiresOn === 'turn' or 'round'
 * - 'shortRest' clears buffs with expiresOn === 'turn', 'round', 'shortRest', or 'rest'
 * - 'longRest' clears buffs with expiresOn === 'turn', 'round', 'shortRest', 'longRest', or 'rest'
 */
export function expireActiveBuffs(
  buffs: readonly ActiveBuff[] | undefined,
  trigger: Exclude<BuffExpiryTrigger, 'manual'>
): ActiveBuff[] {
  if (!Array.isArray(buffs) || buffs.length === 0) return [];
  const expiredSet = new Set<BuffExpiryTrigger>();
  if (trigger === 'turn') {
    expiredSet.add('turn');
  } else if (trigger === 'round') {
    expiredSet.add('turn');
    expiredSet.add('round');
  } else if (trigger === 'shortRest' || trigger === 'rest') {
    expiredSet.add('turn');
    expiredSet.add('round');
    expiredSet.add('shortRest');
    expiredSet.add('rest');
  } else if (trigger === 'longRest') {
    expiredSet.add('turn');
    expiredSet.add('round');
    expiredSet.add('shortRest');
    expiredSet.add('longRest');
    expiredSet.add('rest');
  }
  return buffs.filter((b) => !b.expiresOn || !expiredSet.has(b.expiresOn));
}

export function clearExpiredBuffsOnPc(
  pc: PlayerCharacter,
  trigger: Exclude<BuffExpiryTrigger, 'manual'>
): PlayerCharacter {
  if (!Array.isArray(pc.activeBuffs) || pc.activeBuffs.length === 0) {
    return { ...pc };
  }
  return {
    ...pc,
    activeBuffs: expireActiveBuffs(pc.activeBuffs, trigger),
  };
}
