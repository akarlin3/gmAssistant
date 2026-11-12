import { evalExpr, parseFormula } from '@/components/diceRoller/parser';
import {
  combineRollModes,
  computeEffectiveCharacterStats,
  type RollMode,
} from './activeModifiers';
import { abilityMod } from './pc/derived';
import {
  SPELL_SLOT_LEVELS,
  type AbilityName,
  type Attack,
  type DeathSaveCount,
  type FeatureEntry,
  type PlayerCharacter,
  type RollEvent,
  type SkillName,
  type SpellSlotLevel,
} from './pc/types';
import { emitLocalVisualRoll } from './visualDiceBus';

export const ROLL_RING_BUFFER_CAP = 50;

export interface SheetRollOptions {
  pc?: PlayerCharacter;
  actorName?: string;
  label: string;
  baseMod?: number;
  baseFormula?: string; // e.g., "1d20+5" or "2d6+3"
  isD20?: boolean;
  rollMode?: RollMode; // User pill override ('normal' | 'advantage' | 'disadvantage')
  effectRollMode?: RollMode; // Condition/buff roll mode from computeEffectiveCharacterStats
  bonusFormulas?: string[]; // From activeBuffs (e.g. ["+1d4"])
  situationalBonus?: string; // User quick pill (e.g. "+1d4", "+2", "-2")
  secretRoll?: boolean;
  rng?: () => number;
  now?: number;
}

function makeRollId(now: number): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `roll-${crypto.randomUUID()}`;
  }
  return `roll-${now}-${Math.random().toString(36).slice(2, 9)}`;
}

function rollDieWithRng(sides: number, rng: () => number): number {
  return Math.floor(rng() * sides) + 1;
}

interface ParsedTerm {
  sign: 1 | -1;
  count: number;
  sides: number; // 0 for flat constant
}

function parseBonusTerms(formulaStr: string): ParsedTerm[] {
  const cleaned = formulaStr.replace(/\s+/g, '');
  if (!cleaned) return [];
  const tokens = cleaned.match(/[+-]?[^+-]+/g) ?? [];
  const out: ParsedTerm[] = [];
  for (const raw of tokens) {
    let sign: 1 | -1 = 1;
    let body = raw;
    if (body.startsWith('+')) {
      body = body.slice(1);
    } else if (body.startsWith('-')) {
      sign = -1;
      body = body.slice(1);
    }
    const diceMatch = body.match(/^(\d*)d(\d+)$/i);
    if (diceMatch) {
      const count = diceMatch[1] ? parseInt(diceMatch[1], 10) : 1;
      const sides = parseInt(diceMatch[2], 10);
      if (count > 0 && sides > 0) {
        out.push({ sign, count, sides });
      }
      continue;
    }
    const flatMatch = body.match(/^\d+$/);
    if (flatMatch) {
      const val = parseInt(body, 10);
      if (val !== 0) {
        out.push({ sign, count: val, sides: 0 });
      }
    }
  }
  return out;
}

function formatMod(mod: number): string {
  if (mod === 0) return '';
  return mod > 0 ? `+${mod}` : `${mod}`;
}

/**
 * Executes a sheet roll (d20 check/save/attack or damage/healing formula)
 * and returns a structured RollEvent ready for UI display and ring-buffer logging.
 */
