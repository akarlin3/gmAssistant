import { describe, it, expect } from 'vitest';
import {
  participantKeys,
  edgeTouches,
  edgesFor,
  isDirected,
  effectiveWeight,
  defaultWeightForKind,
  edgeVisibleToSlot,
} from '../edges';
import type { Relationship } from '../types';

function edge(p: Partial<Relationship>): Relationship {
  return {
    id: p.id ?? 'e1',
    fromType: p.fromType ?? 'npc',
    fromId: p.fromId ?? 'n1',
    toType: p.toType ?? 'faction',
    toId: p.toId ?? 'f1',
    kind: p.kind ?? 'memberOf',
    createdAt: p.createdAt ?? 0,
    ...p,
  };
}

describe('participantKeys', () => {
  it('produces composite type:id keys, never bare ids', () => {
    expect(participantKeys(edge({ fromType: 'npc', fromId: 'n1', toType: 'faction', toId: 'f1' })))
      .toEqual(['npc:n1', 'faction:f1']);
  });
});

describe('edgesFor (bidirectional lookup)', () => {
  const rels = [
    edge({ id: 'a', fromType: 'npc', fromId: 'n1', toType: 'faction', toId: 'f1' }),
    edge({ id: 'b', fromType: 'npc', fromId: 'n2', toType: 'npc', toId: 'n1', kind: 'allyOf' }),
    edge({ id: 'c', fromType: 'npc', fromId: 'n3', toType: 'faction', toId: 'f2' }),
  ];

  it('finds edges where the entity is the source', () => {
    expect(edgesFor(rels, 'npc', 'n1').map((r) => r.id).sort()).toEqual(['a', 'b']);
  });

  it('finds edges where the entity is the target', () => {
    expect(edgesFor(rels, 'faction', 'f2').map((r) => r.id)).toEqual(['c']);
  });

  it('returns empty for an entity with no edges', () => {
    expect(edgesFor(rels, 'faction', 'nope')).toEqual([]);
  });

  it('edgeTouches matches either endpoint', () => {
    const e = edge({ fromType: 'npc', fromId: 'n1', toType: 'faction', toId: 'f1' });
    expect(edgeTouches(e, 'npc', 'n1')).toBe(true);
    expect(edgeTouches(e, 'faction', 'f1')).toBe(true);
    expect(edgeTouches(e, 'npc', 'f1')).toBe(false);
  });
});

describe('isDirected', () => {
  it('symmetric kinds are undirected, asymmetric kinds are directed', () => {
    expect(isDirected(edge({ kind: 'allyOf' }))).toBe(false); // symmetric in catalog
    expect(isDirected(edge({ kind: 'memberOf' }))).toBe(true); // asymmetric
  });
});

describe('effectiveWeight / defaultWeightForKind', () => {
  it('uses the explicit weight when present, clamped to 0..1', () => {
    expect(effectiveWeight(edge({ kind: 'related', weight: 0.42 }))).toBe(0.42);
    expect(effectiveWeight(edge({ kind: 'related', weight: 5 }))).toBe(1);
    expect(effectiveWeight(edge({ kind: 'related', weight: -1 }))).toBe(0);
  });

  it('falls back to the kind default when weight is absent', () => {
    expect(effectiveWeight(edge({ kind: 'memberOf' }))).toBe(1);
    expect(effectiveWeight(edge({ kind: 'related' }))).toBe(0.3);
    expect(defaultWeightForKind('allyOf')).toBe(0.7);
  });
});

describe('edgeVisibleToSlot (fail-closed)', () => {
  it('absent/private visibility is never visible', () => {
    expect(edgeVisibleToSlot(undefined, undefined, 'slot-a')).toBe(false);
    expect(edgeVisibleToSlot('private', undefined, 'slot-a')).toBe(false);
  });
  it('party is visible to everyone', () => {
    expect(edgeVisibleToSlot('party', undefined, 'slot-a')).toBe(true);
  });
  it('custom is visible only to listed slots', () => {
    expect(edgeVisibleToSlot('custom', ['slot-b'], 'slot-a')).toBe(false);
    expect(edgeVisibleToSlot('custom', ['slot-a'], 'slot-a')).toBe(true);
    expect(edgeVisibleToSlot('custom', undefined, 'slot-a')).toBe(false);
  });
});
