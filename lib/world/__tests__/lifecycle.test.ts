import { test, describe } from 'node:test';
import assert from 'node:assert';

// End-to-end queue lifecycle over a plain `data` object, simulating the
// get/setVal accessor the editor exposes. Proves the CP4 invariant: proposing
// never touches canonical `data.relationships`; only an explicit approval +
// applyApprovedDeltas does — and that change then lives in `data.*`.

import {
  proposeFromAnchorChange,
  appendEvents,
  getPendingEvents,
  pendingOnly,
  applyApprovedDeltas,
  removeEvent,
  PENDING_EVENTS_KEY,
} from '../proposals.js';
import { effectiveWeight } from '../../wiki/edges.js';
import type { Relationship } from '../../wiki/types.js';

function rel(p: Partial<Relationship> & { id: string; fromId: string; toId: string; kind: any }): Relationship {
  return { fromType: 'npc', toType: 'npc', createdAt: 0, ...p } as Relationship;
}

describe('propose → review → commit lifecycle', () => {
  test('a dead NPC enqueues bounded proposals, and approval is the only canonical write', () => {
    const data: Record<string, any> = {
      relationships: [
        rel({ id: 'e1', fromId: 'hero', toId: 'ally', kind: 'allyOf', weight: 0.8 }),
        rel({ id: 'e2', fromId: 'ally', toType: 'faction', toId: 'guild', kind: 'memberOf', weight: 1 }),
      ],
    };
    const set = (k: string, v: any) => { data[k] = v; };
    const get = (k: string, fb: any) => (k in data ? data[k] : fb);

    // 1. The hero dies → reactive propose (propose-only).
    const beforeEdges = JSON.stringify(data.relationships);
    const ev = proposeFromAnchorChange(get('relationships', []), 'npc:hero', -1, { sourceRule: 'reactive:death' });
    assert.ok(ev);
    set(PENDING_EVENTS_KEY, appendEvents(getPendingEvents(data), [ev!]));

    // Proposing must NOT have changed canonical edges.
    assert.equal(JSON.stringify(data.relationships), beforeEdges, 'edges untouched by proposing');
    assert.equal(pendingOnly(getPendingEvents(data)).length, 1);

    // Capture the proposed target so we can assert it landed.
    const delta = ev!.deltas[0];
    const targetEdgeBefore = data.relationships.find((r: Relationship) => r.id === delta.targetId)!;
    assert.equal(effectiveWeight(targetEdgeBefore), Number(delta.from));

    // 2. GM approves → commit through the (simulated) CRDT/auto-save path.
    const queue = getPendingEvents(data);
    const deltas = queue[0].deltas;
    set('relationships', applyApprovedDeltas(get('relationships', []), deltas));
    set(PENDING_EVENTS_KEY, removeEvent(queue, queue[0].id));

    // 3. The approved delta now lives in canonical data.*.
    const after = data.relationships.find((r: Relationship) => r.id === delta.targetId)!;
    assert.equal(after.weight, Number(delta.to));
    assert.equal(pendingOnly(getPendingEvents(data)).length, 0, 'queue drained');
  });

  test('rejection drains the queue without any canonical write', () => {
    const data: Record<string, any> = {
      relationships: [rel({ id: 'e1', fromId: 'a', toId: 'b', kind: 'allyOf', weight: 0.9 })],
    };
    const ev = proposeFromAnchorChange(data.relationships, 'npc:a', -1)!;
    data[PENDING_EVENTS_KEY] = [ev];
    const before = JSON.stringify(data.relationships);

    data[PENDING_EVENTS_KEY] = removeEvent(getPendingEvents(data), ev.id);

    assert.equal(getPendingEvents(data).length, 0);
    assert.equal(JSON.stringify(data.relationships), before, 'reject changes no canonical state');
  });
});