export function executeSheetRoll(opts: SheetRollOptions): RollEvent {
  const rng = opts.rng ?? Math.random;
  const now = opts.now ?? Date.now();
  const actorName = opts.actorName || opts.pc?.name || 'Player';
  const pcId = opts.pc?.id;
  const isD20 = opts.isD20 ?? (!opts.baseFormula || /1d20/i.test(opts.baseFormula));

  // Determine effective roll mode: if user explicitly picked advantage/disadvantage in pill bar,
  // combine or honor it; if user left pill bar on 'normal', use effectRollMode from conditions/buffs.
  const effectiveMode: RollMode =
    opts.rollMode && opts.rollMode !== 'normal'
      ? opts.effectRollMode && opts.effectRollMode !== 'normal'
        ? combineRollModes([opts.rollMode, opts.effectRollMode])
        : opts.rollMode
      : opts.effectRollMode ?? 'normal';

  const bonusFormulas = [...(opts.bonusFormulas ?? [])];
  if (opts.situationalBonus && opts.situationalBonus.trim()) {
    const sb = opts.situationalBonus.trim();
    bonusFormulas.push(sb.startsWith('+') || sb.startsWith('-') ? sb : `+${sb}`);
  }

  if (isD20) {
    const baseMod = opts.baseMod ?? 0;
    const r1 = rollDieWithRng(20, rng);
    const r2 = effectiveMode === 'normal' ? null : rollDieWithRng(20, rng);
    const d20Rolls = r2 !== null ? [r1, r2] : [r1];
    const keptD20 =
      r2 === null
        ? r1
        : effectiveMode === 'advantage'
          ? Math.max(r1, r2)
          : Math.min(r1, r2);

    const crit: 'nat20' | 'nat1' | null =
      keptD20 === 20 ? 'nat20' : keptD20 === 1 ? 'nat1' : null;

    let extraTotal = 0;
    const breakdownParts: string[] = [];

    if (r2 !== null) {
      const modeTag = effectiveMode === 'advantage' ? 'Adv' : 'Dis';
      breakdownParts.push(`d20(${r1}, ${r2} -> ${keptD20} ${modeTag})`);
    } else {
      breakdownParts.push(`d20(${keptD20})`);
    }

    if (baseMod !== 0) {
      breakdownParts.push(formatMod(baseMod));
    }

    for (const bf of bonusFormulas) {
      const terms = parseBonusTerms(bf);
      for (const t of terms) {
        if (t.sides === 0) {
          const signedVal = t.sign * t.count;
          extraTotal += signedVal;
          breakdownParts.push(formatMod(signedVal));
        } else {
          const rolls: number[] = [];
          for (let i = 0; i < t.count; i++) {
            rolls.push(rollDieWithRng(t.sides, rng));
          }
          const sum = rolls.reduce((a, b) => a + b, 0);
          extraTotal += t.sign * sum;
          const signStr = t.sign > 0 ? '+' : '-';
          breakdownParts.push(`${signStr}${t.count}d${t.sides}[${rolls.join(',')}]=${t.sign * sum}`);
        }
      }
    }

    const total = keptD20 + baseMod + extraTotal;
    const formulaBase = `1d20${formatMod(baseMod)}${bonusFormulas.join('')}`;
    const formula =
      effectiveMode === 'advantage'
        ? `${formulaBase} (Adv)`
        : effectiveMode === 'disadvantage'
          ? `${formulaBase} (Dis)`
          : formulaBase;

    const evt: RollEvent = {
      id: makeRollId(now),
      ...(pcId ? { pcId } : {}),
      actorName,
      label: opts.label,
      formula,
      d20Rolls,
      total,
      breakdown: `${breakdownParts.join(' ')} = ${total}`,
      crit,
      timestamp: now,
      ...(opts.secretRoll ? { secretRoll: true } : {}),
      rollMode: effectiveMode,
      ...(opts.situationalBonus ? { situationalBonus: opts.situationalBonus } : {}),
    };
    emitLocalVisualRoll(evt);
    return evt;
  }

  // Non-d20 formula roll (e.g., weapon/spell damage, Hit Die)
  const rawFormula = `${opts.baseFormula || '1d6'}${bonusFormulas.join('')}`;
  const terms = parseBonusTerms(rawFormula);
  if (terms.length > 0) {
    let total = 0;
    const parts: string[] = [];
    const d20Rolls: number[] = [];
    for (let idx = 0; idx < terms.length; idx++) {
      const t = terms[idx];
      if (t.sides === 0) {
        const v = t.sign * t.count;
        total += v;
        parts.push(idx === 0 && v > 0 ? `${v}` : formatMod(v));
      } else {
        const rolls: number[] = [];
        for (let i = 0; i < t.count; i++) {
          const r = rollDieWithRng(t.sides, rng);
          rolls.push(r);
          if (t.sides === 20) d20Rolls.push(r);
        }
        const sum = rolls.reduce((a, b) => a + b, 0);
        total += t.sign * sum;
        const prefix = idx === 0 ? (t.sign < 0 ? '-' : '') : t.sign > 0 ? '+' : '-';
        parts.push(`${prefix}${t.count}d${t.sides}[${rolls.join(',')}]`);
      }
    }
    const evt: RollEvent = {
      id: makeRollId(now),
      ...(pcId ? { pcId } : {}),
      actorName,
      label: opts.label,
      formula: rawFormula,
      d20Rolls,
      total,
      breakdown: `${parts.join(' ')} = ${total}`,
      crit: null,
      timestamp: now,
      ...(opts.secretRoll ? { secretRoll: true } : {}),
      rollMode: 'normal',
      ...(opts.situationalBonus ? { situationalBonus: opts.situationalBonus } : {}),
    };
    emitLocalVisualRoll(evt);
    return evt;
  }

  // Fallback to components/diceRoller/parser for complex expressions (like kh/kl)
  const parsed = parseFormula(rawFormula);
  const evaluated = parsed.ok ? evalExpr(parsed.expr, null) : { parts: [], total: 0 };
  const breakdownStr =
    evaluated.parts.length > 0
      ? evaluated.parts.map((p) => `${p.expr} (${p.subtotal})`).join(' + ')
      : rawFormula;
  const evt: RollEvent = {
    id: makeRollId(now),
    ...(pcId ? { pcId } : {}),
    actorName,
    label: opts.label,
    formula: rawFormula,
    d20Rolls: [],
    total: evaluated.total,
    breakdown: `${breakdownStr} = ${evaluated.total}`,
    crit: null,
    timestamp: now,
    ...(opts.secretRoll ? { secretRoll: true } : {}),
    rollMode: 'normal',
  };
  emitLocalVisualRoll(evt);
  return evt;
}

