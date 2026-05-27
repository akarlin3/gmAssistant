// Pure derivations from a PlayerCharacter: ability modifiers, proficiency
// bonus, total level, initiative. These are the single source of truth for
// every auto-computed stat shown on the sheet and consumed by integrations.

import type { PlayerCharacter } from './types';

export function abilityMod(score: number): number {
  if (typeof score !== 'number' || Number.isNaN(score)) return 0;
  return Math.floor((score - 10) / 2);
}

export function proficiencyBonusForLevel(level: number): number {
  if (level >= 17) return 6;
  if (level >= 13) return 5;
  if (level >= 9) return 4;
  if (level >= 5) return 3;
  return 2;
}

export function pcTotalLevel(pc: PlayerCharacter): number {
  if (pc.classes && pc.classes.length > 0) {
    return pc.classes.reduce((sum, c) => sum + (c.level || 0), 0);
  }
  return pc.level || 1;
}

export function pcInitiative(pc: PlayerCharacter): number {
  if (typeof pc.initiativeMod === 'number' && !Number.isNaN(pc.initiativeMod)) {
    return pc.initiativeMod;
  }
  return abilityMod(pc.abilities.DEX);
}

// Formats a modifier with an explicit sign, e.g. 3 -> "+3", -1 -> "-1".
export function formatMod(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}
