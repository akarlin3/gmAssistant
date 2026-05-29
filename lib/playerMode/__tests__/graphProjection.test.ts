import { describe, it, expect } from 'vitest';
import { buildSlotProjection } from '../projection';
import { buildPlayerGraph } from '../graphProjection';
import { initPlayerMode } from '../migration';
import type { PlayerModeData } from '../types';

// CP2 focused test: the read-only player *graph* (what ConnectionsTab renders)
// must never surface a private edge or a hidden entity. We drive the full path
// the UI uses — buildSlotProjection (the redaction boundary) -> buildPlayerGraph
// (the graph consumer) — and assert the graph is clean. buildPlayerGraph itself
// performs no visibility logic, so this also guards that it can't accidentally
// re-introduce hidden data.

function seed(): PlayerModeData {
  const base = {
    npcs: [
      { id: 'npc1', name: 'Sera', appearance: 'tall' },
      { id: 'npc2', name: 'Hidden One', appearance: 'cloaked' },
    ],
    locations: [{ id: 'loc1', name: 'The Keep', type: 'Settlement' }],
  } as Record<string, any>;
  const { data } = initPlayerMode(base);
  // npc1 + loc1 visible to the party; npc2 stays private (hidden).
  data.player.entityVisibility.npcs = { npc1: { mode: 'party' } };
  data.player.entityVisibility.locations = { loc1: { mode: 'party' } };
  return data as PlayerModeData;
}

describe('buildPlayerGraph (read-only player graph)', () => {
  it('omits a private edge and never renders a node for a hidden entity', () => {
    const data = seed();
    data.relationships = [
      // party edge between two visible entities -> should render
      { id: 'e_ok', fromType: 'npc', fromId: 'npc1', toType: 'location', toId: 'loc1', kind: 'locatedAt', createdAt: 0, visibility: 'party' },
      // explicitly private edge -> must be absent
      { id: 'e_priv', fromType: 'npc', fromId: 'npc1', toType: 'location', toId: 'loc1', kind: 'allyOf', createdAt: 0, visibility: 'private' },
      // party edge to the HIDDEN npc2 -> must be absent (endpoint guard)
      { id: 'e_hidden', fromType: 'npc', fromId: 'npc1', toType: 'npc', toId: 'npc2', kind: 'allyOf', createdAt: 0, visibility: 'party' },
    ];

    const proj = buildSlotProjection(data, 'C', 'slot-a');
    const { nodes, edges } = buildPlayerGraph(proj);

    const nodeKeys = nodes.map((n) => n.key);
    expect(nodeKeys).toContain('npc:npc1');
    expect(nodeKeys).toContain('location:loc1');
    // The hidden entity is never a node.
    expect(nodeKeys).not.toContain('npc:npc2');

    const edgeIds = edges.map((e) => e.id);
    expect(edgeIds).toEqual(['e_ok']);
    expect(edgeIds).not.toContain('e_priv');
    expect(edgeIds).not.toContain('e_hidden');

    // Every rendered edge connects two rendered nodes (no dangling endpoint
    // that could hint at a hidden entity).
    const keySet = new Set(nodeKeys);
    for (const e of edges) {
      expect(keySet.has(e.source)).toBe(true);
      expect(keySet.has(e.target)).toBe(true);
    }
  });

  it('passes through kind/weight and marks asymmetric kinds directed', () => {
    const data = seed();
    data.relationships = [
      { id: 'e1', fromType: 'npc', fromId: 'npc1', toType: 'location', toId: 'loc1', kind: 'locatedAt', createdAt: 0, visibility: 'party', weight: 0.9 },
    ];
    const proj = buildSlotProjection(data, 'C', 'slot-a');
    const { edges } = buildPlayerGraph(proj);
    expect(edges).toHaveLength(1);
    expect(edges[0].kind).toBe('locatedAt');
    expect(edges[0].weight).toBe(0.9);
    expect(edges[0].directed).toBe(true); // locatedAt is asymmetric
  });

  it('never surfaces a proposed (review-queue) edge to players, even if party-visible', () => {
    const data = seed();
    data.relationships = [
      // A derivation proposal awaiting GM review — must stay GM-only until accepted.
      { id: 'e_prop', fromType: 'npc', fromId: 'npc1', toType: 'location', toId: 'loc1', kind: 'allyOf', createdAt: 0, visibility: 'party', proposed: true },
    ];
    const proj = buildSlotProjection(data, 'C', 'slot-a');
    const { edges } = buildPlayerGraph(proj);
    expect(edges).toEqual([]);
  });

  it('produces an empty graph when nothing is shared', () => {
    const data = seed();
    data.relationships = [];
    const proj = buildSlotProjection(data, 'C', 'slot-a');
    const { edges } = buildPlayerGraph(proj);
    expect(edges).toEqual([]);
  });
});