// ---- High-level PC sheet click-to-roll helpers --------------------------

export const SKILL_DEFINITIONS: ReadonlyArray<{ name: SkillName; ability: AbilityName }> = [
  { name: 'Acrobatics', ability: 'DEX' },
  { name: 'Animal Handling', ability: 'WIS' },
  { name: 'Arcana', ability: 'INT' },
  { name: 'Athletics', ability: 'STR' },
  { name: 'Deception', ability: 'CHA' },
  { name: 'History', ability: 'INT' },
  { name: 'Insight', ability: 'WIS' },
  { name: 'Intimidation', ability: 'CHA' },
  { name: 'Investigation', ability: 'INT' },
  { name: 'Medicine', ability: 'WIS' },
  { name: 'Nature', ability: 'INT' },
  { name: 'Perception', ability: 'WIS' },
  { name: 'Performance', ability: 'CHA' },
  { name: 'Persuasion', ability: 'CHA' },
  { name: 'Religion', ability: 'INT' },
  { name: 'Sleight of Hand', ability: 'DEX' },
  { name: 'Stealth', ability: 'DEX' },
  { name: 'Survival', ability: 'WIS' },
];

export interface QuickRollControls {
  rollMode?: RollMode;
  rollModeOverride?: RollMode;
  situationalBonus?: string;
  secretRoll?: boolean;
  rng?: () => number;
  now?: number;
}

function normalizeAbilityKey(ability: string): AbilityName {
  const upper = String(ability || 'STR').trim().toUpperCase();
  if (
    upper === 'STR' ||
    upper === 'DEX' ||
    upper === 'CON' ||
    upper === 'INT' ||
    upper === 'WIS' ||
    upper === 'CHA'
  ) {
    return upper;
  }
  return 'STR';
}

export function rollAbilityCheck(
  pc: PlayerCharacter,
  ability: AbilityName | string,
  controls: QuickRollControls = {}
): RollEvent {
  const normAbil = normalizeAbilityKey(ability);
  const eff = computeEffectiveCharacterStats(pc);
  const check = eff.abilityChecks[normAbil];
  // Separate non-flat dice formulas from flat bonuses already included in effectiveMod
  const diceOnlyFormulas = check.bonusFormulas.filter((f) => /d/i.test(f));
  return executeSheetRoll({
    pc,
    label: `${normAbil} Check`,
    baseMod: check.effectiveMod,
    isD20: true,
    rollMode: controls.rollMode,
    effectRollMode: check.rollMode,
    bonusFormulas: diceOnlyFormulas,
    situationalBonus: controls.situationalBonus,
    secretRoll: controls.secretRoll,
    rng: controls.rng,
    now: controls.now,
  });
}

