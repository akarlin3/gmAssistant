import { test, describe } from 'node:test';
import assert from 'node:assert';

import {
  getPendingEvents,
  pendingOnly,
  appendEvents,
  setEventStatus,
  removeEvent,
  buildPropEdges,
  proposeFromAnchorChange,
  proposeWeightDrift,
  proposeFactionConflicts,
  applyApprovedDeltas,
  PENDING_EVENTS_KEY,
  type PendingWorldEvent,
} from '../proposals.js';
import type { Relationship } from '../../wiki/types.js';

let seq = 0;
function rel(p: Partial<Relationship> & { fromType: any; fromId: string; toType: any; toId: string; kind: any }): Relationship {
  seq += 1;
  return {
    id: p.id ?? `r${seq}`,
    createdAt: 0,
    ...p,
  } as Relationship;
}

describe('queue helpers', () => {
  test('getPendingEvents tolerates missing/non-array', () => {
    assert.deepEqual(getPendingEvents(null), []);
    assert.deepEqual(getPendingEvents({}), []);
    assert.deepEqual(getPendingEvents({ [PENDING_EVENTS_KEY]: 'nope' }), []);
  });

  test('append/status/remove/pendingOnly are pure transforms', () => {
    const e1: PendingWorldEvent = { id: 'a', anchorId: 'x', deltas: [{ targetId: 'r1', field: 'weight', from: 0.5, to: 0.7 }], sourceRule: 'propagation', createdAt: 1, status: 'pending' };
    const empty: PendingWorldEvent = { id: 'b', anchorId: 'y', deltas: [], sourceRule: 'drift', createdAt: 1, status: 'pending' };
    const appended = appendEvents([], [e1, empty]);
    assert.equal(appended.length, 1, 'drops events with no deltas');

    const approved = setEventStatus(appended, 'a', 'approved');
    assert.equal(approved[0].status, 'approved');
    assert.equal(appended[0].status, 'pending', 'original untouched (pure)');
    assert.equal(pendingOnly(approved).length, 0);

    assert.equal(removeEvent(approved, 'a').length, 0);
  });
});

describe('buildPropEdges', () => {
  test('skips unconfirmed suggestions and resolves effective weight', () => {
    const rels = [
      rel({ id: 'keep', fromType: 'npc', fromId: 'a', toType: 'npc', toId: 'b', kind: 'allyOf', weight: 0.9 }),
      rel({ id: 'drop', fromType: 'npc', fromId: 'a', toType: 'npc', toId: 'c', kind: 'allyOf', suggested: true }),
      rel({ id: 'def', fromType: 'npc', fromId: 'a', toType: 'faction', toId: 'f', kind: 'memberOf' }),
    ];
    const edges = buildPropEdges(rels);
    const ids = edges.map((e) => e.id).sort();
    assert.deepEqual(ids, ['def', 'keep']);
    const keep = edges.find((e) => e.id === 'keep')!;
    assert.equal(keep.weight, 0.9);
    assert.equal(keep.a, 'npc:a');
    assert.equal(keep.b, 'npc:b');
    // memberOf has no explicit weight → kind default (1).
    assert.equal(edges.find((e) => e.id === 'def')!.weight, 1);
  });
});

describe('proposeFromAnchorChange — propose-only', () => {
  test('a dead NPC enqueues bounded edge-weight proposals, mutating nothing', () => {
    const rels = [
      rel({ id: 'e1', fromType: 'npc', fromId: 'hero', toType: 'npc', toId: 'ally', kind: 'allyOf', weight: 0.8 }),
      rel({ id: 'e2', fromType: 'npc', fromId: 'ally', toType: 'faction', toId: 'guild', kind: 'memberOf', weight: 1 }),
    ];
    const snapshot = JSON.stringify(rels);
    // Negative magnitude: the hero is gone.
    const ev = proposeFromAnchorChange(rels, 'npc:hero', -1, { now: 1000 });
    assert.ok(ev, 'should produce an event');
    assert.equal(ev!.status, 'pending');
    assert.equal(ev!.anchorId, 'npc:hero');
    assert.ok(ev!.deltas.length >= 1);
    for (const d of ev!.deltas) {
      assert.equal(d.field, 'weight');
      assert.notEqual(d.from, d.to);
      assert.ok((d.to as number) >= 0 && (d.to as number) <= 1, 'clamped');
    }
    // Canonical data is untouched by proposing.
    assert.equal(JSON.stringify(rels), snapshot);
  });

  test('isolated anchor → null (nothing to propose)', () => {
    const rels = [rel({ fromType: 'npc', fromId: 'a', toType: 'npc', toId: 'b', kind: 'allyOf', weight: 0.5 })];
    assert.equal(proposeFromAnchorChange(rels, 'npc:lonely', -1), null);
  });
});

