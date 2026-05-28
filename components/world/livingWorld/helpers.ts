import type { GetFn } from './types';

/**
 * Read an array-valued slice of campaign data, falling back to `[]` when the
 * stored value is missing or not an array. Mirrors the original inline
 * `Array.isArray(get(k, [])) ? get(k, []) : []` pattern that appeared for
 * every entity collection.
 */
export function readArray<T = unknown>(get: GetFn, key: string): T[] {
  const value = get(key, []);
  return Array.isArray(value) ? (value as T[]) : [];
}

export function clampInt(value: string, min: number, max: number): number {
  const n = parseInt(value, 10);
  if (isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}
