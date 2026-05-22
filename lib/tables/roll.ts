import type { SeededRng } from '@/lib/generators/rng';

export type WeightedEntry<T> = { value: T; weight: number };

function isWeighted<T>(table: readonly (T | WeightedEntry<T>)[]): table is readonly WeightedEntry<T>[] {
  return table.length > 0
    && typeof table[0] === 'object'
    && table[0] !== null
    && 'value' in (table[0] as object)
    && 'weight' in (table[0] as object);
}

export function rollOn<T>(table: readonly WeightedEntry<T>[], rng: SeededRng): T;
export function rollOn<T>(table: readonly T[], rng: SeededRng): T;
export function rollOn<T>(table: readonly T[] | readonly WeightedEntry<T>[], rng: SeededRng): T {
  if (table.length === 0) throw new Error('rollOn: empty table');
  if (!isWeighted(table)) {
    return (table as readonly T[])[Math.floor(rng.next() * table.length)];
  }
  const weighted = table as readonly WeightedEntry<T>[];
  const total = weighted.reduce((s, e) => s + Math.max(0, e.weight), 0);
  if (total <= 0) return weighted[0].value;
  let r = rng.next() * total;
  for (const e of weighted) {
    r -= Math.max(0, e.weight);
    if (r < 0) return e.value;
  }
  return weighted[weighted.length - 1].value;
}

export function rollMultiple<T>(
  table: readonly WeightedEntry<T>[],
  n: number,
  rng: SeededRng,
  opts?: { unique?: boolean },
): T[];
export function rollMultiple<T>(
  table: readonly T[],
  n: number,
  rng: SeededRng,
  opts?: { unique?: boolean },
): T[];
export function rollMultiple<T>(
  table: readonly T[] | readonly WeightedEntry<T>[],
  n: number,
  rng: SeededRng,
  opts?: { unique?: boolean },
): T[] {
  const out: T[] = [];
  const seen = new Set<T>();
  let safety = n * 20;
  while (out.length < n && safety-- > 0) {
    const v = rollOn(table as any, rng) as T;
    if (opts?.unique) {
      if (seen.has(v)) continue;
      seen.add(v);
    }
    out.push(v);
  }
  return out;
}

// Tiered table lookup — chooses a sub-table by tier key, then rolls.
export function rollOnTiered<TMap extends Record<string, readonly any[] | readonly WeightedEntry<any>[]>, K extends keyof TMap>(
  tables: TMap,
  tier: K,
  rng: SeededRng,
): TMap[K] extends readonly (infer T)[] | readonly WeightedEntry<infer T>[] ? T : never {
  const table = tables[tier as string];
  if (!table) throw new Error(`rollOnTiered: no table for tier "${String(tier)}"`);
  return rollOn(table as any, rng) as any;
}

// Roll NdS as the sum of N dice with S sides each, using the seeded RNG.
export function rollDice(n: number, sides: number, rng: SeededRng): number {
  let total = 0;
  for (let i = 0; i < n; i++) total += 1 + Math.floor(rng.next() * sides);
  return total;
}

// Helper: build a weighted table from a record where keys are values and
// values are weights. Useful when expressing tables inline.
export function weighted<T extends string>(entries: Record<T, number>): WeightedEntry<T>[] {
  return (Object.entries(entries) as [T, number][]).map(([value, weight]) => ({ value, weight }));
}