describe('proposeWeightDrift', () => {
  test('relaxes an inflated edge toward its kind baseline', () => {
    // allyOf baseline is 0.7; an edge currently at 1.0 should drift down.
    const rels = [rel({ id: 'e', fromType: 'npc', fromId: 'a', toType: 'npc', toId: 'b', kind: 'allyOf', weight: 1 })];
    const ev = proposeWeightDrift(rels, 3, { now: 1 });
    assert.ok(ev);
    assert.equal(ev!.sourceRule, 'drift');
    const d = ev!.deltas[0];
    assert.equal(d.targetId, 'e');
    assert.ok((d.to as number) < (d.from as number));
    assert.ok((d.to as number) > 0.7, 'still above baseline after 3 sessions');
  });

  test('0 sessions or sub-threshold drift → null', () => {
    const rels = [rel({ fromType: 'npc', fromId: 'a', toType: 'npc', toId: 'b', kind: 'allyOf', weight: 0.7 })];
    assert.equal(proposeWeightDrift(rels, 0), null);
    // Already at baseline → no drift.
    assert.equal(proposeWeightDrift(rels, 5), null);
  });
});

describe('proposeFactionConflicts', () => {
  test('wealthier + hostile pair proposes escalation; poorer side does not', () => {
    const rels = [
      rel({ id: 'war', fromType: 'faction', fromId: 'iron', toType: 'faction', toId: 'silver', kind: 'enemyOf', weight: 0.85 }),
    ];
    const factions = [
      { key: 'faction:iron', name: 'Iron Hand', wealth: 9 },
      { key: 'faction:silver', name: 'Silver Court', wealth: 4 },
    ];
    const events = proposeFactionConflicts(factions, rels, { now: 2 });
    assert.equal(events.length, 1, 'only the wealthier aggressor proposes');
    assert.equal(events[0].sourceRule, 'faction:conflict');
    assert.equal(events[0].anchorId, 'faction:iron');
    assert.equal(events[0].deltas[0].targetId, 'war');
    assert.ok((events[0].deltas[0].to as number) >= 0.85);
  });

  test('below hostility threshold → no proposal', () => {
    const rels = [rel({ id: 'w', fromType: 'faction', fromId: 'a', toType: 'faction', toId: 'b', kind: 'enemyOf', weight: 0.5 })];
    const factions = [
      { key: 'faction:a', name: 'A', wealth: 9 },
      { key: 'faction:b', name: 'B', wealth: 1 },
    ];
    assert.deepEqual(proposeFactionConflicts(factions, rels), []);
  });
});

describe('applyApprovedDeltas — the only canonical writer', () => {
  test('sets weight on matched edges, clamps, stamps updatedAt, ignores unknown fields', () => {
    const rels = [
      rel({ id: 'e1', fromType: 'npc', fromId: 'a', toType: 'npc', toId: 'b', kind: 'allyOf', weight: 0.5 }),
      rel({ id: 'e2', fromType: 'npc', fromId: 'a', toType: 'npc', toId: 'c', kind: 'enemyOf', weight: 0.2 }),
    ];
    const next = applyApprovedDeltas(rels, [
      { targetId: 'e1', field: 'weight', from: 0.5, to: 1.4 }, // clamps to 1
      { targetId: 'e2', field: 'mood', from: 'x', to: 'y' }, // unknown field ignored
      { targetId: 'missing', field: 'weight', from: 0, to: 0.9 }, // no match
    ]);
    assert.equal(next.find((r) => r.id === 'e1')!.weight, 1);
    assert.ok(typeof next.find((r) => r.id === 'e1')!.updatedAt === 'number');
    assert.equal(next.find((r) => r.id === 'e2')!.weight, 0.2, 'unchanged');
    // Input not mutated.
    assert.equal(rels.find((r) => r.id === 'e1')!.weight, 0.5);
  });

  test('empty delta list returns a copy, not the same reference', () => {
    const rels = [rel({ fromType: 'npc', fromId: 'a', toType: 'npc', toId: 'b', kind: 'allyOf' })];
    const out = applyApprovedDeltas(rels, []);
    assert.notEqual(out, rels);
    assert.deepEqual(out, rels);
  });
});
