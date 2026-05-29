import { describe, it, expect } from 'vitest';
import {
  createEdge,
  updateRelationship,
  addRelationship,
  removeRelationship,
} from '../relationships';
import { effectiveWeight } from '../edges';
import type { Relationship } from '../types';

const NPC_A = { type: 'npc', id: 'a' } as const;
const FAC_X = { type: 'faction', id: 'x' } as const;

describe('createEdge (drag-to-connect, CP5)', () => {
  it('creates a valid edge with clamped weight + explicit visibility', () => {
    const e = createEdge(NPC_A, FAC_X, 'memberOf', { weight: 1.5, visibility: 'party' });
    expect(e.fromType).toBe('npc');
    expect(e.toId).toBe('x');
    expect(e.kind).toBe('memberOf');
    expect(e.weight).toBe(1); // clamped to 0..1
    expect(e.visibility).toBe('party');
    expect(e.updatedAt).toBe(e.createdAt);
    expect(typeof e.id).toBe('string');
  });

  it('omits weight when not supplied (falls back to kind default at read time)', () => {
    const e = createEdge(NPC_A, FAC_X, 'memberOf');
    expect(e.weight).toBeUndefined();
    // memberOf default is 1.0.
    expect(effectiveWeight(e)).toBe(1);
    // Absent visibility ⇒ fail-closed private at read time.
    expect(e.visibility).toBeUndefined();
  });

  it('keeps customVisibleTo only for custom visibility', () => {
    const custom = createEdge(NPC_A, FAC_X, 'memberOf', {
      visibility: 'custom',
      customVisibleTo: ['slot-1'],
    });
    expect(custom.customVisibleTo).toEqual(['slot-1']);
    const party = createEdge(NPC_A, FAC_X, 'memberOf', {
      visibility: 'party',
      customVisibleTo: ['slot-1'],
    });
    expect(party.customVisibleTo).toBeUndefined();
  });
});

describe('updateRelationship (edge editor, CP5)', () => {
  const base: Relationship = {
    id: 'e1',
    fromType: 'npc',
    fromId: 'a',
    toType: 'faction',
    toId: 'x',
    kind: 'memberOf',
    weight: 0.5,
    visibility: 'custom',
    customVisibleTo: ['slot-1'],
    createdAt: 0,
  };

  it('edits kind/weight/visibility in place and stamps updatedAt', () => {
    const [next] = updateRelationship([base], 'e1', {
      kind: 'leaderOf',
      weight: 0.9,
      visibility: 'party',
    });
    expect(next.kind).toBe('leaderOf');
    expect(next.weight).toBe(0.9);
    expect(next.visibility).toBe('party');
    // Switching away from custom drops the stale roster list.
    expect(next.customVisibleTo).toBeUndefined();
    expect(typeof next.updatedAt).toBe('number');
  });

  it('clamps weight to 0..1', () => {
    expect(updateRelationship([base], 'e1', { weight: -3 })[0].weight).toBe(0);
    expect(updateRelationship([base], 'e1', { weight: 99 })[0].weight).toBe(1);
  });

  it('is immutable and leaves non-matching edges untouched', () => {
    const other: Relationship = { ...base, id: 'e2' };
    const out = updateRelationship([base, other], 'e1', { weight: 0.1 });
    expect(out[0]).not.toBe(base); // new object for the edited edge
    expect(out[1]).toBe(other); // same reference for the untouched edge
    expect(base.weight).toBe(0.5); // original not mutated
  });

  it('empty notes clears the field', () => {
    const withNotes: Relationship = { ...base, notes: 'since the siege' };
    expect(updateRelationship([withNotes], 'e1', { notes: '  ' })[0].notes).toBeUndefined();
  });

  it('composes with add/remove for the full graph-edit lifecycle', () => {
    const created = createEdge(NPC_A, FAC_X, 'memberOf', { weight: 0.4 });
    let all = addRelationship([], created);
    expect(all).toHaveLength(1);
    all = updateRelationship(all, created.id, { weight: 0.7 });
    expect(all[0].weight).toBe(0.7);
    all = removeRelationship(all, created.id);
    expect(all).toHaveLength(0);
  });
});
