import { evaluateCharacterSheet } from './characterEvaluator';
import { normalizePc } from './pc/factory';
import {
  SPELL_SLOT_LEVELS,
  type FeatureEntry,
  type InventoryItem,
  type PactMagicSlots,
  type PcResourcePool,
  type PlayerCharacter,
  type SpellSlot,
  type SpellSlotLevel,
} from './pc/types';
import { validatePlayerField } from './player/allowlist';
import { sanitizeOutboundWritebackUpdates } from './playerMode/playerTrackerStorage';

export type MergeCharacterOptions = {
  /**
   * When true, treats the uploaded payload as a full-state backup where
   * explicitly provided conditions/tempHp/exhaustion/deathSaves override existing ones.
   */
  isFullStateBackup?: boolean;
};

export function normalizeCharacterName(name: string | undefined | null): string {
  if (!name) return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normPoolKey(s: string | undefined): string {
  if (!s) return '';
  const k = s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (k === 'kipoints' || k === 'focuspoints' || k === 'focuskipoints' || k === 'kifocuspoints') {
    return 'focuskipoints';
  }
  return k;
}

function normItemKey(name: string | undefined): string {
  if (!name) return '';
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Find an existing PC in a roster that matches the uploaded sheet by:
 * 1. Explicit targetPcId
 * 2. Explicit targetSlotId (matching pc.ownership.playerSlotId)
 * 3. Normalized character name
 */
export function findMatchingPc(
  pcs: PlayerCharacter[],
  uploadedPc: Partial<PlayerCharacter>,
  targetPcId?: string,
  targetSlotId?: string,
): PlayerCharacter | undefined {
  if (!Array.isArray(pcs) || pcs.length === 0) return undefined;

  if (targetPcId) {
    const byId = pcs.find((p) => p.id === targetPcId);
    if (byId) return byId;
  }

  if (targetSlotId) {
    const bySlot = pcs.find(
      (p) => p.ownership?.ownerType === 'player' && p.ownership?.playerSlotId === targetSlotId,
    );
    if (bySlot) return bySlot;
  }

  const targetName = normalizeCharacterName(uploadedPc.name);
  if (targetName && targetName !== 'unnamed') {
    const byName = pcs.find((p) => normalizeCharacterName(p.name) === targetName);
    if (byName) return byName;
  }

  return undefined;
}

function readSlotSpent(slot: Record<string, unknown> | undefined): number {
  if (!slot || typeof slot !== 'object') return 0;
  const max = typeof slot.max === 'number' ? slot.max : 0;
  if (typeof slot.used === 'number' && slot.used >= 0) {
    return Math.max(0, slot.used);
  }
  if (typeof slot.current === 'number' && max > 0) {
    return Math.max(0, max - slot.current);
  }
  return 0;
}

function extractSlotMap(
  rawSlots: unknown,
): Partial<Record<SpellSlotLevel, { max: number; used: number; spent: number }>> {
  const out: Partial<Record<SpellSlotLevel, { max: number; used: number; spent: number }>> = {};
  if (!rawSlots || typeof rawSlots !== 'object') return out;

  if (Array.isArray(rawSlots)) {
    for (const entry of rawSlots) {
      if (!entry || typeof entry !== 'object') continue;
      const o = entry as Record<string, unknown>;
      const lvl = Number(o.level) as SpellSlotLevel;
      if (SPELL_SLOT_LEVELS.includes(lvl)) {
        const max = Math.max(0, Number(o.max) || 0);
        const spent = readSlotSpent(o);
        out[lvl] = { max, used: Math.min(max, spent), spent };
      }
    }
    return out;
  }

  const rec = rawSlots as Record<string, unknown>;
  for (const lvl of SPELL_SLOT_LEVELS) {
    const s = rec[lvl] as Record<string, unknown> | undefined;
    if (s && typeof s === 'object') {
      const max = Math.max(0, Number(s.max) || 0);
      const spent = readSlotSpent(s);
      out[lvl] = { max, used: Math.min(max, spent), spent };
    }
  }
  return out;
}

function mergeSpellSlots(
  existingRawSlots: unknown,
  evaluatedRawSlots: unknown,
): Partial<Record<SpellSlotLevel, SpellSlot>> | undefined {
  const oldMap = extractSlotMap(existingRawSlots);
  const newMap = extractSlotMap(evaluatedRawSlots);

  const merged: Partial<Record<SpellSlotLevel, SpellSlot>> = {};
  let hasAny = false;

  for (const lvl of SPELL_SLOT_LEVELS) {
    const oldSlot = oldMap[lvl];
    const newSlot = newMap[lvl];

    if (!newSlot && !oldSlot) continue;

    if (newSlot && newSlot.max > 0) {
      // If slot level existed before, preserve spent slots: current = max(0, newMax - spent), used = min(newMax, spent)
      // If newly unlocked slot level, initialize at full (used = 0, current = newMax)
      const spent = oldSlot && oldSlot.max > 0 ? oldSlot.spent : 0;
      const used = Math.min(newSlot.max, Math.max(0, spent));
      merged[lvl] = {
        max: newSlot.max,
        used,
      };
      hasAny = true;
    } else if (oldSlot && oldSlot.max > 0 && !newSlot) {
      // Preserve existing slot level if new sheet omitted spell slots
      merged[lvl] = {
        max: oldSlot.max,
        used: oldSlot.used,
      };
      hasAny = true;
    }
  }

  return hasAny ? merged : undefined;
}

function mergePactSlots(
  existingPact: PactMagicSlots | null | undefined,
  evaluatedPact: PactMagicSlots | null | undefined,
): PactMagicSlots | undefined {
  if (!evaluatedPact && !existingPact) return undefined;
  if (evaluatedPact && evaluatedPact.max > 0) {
    const oldSpent =
      existingPact && existingPact.max > 0
        ? readSlotSpent(existingPact as unknown as Record<string, unknown>)
        : 0;
    const newMax = evaluatedPact.max;
    return {
      level: evaluatedPact.level,
      max: newMax,
      used: Math.min(newMax, Math.max(0, oldSpent)),
    };
  }
  if (existingPact && existingPact.max > 0) {
    return { ...existingPact };
  }
  return undefined;
}

function mergeResourcePools(
  existingPools: PcResourcePool[] | undefined,
  evaluatedPools: PcResourcePool[] | undefined,
  mergedHitDice: PlayerCharacter['hitDice'],
): PcResourcePool[] {
  const oldPools = Array.isArray(existingPools) ? existingPools : [];
  const newPools = Array.isArray(evaluatedPools) ? evaluatedPools : [];

  const oldByKey = new Map<string, PcResourcePool>();
  for (const p of oldPools) {
    if (p.id) oldByKey.set(normPoolKey(p.id), p);
    if (p.name) oldByKey.set(normPoolKey(p.name), p);
  }

  const matchedOldKeys = new Set<string>();
  const result: PcResourcePool[] = [];

  for (const newPool of newPools) {
    const idKey = normPoolKey(newPool.id);
    const nameKey = normPoolKey(newPool.name);
    const oldPool = oldByKey.get(idKey) ?? oldByKey.get(nameKey);

    if (idKey === 'hitdice' || nameKey === 'hitdice') {
      if (oldPool) {
        matchedOldKeys.add(normPoolKey(oldPool.id));
        matchedOldKeys.add(normPoolKey(oldPool.name));
      }
      const hdMax = mergedHitDice.max;
      const hdCurrent = Math.max(0, hdMax - mergedHitDice.used);
      result.push({
        ...newPool,
        id: oldPool?.id || newPool.id || 'hit-dice',
        max: hdMax,
        current: hdCurrent,
      });
      continue;
    }

    if (oldPool) {
      matchedOldKeys.add(normPoolKey(oldPool.id));
      matchedOldKeys.add(normPoolKey(oldPool.name));
      const spent = Math.max(0, oldPool.max - oldPool.current);
      const newMax = Math.max(0, newPool.max);
      const nextCurrent = Math.max(0, newMax - spent);
      result.push({
        ...newPool,
        id: oldPool.id || newPool.id,
        max: newMax,
        current: nextCurrent,
      });
    } else {
      // Brand-new class feature pool unlocked on level-up -> initialize at current = newMax
      result.push({
        ...newPool,
        current: newPool.max,
      });
    }
  }

  // Preserve any custom user-created manual resource trackers or pools not on the uploaded sheet
  for (const oldPool of oldPools) {
    const idKey = normPoolKey(oldPool.id);
    const nameKey = normPoolKey(oldPool.name);
    if (matchedOldKeys.has(idKey) || matchedOldKeys.has(nameKey)) continue;
    result.push({ ...oldPool });
  }

  return result;
}

function mergeFeatures(
  existingFeatures: FeatureEntry[] | undefined,
  evaluatedFeatures: FeatureEntry[] | undefined,
): FeatureEntry[] {
  const oldFeats = Array.isArray(existingFeatures) ? existingFeatures : [];
  const newFeats = Array.isArray(evaluatedFeatures) ? evaluatedFeatures : [];

  if (newFeats.length === 0) return oldFeats;

  const oldByKey = new Map<string, FeatureEntry>();
  for (const f of oldFeats) {
    oldByKey.set(normItemKey(f.name), f);
  }

  const seenKeys = new Set<string>();
  const merged: FeatureEntry[] = [];

  for (const nf of newFeats) {
    const key = normItemKey(nf.name);
    seenKeys.add(key);
    const of = oldByKey.get(key);
    if (of && of.uses && nf.uses) {
      const spent = Math.max(0, of.uses.used || 0);
      merged.push({
        ...nf,
        id: of.id || nf.id,
        uses: {
          max: nf.uses.max,
          used: Math.min(nf.uses.max, spent),
          refresh: nf.uses.refresh || of.uses.refresh,
        },
      });
    } else if (of) {
      merged.push({
        ...nf,
        id: of.id || nf.id,
        description: nf.description || of.description,
        source: nf.source || of.source,
        ...(nf.uses ? { uses: nf.uses } : of.uses ? { uses: of.uses } : {}),
      });
    } else {
      merged.push(nf);
    }
  }

  return merged;
}

function mergeInventory(
  existingInventory: InventoryItem[] | undefined,
  evaluatedInventory: InventoryItem[] | undefined,
): InventoryItem[] {
  const oldInv = Array.isArray(existingInventory) ? existingInventory : [];
  const newInv = Array.isArray(evaluatedInventory) ? evaluatedInventory : [];

  if (newInv.length === 0) return [...oldInv];

  const oldByKey = new Map<string, InventoryItem>();
  for (const item of oldInv) {
    const k = normItemKey(item.name);
    if (k && !oldByKey.has(k)) {
      oldByKey.set(k, item);
    }
  }

  const matchedKeys = new Set<string>();
  const merged: InventoryItem[] = [];

  for (const newItem of newInv) {
    const k = normItemKey(newItem.name);
    const oldItem = k ? oldByKey.get(k) : undefined;
    if (oldItem && k) {
      matchedKeys.add(k);
      merged.push({
        ...oldItem,
        ...newItem,
        id: oldItem.id || newItem.id,
        qty: newItem.qty ?? oldItem.qty,
        equipped: newItem.equipped ?? oldItem.equipped,
        attuned: newItem.attuned ?? oldItem.attuned,
        notes: newItem.notes || oldItem.notes,
        description: newItem.description || oldItem.description,
        ...(typeof oldItem.sharedWithGm === 'boolean'
          ? { sharedWithGm: oldItem.sharedWithGm }
          : typeof newItem.sharedWithGm === 'boolean'
            ? { sharedWithGm: newItem.sharedWithGm }
            : {}),
      });
    } else {
      merged.push({ ...newItem });
    }
  }

  // Preserve custom player-added loot items not present on the uploaded sheet
  for (const oldItem of oldInv) {
    const k = normItemKey(oldItem.name);
    if (!k || matchedKeys.has(k)) continue;
    merged.push({ ...oldItem });
  }

  return merged;
}

function mergeStringArraysUnion(existingArr: string[] | undefined, newArr: string[] | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of [...(existingArr || []), ...(newArr || [])]) {
    const trimmed = (s || '').trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out;
}

function mergeNotes(existingNotes: string | undefined, uploadedNotes: string | undefined): string {
  const oldTrimmed = (existingNotes || '').trim();
  const newTrimmed = (uploadedNotes || '').trim();
  if (!oldTrimmed) return newTrimmed;
  if (!newTrimmed) return oldTrimmed;
  if (oldTrimmed.includes(newTrimmed)) return oldTrimmed;
  if (newTrimmed.includes(oldTrimmed)) return newTrimmed;
  return `${oldTrimmed}\n\n${newTrimmed}`;
}

/**
 * State-Preserving Delta Merge (`mergeUploadedCharacterSheet`):
 *
 * Merges a newly parsed & evaluated character sheet into an existing PC while
 * preserving active mid-session combat/resource state, custom inventory loot,
 * notes, and bidirectional privacy boundaries.
 */
export function mergeUploadedCharacterSheet(
  existingInput: Partial<PlayerCharacter> & Record<string, unknown>,
  uploadedInput: Partial<PlayerCharacter> & Record<string, unknown>,
  options?: MergeCharacterOptions,
): PlayerCharacter {
  const existingRaw = (existingInput || {}) as Record<string, unknown>;
  const uploadedRaw = (uploadedInput || {}) as Record<string, unknown>;

  const existingPc = normalizePc(existingInput);
  const evaluatedPc = uploadedInput.evaluation
    ? evaluateCharacterSheet(uploadedInput)
    : evaluateCharacterSheet(uploadedInput);

  const isFullBackup =
    options?.isFullStateBackup === true || uploadedRaw._fullStateBackup === true;

  // 1. Vitals & Active Status Preservation
  const existingHpObj = (existingRaw.hp as Record<string, unknown>) || {};
  const existingMaxHp =
    typeof existingHpObj.max === 'number'
      ? existingHpObj.max
      : typeof existingRaw.maxHp === 'number'
        ? existingRaw.maxHp
        : existingPc.hp.max;
  const existingCurrentHp =
    typeof existingHpObj.current === 'number'
      ? existingHpObj.current
      : typeof existingRaw.currentHp === 'number'
        ? existingRaw.currentHp
        : existingPc.hp.current;
  const existingTempHp =
    typeof existingHpObj.temp === 'number'
      ? existingHpObj.temp
      : typeof existingRaw.tempHp === 'number'
        ? existingRaw.tempHp
        : existingPc.hp.temp;

  const newMaxHp = evaluatedPc.hp.max > 0 ? evaluatedPc.hp.max : existingMaxHp;

  let mergedCurrentHp: number;
  if (existingMaxHp > 0) {
    const damageTaken = Math.max(0, existingMaxHp - existingCurrentHp);
    mergedCurrentHp = Math.max(0, newMaxHp - damageTaken);
  } else {
    mergedCurrentHp =
      evaluatedPc.hp.current > 0 ? evaluatedPc.hp.current : newMaxHp;
  }

  const mergedTempHp = isFullBackup ? evaluatedPc.hp.temp : existingTempHp;
  const mergedConditions =
    isFullBackup && Array.isArray(uploadedRaw.conditions)
      ? evaluatedPc.conditions
      : existingPc.conditions;
  const mergedDeathSaves =
    isFullBackup && uploadedRaw.deathSaves
      ? evaluatedPc.deathSaves
      : existingPc.deathSaves;
  const mergedExhaustion =
    isFullBackup && typeof uploadedRaw.exhaustion === 'number'
      ? evaluatedPc.exhaustion
      : existingPc.exhaustion;
  const mergedInspiration =
    isFullBackup && typeof uploadedRaw.inspiration === 'boolean'
      ? evaluatedPc.inspiration
      : existingPc.inspiration ?? evaluatedPc.inspiration;

  // 2. Hit Dice, Spell Slots & Class Resource Pool Preservation
  const oldHdMax = existingPc.hitDice?.max || existingPc.level || 1;
  const oldHdUsed = Math.max(0, existingPc.hitDice?.used || 0);
  const newHdMax = Math.max(evaluatedPc.level, evaluatedPc.hitDice?.max || evaluatedPc.level);
  const mergedHitDice = {
    dieSize: evaluatedPc.hitDice?.dieSize || existingPc.hitDice?.dieSize || 8,
    max: Math.max(oldHdMax, newHdMax),
    used: Math.min(Math.max(oldHdMax, newHdMax), oldHdUsed),
  };

  const mergedSpellSlots = mergeSpellSlots(
    existingRaw.spellSlots ?? existingPc.spellSlots,
    uploadedRaw.spellSlots ?? evaluatedPc.spellSlots,
  );
  const mergedPactSlots = mergePactSlots(existingPc.pactSlots, evaluatedPc.pactSlots);
  const mergedResourcePools = mergeResourcePools(
    existingPc.resourcePools,
    evaluatedPc.resourcePools,
    mergedHitDice,
  );
  const mergedFeatures = mergeFeatures(existingPc.features, evaluatedPc.features);

  // 3. Inventory, Notes & Bidirectional Privacy Preservation
  const mergedInventory = mergeInventory(existingPc.inventory, evaluatedPc.inventory);
  const invAttunedCount = mergedInventory.filter((i) => i.attuned).length;
  const mergedAttunedCount = Math.max(
    evaluatedPc.attunedCount || 0,
    existingPc.attunedCount || 0,
    invAttunedCount,
  );

  const mergedCurrency = evaluatedPc.currency || existingPc.currency;
  const mergedPartyLoot = existingPc.partyLoot || evaluatedPc.partyLoot;

  const mergedPc: PlayerCharacter = {
    ...existingPc,
    ...evaluatedPc,
    id: existingPc.id || evaluatedPc.id,
    name: evaluatedPc.name && evaluatedPc.name !== 'Unnamed' ? evaluatedPc.name : existingPc.name,
    player: evaluatedPc.player || existingPc.player,
    hp: {
      current: mergedCurrentHp,
      max: newMaxHp,
      temp: mergedTempHp,
    },
    hitDice: mergedHitDice,
    conditions: [...mergedConditions],
    deathSaves: { ...mergedDeathSaves },
    exhaustion: mergedExhaustion,
    ...(mergedInspiration !== undefined ? { inspiration: mergedInspiration } : {}),
    ...(mergedSpellSlots ? { spellSlots: mergedSpellSlots } : {}),
    ...(mergedPactSlots ? { pactSlots: mergedPactSlots } : {}),
    resourcePools: mergedResourcePools,
    features: mergedFeatures,
    inventory: mergedInventory,
    attunedCount: mergedAttunedCount,
    ...(mergedCurrency ? { currency: mergedCurrency } : {}),
    ...(mergedPartyLoot !== undefined ? { partyLoot: mergedPartyLoot } : {}),
    notes: mergeNotes(existingPc.notes, evaluatedPc.notes),
    goals: mergeStringArraysUnion(existingPc.goals, evaluatedPc.goals),
    bonds: mergeStringArraysUnion(existingPc.bonds, evaluatedPc.bonds),
    ideals: mergeStringArraysUnion(existingPc.ideals, evaluatedPc.ideals),
    flaws: mergeStringArraysUnion(existingPc.flaws, evaluatedPc.flaws),
    // Strictly preserve ownership and opt-in shared tracker slices from existingPc
    ownership: existingPc.ownership || evaluatedPc.ownership,
    ...(existingPc.sharedQuests ? { sharedQuests: existingPc.sharedQuests } : {}),
    ...(existingPc.sharedAnnotations ? { sharedAnnotations: existingPc.sharedAnnotations } : {}),
    ...(existingPc.sharedJournal ? { sharedJournal: existingPc.sharedJournal } : {}),
    ...(existingPc.turnEconomy ? { turnEconomy: existingPc.turnEconomy } : {}),
    ...(existingPc.concentrationSpell !== undefined
      ? { concentrationSpell: existingPc.concentrationSpell }
      : {}),
    ...(existingPc.downtimeDays !== undefined ? { downtimeDays: existingPc.downtimeDays } : {}),
    ...(existingPc.renown !== undefined ? { renown: existingPc.renown } : {}),
    updatedAt: Date.now(),
  };

  // Re-evaluate audit notes & defensive profile against the merged inventory/stats while keeping merged pools/HP
  const reEvaluated = evaluateCharacterSheet(mergedPc);
  const finalPc: PlayerCharacter = {
    ...reEvaluated,
    hp: mergedPc.hp,
    hitDice: mergedPc.hitDice,
    conditions: mergedPc.conditions,
    deathSaves: mergedPc.deathSaves,
    exhaustion: mergedPc.exhaustion,
    ...(mergedPc.inspiration !== undefined ? { inspiration: mergedPc.inspiration } : {}),
    ...(mergedSpellSlots ? { spellSlots: mergedSpellSlots } : {}),
    ...(mergedPactSlots ? { pactSlots: mergedPactSlots } : {}),
    resourcePools: mergedResourcePools,
    features: mergedFeatures,
    inventory: mergedInventory,
    attunedCount: mergedAttunedCount,
    notes: mergedPc.notes,
    goals: mergedPc.goals,
    bonds: mergedPc.bonds,
    ideals: mergedPc.ideals,
    flaws: mergedPc.flaws,
    ownership: mergedPc.ownership,
    ...(mergedPc.partyLoot !== undefined ? { partyLoot: mergedPc.partyLoot } : {}),
    ...(mergedPc.sharedQuests ? { sharedQuests: mergedPc.sharedQuests } : {}),
    ...(mergedPc.sharedAnnotations ? { sharedAnnotations: mergedPc.sharedAnnotations } : {}),
    ...(mergedPc.sharedJournal ? { sharedJournal: mergedPc.sharedJournal } : {}),
  };

  return finalPc;
}

/**
 * Builds a sanitized, allowlist-validated `pcWritebacks` update map from a
 * merged/evaluated PC so unauthenticated `/player` share-link clients can stage
 * their mechanical sheet slice + `evaluation` summary into the GM's CRDT merge
 * while strictly stripping any `sharedWithGm === false` items and omitting
 * non-player-editable fields.
 */
export function buildPlayerWritebackFromMergedPc(
  pc: PlayerCharacter,
): Record<string, unknown> {
  const spellSlotsArray = pc.spellSlots
    ? SPELL_SLOT_LEVELS.filter((lvl) => pc.spellSlots?.[lvl] && pc.spellSlots[lvl]!.max > 0).map(
        (lvl) => ({
          level: lvl,
          max: Math.min(20, Math.max(0, pc.spellSlots![lvl]!.max)),
          used: Math.min(20, Math.max(0, pc.spellSlots![lvl]!.used)),
        }),
      )
    : [];

  const validDieSizes = [4, 6, 8, 10, 12];
  const dieSize = validDieSizes.includes(pc.hitDice.dieSize) ? pc.hitDice.dieSize : 8;

  const candidate: Record<string, unknown> = {
    'hp.current': Math.max(0, Math.round(pc.hp.current)),
    'hp.max': Math.max(1, Math.min(9999, Math.round(pc.hp.max || 1))),
    'hp.temp': Math.max(0, Math.round(pc.hp.temp || 0)),
    hitDice: {
      dieSize,
      max: Math.max(0, Math.min(40, Math.round(pc.hitDice.max))),
      used: Math.max(0, Math.min(40, Math.round(pc.hitDice.used))),
    },
    conditions: pc.conditions || [],
    exhaustion: Math.max(0, Math.min(6, Math.round(pc.exhaustion || 0))),
    deathSaves: {
      successes: Math.max(0, Math.min(3, Math.round(pc.deathSaves?.successes || 0))),
      failures: Math.max(0, Math.min(3, Math.round(pc.deathSaves?.failures || 0))),
    },
    ...(typeof pc.inspiration === 'boolean' ? { inspiration: pc.inspiration } : {}),
    ac: Math.max(0, Math.min(50, Math.round(pc.ac || 10))),
    speed: Math.max(0, Math.min(999, Math.round(pc.speed || 30))),
    initiativeMod: Math.max(-20, Math.min(30, Math.round(pc.initiativeMod || 0))),
    spellSlots: spellSlotsArray,
    pactSlots: pc.pactSlots
      ? {
          level: Math.max(1, Math.min(9, Math.round(pc.pactSlots.level))),
          max: Math.max(0, Math.min(20, Math.round(pc.pactSlots.max))),
          used: Math.max(0, Math.min(20, Math.round(pc.pactSlots.used))),
        }
      : null,
    resourcePools: (pc.resourcePools || []).map((p) => ({
      id: p.id || 'pool',
      name: p.name || 'Resource',
      current: Math.max(0, Math.round(p.current)),
      max: Math.max(0, Math.round(p.max)),
      rechargeOn: p.rechargeOn || 'long',
    })),
    features: (pc.features || []).map((f) => ({
      id: f.id,
      name: f.name,
      source: f.source || '',
      description: f.description || '',
      ...(f.uses ? { uses: f.uses } : {}),
    })),
    inventory: (pc.inventory || []).map((i) => ({
      id: i.id,
      name: i.name,
      qty: Math.max(0, i.qty ?? 1),
      ...(typeof i.equipped === 'boolean' ? { equipped: i.equipped } : {}),
      ...(typeof i.attuned === 'boolean' ? { attuned: i.attuned } : {}),
      ...(typeof i.weight === 'number' && i.weight >= 0 ? { weight: i.weight } : {}),
      ...(i.description ? { description: i.description } : {}),
      ...(i.notes ? { notes: i.notes } : {}),
      ...(typeof i.sharedWithGm === 'boolean' ? { sharedWithGm: i.sharedWithGm } : {}),
    })),
    attunedCount: Math.max(0, Math.min(3, Math.round(pc.attunedCount || 0))),
    ...(pc.currency
      ? {
          currency: {
            cp: Math.max(0, Math.round(pc.currency.cp || 0)),
            sp: Math.max(0, Math.round(pc.currency.sp || 0)),
            ep: Math.max(0, Math.round(pc.currency.ep || 0)),
            gp: Math.max(0, Math.round(pc.currency.gp || 0)),
            pp: Math.max(0, Math.round(pc.currency.pp || 0)),
          },
        }
      : {}),
    ...(typeof pc.partyLoot === 'string' ? { partyLoot: pc.partyLoot } : {}),
    notes: pc.notes || '',
    goals: pc.goals || [],
    bonds: pc.bonds || [],
    ideals: pc.ideals || [],
    flaws: pc.flaws || [],
    ...(pc.evaluation ? { evaluation: pc.evaluation } : {}),
  };

  const sanitized = sanitizeOutboundWritebackUpdates(candidate);
  const verified: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(sanitized)) {
    if (validatePlayerField(field, value)) {
      verified[field] = value;
    }
  }
  return verified;
}
