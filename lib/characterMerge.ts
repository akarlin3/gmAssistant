import {
  SPELL_SLOT_LEVELS,
  type InventoryItem,
  type PactMagicSlots,
  type PcResourcePool,
  type PlayerCharacter,
  type SpellSlot,
  type SpellSlotLevel,
} from './pc/types';
import { evaluateCharacterSheet, type EvaluatedPlayerCharacter } from './characterEvaluator';

function normalizeKey(s: string | undefined | null): string {
  return (s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function readMaxHp(pc: Record<string, unknown>): number {
  const hp = pc.hp as Record<string, unknown> | undefined;
  if (typeof pc.maxHp === 'number' && Number.isFinite(pc.maxHp)) return pc.maxHp;
  if (hp && typeof hp.max === 'number' && Number.isFinite(hp.max)) return hp.max;
  return 0;
}

function readCurrentHp(pc: Record<string, unknown>, fallbackMax: number): number {
  const hp = pc.hp as Record<string, unknown> | undefined;
  if (typeof pc.currentHp === 'number' && Number.isFinite(pc.currentHp)) return pc.currentHp;
  if (hp && typeof hp.current === 'number' && Number.isFinite(hp.current)) return hp.current;
  return fallbackMax;
}

function readTempHp(pc: Record<string, unknown>): number {
  const hp = pc.hp as Record<string, unknown> | undefined;
  if (typeof pc.tempHp === 'number' && Number.isFinite(pc.tempHp)) return pc.tempHp;
  if (hp && typeof hp.temp === 'number' && Number.isFinite(hp.temp)) return hp.temp;
  return 0;
}

type NormalizedSlotInfo = {
  max: number;
  current: number;
  used: number;
};

function extractSlotInfo(rawSlot: unknown): NormalizedSlotInfo | null {
  if (!rawSlot || typeof rawSlot !== 'object') return null;
  const s = rawSlot as Record<string, unknown>;
  const max = typeof s.max === 'number' ? Math.max(0, s.max) : 0;
  if (typeof s.current === 'number') {
    const current = Math.max(0, Math.min(max, s.current));
    return { max, current, used: Math.max(0, max - current) };
  }
  const used = typeof s.used === 'number' ? Math.max(0, Math.min(max, s.used)) : 0;
  return { max, current: Math.max(0, max - used), used };
}

function extractSpellSlotsMap(
  rawSlots: unknown,
): Partial<Record<SpellSlotLevel, NormalizedSlotInfo>> {
  const map: Partial<Record<SpellSlotLevel, NormalizedSlotInfo>> = {};
  if (!rawSlots || typeof rawSlots !== 'object') return map;

  if (Array.isArray(rawSlots)) {
    for (const item of rawSlots) {
      if (item && typeof item === 'object') {
        const rec = item as Record<string, unknown>;
        const lvl = Number(rec.level) as SpellSlotLevel;
        if (SPELL_SLOT_LEVELS.includes(lvl)) {
          const info = extractSlotInfo(rec);
          if (info) map[lvl] = info;
        }
      }
    }
    return map;
  }

  const obj = rawSlots as Record<string, unknown>;
  for (const lvl of SPELL_SLOT_LEVELS) {
    const info = extractSlotInfo(obj[lvl] ?? obj[String(lvl)]);
    if (info) map[lvl] = info;
  }
  return map;
}

/**
 * Matches an uploaded PC against an existing party roster by:
 * 1. Explicit `targetPcId` or `targetSlotId` (ownership.playerSlotId)
 * 2. Exact `id` match
 * 3. Normalized character `name` match
 */
export function findMatchingExistingPc<T extends Partial<PlayerCharacter> & Record<string, unknown>>(
  pcs: T[],
  uploadedPc: Partial<PlayerCharacter> & Record<string, unknown>,
  optionsOrTargetPcId?: { targetPcId?: string; targetSlotId?: string } | string,
  targetSlotIdArg?: string,
): ({ pc: T; index: number; id?: string } & Partial<T>) | null {
  if (!Array.isArray(pcs) || pcs.length === 0) return null;

  const options =
    typeof optionsOrTargetPcId === 'string'
      ? { targetPcId: optionsOrTargetPcId, targetSlotId: targetSlotIdArg }
      : {
          targetPcId: optionsOrTargetPcId?.targetPcId,
          targetSlotId: optionsOrTargetPcId?.targetSlotId ?? targetSlotIdArg,
        };

  const wrapMatch = (idx: number) => ({
    ...pcs[idx],
    pc: pcs[idx],
    index: idx,
    id: pcs[idx].id,
  });

  if (options?.targetPcId) {
    const idx = pcs.findIndex((p) => p.id === options.targetPcId);
    if (idx !== -1) return wrapMatch(idx);
  }

  if (options?.targetSlotId) {
    const idx = pcs.findIndex(
      (p) =>
        p.ownership?.ownerType === 'player' &&
        p.ownership?.playerSlotId === options.targetSlotId,
    );
    if (idx !== -1) return wrapMatch(idx);
  }

  if (uploadedPc?.id) {
    const idx = pcs.findIndex((p) => p.id === uploadedPc.id);
    if (idx !== -1) return wrapMatch(idx);
  }

  const targetName = normalizeKey(uploadedPc?.name);
  if (targetName) {
    const idx = pcs.findIndex((p) => normalizeKey(p.name) === targetName);
    if (idx !== -1) return wrapMatch(idx);
  }

  return null;
}

/**
 * State-Preserving Delta Merge (`mergeUploadedCharacterSheet(existingPc, evaluatedPc)`):
 * Preserves active mid-session state when an uploaded sheet updates or levels up an existing PC:
 * 1. Vitals & Active Status:
 *    `damageTaken = Math.max(0, existingMaxHp - existingCurrentHp)`
 *    `currentHp = Math.max(0, evaluatedMaxHp - damageTaken)`
 *    Preserves `tempHp`, `conditions`, `deathSaves`, `exhaustion`, and `inspiration`.
 * 2. Spell Slots & Class Resource Pools:
 *    For every spell slot level (1-9 + Pact Magic) and matched class resource pool (including Hit Dice),
 *    `spent = Math.max(0, oldMax - oldCurrent)` and `current = Math.max(0, newMax - spent)`.
 *    Initializes newly unlocked pools/levels at `newMax` and retains custom manual trackers.
 * 3. Inventory, Notes & Privacy:
 *    Merges equipment while keeping custom player loot, `sharedWithGm` flags, GM-only secrets/notes,
 *    ownership, and local player quests/annotations/journals intact.
 */
export function mergeUploadedCharacterSheet(
  existingPcInput: Partial<PlayerCharacter> & Record<string, unknown>,
  evaluatedPcInput: Partial<PlayerCharacter> & Record<string, unknown>,
): EvaluatedPlayerCharacter {
  const existingRaw = (existingPcInput ?? {}) as Record<string, unknown>;
  const evaluated =
    evaluatedPcInput && (evaluatedPcInput as EvaluatedPlayerCharacter).evaluation
      ? (evaluatedPcInput as EvaluatedPlayerCharacter)
      : evaluateCharacterSheet(evaluatedPcInput);

  // 1. Vitals & Active Status Preservation
  const existingMaxHp = readMaxHp(existingRaw);
  const existingCurrentHp = readCurrentHp(existingRaw, existingMaxHp);
  const existingTempHp = readTempHp(existingRaw);

  const evaluatedMaxHp = readMaxHp(evaluated as unknown as Record<string, unknown>) || evaluated.hp.max;
  const damageTaken = Math.max(0, existingMaxHp - existingCurrentHp);
  const mergedCurrentHp = Math.max(0, evaluatedMaxHp - damageTaken);
  const mergedTempHp =
    existingTempHp > 0 ? existingTempHp : readTempHp(evaluated as unknown as Record<string, unknown>);

  const mergedConditions =
    Array.isArray(existingRaw.conditions) && existingRaw.conditions.length > 0
      ? (existingRaw.conditions as string[])
      : evaluated.conditions;

  const existingExhaustion =
    typeof existingRaw.exhaustion === 'number' ? existingRaw.exhaustion : 0;
  const mergedExhaustion = (
    existingExhaustion > 0 ? existingExhaustion : evaluated.exhaustion
  ) as PlayerCharacter['exhaustion'];

  const existingDeathSaves = existingRaw.deathSaves as
    | { successes?: number; failures?: number }
    | undefined;
  const mergedDeathSaves =
    existingDeathSaves &&
    ((existingDeathSaves.successes ?? 0) > 0 || (existingDeathSaves.failures ?? 0) > 0)
      ? {
          successes: Math.max(0, Math.min(3, existingDeathSaves.successes ?? 0)) as 0 | 1 | 2 | 3,
          failures: Math.max(0, Math.min(3, existingDeathSaves.failures ?? 0)) as 0 | 1 | 2 | 3,
        }
      : evaluated.deathSaves;

  const mergedInspiration =
    typeof existingRaw.inspiration === 'boolean'
      ? existingRaw.inspiration
      : evaluated.inspiration;

  // 2. Hit Dice Preservation
  const existingHd = (existingRaw.hitDice as Record<string, unknown>) || {};
  const oldHdMax = typeof existingHd.max === 'number' ? existingHd.max : existingPcInput.level || 1;
  const oldHdCurrent =
    typeof existingHd.current === 'number'
      ? existingHd.current
      : oldHdMax - (typeof existingHd.used === 'number' ? existingHd.used : 0);
  const hdSpent = Math.max(0, oldHdMax - oldHdCurrent);
  const newHdMax = Math.max(1, evaluated.hitDice.max || evaluated.level || 1);
  const newHdCurrent = Math.max(0, newHdMax - hdSpent);
  const newHdUsed = Math.max(0, newHdMax - newHdCurrent);

  const mergedHitDice = {
    dieSize: evaluated.hitDice.dieSize || (typeof existingHd.dieSize === 'number' ? existingHd.dieSize : 8),
    max: newHdMax,
    used: newHdUsed,
    current: newHdCurrent,
  };

  // 3. Spell Slots Preservation (1-9)
  const oldSlotsMap = extractSpellSlotsMap(existingRaw.spellSlots);
  const newSlotsMap = extractSpellSlotsMap(evaluated.spellSlots);
  const mergedSpellSlots: Partial<Record<SpellSlotLevel, SpellSlot & { current?: number }>> = {};
  let hasAnySpellSlots = false;

  for (const lvl of SPELL_SLOT_LEVELS) {
    const newSlot = newSlotsMap[lvl];
    const oldSlot = oldSlotsMap[lvl];
    if (newSlot && newSlot.max > 0) {
      const spent = oldSlot ? Math.max(0, oldSlot.max - oldSlot.current) : 0;
      const current = Math.max(0, newSlot.max - spent);
      const used = Math.max(0, newSlot.max - current);
      mergedSpellSlots[lvl] = { max: newSlot.max, used, current };
      hasAnySpellSlots = true;
    } else if (oldSlot && oldSlot.max > 0 && !evaluated.spellSlots) {
      mergedSpellSlots[lvl] = {
        max: oldSlot.max,
        used: oldSlot.used,
        current: oldSlot.current,
      };
      hasAnySpellSlots = true;
    }
  }

  // 4. Pact Magic Slots Preservation
  const oldPactInfo = extractSlotInfo(existingRaw.pactSlots);
  const newPactInfo = extractSlotInfo(evaluated.pactSlots);
  let mergedPactSlots: (PactMagicSlots & { current?: number }) | null | undefined =
    evaluated.pactSlots;
  if (evaluated.pactSlots && newPactInfo && newPactInfo.max > 0) {
    const spent = oldPactInfo ? Math.max(0, oldPactInfo.max - oldPactInfo.current) : 0;
    const current = Math.max(0, newPactInfo.max - spent);
    const used = Math.max(0, newPactInfo.max - current);
    mergedPactSlots = {
      level: evaluated.pactSlots.level,
      max: newPactInfo.max,
      used,
      current,
    };
  } else if (!evaluated.pactSlots && existingRaw.pactSlots && oldPactInfo) {
    const rawOldPact = existingRaw.pactSlots as Record<string, unknown>;
    mergedPactSlots = {
      level: (Number(rawOldPact.level) || 1) as SpellSlotLevel,
      max: oldPactInfo.max,
      used: oldPactInfo.used,
      current: oldPactInfo.current,
    };
  }

  // 5. Class Resource Pools Preservation
  const existingPools: PcResourcePool[] = Array.isArray(existingRaw.resourcePools)
    ? (existingRaw.resourcePools as PcResourcePool[])
    : [];
  const evaluatedPools: PcResourcePool[] = Array.isArray(evaluated.resourcePools)
    ? evaluated.resourcePools
    : [];

  const matchedExistingPoolIds = new Set<string>();
  const mergedPools: PcResourcePool[] = evaluatedPools.map((newPool) => {
    const normNewName = normalizeKey(newPool.name);
    const oldPool = existingPools.find(
      (p) => p.id === newPool.id || normalizeKey(p.name) === normNewName,
    );

    if (normNewName === 'hit dice' || newPool.id === 'res-hit-dice') {
      if (oldPool) matchedExistingPoolIds.add(oldPool.id);
      const poolSpent = oldPool
        ? Math.max(0, oldPool.max - oldPool.current)
        : hdSpent;
      const finalCurrent = Math.max(0, newPool.max - poolSpent);
      return {
        ...newPool,
        current: finalCurrent,
      };
    }

    if (oldPool) {
      matchedExistingPoolIds.add(oldPool.id);
      const spent = Math.max(0, oldPool.max - oldPool.current);
      const current = Math.max(0, newPool.max - spent);
      return {
        ...newPool,
        id: oldPool.id || newPool.id,
        current,
      };
    }

    // Newly unlocked pool starts at newMax
    return {
      ...newPool,
      current: newPool.max,
    };
  });

  // Keep custom manual trackers or unmatched existing pools intact
  for (const oldPool of existingPools) {
    const normOld = normalizeKey(oldPool.name);
    const alreadyMerged =
      matchedExistingPoolIds.has(oldPool.id) ||
      mergedPools.some((p) => p.id === oldPool.id || normalizeKey(p.name) === normOld);
    if (!alreadyMerged) {
      mergedPools.push({ ...oldPool });
    }
  }

  // 6. Inventory, Notes & Privacy Preservation
  const existingInventory: InventoryItem[] = Array.isArray(existingRaw.inventory)
    ? (existingRaw.inventory as InventoryItem[])
    : [];
  const evaluatedInventory: InventoryItem[] = Array.isArray(evaluated.inventory)
    ? evaluated.inventory
    : [];

  const mergedInventory: InventoryItem[] = [];
  const matchedExistingItemIds = new Set<string>();

  for (const newItem of evaluatedInventory) {
    const normNew = normalizeKey(newItem.name);
    const existingItem = existingInventory.find(
      (it) => it.id === newItem.id || normalizeKey(it.name) === normNew,
    );
    if (existingItem) {
      matchedExistingItemIds.add(existingItem.id);
      mergedInventory.push({
        ...newItem,
        id: existingItem.id || newItem.id,
        notes: newItem.notes || existingItem.notes,
        equipped: newItem.equipped ?? existingItem.equipped,
        attuned: newItem.attuned ?? existingItem.attuned,
        ...(typeof existingItem.sharedWithGm === 'boolean'
          ? { sharedWithGm: existingItem.sharedWithGm }
          : typeof newItem.sharedWithGm === 'boolean'
            ? { sharedWithGm: newItem.sharedWithGm }
            : {}),
      });
    } else {
      mergedInventory.push({ ...newItem });
    }
  }

  // Preserve custom player loot / items added mid-session that weren't in the newly uploaded sheet
  for (const oldItem of existingInventory) {
    const normOld = normalizeKey(oldItem.name);
    const alreadyInMerged =
      matchedExistingItemIds.has(oldItem.id) ||
      mergedInventory.some((it) => it.id === oldItem.id || normalizeKey(it.name) === normOld);
    if (!alreadyInMerged) {
      mergedInventory.push({ ...oldItem });
    }
  }

  // Preserve notes, GM secrets, ownership, and local/shared player trackers
  const existingNotes = typeof existingRaw.notes === 'string' ? existingRaw.notes.trim() : '';
  const evaluatedNotes = (evaluated.notes || '').trim();
  const mergedNotes =
    existingNotes && evaluatedNotes && !evaluatedNotes.includes(existingNotes)
      ? `${existingNotes}\n\n${evaluatedNotes}`
      : existingNotes || evaluatedNotes;

  const mergedPc: EvaluatedPlayerCharacter = {
    ...evaluated,
    id: (typeof existingRaw.id === 'string' && existingRaw.id) || evaluated.id,
    hp: {
      current: mergedCurrentHp,
      max: evaluatedMaxHp,
      temp: mergedTempHp,
    },
    currentHp: mergedCurrentHp,
    maxHp: evaluatedMaxHp,
    tempHp: mergedTempHp,
    hitDice: mergedHitDice,
    conditions: mergedConditions,
    exhaustion: mergedExhaustion,
    deathSaves: mergedDeathSaves,
    ...(mergedInspiration !== undefined ? { inspiration: mergedInspiration } : {}),
    ...(hasAnySpellSlots ? { spellSlots: mergedSpellSlots as EvaluatedPlayerCharacter['spellSlots'] } : {}),
    ...(mergedPactSlots !== undefined ? { pactSlots: mergedPactSlots } : {}),
    resourcePools: mergedPools,
    inventory: mergedInventory,
    partyLoot:
      (typeof existingRaw.partyLoot === 'string' && existingRaw.partyLoot) ||
      evaluated.partyLoot,
    notes: mergedNotes,
    goals:
      evaluated.goals.length > 0
        ? Array.from(new Set([...(Array.isArray(existingRaw.goals) ? (existingRaw.goals as string[]) : []), ...evaluated.goals]))
        : Array.isArray(existingRaw.goals)
          ? (existingRaw.goals as string[])
          : [],
    bonds:
      evaluated.bonds.length > 0
        ? evaluated.bonds
        : Array.isArray(existingRaw.bonds)
          ? (existingRaw.bonds as string[])
          : [],
    ideals:
      evaluated.ideals.length > 0
        ? evaluated.ideals
        : Array.isArray(existingRaw.ideals)
          ? (existingRaw.ideals as string[])
          : [],
    flaws:
      evaluated.flaws.length > 0
        ? evaluated.flaws
        : Array.isArray(existingRaw.flaws)
          ? (existingRaw.flaws as string[])
          : [],
    sharedQuests:
      (existingRaw.sharedQuests as PlayerCharacter['sharedQuests']) ??
      evaluated.sharedQuests,
    sharedAnnotations:
      (existingRaw.sharedAnnotations as PlayerCharacter['sharedAnnotations']) ??
      evaluated.sharedAnnotations,
    sharedJournal:
      (existingRaw.sharedJournal as PlayerCharacter['sharedJournal']) ??
      evaluated.sharedJournal,
    gmNotes:
      (typeof existingRaw.gmNotes === 'string' ? existingRaw.gmNotes : undefined) ??
      evaluated.gmNotes,
    gmSecrets:
      (existingRaw.gmSecrets !== undefined
        ? (existingRaw.gmSecrets as PlayerCharacter['gmSecrets'])
        : undefined) ?? evaluated.gmSecrets,
    privateNotes:
      (typeof existingRaw.privateNotes === 'string' ? existingRaw.privateNotes : undefined) ??
      evaluated.privateNotes,
    backstory:
      evaluated.backstory ||
      (typeof existingRaw.backstory === 'string' ? existingRaw.backstory : undefined),
    ownership:
      (existingRaw.ownership as PlayerCharacter['ownership']) ??
      evaluated.ownership,
  };

  // Preserve any extra player-local keys like `quests`, `annotations`, `journal`, `journalEntries` if attached
  if (Array.isArray(existingRaw.quests)) {
    (mergedPc as Record<string, unknown>).quests = existingRaw.quests;
  }
  if (Array.isArray(existingRaw.annotations)) {
    (mergedPc as Record<string, unknown>).annotations = existingRaw.annotations;
  }
  if (Array.isArray(existingRaw.journal)) {
    (mergedPc as Record<string, unknown>).journal = existingRaw.journal;
  }
  if (Array.isArray(existingRaw.journalEntries)) {
    (mergedPc as Record<string, unknown>).journalEntries = existingRaw.journalEntries;
  }

  if (mergedPc.spellSlots && typeof mergedPc.spellSlots === 'object' && !Array.isArray(mergedPc.spellSlots)) {
    const toGroupArray = () =>
      SPELL_SLOT_LEVELS.filter((lvl) => mergedPc.spellSlots?.[lvl] && mergedPc.spellSlots[lvl]!.max > 0).map(
        (lvl) => ({
          level: lvl,
          max: mergedPc.spellSlots![lvl]!.max,
          used: mergedPc.spellSlots![lvl]!.used,
        }),
      );
    for (const method of ['some', 'find', 'map', 'filter', 'forEach'] as const) {
      Object.defineProperty(mergedPc.spellSlots, method, {
        value: (...args: unknown[]) => (toGroupArray() as any)[method](...args),
        enumerable: false,
        configurable: true,
        writable: true,
      });
    }
  }

  return mergedPc;
}
