// Minimal d20 check resolver for Scene Mode's suggested rolls. The full dice
// roller (components/DiceRoller.tsx) is a heavyweight tabletop tool; a suggested
// roll only needs a single 1d20 + modifier against a DC, so this stays small
// and reuses the same crypto RNG approach.

import type { SuggestedRoll } from './types';

export function rollD20(): number {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return Math.floor((buf[0] / 2 ** 32) * 20) + 1;
  }
  return Math.floor(Math.random() * 20) + 1;
}

export function formatRollExpr(modifier: number): string {
  if (modifier > 0) return `1d20+${modifier}`;
  if (modifier < 0) return `1d20${modifier}`;
  return '1d20';
}

export function rollLabel(roll: SuggestedRoll): string {
  const skill = roll.skill ? ` (${roll.skill})` : '';
  return `Roll ${roll.ability}${skill} DC ${roll.dc}`;
}

export type ResolvedRoll = { expr: string; result: number; success: boolean };

export function resolveCheck(modifier: number, dc: number): ResolvedRoll {
  const d20 = rollD20();
  const result = d20 + modifier;
  return { expr: formatRollExpr(modifier), result, success: result >= dc };
}
