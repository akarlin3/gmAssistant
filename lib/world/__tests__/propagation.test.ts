import { test, describe } from 'node:test';
import assert from 'node:assert';

import {
  propagate,
  signForKind,
  driftWeight,
  clampWeight,
  DEFAULT_PROPAGATION_PARAMS,
  type PropEdge,
} from '../propagation.js';

const P = DEFAULT_PROPAGATION_PARAMS; // decay 0.5, ε 0.05, depthCap 4

function edge(p: Partial<PropEdge> & { a: string; b: string }): PropEdge {
  return { id: p.id ?? `${p.a}->${p.b}`, kind: p.kind ?? 'allyOf', weight: p.weight ?? 1, ...p };
}

describe('signForKind', () => {
  test('hostile kinds invert, dependent/ally kinds carry through', () => {
    assert.equal(signForKind('enemyOf'), -1);
    assert.equal(signForKind('fears'), -1);
    assert.equal(signForKind('allyOf'), 1);
    assert.equal(signForKind('memberOf'), 1);
    assert.equal(signForKind('protects'), 1);
  });
});

describe('propagate — convergence + bounds', () => {
  test('a single ally hop applies Δ·weight·decay', () => {
    const edges = [edge({ a: 'npc:a', b: 'npc:b', weight: 1, kind: 'allyOf' })];
    const impacts = propagate({ anchorKey: 'npc:a', magnitude: 1, edges, ...P });
    assert.equal(impacts.length, 1);
    // 1 * 1 * (+1) * 0.5
    assert.ok(Math.abs(impacts[0].delta - 0.5) < 1e-9);
    assert.equal(impacts[0].hop, 1);
    assert.equal(impacts[0].targetKey, 'npc:b');
  });

  test('enemy edges flip the sign of the impact', () => {
    const edges = [edge({ a: 'npc:a', b: 'npc:b', weight: 1, kind: 'enemyOf' })];
    const impacts = propagate({ anchorKey: 'npc:a', magnitude: 1, edges, ...P });
    assert.ok(impacts[0].delta < 0);
  });

  test('magnitude decays geometrically along a chain and stops below ε', () => {
    // weight 1 everywhere, decay 0.5: hop1=0.5, hop2=0.25, hop3=0.125,
    // hop4=0.0625, hop5 would be 0.03125 < ε(0.05) → pruned.
    const edges = [
      edge({ a: 'n0', b: 'n1' }),
      edge({ a: 'n1', b: 'n2' }),
      edge({ a: 'n2', b: 'n3' }),
      edge({ a: 'n3', b: 'n4' }),
      edge({ a: 'n4', b: 'n5' }),
      edge({ a: 'n5', b: 'n6' }),
    ];
    const impacts = propagate({ anchorKey: 'n0', magnitude: 1, edges, ...P });
    const hops = impacts.map((i) => i.hop).sort((x, y) => x - y);
    // depthCap 4 caps at hop 4; the ε prune would also have stopped at hop 5.
    assert.deepEqual(hops, [1, 2, 3, 4]);
    for (const im of impacts) assert.ok(Math.abs(im.delta) >= P.epsilon);
  });

  test('depthCap halts expansion even when ε would allow deeper hops', () => {
    const edges = [
      edge({ a: 'n0', b: 'n1', weight: 1 }),
      edge({ a: 'n1', b: 'n2', weight: 1 }),
      edge({ a: 'n2', b: 'n3', weight: 1 }),
      edge({ a: 'n3', b: 'n4', weight: 1 }),
      edge({ a: 'n4', b: 'n5', weight: 1 }),
    ];
    // High decay so ε never prunes; only depthCap can stop it.
    const impacts = propagate({ anchorKey: 'n0', magnitude: 1, edges, decay: 0.99, epsilon: 0.001, depthCap: 3 });
    const maxHop = Math.max(...impacts.map((i) => i.hop));
    assert.equal(maxHop, 3);
  });

  test('cycles do not loop forever (visited-set) and each edge yields ≤1 impact', () => {
    // Triangle a-b-c-a, all weight 1. Without a visited set this recurses forever.
    const edges = [
      edge({ id: 'ab', a: 'a', b: 'b', weight: 1 }),
      edge({ id: 'bc', a: 'b', b: 'c', weight: 1 }),
      edge({ id: 'ca', a: 'c', b: 'a', weight: 1 }),
    ];
    const impacts = propagate({ anchorKey: 'a', magnitude: 1, edges, decay: 0.9, epsilon: 0.01, depthCap: 50 });
    const edgeIds = impacts.map((i) => i.viaEdgeId);
    // Every edge appears at most once.
    assert.equal(new Set(edgeIds).size, edgeIds.length);
    // And at most one impact per edge in the graph.
    assert.ok(impacts.length <= edges.length);
  });

  test('zero magnitude or isolated anchor yields nothing', () => {
    const edges = [edge({ a: 'x', b: 'y' })];
    assert.equal(propagate({ anchorKey: 'x', magnitude: 0, edges, ...P }).length, 0);
    assert.equal(propagate({ anchorKey: 'lonely', magnitude: 1, edges, ...P }).length, 0);
  });

  test('large dense graph terminates (stress / recursion-safety)', () => {
    // Fully-connected 30-node graph with cycles everywhere.
    const nodes = Array.from({ length: 30 }, (_, i) => `n${i}`);
    const edges: PropEdge[] = [];
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        edges.push(edge({ id: `${i}-${j}`, a: nodes[i], b: nodes[j], weight: 1 }));
      }
    }
    const impacts = propagate({ anchorKey: 'n0', magnitude: 1, edges, decay: 0.9, epsilon: 0.01, depthCap: 100 });
    // Terminates, and never exceeds one impact per edge.
    assert.ok(impacts.length <= edges.length);
  });
});

describe('driftWeight', () => {
  test('relaxes toward baseline as sessions elapse', () => {
    const baseline = 0.3;
    const start = 0.9;
    const after1 = driftWeight(baseline, start, 0.5, 1); // 0.3 + 0.6*0.5 = 0.6
    const after2 = driftWeight(baseline, start, 0.5, 2); // 0.3 + 0.6*0.25 = 0.45
    assert.ok(Math.abs(after1 - 0.6) < 1e-9);
    assert.ok(Math.abs(after2 - 0.45) < 1e-9);
    // Monotonic approach to baseline.
    assert.ok(after2 < after1 && after2 > baseline);
  });

  test('clamps into 0..1 and 0 sessions is identity', () => {
    assert.equal(driftWeight(0.5, 0.8, 0.5, 0), 0.8);
    assert.equal(clampWeight(1.7), 1);
    assert.equal(clampWeight(-0.3), 0);
  });
});
