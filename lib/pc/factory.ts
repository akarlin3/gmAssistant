// PC construction + normalization. `normalizePc` is the read-side guard: PCs
// come back from Firestore as untyped JSON, so we coerce every field to its
// declared shape (fail-safe defaults) before the UI or integrations touch it.

import { proficiencyBonusForLevel } from './derived';
import {
  ABILITY_NAMES,
  PC_CAP,
  SPELL_SLOT_LEVELS,
  type AbilityName,
  type ActiveBuff,
  type Attack,
  type AttitudeTag,
  type CoinPurse,
  type DeathSaveCount,
  type ExhaustionLevel,
  type FeatureEntry,
  type InventoryItem,
  type PactMagicSlots,
  type PartyLootItem,
  type PcClass,
  type PcResourcePool,
  type PlayerCharacter,
  type PcOwnership,
  type PlayerJournalEntry,
  type PlayerLoreAnnotation,
  type PlayerQuest,
  type PlayerQuestCategory,
  type PlayerQuestStatus,
  type PlayerStickyCard,
  type PlayerTheoryLink,
  type RechargeTiming,
  type RollEvent,
  type SkillName,
  type SpellSlot,
  type SpellSlotLevel,
  type TurnActionEconomy,
} from './types';
import { SKILL_ABILITIES } from './skills';

