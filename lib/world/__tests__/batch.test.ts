import { test, describe } from 'node:test';
import assert from 'node:assert';

import { computeFactionStandings, runBatchProposals } from '../batch.js';

describe('computeFactionStandings', () => {
  test('uses an explicit numeric strength field when present', () => {
    const data = { factions: [{ id: 'iron', name: 'Iron Hand', power: 7 }] };
    const s = computeFactionStandings(data);
    assert.deepEqual(s, [{ key: 'faction:iron', name: 'Iron Hand', wealth: 7 }]);
  });

  test('falls back to a graph holdings proxy from edges', () => {
    const data = {
      factions: [{ id: 'iron', name: 'Iron Hand' }],
      relationships: [
        { id: 'r1', fromType: 'faction', fromId: 'iron', toType: 'location', toId: 'keep', kind: 'owns', weight: 0.6, createdAt: 0 },
        { id: 'r2', fromType: 'npc', fromId: 'n1', toType: 'faction', toId: 'iron', kind: 'memberOf', createdAt: 0 }, // weight default 1
      ],
    };
    const s = computeFactionStandings(data);
    assert.equal(s.length, 1);
    assert.ok(Math.abs(s[0].wealth - 1.6) < 1e-9);
  });
});

describe('runBatchProposals — propagation + faction heuristics + drift', () => {
  test('produces drift, conflict, and propagation events without mutating data', () => {
    const data = {
      factions: [
        { id: 'iron', name: 'Iron Hand', power: 9 },
        { id: 'silver', name: 'Silver Court', power: 3 },
      ],
      relationships: [
        // Hostile, wealthy aggressor → conflict + propagation anchor.
        { id: 'war', fromType: 'faction', fromId: 'iron', toType: 'faction', toId: 'silver', kind: 'enemyOf', weight: 0.9, createdAt: 0 },
        // Inflated ally edge that should drift toward baseline 0.7.
        { id: 'pact', fromType: 'faction', fromId: 'iron', toType: 'faction', toId: 'gold', kind: 'allyOf', weight: 1, createdAt: 0 },
      ],
    };
    const snapshot = JSON.stringify(data);
    const events = runBatchProposals(data, { sessionsElapsed: 3, now: 5 });

    const rules = new Set(events.map((e) => e.sourceRule));
    assert.ok(rules.has('drift'), 'has a drift event');
    assert.ok(rules.has('faction:conflict'), 'has a faction conflict event');
    assert.ok(rules.has('faction:propagation'), 'propagates from the aggressor');

    // Every event is pending and has at least one delta.
    for (const e of events) {
      assert.equal(e.status, 'pending');
      assert.ok(e.deltas.length > 0);
    }
    // Propose-only: input data is untouched.
    assert.equal(JSON.stringify(data), snapshot);
  });

  test('empty world proposes nothing', () => {
    assert.deepEqual(runBatchProposals({ factions: [], relationships: [] }, { sessionsElapsed: 2 }), []);
  });
});
