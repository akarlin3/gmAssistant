import { describe, it, expect } from 'vitest';
import { propagateRelationships } from '../propagate';
import { factionStanceProposals } from '../factionTurnEdges';
import { mergeProposals, updateRelationship } from '../relationships';
import type { Relationship } from '../types';
import { emptyWorld, setRelationship } from '@/lib/factionEngine';

function rel(from: string, to: string, kind: Relationship['kind'], extra: Partial<Relationship> = {}): Relationship {
  const [ft, fi] = from.split(':');
  const [tt, ti] = to.split(':');
  return { id: `${from}-${kind}-${to}`, fromType: ft as any, fromId: fi, toType: tt as any, toId: ti, kind, createdAt: 0, ...extra };
}

describe('propagateRelationships', () => {
  it('infers friend-of-a-friend as a proposed ally', () => {
    const rels = [rel('npc:a', 'npc:b', 'allyOf'), rel('npc:b', 'npc:c', 'allyOf')];
    const { proposals } = propagateRelationships(rels);
    expect(proposals).toHaveLength(1);
    const p = proposals[0];
    expect(p.kind).toBe('allyOf');
    expect(p.proposed).toBe(true);
    expect(new Set([p.fromId, p.toId])).toEqual(new Set(['a', 'c']));
    expect(p.weight).toBeGreaterThan(0);
    expect(p.weight).toBeLessThan(1);
  });

  it("infers a friend's enemy as a proposed enemy", () => {
    const rels = [rel('npc:a', 'npc:b', 'allyOf'), rel('npc:b', 'npc:c', 'enemyOf')];
    const { proposals } = propagateRelationships(rels);
    expect(proposals).toHaveLength(1);
    expect(proposals[0].kind).toBe('enemyOf');
    expect(new Set([proposals[0].fromId, proposals[0].toId])).toEqual(new Set(['a', 'c']));
  });

  it('does not re-propose a pair that is already directly related', () => {
    const rels = [
      rel('npc:a', 'npc:b', 'allyOf'),
      rel('npc:b', 'npc:c', 'allyOf'),
      rel('npc:a', 'npc:c', 'enemyOf'), // already related directly
    ];
    const { proposals } = propagateRelationships(rels);
    expect(proposals).toHaveLength(0);
  });

  it('ignores suggested/proposed source edges (confirmed only)', () => {
    const rels = [rel('npc:a', 'npc:b', 'allyOf', { suggested: true }), rel('npc:b', 'npc:c', 'allyOf')];
    expect(propagateRelationships(rels).proposals).toHaveLength(0);
  });

  it('is deterministic', () => {
    const rels = [rel('npc:a', 'npc:b', 'allyOf'), rel('npc:b', 'npc:c', 'allyOf')];
    const a = propagateRelationships(rels, undefined, 1);
    const b = propagateRelationships(rels, undefined, 1);
    expect(a.proposals.map((p) => [p.fromId, p.toId, p.kind, p.weight])).toEqual(
      b.proposals.map((p) => [p.fromId, p.toId, p.kind, p.weight]),
    );
  });
});

describe('mergeProposals', () => {
  it('skips proposals that duplicate an existing link (either direction)', () => {
    const existing = [rel('npc:a', 'npc:c', 'allyOf')];
    const proposals = [rel('npc:c', 'npc:a', 'allyOf', { proposed: true })];
    const { relationships, added } = mergeProposals(existing, proposals);
    expect(added).toBe(0);
    expect(relationships).toHaveLength(1);
  });

  it('adds genuinely new proposals', () => {
    const existing = [rel('npc:a', 'npc:b', 'allyOf')];
    const proposals = [rel('npc:a', 'npc:c', 'allyOf', { proposed: true })];
    const { added } = mergeProposals(existing, proposals);
    expect(added).toBe(1);
  });
});

describe('updateRelationship', () => {
  it('patches editable fields and stamps updatedAt', () => {
    const rels = [rel('npc:a', 'npc:b', 'allyOf')];
    const next = updateRelationship(rels, rels[0].id, { weight: 0.42, visibility: 'party' });
    expect(next[0].weight).toBe(0.42);
    expect(next[0].visibility).toBe('party');
    expect(typeof next[0].updatedAt).toBe('number');
  });
});

describe('factionStanceProposals', () => {
  it('proposes ally/enemy edges between matching wiki factions past the stance thresholds', () => {
    let world = emptyWorld();
    world = {
      ...world,
      tick: 3,
      factions: [
        { id: 'F1', name: 'The Crown', archetype: '', aggression: 5, reach: 3, wealth: 3, influence: 5, goals: [] },
        { id: 'F2', name: 'Iron Hand', archetype: '', aggression: 5, reach: 3, wealth: 3, influence: 5, goals: [] },
        { id: 'F3', name: 'Neutrals', archetype: '', aggression: 5, reach: 3, wealth: 3, influence: 5, goals: [] },
      ],
    };
    world = { ...world, relationships: setRelationship(world.relationships, 'F1', 'F2', { stance: -8 }) };
    world = { ...world, relationships: setRelationship(world.relationships, 'F1', 'F3', { stance: 1 }) }; // neutral band

    // Map engine names to wiki faction entity ids.
    const byName: Record<string, string> = { 'the crown': 'wf-crown', 'iron hand': 'wf-iron' };
    const props = factionStanceProposals(world, (n) => byName[n.trim().toLowerCase()]);

    expect(props).toHaveLength(1);
    expect(props[0].kind).toBe('enemyOf');
    expect(new Set([props[0].fromId, props[0].toId])).toEqual(new Set(['wf-crown', 'wf-iron']));
    expect(props[0].weight).toBeCloseTo(0.8, 5);
    expect(props[0].proposed).toBe(true);
  });

  it('skips factions with no wiki match', () => {
    let world = emptyWorld();
    world = {
      ...world,
      factions: [
        { id: 'F1', name: 'Unknown A', archetype: '', aggression: 5, reach: 3, wealth: 3, influence: 5, goals: [] },
        { id: 'F2', name: 'Unknown B', archetype: '', aggression: 5, reach: 3, wealth: 3, influence: 5, goals: [] },
      ],
      relationships: setRelationship({}, 'F1', 'F2', { stance: 9 }),
    };
    expect(factionStanceProposals(world, () => undefined)).toHaveLength(0);
  });
});
