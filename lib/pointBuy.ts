// Standard D&D 5e point-buy: 27 points, base scores 8-15.
// Cost per score: 8→0, 9→1, 10→2, 11→3, 12→4, 13→5, 14→7, 15→9.

export const POINT_BUY_BUDGET = 27;
export const POINT_BUY_MIN = 8;
export const POINT_BUY_MAX = 15;

export const POINT_BUY_COST: Record<number, number> = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9,
};

export type AbilityKey = 'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha';

export const ABILITY_KEYS: ReadonlyArray<AbilityKey> = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

export const ABILITY_LABEL: Record<AbilityKey, string> = {
  str: 'Strength',
  dex: 'Dexterity',
  con: 'Constitution',
  int: 'Intelligence',
  wis: 'Wisdom',
  cha: 'Charisma',
};

export type AbilityScores = Record<AbilityKey, number>;

export type PointBuy = {
  base: AbilityScores;
  racial: AbilityScores;
};

export function emptyAbilityScores(value = 0): AbilityScores {
  return { str: value, dex: value, con: value, int: value, wis: value, cha: value };
}

export function emptyPointBuy(): PointBuy {
  return { base: emptyAbilityScores(POINT_BUY_MIN), racial: emptyAbilityScores(0) };
}

export function costForScore(score: number): number {
  return POINT_BUY_COST[score] ?? 0;
}

export function totalCost(base: AbilityScores): number {
  return ABILITY_KEYS.reduce((sum, k) => sum + costForScore(base[k]), 0);
}

export function remainingPoints(base: AbilityScores): number {
  return POINT_BUY_BUDGET - totalCost(base);
}

export function clampBase(score: number): number {
  if (!Number.isFinite(score)) return POINT_BUY_MIN;
  return Math.max(POINT_BUY_MIN, Math.min(POINT_BUY_MAX, Math.round(score)));
}

export function canIncrement(base: AbilityScores, key: AbilityKey): boolean {
  const next = base[key] + 1;
  if (next > POINT_BUY_MAX) return false;
  const delta = costForScore(next) - costForScore(base[key]);
  return remainingPoints(base) >= delta;
}

export function canDecrement(base: AbilityScores, key: AbilityKey): boolean {
  return base[key] - 1 >= POINT_BUY_MIN;
}

export function finalScore(base: number, racial: number): number {
  return base + (Number.isFinite(racial) ? racial : 0);
}

export function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function formatMod(score: number): string {
  const m = abilityMod(score);
  return m >= 0 ? `+${m}` : `${m}`;
}

export function normalizePointBuy(input: unknown): PointBuy {
  const base = emptyPointBuy();
  if (!input || typeof input !== 'object') return base;
  const o = input as Record<string, unknown>;
  const inBase = (o.base as Record<string, unknown>) || {};
  const inRacial = (o.racial as Record<string, unknown>) || {};
  const asInt = (v: unknown, fallback: number): number => {
    if (typeof v === 'number' && Number.isFinite(v)) return Math.round(v);
    if (typeof v === 'string') {
      const n = parseInt(v, 10);
      return Number.isFinite(n) ? n : fallback;
    }
    return fallback;
  };
  return {
    base: {
      str: clampBase(asInt(inBase.str, POINT_BUY_MIN)),
      dex: clampBase(asInt(inBase.dex, POINT_BUY_MIN)),
      con: clampBase(asInt(inBase.con, POINT_BUY_MIN)),
      int: clampBase(asInt(inBase.int, POINT_BUY_MIN)),
      wis: clampBase(asInt(inBase.wis, POINT_BUY_MIN)),
      cha: clampBase(asInt(inBase.cha, POINT_BUY_MIN)),
    },
    racial: {
      str: asInt(inRacial.str, 0),
      dex: asInt(inRacial.dex, 0),
      con: asInt(inRacial.con, 0),
      int: asInt(inRacial.int, 0),
      wis: asInt(inRacial.wis, 0),
      cha: asInt(inRacial.cha, 0),
    },
  };
}