export function rollSavingThrow(
  pc: PlayerCharacter,
  ability: AbilityName | string,
  controls: QuickRollControls = {}
): RollEvent {
  const normAbil = normalizeAbilityKey(ability);
  const eff = computeEffectiveCharacterStats(pc);
  const save = eff.savingThrows[normAbil];
  const diceOnlyFormulas = save.bonusFormulas.filter((f) => /d/i.test(f));
  return executeSheetRoll({
    pc,
    label: `${normAbil} Save`,
    baseMod: save.effectiveMod,
    isD20: true,
    rollMode: controls.rollMode,
    effectRollMode: save.rollMode,
    bonusFormulas: diceOnlyFormulas,
    situationalBonus: controls.situationalBonus,
    secretRoll: controls.secretRoll,
    rng: controls.rng,
    now: controls.now,
  });
}

export function rollSkillCheck(
  pc: PlayerCharacter,
  skill: SkillName | string,
  controls: QuickRollControls = {}
): RollEvent {
  const eff = computeEffectiveCharacterStats(pc);
  const sk = eff.skills[skill as SkillName] ?? eff.skills.Perception;
  const diceOnlyFormulas = sk.bonusFormulas.filter((f) => /d/i.test(f));
  return executeSheetRoll({
    pc,
    label: `${skill} Check`,
    baseMod: sk.effectiveMod,
    isD20: true,
    rollMode: controls.rollMode,
    effectRollMode: sk.rollMode,
    bonusFormulas: diceOnlyFormulas,
    situationalBonus: controls.situationalBonus,
    secretRoll: controls.secretRoll,
    rng: controls.rng,
    now: controls.now,
  });
}

export function rollInitiativeCheck(
  pc: PlayerCharacter,
  controls: QuickRollControls = {}
): RollEvent {
  const eff = computeEffectiveCharacterStats(pc);
  const diceOnlyFormulas = eff.initiativeRollContext.bonusFormulas.filter((f) => /d/i.test(f));
  return executeSheetRoll({
    pc,
    label: 'Initiative',
    baseMod: eff.initiativeMod,
    isD20: true,
    rollMode: controls.rollMode,
    effectRollMode: eff.initiativeRollContext.rollMode,
    bonusFormulas: diceOnlyFormulas,
    situationalBonus: controls.situationalBonus,
    secretRoll: controls.secretRoll,
    rng: controls.rng,
    now: controls.now,
  });
}

export function rollWeaponOrSpellAttack(
  pc: PlayerCharacter,
  attack: { name: string; attackBonus: number; damage?: string; damageExpr?: string; damageType?: string },
  controls: QuickRollControls = {}
): RollEvent {
  const eff = computeEffectiveCharacterStats(pc);
  const diceOnlyFormulas = eff.attackRollContext.bonusFormulas.filter((f) => /d/i.test(f));
  return executeSheetRoll({
    pc,
    label: `${attack.name} Attack`,
    baseMod: attack.attackBonus + eff.attackRollContext.flatBonusDelta,
    isD20: true,
    rollMode: controls.rollMode,
    effectRollMode: eff.attackRollContext.rollMode,
    bonusFormulas: diceOnlyFormulas,
    situationalBonus: controls.situationalBonus,
    secretRoll: controls.secretRoll,
    rng: controls.rng,
    now: controls.now,
  });
}

export function rollAttackDamage(
  pc: PlayerCharacter,
  attack: { name: string; damageExpr?: string; damage?: string; damageType?: string },
  controls: QuickRollControls & { isCrit?: boolean } = {}
): RollEvent {
  const eff = computeEffectiveCharacterStats(pc);
  let expr = (attack.damageExpr ?? attack.damage ?? '1d6').trim() || '1d6';
  if (controls.isCrit) {
    // Double the leading dice count on a critical hit
    expr = expr.replace(/^(\d*)d(\d+)/i, (_m, cnt, sides) => {
      const n = cnt ? parseInt(cnt, 10) : 1;
      return `${n * 2}d${sides}`;
    });
  }
  const typeLabel = attack.damageType ? ` (${attack.damageType})` : '';
  return executeSheetRoll({
    pc,
    label: `${attack.name} Damage${typeLabel}${controls.isCrit ? ' [CRIT]' : ''}`,
    baseFormula: expr,
    isD20: false,
    bonusFormulas: eff.damageBonusFormulas,
    situationalBonus: controls.situationalBonus,
    secretRoll: controls.secretRoll,
    rng: controls.rng,
    now: controls.now,
  });
}

