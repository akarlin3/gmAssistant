import { rollMultiple } from '@/lib/tables/roll';
import type { SeededRng } from './rng';
import { TRINKETS } from './tables/trinket-tables';
import type { TrinketResult } from './types';

export function generateTrinkets(
  inputs: { count: number },
  rng: SeededRng,
): TrinketResult {
  const count = Math.max(1, Math.min(10, Math.floor(inputs.count)));
  const picks = rollMultiple(TRINKETS, count, rng, { unique: true });
  return {
    kind: 'trinket',
    id: `trinket_${rng.seed.toString(16)}`,
    seed: rng.seed,
    inputs: { count },
    trinkets: picks.map((description) => ({ description })),
    enhanced: false,
  };
}
