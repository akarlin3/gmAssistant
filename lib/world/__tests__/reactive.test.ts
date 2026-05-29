import { test, describe } from 'node:test';
import assert from 'node:assert';

import { isDeadNpc, deathStateById, detectDeathTransitions } from '../reactive.js';
import { proposeFromAnchorChange } from '../proposals.js';
import type { Relationship } from '../../wiki/types.js';

describe('isDeadNpc', () => {
  test('boolean flag and status text both count; living NPCs do not', () => {
    assert.equal(isDeadNpc({ id: 'a', dead: true }), true);
    assert.equal(isDeadNpc({ id: 'b', status: 'Deceased (slain at the bridge)' }), true);
    assert.equal(isDeadNpc({ id: 'c', status: 'Killed' }), true);
    assert.equal(isDeadNpc({ id: 'd', status: 'Active' }), false);
    assert.equal(isDeadNpc({ id: 'e' }), false);
    assert.equal(isDeadNpc(null), false);
    // "dreadful" must not match the word-boundary "dead".
    assert.equal(isDeadNpc({ id: 'f', status: 'dreadful but alive' }), false);
  });
});

describe('detectDeathTransitions', () => {
  test('only NEW deaths are reported; pre-existing deaths are not', () => {
    const prev = [{ id: 'a', status: 'Active' }, { id: 'b', status: 'Dead' }];
    const next = [{ id: 'a', status: 'Killed' }, { id: 'b', status: 'Dead' }];
    assert.deepEqual(detectDeathTransitions(prev, next), ['npc:a']);
  });

  test('a freshly-added already-dead NPC is a transition', () => {
    assert.deepEqual(detectDeathTransitions([], [{ id: 'z', dead: true }]), ['npc:z']);
  });

  test('resurrection (dead → alive) is not a death transition', () => {
    const prev = [{ id: 'a', status: 'Dead' }];
    const next = [{ id: 'a', status: 'Active' }];
    assert.deepEqual(detectDeathTransitions(prev, next), []);
  });

  test('ids are required to anchor; missing-id NPCs are skipped', () => {
    assert.deepEqual(detectDeathTransitions([], [{ status: 'Dead' }]), []);
  });

  test('deathStateById ignores idless entries', () => {
    const m = deathStateById([{ id: 'a', dead: true }, { status: 'Dead' }]);
    assert.equal(m.size, 1);
    assert.equal(m.get('a'), true);
  });
});

// CP5: editing a node's state from the graph (marking an NPC dead) is a
// canonical write, but its *consequence* must land as a PROPOSAL, never a silent
// edge mutation. This exercises the same two-step the reactive observer runs:
// detect the death transition, then build a propose-only world event.
describe('graph-originated state change → proposal (CP5 invariant)', () => {
  test('a death transition produces a pending proposal and mutates no edge', () => {
    const rels: Relationship[] = [
      { id: 'e1', fromType: 'npc', fromId: 'hero', toType: 'faction', toId: 'guild', kind: 'memberOf', weight: 1, createdAt: 0 },
      { id: 'e2', fromType: 'npc', fromId: 'hero', toType: 'npc', toId: 'ally', kind: 'allyOf', weight: 0.8, createdAt: 0 },
    ];
    const snapshot = JSON.stringify(rels);

    // The GM toggles dead from the graph sidebar → npcs array changes.
    const prev = [{ id: 'hero', status: 'Active' }];
    const next = [{ id: 'hero', dead: true, status: 'Active' }];
    const transitions = detectDeathTransitions(prev, next);
    assert.deepEqual(transitions, ['npc:hero']);

    const ev = proposeFromAnchorChange(rels, transitions[0], -1, { now: 5 });
    assert.ok(ev, 'death enqueues a proposal');
    assert.equal(ev!.status, 'pending', 'proposed, not applied');
    assert.ok(ev!.deltas.length >= 1);
    // The proposal describes intended edge changes but does NOT apply them:
    // canonical relationships are byte-for-byte unchanged.
    assert.equal(JSON.stringify(rels), snapshot);
  });
});
