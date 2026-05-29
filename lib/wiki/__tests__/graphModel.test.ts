import { describe, it, expect } from 'vitest';
import { buildClusters, edgesFromRelationships } from '../graphModel';
import { computeLayout } from '../graphLayout';
import type { GraphNode } from '../graphModel';
import type { Relationship } from '../types';

const nodes: GraphNode[] = [
  { key: 'faction:f1', type: 'faction', id: 'f1', name: 'Crown' },
  { key: 'npc:n1', type: 'npc', id: 'n1', name: 'Sera' },
  { key: 'npc:n2', type: 'npc', id: 'n2', name: 'Loner' },
];

describe('edgesFromRelationships', () => {
  it('drops suggested edges and derives weight + directedness', () => {
    const rels: Relationship[] = [
      { id: 'e1', fromType: 'npc', fromId: 'n1', toType: 'faction', toId: 'f1', kind: 'memberOf', createdAt: 0 },
      { id: 'e2', fromType: 'npc', fromId: 'n2', toType: 'npc', toId: 'n1', kind: 'allyOf', createdAt: 0, suggested: true },
    ];
    const edges = edgesFromRelationships(rels);
    expect(edges.map((e) => e.id)).toEqual(['e1']);
    expect(edges[0].source).toBe('npc:n1');
    expect(edges[0].target).toBe('faction:f1');
    expect(edges[0].directed).toBe(true); // memberOf is asymmetric
    expect(edges[0].weight).toBeGreaterThan(0);
  });
});

describe('buildClusters', () => {
  it('anchors factions and joins members to their faction; loners are unclustered', () => {
    const edges = edgesFromRelationships([
      { id: 'e1', fromType: 'npc', fromId: 'n1', toType: 'faction', toId: 'f1', kind: 'memberOf', createdAt: 0 },
    ]);
    const clusters = buildClusters(nodes, edges);
    expect(clusters.get('faction:f1')).toBe('faction:f1');
    expect(clusters.get('npc:n1')).toBe('faction:f1');
    expect(clusters.get('npc:n2')).toBeNull();
  });
});

describe('computeLayout', () => {
  it('returns a finite position for every node and is deterministic', () => {
    const edges = [{ source: 'npc:n1', target: 'faction:f1', weight: 0.6 }];
    const a = computeLayout(nodes.map((n) => ({ id: n.key, cluster: null })), edges);
    const b = computeLayout(nodes.map((n) => ({ id: n.key, cluster: null })), edges);
    for (const n of nodes) {
      expect(Number.isFinite(a[n.key].x)).toBe(true);
      expect(Number.isFinite(a[n.key].y)).toBe(true);
    }
    expect(a).toEqual(b); // seeded, not random
  });
});
