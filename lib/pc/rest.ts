// Rest mechanics. Short rest refreshes short-rest features only. Long rest
// refreshes everything: HP to max, all spell slots, all feature uses, and
// regains half the spent hit dice (rounded down) per SRD.

import { expireActiveBuffs } from '../activeModifiers';
import type {
  FeatureEntry,
  PactMagicSlots,
  PcResourcePool,
  PlayerCharacter,
  SpellSlot,
  SpellSlotLevel,
} from './types';

function resetFeatures(
  features: FeatureEntry[],
  scope: 'short' | 'all',
): FeatureEntry[] {
  return features.map((f) => {
    if (!f.uses) return f;
    if (scope === 'short' && f.uses.refresh !== 'short') return f;
    return { ...f, uses: { ...f.uses, used: 0 } };
  });
}

function resetResourcePools(
  pools: PcResourcePool[] | undefined,
  scope: 'short' | 'long',
): PcResourcePool[] | undefined {
  if (!pools) return pools;
  return pools.map((p) => {
    if (p.rechargeOn === 'manual') return p;
    if (scope === 'short' && p.rechargeOn !== 'short') return p;
    return { ...p, current: p.max };
  });
}

function resetSlots(
  slots: Partial<Record<SpellSlotLevel, SpellSlot>> | undefined,
): Partial<Record<SpellSlotLevel, SpellSlot>> | undefined {
  if (!slots) return slots;
  const out: Partial<Record<SpellSlotLevel, SpellSlot>> = {};
  for (const [lvl, slot] of Object.entries(slots)) {
    if (slot) out[Number(lvl) as SpellSlotLevel] = { ...slot, used: 0 };
  }
  return out;
}

function resetPactSlots(pactSlots: PactMagicSlots | undefined): PactMagicSlots | undefined {
  if (!pactSlots) return pactSlots;
  return { ...pactSlots, used: 0 };
}

export function shortRest(pc: PlayerCharacter): PlayerCharacter {
  return {
    ...pc,
    features: resetFeatures(pc.features, 'short'),
    ...(pc.resourcePools ? { resourcePools: resetResourcePools(pc.resourcePools, 'short') } : {}),
    ...(pc.pactSlots ? { pactSlots: resetPactSlots(pc.pactSlots) } : {}),
    ...(Array.isArray(pc.activeBuffs)
      ? { activeBuffs: expireActiveBuffs(pc.activeBuffs, 'shortRest') }
      : {}),
  };
}

export function longRest(pc: PlayerCharacter): PlayerCharacter {
  const regainedHitDiceUsed = Math.floor(pc.hitDice.used / 2);
  return {
    ...pc,
    hp: { ...pc.hp, current: pc.hp.max, temp: 0 },
    hitDice: { ...pc.hitDice, used: regainedHitDiceUsed },
    spellSlots: resetSlots(pc.spellSlots),
    ...(pc.pactSlots ? { pactSlots: resetPactSlots(pc.pactSlots) } : {}),
    features: resetFeatures(pc.features, 'all'),
    ...(pc.resourcePools ? { resourcePools: resetResourcePools(pc.resourcePools, 'long') } : {}),
    ...(Array.isArray(pc.activeBuffs)
      ? { activeBuffs: expireActiveBuffs(pc.activeBuffs, 'longRest') }
      : {}),
    exhaustion: Math.max(0, pc.exhaustion - 1) as PlayerCharacter['exhaustion'],
    deathSaves: { successes: 0, failures: 0 },
  };
}

