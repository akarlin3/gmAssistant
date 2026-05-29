import { test, describe } from 'node:test';
import assert from 'node:assert';

import { isDeadNpc, deathStateById, detectDeathTransitions } from '../reactive.js';

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