export function rollCharacterHitDie(
  pc: PlayerCharacter,
  controls: QuickRollControls = {}
): {
  roll: RollEvent;
  rollEvent: RollEvent;
  updatedPc: PlayerCharacter;
  hpHealed: number;
  nextCurrentHp: number;
} {
  const dieSize = pc.hitDice?.dieSize || 8;
  const abils = (pc.abilities ?? {}) as Record<string, number>;
  const conScore = abils.CON ?? abils.con ?? 10;
  const conMod = abilityMod(conScore);
  const formula = `1d${dieSize}${formatMod(conMod)}`;
  const roll = executeSheetRoll({
    pc,
    label: `Hit Die (d${dieSize})`,
    baseFormula: formula,
    isD20: false,
    situationalBonus: controls.situationalBonus,
    secretRoll: controls.secretRoll,
    rng: controls.rng,
    now: controls.now,
  });

  const used = Math.min(pc.hitDice.max, (pc.hitDice.used ?? 0) + 1);
  const healAmount = Math.max(1, roll.total);
  const nextCurrentHp = Math.min(pc.hp.max, pc.hp.current + healAmount);

  return {
    roll,
    rollEvent: roll,
    hpHealed: healAmount,
    nextCurrentHp,
    updatedPc: {
      ...pc,
      hp: { ...pc.hp, current: nextCurrentHp },
      hitDice: { ...pc.hitDice, used },
    },
  };
}

export function rollCharacterDeathSave(
  pc: PlayerCharacter,
  controls: QuickRollControls = {}
): {
  roll: RollEvent;
  rollEvent: RollEvent;
  updatedPc: PlayerCharacter;
  nextDeathSaves: { successes: DeathSaveCount; failures: DeathSaveCount };
  regainedOneHp: boolean;
  revivedWithOneHp: boolean;
} {
  const eff = computeEffectiveCharacterStats(pc);
  // Bless / generic save bonuses also apply to Death Saving Throws in 5e!
  const allSaveBuffFormulas: string[] = [];
  let flatBonus = 0;
  for (const buff of pc.activeBuffs ?? []) {
    if (!buff) continue;
    if ((buff.affectsSaves === 'all' || !buff.affectsSaves) && buff.saveBonusFormula) {
      if (/^[+-]?\d+$/.test(buff.saveBonusFormula.trim())) {
        flatBonus += parseInt(buff.saveBonusFormula.trim(), 10);
      } else {
        allSaveBuffFormulas.push(buff.saveBonusFormula);
      }
    }
  }
  const roll = executeSheetRoll({
    pc,
    label: 'Death Saving Throw',
    baseMod: flatBonus,
    isD20: true,
    rollMode: controls.rollMode ?? controls.rollModeOverride,
    effectRollMode: eff.savingThrows.CON.rollMode === 'disadvantage' && (pc.exhaustion ?? 0) >= 3 ? 'disadvantage' : 'normal',
    bonusFormulas: allSaveBuffFormulas,
    situationalBonus: controls.situationalBonus,
    secretRoll: controls.secretRoll,
    rng: controls.rng,
    now: controls.now,
  });

  let successes = pc.deathSaves?.successes ?? 0;
  let failures = pc.deathSaves?.failures ?? 0;
  let nextHp = { ...pc.hp };
  let regainedOneHp = false;

  if (roll.crit === 'nat20') {
    nextHp = { ...pc.hp, current: Math.max(1, pc.hp.current) };
    successes = 0;
    failures = 0;
    regainedOneHp = true;
  } else if (roll.crit === 'nat1') {
    failures = Math.min(3, failures + 2) as DeathSaveCount;
  } else if (roll.total >= 10) {
    successes = Math.min(3, successes + 1) as DeathSaveCount;
  } else {
    failures = Math.min(3, failures + 1) as DeathSaveCount;
  }

  const nextDeathSaves = {
    successes: successes as DeathSaveCount,
    failures: failures as DeathSaveCount,
  };

  return {
    roll,
    rollEvent: roll,
    nextDeathSaves,
    regainedOneHp,
    revivedWithOneHp: regainedOneHp,
    updatedPc: {
      ...pc,
      hp: nextHp,
      deathSaves: nextDeathSaves,
    },
  };
}

