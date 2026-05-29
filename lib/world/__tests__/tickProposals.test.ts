import { test, describe } from 'node:test';
import assert from 'node:assert';

import {
  classifyTickChange,
  computeTickDeltas,
  commitTickToData,
  buildTickReviewEvents,
  tickEventId,
  TICK_SOURCE_RULE,
} from '../tickProposals.js';
import {
  appendEvents,
  applyApprovedDeltas,
  getPendingEvents,
  pendingOnly,
  PENDING_EVENTS_KEY,
  type DeltaCollections,
  type WorldDelta,
} from '../proposals.js';
import type { Relationship } from '../../wiki/types.js';

// A campaign slice that, ticked from day 1 → day 15 (two 7-day fires per rule),
// exercises every branch of the routing principle:
//   c1 (max 6, +1×2 = 2)        → clock increment below cap   → AUTO
//   c2 (max 3, 1 +1×2 = 3)      → clock COMPLETION (hits cap)  → REVIEW
//   d1 (+10×2 = 20)             → downtime increment below 100 → AUTO
//   d2 (80 +10×2 = 100)         → downtime COMPLETION          → REVIEW
//   f1 renown (+2×2 = 4)        → faction power change         → REVIEW
//   a1 daily agenda             → plot motion                  → REVIEW
function makeData() {
  return {
    npcs: [{ id: 'n1', name: 'Villain' }],
    factions: [{ id: 'f1', name: 'Reds', renown: 0 }],
    clocks: [
      { id: 'c1', max: 6, filled: 0, text: 'Below cap' },
      { id: 'c2', max: 3, filled: 1, text: 'Completes' },
    ],
    downtime: [
      { id: 'd1', type: 'craft', progress: 0 },
      { id: 'd2', type: 'research', progress: 80 },
    ],
    worldClock: {
      currentDay: 1,
      lastTickAt: 0,
      tickRules: [
        { id: 'r1', targetType: 'factionClock', targetId: 'c1', trigger: 'everyNDays', intervalDays: 7, advanceBy: 1, paused: false },
        { id: 'r2', targetType: 'factionClock', targetId: 'c2', trigger: 'everyNDays', intervalDays: 7, advanceBy: 1, paused: false },
        { id: 'r3', targetType: 'downtime', targetId: 'd1', trigger: 'everyNDays', intervalDays: 7, advanceBy: 1, paused: false },
        { id: 'r4', targetType: 'downtime', targetId: 'd2', trigger: 'everyNDays', intervalDays: 7, advanceBy: 1, paused: false },
        { id: 'r5', targetType: 'renown', targetId: 'f1', trigger: 'everyNDays', intervalDays: 7, advanceBy: 2, paused: false },
      ],
      agendas: [{ id: 'a1', npcId: 'n1', goal: 'Plot', schedule: 'daily', progress: 0, blockers: [] }],
      briefingLog: [],
    },
  };
}

const TICK = { toDay: 15, rngSeed: 42, now: 1000 } as const;

describe('classifyTickChange — the routing principle', () => {
  test('increments auto-apply; completions and narrative changes review', () => {
    assert.equal(classifyTickChange('clockAdvanced', false), 'auto');
    assert.equal(classifyTickChange('clockAdvanced', true), 'review'); // completion carve-out
    assert.equal(classifyTickChange('downtimeResolved', false), 'auto');
    assert.equal(classifyTickChange('downtimeResolved', true), 'review'); // symmetric with clocks
    assert.equal(classifyTickChange('renownShift', false), 'review');
    assert.equal(classifyTickChange('agendaProgress', false), 'review');
  });
});

describe('computeTickDeltas — categorization', () => {
  test('each rule lands in the correct bucket', () => {
    const { deltas } = computeTickDeltas({ data: makeData(), ...TICK });
    const auto = deltas.filter((d) => d.category === 'auto').map((d) => d.delta.targetId).sort();
    const review = deltas.filter((d) => d.category === 'review').map((d) => d.delta.targetId).sort();
    assert.deepEqual(auto, ['c1', 'd1'], 'below-cap clock + downtime increments auto-apply');
    assert.deepEqual(review, ['a1', 'c2', 'd2', 'f1'], 'completions + renown + agenda are reviewable');
  });

  test('a clock that does NOT complete stays auto; collapses multiple fires into one delta', () => {
    const { deltas } = computeTickDeltas({ data: makeData(), ...TICK });
    const c1 = deltas.find((d) => d.delta.targetId === 'c1')!;
    assert.equal(c1.category, 'auto');
    assert.equal(c1.delta.from, 0);
    assert.equal(c1.delta.to, 2); // two fires collapsed: 0 → 2
    assert.equal(c1.delta.target?.collection, 'clocks');
    assert.equal(c1.delta.field, 'filled');
  });

  test('clock completion flips to review even though its increments would auto', () => {
    const { deltas } = computeTickDeltas({ data: makeData(), ...TICK });
    const c2 = deltas.find((d) => d.delta.targetId === 'c2')!;
    assert.equal(c2.category, 'review');
    assert.equal(c2.delta.to, 3); // reaches max 3
  });
});

