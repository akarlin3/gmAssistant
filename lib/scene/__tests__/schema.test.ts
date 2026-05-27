import { describe, it, expect } from 'vitest';
import { validateSceneTurnResponse, extractJson } from '../schema';

const valid = {
  dialogue: [{ npcId: 'npc-inn', line: 'What do you want?' }],
  sensory: 'The hearth pops. Smoke hangs low.',
  suggestedRoll: {
    ability: 'WIS',
    skill: 'Insight',
    dc: 15,
    reason: 'Reading her mood is uncertain.',
  },
};

describe('validateSceneTurnResponse', () => {
  it('accepts a well-formed response', () => {
    const r = validateSceneTurnResponse(valid, ['npc-inn']);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.suggestedRoll?.ability).toBe('WIS');
  });

  it('accepts a null suggestedRoll', () => {
    const r = validateSceneTurnResponse({ ...valid, suggestedRoll: null });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.suggestedRoll).toBeNull();
  });

  it('rejects dialogue referencing an NPC not in the scene', () => {
    const r = validateSceneTurnResponse(valid, ['npc-other']);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/not one of the NPCs present/);
  });

  it('rejects an out-of-range DC', () => {
    const r = validateSceneTurnResponse({
      ...valid,
      suggestedRoll: { ...valid.suggestedRoll, dc: 99 },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(' ')).toMatch(/dc must be an integer/);
  });

  it('rejects an invalid ability', () => {
    const r = validateSceneTurnResponse({
      ...valid,
      suggestedRoll: { ...valid.suggestedRoll, ability: 'LUK' },
    });
    expect(r.ok).toBe(false);
  });

  it('rejects missing sensory', () => {
    const r = validateSceneTurnResponse({ dialogue: [], sensory: '', suggestedRoll: null });
    expect(r.ok).toBe(false);
  });

  it('rejects a non-object', () => {
    expect(validateSceneTurnResponse('nope').ok).toBe(false);
    expect(validateSceneTurnResponse(null).ok).toBe(false);
  });
});

describe('extractJson', () => {
  it('parses bare JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });
  it('strips markdown fences', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
  it('recovers JSON embedded in prose', () => {
    expect(extractJson('Sure! {"a":1} hope that helps')).toEqual({ a: 1 });
  });
  it('returns undefined for unparseable text', () => {
    expect(extractJson('no json here')).toBeUndefined();
  });
});