export function makePcId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `pc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyPc(id?: string): PlayerCharacter {
  const pc = emptyPc();
  if (id) pc.id = id;
  return pc;
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
    ownership: { ownerType: 'dm' },
  };
}

// Shallow top-level merge over a fresh PC. Handy for tests and for seeding a PC
// from a partial (e.g. the parser mapper) without re-listing every field.
export function makePc(partial: Partial<PlayerCharacter> = {}): PlayerCharacter {
  return { ...emptyPc(), ...partial };
}

export const newPc = makePc;

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
      ...(o.attuned !== undefined ? { attuned: o.attuned === true } : {}),
      ...(o.notes !== undefined ? { notes: asStr(o.notes) } : {}),
      ...(typeof o.sharedWithGm === 'boolean' ? { sharedWithGm: o.sharedWithGm } : {}),
    };
  });
}

function normResourcePools(v: unknown): PcResourcePool[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v.map((p) => {
    const o = (p as Record<string, unknown>) || {};
    const r = asStr(o.rechargeOn);
    const rechargeOn: RechargeTiming =
      r === 'short' || r === 'long' || r === 'dawn' || r === 'manual' ? r : 'long';
    const max = clampInt(o.max, 0, 9999, 1);
    return {
      id: asStr(o.id) || makePcId(),
      name: asStr(o.name),
      current: clampInt(o.current, 0, 9999, max),
      max,
      rechargeOn,
    };
  });
}

function normPactSlots(v: unknown): (PactMagicSlots & { slotLevel?: SpellSlotLevel }) | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const lvl = clampInt(o.level ?? o.slotLevel, 1, 9, 1) as SpellSlotLevel;
  return {
    level: lvl,
    slotLevel: lvl,
    max: clampInt(o.max, 0, 99, 0),
    used: clampInt(o.used, 0, 99, 0),
  };
}

function normCurrency(v: unknown): CoinPurse | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  return {
    cp: clampInt(o.cp, 0, 9999999, 0),
    sp: clampInt(o.sp, 0, 9999999, 0),
    ep: clampInt(o.ep, 0, 9999999, 0),
    gp: clampInt(o.gp, 0, 9999999, 0),
    pp: clampInt(o.pp, 0, 9999999, 0),
  };
}

function normSharedQuests(v: unknown): PlayerQuest[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v
    .filter((q) => q && typeof q === 'object' && (q as Record<string, unknown>).sharedWithGm === true)
    .map((q) => {
      const o = q as Record<string, unknown>;
      const st = asStr(o.status);
      const status: PlayerQuestStatus =
        st === 'active' || st === 'completed' || st === 'failed' ? st : 'active';
      const cat = asStr(o.category);
      const category: PlayerQuestCategory | undefined =
        cat === 'quest' || cat === 'goal' || cat === 'rumor' ? cat : undefined;
      return {
        id: asStr(o.id) || makePcId(),
        title: asStr(o.title),
        status,
        notes: asStr(o.notes),
        linkedEntityIds: asStrArr(o.linkedEntityIds),
        sharedWithGm: true,
        ...(category ? { category } : {}),
      };
    });
}

function normSharedAnnotations(v: unknown): PlayerLoreAnnotation[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v
    .filter((a) => a && typeof a === 'object' && (a as Record<string, unknown>).sharedWithGm === true)
    .map((a) => {
      const o = a as Record<string, unknown>;
      const tag = asStr(o.attitudeTag);
      const attitudeTag: AttitudeTag | undefined =
        tag === 'friendly' || tag === 'neutral' || tag === 'suspicious' || tag === 'hostile'
          ? tag
          : undefined;
      return {
        id: asStr(o.id) || makePcId(),
        entityId: asStr(o.entityId),
        ...(o.entityType ? { entityType: asStr(o.entityType) } : {}),
        ...(o.entityName ? { entityName: asStr(o.entityName) } : {}),
        ...(attitudeTag ? { attitudeTag } : {}),
        privateNotes: asStr(o.privateNotes),
        ...(o.sharedNotes !== undefined ? { sharedNotes: asStr(o.sharedNotes) } : {}),
        sharedWithGm: true,
      };
    });
}

function normSharedJournal(v: unknown): PlayerJournalEntry[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v
    .filter((j) => j && typeof j === 'object' && (j as Record<string, unknown>).sharedWithGm === true)
    .map((j) => {
      const o = j as Record<string, unknown>;
      return {
        id: asStr(o.id) || makePcId(),
        sessionNumber: clampInt(o.sessionNumber, 0, 9999, 1),
        date: asStr(o.date),
        title: asStr(o.title),
        content: asStr(o.content),
        sharedWithGm: true,
      };
    });
}

function normSharedTheoryLinks(v: unknown): PlayerTheoryLink[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v
    .filter((l) => l && typeof l === 'object' && (l as Record<string, unknown>).sharedWithGm === true)
    .map((l) => {
      const o = l as Record<string, unknown>;
      return {
        id: asStr(o.id) || makePcId(),
        sourceId: asStr(o.sourceId),
        targetId: asStr(o.targetId),
        label: asStr(o.label),
        color: asStr(o.color) || '#f59e0b',
        sharedWithGm: true,
        ...(typeof o.updatedAt === 'number' ? { updatedAt: o.updatedAt } : {}),
      };
    });
}

function normSharedStickyCards(v: unknown): PlayerStickyCard[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v
    .filter((c) => c && typeof c === 'object' && (c as Record<string, unknown>).sharedWithGm === true)
    .map((c) => {
      const o = c as Record<string, unknown>;
      return {
        id: asStr(o.id) || makePcId(),
        title: asStr(o.title),
        content: asStr(o.content),
        color: asStr(o.color) || '#fef08a',
        ...(typeof o.x === 'number' ? { x: asNum(o.x) } : {}),
        ...(typeof o.y === 'number' ? { y: asNum(o.y) } : {}),
        ...(typeof o.linkedEntityId === 'string' && o.linkedEntityId
          ? { linkedEntityId: o.linkedEntityId }
          : {}),
        sharedWithGm: true,
        ...(typeof o.updatedAt === 'number' ? { updatedAt: o.updatedAt } : {}),
      };
    });
}

function normActiveBuffs(v: unknown): ActiveBuff[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v
    .filter((b) => b && typeof b === 'object' && asStr((b as Record<string, unknown>).name).length > 0)
    .map((b) => {
      const o = b as Record<string, unknown>;
      const exp = asStr(o.expiresOn);
      const expiresOn =
        exp === 'turn' || exp === 'round' || exp === 'shortRest' || exp === 'longRest' || exp === 'manual'
          ? exp
          : undefined;
      const rm = asStr(o.rollModeOverride);
      const rollModeOverride =
        rm === 'advantage' || rm === 'disadvantage' || rm === 'normal' ? rm : undefined;
      return {
        id: asStr(o.id) || makePcId(),
        ...(typeof o.presetKey === 'string' && o.presetKey ? { presetKey: o.presetKey } : {}),
        name: asStr(o.name),
        ...(typeof o.acBonus === 'number' ? { acBonus: clampInt(o.acBonus, -50, 50, 0) } : {}),
        ...(typeof o.speedBonus === 'number' ? { speedBonus: clampInt(o.speedBonus, -500, 500, 0) } : {}),
        ...(typeof o.speedMultiplier === 'number' ? { speedMultiplier: asNum(o.speedMultiplier, 1) } : {}),
        ...(typeof o.saveBonusFormula === 'string' && o.saveBonusFormula ? { saveBonusFormula: o.saveBonusFormula } : {}),
        ...(typeof o.attackBonusFormula === 'string' && o.attackBonusFormula ? { attackBonusFormula: o.attackBonusFormula } : {}),
        ...(typeof o.checkBonusFormula === 'string' && o.checkBonusFormula ? { checkBonusFormula: o.checkBonusFormula } : {}),
        ...(typeof o.damageBonusFormula === 'string' && o.damageBonusFormula ? { damageBonusFormula: o.damageBonusFormula } : {}),
        ...(rollModeOverride ? { rollModeOverride } : {}),
        ...(typeof o.affectsChecks === 'boolean' ? { affectsChecks: o.affectsChecks } : {}),
        ...(typeof o.affectsAttacks === 'boolean' ? { affectsAttacks: o.affectsAttacks } : {}),
        ...(o.affectsSaves === 'all'
          ? { affectsSaves: 'all' as const }
          : Array.isArray(o.affectsSaves)
            ? {
                affectsSaves: asStrArr(o.affectsSaves).filter((a) => VALID_ABILITIES.has(a)) as AbilityName[],
              }
            : {}),
        ...(typeof o.mageArmor === 'boolean' ? { mageArmor: o.mageArmor } : {}),
        ...(expiresOn ? { expiresOn } : {}),
      };
    });
}

function normRollEvents(v: unknown): RollEvent[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v
    .filter((r) => r && typeof r === 'object' && (r as Record<string, unknown>).secretRoll !== true)
    .slice(-50)
    .map((r) => {
      const o = r as Record<string, unknown>;
      const critRaw = asStr(o.crit);
      const crit = critRaw === 'nat20' || critRaw === 'nat1' ? critRaw : null;
      return {
        id: asStr(o.id) || makePcId(),
        ...(o.pcId ? { pcId: asStr(o.pcId) } : {}),
        actorName: asStr(o.actorName) || 'Player',
        label: asStr(o.label),
        formula: asStr(o.formula),
        d20Rolls: Array.isArray(o.d20Rolls)
          ? (o.d20Rolls as unknown[]).map((n) => clampInt(n, 1, 100, 1))
          : [],
        total: Math.round(asNum(o.total)),
        breakdown: asStr(o.breakdown),
        crit,
        timestamp: Math.round(asNum(o.timestamp, Date.now())),
      };
    });
}

function normPartyLootItems(v: unknown): PartyLootItem[] | undefined {
  if (!Array.isArray(v)) return undefined;
  return v
    .filter((it) => it && typeof it === 'object')
    .map((it) => {
      const o = it as Record<string, unknown>;
      const curr = normCurrency(o.currency);
      return {
        id: asStr(o.id) || makePcId(),
        name: asStr(o.name),
        qty: clampInt(o.qty, 0, 99999, 1),
        ...(o.weight !== undefined ? { weight: asNum(o.weight) } : {}),
        ...(o.notes !== undefined ? { notes: asStr(o.notes) } : {}),
        ...(curr ? { currency: curr } : {}),
        ...(o.claimedByPcId ? { claimedByPcId: asStr(o.claimedByPcId) } : {}),
        ...(o.claimedByName ? { claimedByName: asStr(o.claimedByName) } : {}),
        ...(o.claimNonce ? { claimNonce: asStr(o.claimNonce) } : {}),
        ...(typeof o.splitCompleted === 'boolean' ? { splitCompleted: o.splitCompleted } : {}),
        ...(typeof o.updatedAt === 'number' ? { updatedAt: o.updatedAt } : {}),
      };
    });
}

function normTurnEconomy(v: unknown): TurnActionEconomy | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  return {
    action: o.action === true,
    bonusAction: o.bonusAction === true,
    movement: o.movement === true,
    reaction: o.reaction === true,
    freeInteraction: o.freeInteraction === true,
  };
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
  const out: Partial<Record<SpellSlotLevel, SpellSlot>> = {};
  let any = false;
  if (Array.isArray(v)) {
    for (const item of v) {
      if (item && typeof item === 'object') {
        const rec = item as Record<string, unknown>;
        const lvl = clampInt(rec.level, 1, 9, 0) as SpellSlotLevel;
        if (SPELL_SLOT_LEVELS.includes(lvl)) {
          out[lvl] = {
            max: clampInt(rec.max, 0, 99, 0),
            used: clampInt(rec.used, 0, 99, 0),
          };
          any = true;
        }
      }
    }
    return any ? out : undefined;
  }
  const o = v as Record<string, unknown>;
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

function normOwnership(v: unknown): PcOwnership {
  if (!v || typeof v !== 'object') return { ownerType: 'dm' };
  const o = v as Record<string, unknown>;
  const ownerType = o.ownerType === 'player' ? 'player' : 'dm';
  return {
    ownerType,
    ...(o.playerSlotId ? { playerSlotId: asStr(o.playerSlotId) } : {}),
  };
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
  const skillExpertise = asStrArr(o.skillExpertise).filter((x) =>
    VALID_SKILLS.has(x),
  ) as SkillName[];

  const spellcastingAbility = asStr(o.spellcastingAbility);
  const resourcePools = normResourcePools(o.resourcePools);
  const pactSlots = normPactSlots(o.pactSlots);
  const currency = normCurrency(o.currency);
  const sharedQuests = normSharedQuests(o.sharedQuests);
  const sharedAnnotations = normSharedAnnotations(o.sharedAnnotations);
  const sharedJournal = normSharedJournal(o.sharedJournal);
  const sharedTheoryLinks = normSharedTheoryLinks(o.sharedTheoryLinks);
  const sharedStickyCards = normSharedStickyCards(o.sharedStickyCards);
  const activeBuffs = normActiveBuffs(o.activeBuffs);
  const rollEvents = normRollEvents(o.rollEvents);
  const partyLootItems = normPartyLootItems(o.partyLootItems);
  const turnEconomy = normTurnEconomy(o.turnEconomy);

  const hpCurrentRaw = hp.current !== undefined ? hp.current : o.currentHp;
  const hpMaxRaw = hp.max !== undefined ? hp.max : o.maxHp;
  const hpTempRaw = hp.temp !== undefined ? hp.temp : o.tempHp;

  return {
    id: asStr(o.id) || base.id,
    name: asStr(o.name),
    ...(typeof o.player === 'string' && o.player ? { player: o.player } : {}),
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
      current: clampInt(hpCurrentRaw, -999, 9999, 0),
      max: clampInt(hpMaxRaw, 0, 9999, 0),
      temp: clampInt(hpTempRaw, 0, 9999, 0),
    },
    hitDice: {
      dieSize: clampInt(hd.dieSize, 1, 100, 8),
      max: clampInt(hd.max, 0, 99, 1),
      used: clampInt(hd.used, 0, 99, 0),
    },
    ac: clampInt(o.ac, 0, 99, 10),
    initiativeMod: Math.round(asNum(o.initiativeMod)),
    speed: clampInt(o.speed, 0, 999, 30),
    ...(typeof o.inspiration === 'boolean' ? { inspiration: o.inspiration } : {}),
    conditions: asStrArr(o.conditions),
    exhaustion: clampInt(o.exhaustion, 0, 6, 0) as ExhaustionLevel,
    deathSaves: {
      successes: clampInt(ds.successes, 0, 3, 0) as DeathSaveCount,
      failures: clampInt(ds.failures, 0, 3, 0) as DeathSaveCount,
    },
    ...(normSpellSlots(o.spellSlots) ? { spellSlots: normSpellSlots(o.spellSlots) } : {}),
    ...(pactSlots ? { pactSlots } : {}),
    ...(Array.isArray(o.spellsKnown)
      ? {
          spellsKnown: (o.spellsKnown as unknown[])
            .map((item) => {
              if (typeof item === 'string') return item;
              if (item && typeof item === 'object') {
                const rec = item as Record<string, unknown>;
                const nm = asStr(rec.name);
                if (!nm) return '';
                return rec.concentration === true ? `${nm} [C]` : nm;
              }
              return '';
            })
            .filter(Boolean),
        }
      : {}),
    ...(VALID_ABILITIES.has(spellcastingAbility)
      ? { spellcastingAbility: spellcastingAbility as AbilityName }
      : {}),
    ...(resourcePools ? { resourcePools } : {}),
    inventory: normInventory(o.inventory),
    ...(o.attunedCount !== undefined ? { attunedCount: clampInt(o.attunedCount, 0, 3, 0) } : {}),
    ...(currency ? { currency } : {}),
    ...(typeof o.partyLoot === 'string' ? { partyLoot: o.partyLoot } : {}),
    attacks: normAttacks(o.attacks),
    features: normFeatures(o.features),
    notes: asStr(o.notes),
    goals: asStrArr(o.goals),
    bonds: asStrArr(o.bonds),
    ideals: asStrArr(o.ideals),
    flaws: asStrArr(o.flaws),
    ...(sharedQuests ? { sharedQuests } : {}),
    ...(sharedAnnotations ? { sharedAnnotations } : {}),
    ...(sharedJournal ? { sharedJournal } : {}),
    ...(sharedTheoryLinks ? { sharedTheoryLinks } : {}),
    ...(sharedStickyCards ? { sharedStickyCards } : {}),
    ...(activeBuffs ? { activeBuffs } : {}),
    ...(rollEvents ? { rollEvents } : {}),
    ...(partyLootItems ? { partyLootItems } : {}),
    ...(Array.isArray(o.quests) ? { quests: o.quests as PlayerQuest[] } : {}),
    ...(Array.isArray(o.journalEntries) ? { journalEntries: o.journalEntries as PlayerJournalEntry[] } : {}),
    ...(turnEconomy ? { turnEconomy } : {}),
    ...(typeof o.concentrationSpell === 'string' ? { concentrationSpell: o.concentrationSpell } : {}),
    ...(typeof o.downtimeDays === 'number' ? { downtimeDays: clampInt(o.downtimeDays, 0, 99999, 0) } : {}),
    ...(o.renown && typeof o.renown === 'object' ? { renown: o.renown as Record<string, number> } : {}),
    ...(skillExpertise.length > 0 ? { skillExpertise } : {}),
    ...(Array.isArray(o.resistances) ? { resistances: asStrArr(o.resistances) } : {}),
    ...(Array.isArray(o.immunities) ? { immunities: asStrArr(o.immunities) } : {}),
    ...(Array.isArray(o.senses) ? { senses: asStrArr(o.senses) } : {}),
    ...(typeof o.backstory === 'string' ? { backstory: o.backstory } : {}),
    ...(typeof o.privateNotes === 'string' ? { privateNotes: o.privateNotes } : {}),
    ...(typeof o.gmNotes === 'string' ? { gmNotes: o.gmNotes } : {}),
    ...(typeof o.gmSecrets === 'string'
      ? { gmSecrets: o.gmSecrets as unknown as string[] }
      : Array.isArray(o.gmSecrets)
        ? { gmSecrets: asStrArr(o.gmSecrets) }
        : {}),
    ...(o.evaluation && typeof o.evaluation === 'object' ? { evaluation: o.evaluation as PlayerCharacter['evaluation'] } : {}),
    ownership: normOwnership(o.ownership),
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
