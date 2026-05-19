import { rollDice, rollOn } from '@/lib/tables/roll';
import type { SeededRng } from './rng';
import {
  ART_BANDS,
  ART_COUNT,
  COIN_TABLES,
  GEM_BANDS,
  GEM_COUNT,
  MAGIC_ITEM_BANDS,
  MAGIC_ITEMS,
  type CrTier,
  type HoardType,
} from './tables/treasure-hoard-tables';
import type { CoinPurse, ItemRarity, TreasureHoardResult } from './types';

// Parse a dice expression like "3d6", "2d6+10", "1d4-1".
// Returns { n, sides, modifier }. Multiplier is applied externally.
function parseDice(expr: string): { n: number; sides: number; modifier: number } {
  const m = /^(\d+)d(\d+)\s*([+-]\s*\d+)?$/.exec(expr.trim());
  if (!m) throw new Error(`Bad dice expression: ${expr}`);
  return {
    n: Number(m[1]),
    sides: Number(m[2]),
    modifier: m[3] ? Number(m[3].replace(/\s/g, '')) : 0,
  };
}

function rollExpr(expr: string, rng: SeededRng): number {
  const { n, sides, modifier } = parseDice(expr);
  if (n === 0) return 0;
  return rollDice(n, sides, rng) + modifier;
}

function rollCoins(crTier: CrTier, hoardType: HoardType, rng: SeededRng): CoinPurse {
  const table = COIN_TABLES[hoardType][crTier];
  const out: CoinPurse = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  for (const key of ['cp', 'sp', 'ep', 'gp', 'pp'] as const) {
    const f = table[key];
    if (!f) continue;
    out[key] = rollExpr(f.dice, rng) * f.multiplier;
  }
  return out;
}

function rollGems(crTier: CrTier, hoardType: HoardType, rng: SeededRng) {
  const count = Math.max(0, rollExpr(GEM_COUNT[hoardType][crTier].dice, rng));
  if (count === 0) return [];
  const bands = GEM_BANDS[crTier];
  if (!bands.length) return [];
  const band = bands[rng.int(0, bands.length - 1)];
  return Array.from({ length: count }, () => ({
    name: rollOn(band.names, rng),
    value: band.value,
  }));
}

function rollArt(crTier: CrTier, hoardType: HoardType, rng: SeededRng) {
  const count = Math.max(0, rollExpr(ART_COUNT[hoardType][crTier].dice, rng));
  if (count === 0) return [];
  const bands = ART_BANDS[crTier];
  if (!bands.length) return [];
  const band = bands[rng.int(0, bands.length - 1)];
  return Array.from({ length: count }, () => ({
    name: rollOn(band.names, rng),
    value: band.value,
  }));
}

function pickWeightedRarity(weights: Partial<Record<Exclude<ItemRarity, 'mundane'>, number>>, rng: SeededRng): Exclude<ItemRarity, 'mundane'> | null {
  const entries = Object.entries(weights) as [Exclude<ItemRarity, 'mundane'>, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  if (total <= 0) return null;
  let r = rng.next() * total;
  for (const [rarity, weight] of entries) {
    r -= weight;
    if (r < 0) return rarity;
  }
  return entries[entries.length - 1][0];
}

function rollMagicItems(crTier: CrTier, hoardType: HoardType, rng: SeededRng) {
  const band = MAGIC_ITEM_BANDS[hoardType][crTier];
  if (rng.next() >= band.chance) return [];
  const raw = rollExpr(band.count.dice, rng);
  const count = Math.max(band.count.min ?? 0, Math.min(band.count.max ?? raw, raw));
  const items: TreasureHoardResult['magicItems'] = [];
  for (let i = 0; i < count; i++) {
    const rarity = pickWeightedRarity(band.rarityWeights, rng);
    if (!rarity) break;
    const pool = MAGIC_ITEMS[rarity];
    if (!pool?.length) break;
    const entry = pool[rng.int(0, pool.length - 1)];
    items.push({ name: entry.name, rarity: entry.rarity, category: entry.category, note: entry.note });
  }
  return items;
}

export function generateTreasureHoard(
  inputs: { crTier: CrTier; hoardType: HoardType },
  rng: SeededRng,
): TreasureHoardResult {
  return {
    kind: 'treasure-hoard',
    id: `hoard_${rng.seed.toString(16)}`,
    seed: rng.seed,
    inputs,
    coins: rollCoins(inputs.crTier, inputs.hoardType, rng),
    gems: rollGems(inputs.crTier, inputs.hoardType, rng),
    artObjects: rollArt(inputs.crTier, inputs.hoardType, rng),
    magicItems: rollMagicItems(inputs.crTier, inputs.hoardType, rng),
    enhanced: false,
  };
}
