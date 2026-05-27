import { describe, it, expect, beforeEach } from 'vitest';
import { checkAndIncrementMapGen, __resetMapGenForTests, MAP_GEN_MONTHLY_LIMIT } from '../rate-limit';

describe('checkAndIncrementMapGen', () => {
  beforeEach(() => __resetMapGenForTests());

  it('allows up to the monthly limit then blocks', () => {
    const now = Date.UTC(2026, 4, 1);
    for (let i = 0; i < MAP_GEN_MONTHLY_LIMIT; i++) {
      const r = checkAndIncrementMapGen('u', now);
      expect(r.ok).toBe(true);
    }
    const blocked = checkAndIncrementMapGen('u', now);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it('reports remaining generations', () => {
    const now = Date.UTC(2026, 4, 1);
    expect(checkAndIncrementMapGen('u', now)).toEqual({ ok: true, remaining: MAP_GEN_MONTHLY_LIMIT - 1 });
  });

  it('resets when the calendar month rolls over', () => {
    const may = Date.UTC(2026, 4, 15);
    for (let i = 0; i < MAP_GEN_MONTHLY_LIMIT; i++) checkAndIncrementMapGen('u', may);
    expect(checkAndIncrementMapGen('u', may).ok).toBe(false);
    const june = Date.UTC(2026, 5, 1);
    expect(checkAndIncrementMapGen('u', june).ok).toBe(true);
  });

  it('tracks users independently', () => {
    const now = Date.UTC(2026, 4, 1);
    for (let i = 0; i < MAP_GEN_MONTHLY_LIMIT; i++) checkAndIncrementMapGen('a', now);
    expect(checkAndIncrementMapGen('a', now).ok).toBe(false);
    expect(checkAndIncrementMapGen('b', now).ok).toBe(true);
  });
});