export function rollConcentrationCheck(
  pc: PlayerCharacter,
  damageTaken: number,
  controls: QuickRollControls = {}
): RollEvent & { roll: RollEvent; rollEvent: RollEvent; dc: number; passed: boolean } {
  const dc = Math.max(10, Math.floor(Math.max(0, damageTaken) / 2));
  const eff = computeEffectiveCharacterStats(pc);
  const conSave = eff.savingThrows.CON;
  const diceOnlyFormulas = conSave.bonusFormulas.filter((f) => /d/i.test(f));
  const roll = executeSheetRoll({
    pc,
    label: `Concentration Save (DC ${dc})`,
    baseMod: conSave.effectiveMod,
    isD20: true,
    rollMode: controls.rollMode ?? controls.rollModeOverride,
    effectRollMode: conSave.rollMode,
    bonusFormulas: diceOnlyFormulas,
    situationalBonus: controls.situationalBonus,
    secretRoll: controls.secretRoll,
    rng: controls.rng,
    now: controls.now,
  });
  const passed = roll.total >= dc;
  const result = { ...roll } as RollEvent & {
    roll: RollEvent;
    rollEvent: RollEvent;
    dc: number;
    passed: boolean;
  };
  Object.defineProperties(result, {
    roll: { value: roll, enumerable: false },
    rollEvent: { value: roll, enumerable: false },
    dc: { value: dc, enumerable: false },
    passed: { value: passed, enumerable: false },
  });
  return result;
}

// ---- Smart Spell & Limited-Use Feature Roll Hooks -----------------------

const KNOWN_CONCENTRATION_SPELLS = new Set([
  'bless',
  'bane',
  'guidance',
  'haste',
  'hex',
  'hunter\'s mark',
  'hunters mark',
  'faerie fire',
  'entangle',
  'hold person',
  'hold monster',
  'fly',
  'invisibility',
  'greater invisibility',
  'polymorph',
  'spirit guardians',
  'flaming sphere',
  'moonbeam',
  'call lightning',
  'hypnotic pattern',
  'slow',
  'banishment',
  'wall of fire',
  'wall of force',
  'heat metal',
  'silence',
  'darkness',
  'pass without trace',
  'barkskin',
  'shield of faith',
  'blur',
  'WEB',
  'web',
  'levitate',
  'suggestion',
]);

export interface ParsedSpellInfo {
  cleanName: string;
  name: string;
  isCantrip: boolean;
  inferredLevel: SpellSlotLevel | null;
  level: number;
  requiresConcentration: boolean;
}

export function parseSpellMetadata(spellEntry: string): ParsedSpellInfo {
  const raw = spellEntry.trim();
  const hasConcTag =
    /\[c\]/i.test(raw) ||
    /\(concentration\)/i.test(raw) ||
    /\bconc\b/i.test(raw);
  const isCantrip = /\bcantrip\b/i.test(raw) || /\blv\s*0\b/i.test(raw);

  const lvlMatch =
    raw.match(/\b(?:lv|lvl|level)\s*([1-9])\b/i) ||
    raw.match(/\b([1-9])(?:st|nd|rd|th)[\s-]*level\b/i);
  const inferredLevel = lvlMatch ? (parseInt(lvlMatch[1], 10) as SpellSlotLevel) : null;

  const cleanName = raw
    .replace(/\[c\]/gi, '')
    .replace(/\(concentration\)/gi, '')
    .replace(/\((?:lv|lvl|level)\s*\d+\)/gi, '')
    .replace(/\(cantrip\)/gi, '')
    .trim();

  const requiresConcentration =
    hasConcTag || KNOWN_CONCENTRATION_SPELLS.has(cleanName.toLowerCase());

  const finalName = cleanName || raw;
  const level = isCantrip ? 0 : inferredLevel ?? 1;

  return {
    cleanName: finalName,
    name: finalName,
    isCantrip,
    inferredLevel,
    level,
    requiresConcentration,
  };
}

