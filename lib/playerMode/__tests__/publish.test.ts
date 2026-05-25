import { describe, it, expect } from 'vitest';
import { staleSlotIds, rotateShareToken, playUrl } from '../publish';
import type { PlayerConfig } from '../types';

describe('staleSlotIds', () => {
  it('returns slot docs no longer in the roster', () => {
    expect(staleSlotIds(['a', 'b', 'c'], ['a', 'c'])).toEqual(['b']);
  });
  it('returns nothing when all existing slots are still rostered', () => {
    expect(staleSlotIds(['a', 'b'], ['a', 'b', 'c'])).toEqual([]);
  });
  it('handles empty roster (everything is stale)', () => {
    expect(staleSlotIds(['a', 'b'], [])).toEqual(['a', 'b']);
  });
});

describe('rotateShareToken', () => {
  it('replaces the token and bumps the version', () => {
    const config = { shareToken: 'old', tokenVersion: 1, roster: [], fieldDefaults: {}, entityVisibility: {} } as PlayerConfig;
    const next = rotateShareToken(config);
    expect(next.shareToken).not.toBe('old');
    expect(next.shareToken).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(next.tokenVersion).toBe(2);
    // does not mutate the original
    expect(config.shareToken).toBe('old');
  });
});

describe('playUrl', () => {
  it('builds a /play/<token> url from a given origin', () => {
    expect(playUrl('abc123', 'https://gm.averykarlin.org')).toBe('https://gm.averykarlin.org/play/abc123');
  });
});
