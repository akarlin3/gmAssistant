import { describe, it, expect } from 'vitest';
import { resolveMentions, levenshtein } from '../mentions';

const npcs = [
  { id: 'npc-inn', name: 'Inka' },
  { id: 'npc-stranger', name: 'The Stranger' },
  { id: 'npc-bran', name: 'Brann Stoneforge' },
];

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('inka', 'inka')).toBe(0);
  });
  it('counts single edits', () => {
    expect(levenshtein('inka', 'inkah')).toBe(1);
    expect(levenshtein('inka', 'inko')).toBe(1);
  });
  it('handles empty strings', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });
});

describe('resolveMentions', () => {
  it('resolves an exact bareword mention', () => {
    const { resolvedIds, markedText } = resolveMentions('I greet @Inka warmly.', npcs);
    expect(resolvedIds).toEqual(['npc-inn']);
    expect(markedText).toContain('<mention id="npc-inn">@Inka</mention>');
  });

  it('resolves a quoted multi-word name', () => {
    const { resolvedIds } = resolveMentions('I nod to @"The Stranger".', npcs);
    expect(resolvedIds).toEqual(['npc-stranger']);
  });

  it('resolves whitespace-collapsed names', () => {
    const { resolvedIds } = resolveMentions('@BrannStoneforge looks up.', npcs);
    expect(resolvedIds).toEqual(['npc-bran']);
  });

  it('resolves a small typo via levenshtein fallback', () => {
    const { resolvedIds } = resolveMentions('@Inkah waves.', npcs);
    expect(resolvedIds).toEqual(['npc-inn']);
  });

  it('does not resolve an unknown name', () => {
    const { resolvedIds, markedText } = resolveMentions('@Zelphagor appears.', npcs);
    expect(resolvedIds).toEqual([]);
    expect(markedText).toBe('@Zelphagor appears.');
  });

  it('dedupes repeated mentions of the same NPC', () => {
    const { resolvedIds } = resolveMentions('@Inka and again @Inka', npcs);
    expect(resolvedIds).toEqual(['npc-inn']);
  });
});