export function getAvailableSpellSlotsForPc(
  pc: PlayerCharacter,
  minLevel: number = 1
): Array<{ kind: 'spell' | 'pact'; level: SpellSlotLevel; remaining: number; max: number; label: string }> {
  const available: Array<{ kind: 'spell' | 'pact'; level: SpellSlotLevel; remaining: number; max: number; label: string }> = [];
  if (pc.pactSlots && pc.pactSlots.max > pc.pactSlots.used && pc.pactSlots.level >= minLevel) {
    const rem = pc.pactSlots.max - pc.pactSlots.used;
    available.push({
      kind: 'pact',
      level: pc.pactSlots.level,
      remaining: rem,
      max: pc.pactSlots.max,
      label: `Pact Slot L${pc.pactSlots.level} (${rem}/${pc.pactSlots.max})`,
    });
  }
  const rawSlots = pc.spellSlots as unknown;
  if (Array.isArray(rawSlots)) {
    for (const s of rawSlots) {
      if (s && typeof s.level === 'number' && s.level >= minLevel && s.max > s.used) {
        const rem = s.max - s.used;
        available.push({
          kind: 'spell',
          level: s.level as SpellSlotLevel,
          remaining: rem,
          max: s.max,
          label: `Lvl ${s.level} Slot (${rem}/${s.max})`,
        });
      }
    }
  } else if (rawSlots && typeof rawSlots === 'object') {
    for (const lvl of SPELL_SLOT_LEVELS) {
      if (lvl < minLevel) continue;
      const slot = (rawSlots as Record<number, { max: number; used: number }>)[lvl];
      if (slot && slot.max > slot.used) {
        const rem = slot.max - slot.used;
        available.push({
          kind: 'spell',
          level: lvl,
          remaining: rem,
          max: slot.max,
          label: `Lvl ${lvl} Slot (${rem}/${slot.max})`,
        });
      }
    }
  }
  return available;
}

export function applySpellCastToPc(
  pc: PlayerCharacter,
  opts: {
    spellName: string;
    deductSlot?: { kind: 'spell' | 'pact'; level: number } | null;
    slotKind?: 'spell' | 'pact';
    slotLevel?: number;
    setConcentration?: boolean;
  }
): PlayerCharacter & { updatedPc: PlayerCharacter } {
  let nextPc: PlayerCharacter = { ...pc };
  const deductSlot =
    opts.deductSlot ??
    (opts.slotKind && opts.slotLevel && opts.slotLevel > 0
      ? { kind: opts.slotKind, level: opts.slotLevel }
      : null);

  if (deductSlot) {
    if (deductSlot.kind === 'pact' && nextPc.pactSlots) {
      nextPc = {
        ...nextPc,
        pactSlots: {
          ...nextPc.pactSlots,
          used: Math.min(nextPc.pactSlots.max, nextPc.pactSlots.used + 1),
        },
      };
    } else if (deductSlot.kind === 'spell' && nextPc.spellSlots) {
      const lvl = deductSlot.level as SpellSlotLevel;
      if (Array.isArray(nextPc.spellSlots)) {
        nextPc = {
          ...nextPc,
          spellSlots: nextPc.spellSlots.map((s) =>
            s.level === lvl ? { ...s, used: Math.min(s.max, s.used + 1) } : s
          ) as any,
        };
      } else {
        const existing = nextPc.spellSlots[lvl];
        if (existing) {
          nextPc = {
            ...nextPc,
            spellSlots: {
              ...nextPc.spellSlots,
              [lvl]: {
                ...existing,
                used: Math.min(existing.max, existing.used + 1),
              },
            },
          };
        }
      }
    }
  }

  if (opts.setConcentration) {
    const meta = parseSpellMetadata(opts.spellName);
    nextPc = {
      ...nextPc,
      concentrationSpell: meta.cleanName,
    };
  }

  const result = { ...nextPc } as PlayerCharacter & { updatedPc: PlayerCharacter };
  Object.defineProperty(result, 'updatedPc', {
    value: nextPc,
    enumerable: false,
  });
  return result;
}