describe('commitTickToData — auto applies, review only enqueues', () => {
  test('auto deltas hit canonical state; review deltas do NOT; day advances', () => {
    const data = makeData();
    const { data: next, briefing, autoCount, reviewCount } = commitTickToData(data, TICK);

    // Auto applied canonically.
    assert.equal(next.clocks.find((c: any) => c.id === 'c1').filled, 2);
    assert.equal(next.downtime.find((d: any) => d.id === 'd1').progress, 20);

    // Review NOT applied — canonical untouched until approval.
    assert.equal(next.clocks.find((c: any) => c.id === 'c2').filled, 1);
    assert.equal(next.downtime.find((d: any) => d.id === 'd2').progress, 80);
    assert.equal(next.factions.find((f: any) => f.id === 'f1').renown, 0);
    assert.equal(next.worldClock.agendas.find((a: any) => a.id === 'a1').progress, 0);

    // Day advanced; recap briefing records ONLY the auto changes.
    assert.equal(next.worldClock.currentDay, 15);
    assert.equal(autoCount, 2);
    assert.equal(reviewCount, 4);
    assert.equal(briefing.changes.length, 2);
    assert.deepEqual(briefing.changes.map((c: any) => c.entityId).sort(), ['c1', 'd1']);

    // Review half is in the propose-only queue with tick-origin source rules.
    const events = pendingOnly(getPendingEvents(next));
    assert.equal(events.length, 4);
    const rules = events.map((e) => e.sourceRule).sort();
    assert.deepEqual(rules, [
      TICK_SOURCE_RULE.agendaProgress,
      TICK_SOURCE_RULE.clockAdvanced,
      TICK_SOURCE_RULE.downtimeResolved,
      TICK_SOURCE_RULE.renownShift,
    ].sort());
  });

  test('propose-only invariant: the source data is never mutated', () => {
    const data = makeData();
    const snapshot = JSON.stringify(data);
    commitTickToData(data, TICK);
    assert.equal(JSON.stringify(data), snapshot, 'input cloned, not mutated');
  });
});

describe('idempotency — no double-fire across reopen / two devices', () => {
  test('tickEventId is deterministic for the same logical tick', () => {
    const d: WorldDelta = { targetId: 'c2', field: 'filled', from: 1, to: 3, target: { collection: 'clocks', id: 'c2' } };
    assert.equal(tickEventId(1, 15, d), tickEventId(1, 15, d));
    assert.equal(tickEventId(1, 15, d), 'tick:1-15:clocks:c2:filled');
  });

  test('two devices computing the same tick converge to one set (appendEvents dedupes by id)', () => {
    const a = commitTickToData(makeData(), TICK);
    const b = commitTickToData(makeData(), TICK); // independent device, same span
    const eventsA = getPendingEvents(a.data);
    const eventsB = getPendingEvents(b.data);
    const merged = appendEvents(eventsA, eventsB);
    assert.equal(merged.length, eventsA.length, 'duplicate tick proposals collapse by deterministic id');
  });

  test('re-ticking an already-advanced world is refused by the day guard', () => {
    const { data: advanced } = commitTickToData(makeData(), TICK); // currentDay now 15
    assert.throws(() => commitTickToData(advanced, { toDay: 15 }), /toDay must be after currentDay/);
  });
});

describe('buildTickReviewEvents — anchors + shape', () => {
  test('renown anchors to a faction key; deltas carry the collection discriminator', () => {
    const result = computeTickDeltas({ data: makeData(), ...TICK });
    const events = buildTickReviewEvents(result, 1000);
    const renown = events.find((e) => e.sourceRule === TICK_SOURCE_RULE.renownShift)!;
    assert.equal(renown.anchorId, 'faction:f1');
    assert.equal(renown.deltas[0].target?.collection, 'factions');
    assert.equal(renown.status, 'pending');
  });
});

describe('applyApprovedDeltas — multi-collection commit (CP2)', () => {
  test('commits filled/renown/progress and appends agenda blockers; returns only changed collections', () => {
    const input: DeltaCollections = {
      clocks: [{ id: 'c2', filled: 1, max: 3 }],
      factions: [{ id: 'f1', renown: 0 }],
      downtime: [{ id: 'd2', progress: 80 }],
      agendas: [{ id: 'a1', progress: 50, blockers: ['old'] }],
      relationships: [],
    };
    const out = applyApprovedDeltas(input, [
      { targetId: 'c2', field: 'filled', from: 1, to: 3, target: { collection: 'clocks', id: 'c2' } },
      { targetId: 'f1', field: 'renown', from: 0, to: 4, target: { collection: 'factions', id: 'f1' } },
      { targetId: 'd2', field: 'progress', from: 80, to: 100, target: { collection: 'downtime', id: 'd2' } },
      { targetId: 'a1', field: 'progress', from: 50, to: 80, target: { collection: 'agendas', id: 'a1' }, blockers: ['new'] },
    ]);
    assert.equal(out.clocks![0].filled, 3);
    assert.equal(out.factions![0].renown, 4);
    assert.equal(out.downtime![0].progress, 100);
    assert.equal(out.agendas![0].progress, 80);
    assert.deepEqual(out.agendas![0].blockers, ['old', 'new']);
    assert.equal(out.relationships, undefined, 'unchanged collections are omitted');
  });

  test('legacy array overload still applies edge weights and returns an array', () => {
    const rels: Relationship[] = [
      { id: 'e1', fromType: 'npc', fromId: 'a', toType: 'npc', toId: 'b', kind: 'allyOf', weight: 0.5, createdAt: 0 },
    ];
    const out = applyApprovedDeltas(rels, [{ targetId: 'e1', field: 'weight', from: 0.5, to: 0.9 }]);
    assert.ok(Array.isArray(out));
    assert.equal(out[0].weight, 0.9);
  });
});
