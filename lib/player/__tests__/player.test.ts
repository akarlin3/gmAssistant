import { describe, it, expect, beforeEach } from 'vitest';
import { validatePlayerField } from '../allowlist';
import { checkPlayerRateLimit } from '../rate-limit';
import { __resetRateLimitForTests } from '../../rate-limit';

describe('Player Allowlist', () => {
  it('allows valid fields and values', () => {
    expect(validatePlayerField('hp.current', 10)).toBe(true);
    expect(validatePlayerField('hp.max', 25)).toBe(true);
    expect(validatePlayerField('hp.temp', 5)).toBe(true);
    expect(validatePlayerField('hitDice', { dieSize: 8, max: 5, used: 2 })).toBe(true);
    expect(validatePlayerField('hitDice.used', 2)).toBe(true);
    expect(validatePlayerField('conditions', ['Poisoned', 'Prone'])).toBe(true);
    expect(validatePlayerField('exhaustion', 3)).toBe(true);
    expect(validatePlayerField('deathSaves.successes', 2)).toBe(true);
    expect(validatePlayerField('deathSaves.failures', 0)).toBe(true);
    expect(validatePlayerField('inspiration', true)).toBe(true);
    expect(validatePlayerField('ac', 18)).toBe(true);
    expect(validatePlayerField('speed', 30)).toBe(true);
    expect(validatePlayerField('initiativeMod', 3)).toBe(true);
    expect(validatePlayerField('resourcePools', [{ id: 'ki', name: 'Ki Points', current: 3, max: 5, rechargeOn: 'short' }])).toBe(true);
    expect(validatePlayerField('spellSlots', [{ level: 1, max: 4, used: 1 }])).toBe(true);
    expect(validatePlayerField('pactSlots', { level: 3, max: 2, used: 1 })).toBe(true);
    expect(validatePlayerField('inventory', [{ id: 'i1', name: 'Longsword', qty: 1, weight: 3, equipped: true, attuned: false, notes: '' }])).toBe(true);
    expect(validatePlayerField('attunedCount', 2)).toBe(true);
    expect(validatePlayerField('currency', { cp: 10, sp: 5, ep: 0, gp: 120, pp: 1 })).toBe(true);
    expect(validatePlayerField('partyLoot', '2x Potion of Healing, Ruby worth 50gp')).toBe(true);
    expect(validatePlayerField('notes', 'Some custom character notes.')).toBe(true);
    expect(validatePlayerField('goals', ['Defeat the dragon', 'Find the sword'])).toBe(true);
    expect(validatePlayerField('sharedQuests', [{
      id: 'q1',
      title: 'Find the missing blacksmith',
      status: 'active',
      notes: 'Last seen near the old mill',
      linkedEntityIds: ['npc-1'],
      sharedWithGm: true,
    }])).toBe(true);
  });

  it('rejects forbidden fields', () => {
    expect(validatePlayerField('name', 'New Name')).toBe(false);
    expect(validatePlayerField('level', 5)).toBe(false);
    expect(validatePlayerField('abilities.STR', 18)).toBe(false);
    expect(validatePlayerField('proficiencyBonus', 6)).toBe(false);
    expect(validatePlayerField('ownership', { ownerType: 'player' })).toBe(false);
  });

  it('rejects invalid value types for allowed fields', () => {
    expect(validatePlayerField('hp.current', 'ten')).toBe(false);
    expect(validatePlayerField('hp.current', -5)).toBe(false);
    expect(validatePlayerField('conditions', 'Poisoned')).toBe(false);
    expect(validatePlayerField('exhaustion', 10)).toBe(false); // Max exhaustion is 6
    expect(validatePlayerField('deathSaves.successes', 5)).toBe(false); // Max death saves is 3
    expect(validatePlayerField('attunedCount', 4)).toBe(false); // Max attunement is 3
    expect(validatePlayerField('ac', -5)).toBe(false);
  });
});

describe('Player Rate Limiting', () => {
  beforeEach(() => {
    __resetRateLimitForTests();
  });

  it('allows requests within limit and rejects past 60 writes per minute', () => {
    const token = 'test-player-token-12345';

    // First 60 requests should pass
    for (let i = 0; i < 60; i++) {
      const res = checkPlayerRateLimit(token);
      expect(res.ok).toBe(true);
    }

    // 61st request should be rate-limited (429 equivalent)
    const limitRes = checkPlayerRateLimit(token);
    expect(limitRes.ok).toBe(false);
    if (!limitRes.ok) {
      expect(limitRes.retryAfterMs).toBeGreaterThan(0);
    }
  });
});