export function deductFeatureOrResourceUse(
  pc: PlayerCharacter,
  featureOrPoolIdOrName: string | { featureName?: string; poolId?: string }
): { updatedPc: PlayerCharacter; deductedLabel: string | null } {
  const rawKey =
    typeof featureOrPoolIdOrName === 'string'
      ? featureOrPoolIdOrName
      : featureOrPoolIdOrName.poolId || featureOrPoolIdOrName.featureName || '';
  const key = rawKey.trim().toLowerCase();
  let deductedLabel: string | null = null;

  const features: FeatureEntry[] = (pc.features ?? []).map((f) => {
    const currentUses = f.uses ? (typeof f.uses.current === 'number' ? f.uses.current : f.uses.max - (f.uses.used ?? 0)) : 0;
    if (
      !deductedLabel &&
      f.uses &&
      currentUses > 0 &&
      ((f.id && f.id.toLowerCase() === key) || f.name.trim().toLowerCase() === key)
    ) {
      const nextUsed = (f.uses.used ?? (f.uses.max - currentUses)) + 1;
      const nextCurrent = Math.max(0, f.uses.max - nextUsed);
      deductedLabel = `${f.name} (${nextCurrent}/${f.uses.max} left)`;
      return {
        ...f,
        uses: { ...f.uses, used: nextUsed, current: nextCurrent },
      };
    }
    return f;
  });

  const resourcePools = pc.resourcePools
    ? pc.resourcePools.map((p) => {
        if (
          !deductedLabel &&
          p.current > 0 &&
          (p.id.toLowerCase() === key || p.name.trim().toLowerCase() === key)
        ) {
          deductedLabel = `${p.name} (${p.current - 1}/${p.max} left)`;
          return {
            ...p,
            current: p.current - 1,
          };
        }
        return p;
      })
    : pc.resourcePools;

  return {
    updatedPc: {
      ...pc,
      features,
      ...(resourcePools ? { resourcePools } : {}),
    },
    deductedLabel,
  };
}

// ---- Ring Buffer & Secret Roll Privacy Invariants -----------------------

/**
 * Strips any `secretRoll: true` roll events and removes internal flags so
 * outbound `pcWritebacks` and campaign projections NEVER leak secret rolls.
 */
export function sanitizeRollEventsForOutbound(
  events: readonly RollEvent[] | undefined,
  cap: number = ROLL_RING_BUFFER_CAP
): RollEvent[] {
  if (!Array.isArray(events)) return [];
  const filtered = events
    .filter((e) => e && typeof e === 'object' && e.secretRoll !== true)
    .map((e) => {
      const { secretRoll: _secret, ...publicEvent } = e;
      return {
        ...publicEvent,
        crit: e.crit === 'nat20' || e.crit === 'nat1' ? e.crit : null,
      };
    });
  // Deduplicate by id preserving order
  const byId = new Map<string, RollEvent>();
  for (const ev of filtered) {
    if (ev.id) byId.set(ev.id, ev);
  }
  const deduped = Array.from(byId.values()).sort((a, b) => a.timestamp - b.timestamp);
  return deduped.slice(-cap);
}

/**
 * Appends one or more RollEvents to a bounded ring buffer (default 50).
 * When `includeSecret` is false (default for shared/public feeds), `secretRoll: true`
 * events are strictly ignored and stripped.
 */
export function appendRollEventRingBuffer(
  existing: readonly RollEvent[] | undefined,
  incoming: RollEvent | readonly RollEvent[],
  opts: number | { cap?: number; includeSecret?: boolean } = {}
): RollEvent[] {
  const cap =
    typeof opts === 'number' ? opts : opts.cap ?? ROLL_RING_BUFFER_CAP;
  const includeSecret = typeof opts === 'object' && opts.includeSecret === true;
  const incomingList = Array.isArray(incoming) ? incoming : [incoming];
  const combined = [...(existing ?? []), ...incomingList];

  if (!includeSecret) {
    return sanitizeRollEventsForOutbound(combined, cap);
  }

  const byId = new Map<string, RollEvent>();
  for (const ev of combined) {
    if (ev && typeof ev === 'object' && ev.id) {
      byId.set(ev.id, ev);
    }
  }
  return Array.from(byId.values())
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-cap);
}
