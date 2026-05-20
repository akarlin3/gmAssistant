import { rollMultiple } from '@/lib/tables/roll';
import type { SeededRng } from './rng';
import { TAVERN_NAMES } from './tables/tavern-name-tables';
import type { TavernNameResult } from './types';

export function generateTavernNames(
  inputs: { count: number },
  rng: SeededRng,
): TavernNameResult {
  const count = Math.max(1, Math.min(20, Math.floor(inputs.count)));
  const names = rollMultiple(TAVERN_NAMES, count, rng, { unique: true });
  return {
    kind: 'tavern-name',
    id: `tavern-name_${rng.seed.toString(16)}`,
    seed: rng.seed,
    inputs: { count },
    names,
    enhanced: false,
  };
}
