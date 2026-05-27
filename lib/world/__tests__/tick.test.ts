import { test, describe } from 'node:test';
import assert from 'node:assert';

import { applyTicks, previewTicks, mulberry32 } from '../tick.js';
import { undoLastBriefing, canUndo } from '../undo.js';
import { readWorldClock, emptyWorldClock, type WorldClock } from '../types.js';
import { formatChange } from '../format.js';

const NOW = 1_700_000_000_000;

function baseData(over: Partial<Record<string, any>> = {}) {
  const wc: WorldClock = emptyWorldClock(NOW); // currentDay = 1
  return {
    worldClock: wc,
    clocks: [],
    downtime: [],
    factions: [],
    npcs: [],
    ...over,
  } as Record<string, any>;
}

describe('applyTicks — faction clock rule', () => {
  test('a 7-day rule fires 3x over 21 days and advances the clock by 3 segments', () => {
    const data = baseData({
      clocks: [{ id: 'fc-1', text: 'The Cult Rises', filled: 0, max: 8 }],
      worldClock: {
        ...emptyWorldClock(NOW),
        tickRules: [
          {
            id: 'r1',
            targetType: 'factionClock',
            targetId: 'fc-1',
            trigger: 'everyNDays',
            intervalDays: 7,
            advanceBy: 1,
            paused: false,
          },
        ],
      },
    });

    // currentDay = 1, advance to day 22 => span 21 => floor(21/7) = 3 fires.
    const { data: next, briefing } = applyTicks({ data, toDay: 22, rngSeed: 1, now: NOW });

    assert.equal(briefing.changes.length, 3);
    assert.equal(next.clocks[0].filled, 3);
    assert.equal(next.worldClock.currentDay, 22);
    assert.equal(briefing.fromDay, 1);
    assert.equal(briefing.toDay, 22);
    assert.equal(briefing.changes[0].type, 'clockAdvanced');
    assert.equal(briefing.changes[0].before.filled, 0);
    assert.equal(briefing.changes[2].after.filled, 3);
  });

  test('clock fill is capped at max', () => {
    const data = baseData({
      clocks: [{ id: 'fc-1', text: 'Doom', filled: 6, max: 8 }],
      worldClock: {
        ...emptyWorldClock(NOW),
        tickRules: [
          {
            id: 'r1',
            targetType: 'factionClock',
            targetId: 'fc-1',
            trigger: 'everyNDays',
            intervalDays: 7,
            advanceBy: 1,
            paused: false,
          },
        ],
      },
    });
    const { data: next } = applyTicks({ data, toDay: 22, rngSeed: 1, now: NOW });
    assert.equal(next.clocks[0].filled, 8); // 6 + 3 capped at 8
  });

  test('paused rules do not fire', () => {
    const data = baseData({
      clocks: [{ id: 'fc-1', text: 'X', filled: 0, max: 8 }],
      worldClock: {
        ...emptyWorldClock(NOW),
        tickRules: [
          {
            id: 'r1',
            targetType: 'factionClock',
            targetId: 'fc-1',
            trigger: 'everyNDays',
            intervalDays: 7,
            advanceBy: 1,
            paused: true,
          },
        ],
      },
    });
    const { data: next, briefing } = applyTicks({ data, toDay: 22, rngSeed: 1, now: NOW });
    assert.equal(briefing.changes.length, 0);
    assert.equal(next.clocks[0].filled, 0);
  });

  test('manual-trigger rules do not auto-fire', () => {
    const data = baseData({
      clocks: [{ id: 'fc-1', text: 'X', filled: 0, max: 8 }],
      worldClock: {
        ...emptyWorldClock(NOW),
        tickRules: [
          {
            id: 'r1',
            targetType: 'factionClock',
            targetId: 'fc-1',
            trigger: 'manual',
            advanceBy: 1,
            paused: false,
          },
        ],
      },
    });
    const { briefing } = applyTicks({ data, toDay: 22, rngSeed: 1, now: NOW });
    assert.equal(briefing.changes.length, 0);
  });
});

describe('applyTicks — downtime + renown rules', () => {
  test('downtime progress advances by advanceBy*10 per fire and caps at 100', () => {
    const data = baseData({
      downtime: [{ id: 'dt-1', type: 'crafting', fields: { itemName: 'Sword' }, progress: 70 }],
      worldClock: {
        ...emptyWorldClock(NOW),
        tickRules: [
          {
            id: 'r1',
            targetType: 'downtime',
            targetId: 'dt-1',
            trigger: 'everyNDays',
            intervalDays: 7,
            advanceBy: 2,
            paused: false,
          },
        ],
      },
    });
    // 21 days => 3 fires => +20 each => 70 -> 90 -> 100 (cap) -> 100.
    const { data: next } = applyTicks({ data, toDay: 22, rngSeed: 1, now: NOW });
    assert.equal(next.downtime[0].progress, 100);
  });

  test('renown rule adjusts the faction renown field', () => {
    const data = baseData({
      factions: [{ id: 'f-1', name: 'Iron Hand', renown: 3 }],
      worldClock: {
        ...emptyWorldClock(NOW),
        tickRules: [
          {
            id: 'r1',
            targetType: 'renown',
            targetId: 'f-1',
            trigger: 'everyNDays',
            intervalDays: 10,
            advanceBy: 2,
            paused: false,
          },
        ],
      },
    });
    // 20 days => floor(20/10) = 2 fires => +2 each => 3 -> 7.
    const { data: next, briefing } = applyTicks({ data, toDay: 21, rngSeed: 1, now: NOW });
    assert.equal(next.factions[0].renown, 7);
    assert.equal(briefing.changes.at(-1)?.after.renown, 7);
  });
});

describe('applyTicks — NPC agendas', () => {
  test('daily agenda fires once per elapsed day; progress grows 5..20 per tick', () => {
    const data = baseData({
      npcs: [{ id: 'npc-1', name: 'Vane' }],
      worldClock: {
        ...emptyWorldClock(NOW),
        agendas: [
          {
            id: 'a-1',
            npcId: 'npc-1',
            goal: 'Recruit allies',
            schedule: 'daily',
            progress: 0,
            blockers: [],
          },
        ],
      },
    });
    const { data: next, briefing } = applyTicks({ data, toDay: 4, rngSeed: 42, now: NOW }); // 3 days
    const agendaChanges = briefing.changes.filter((c) => c.type === 'agendaProgress');
    assert.equal(agendaChanges.length, 3);
    assert.ok(
      next.worldClock.agendas[0].progress >= 15 && next.worldClock.agendas[0].progress <= 60,
    );
    assert.equal(agendaChanges[0].entityName, 'Vane');
  });

  test('weekly agenda fires once per 7-day block', () => {
    const data = baseData({
      npcs: [{ id: 'npc-1', name: 'Vane' }],
      worldClock: {
        ...emptyWorldClock(NOW),
        agendas: [
          { id: 'a-1', npcId: 'npc-1', goal: 'X', schedule: 'weekly', progress: 0, blockers: [] },
        ],
      },
    });
    const { briefing } = applyTicks({ data, toDay: 16, rngSeed: 7, now: NOW }); // 15 days => 2 weeks
    assert.equal(briefing.changes.filter((c) => c.type === 'agendaProgress').length, 2);
  });

  test('agenda progress caps at 100', () => {
    const data = baseData({
      npcs: [{ id: 'npc-1', name: 'Vane' }],
      worldClock: {
        ...emptyWorldClock(NOW),
        agendas: [
          { id: 'a-1', npcId: 'npc-1', goal: 'X', schedule: 'daily', progress: 95, blockers: [] },
        ],
      },
    });
    const { data: next } = applyTicks({ data, toDay: 11, rngSeed: 3, now: NOW });
    assert.equal(next.worldClock.agendas[0].progress, 100);
  });
});

describe('determinism', () => {
  test('same seed yields identical changes (preview === apply)', () => {
    const data = baseData({
      npcs: [{ id: 'npc-1', name: 'Vane' }],
      clocks: [{ id: 'fc-1', text: 'Cult', filled: 0, max: 8 }],
      worldClock: {
        ...emptyWorldClock(NOW),
        tickRules: [
          {
            id: 'r1',
            targetType: 'factionClock',
            targetId: 'fc-1',
            trigger: 'everyNDays',
            intervalDays: 7,
            advanceBy: 1,
            paused: false,
          },
        ],
        agendas: [
          {
            id: 'a-1',
            npcId: 'npc-1',
            goal: 'X',
            schedule: 'irregular',
            progress: 0,
            blockers: [],
          },
        ],
      },
    });
    const preview = previewTicks({ data, toDay: 30, rngSeed: 12345, now: NOW });
    const { briefing } = applyTicks({ data, toDay: 30, rngSeed: 12345, now: NOW });
    assert.deepStrictEqual(preview.changes, briefing.changes);
  });

  test('mulberry32 is stable for a fixed seed', () => {
    const a = mulberry32(99);
    const b = mulberry32(99);
    assert.equal(a(), b());
    assert.equal(a(), b());
  });

  test('previewTicks does not mutate input data', () => {
    const data = baseData({
      clocks: [{ id: 'fc-1', text: 'Cult', filled: 0, max: 8 }],
      worldClock: {
        ...emptyWorldClock(NOW),
        tickRules: [
          {
            id: 'r1',
            targetType: 'factionClock',
            targetId: 'fc-1',
            trigger: 'everyNDays',
            intervalDays: 7,
            advanceBy: 1,
            paused: false,
          },
        ],
      },
    });
    previewTicks({ data, toDay: 22, rngSeed: 1, now: NOW });
    assert.equal(data.clocks[0].filled, 0);
    assert.equal(data.worldClock.currentDay, 1);
    assert.equal(data.worldClock.briefingLog.length, 0);
  });
});

describe('guards + log cap', () => {
  test('throws when toDay <= currentDay', () => {
    const data = baseData();
    assert.throws(() => applyTicks({ data, toDay: 1, now: NOW }), /toDay must be after currentDay/);
  });

  test('briefingLog is capped at 20 (FIFO)', () => {
    let data = baseData({ clocks: [{ id: 'fc-1', text: 'X', filled: 0, max: 999 }] });
    for (let i = 0; i < 25; i++) {
      const from = data.worldClock.currentDay as number;
      data = applyTicks({ data, toDay: from + 1, rngSeed: i, now: NOW }).data;
    }
    assert.equal(data.worldClock.briefingLog.length, 20);
  });
});

describe('undo', () => {
  test('undo reverts faction segments and the day counter cleanly', () => {
    const data = baseData({
      clocks: [{ id: 'fc-1', text: 'The Cult Rises', filled: 0, max: 8 }],
      worldClock: {
        ...emptyWorldClock(NOW),
        tickRules: [
          {
            id: 'r1',
            targetType: 'factionClock',
            targetId: 'fc-1',
            trigger: 'everyNDays',
            intervalDays: 7,
            advanceBy: 1,
            paused: false,
          },
        ],
      },
    });
    const { data: ticked } = applyTicks({ data, toDay: 22, rngSeed: 1, now: NOW });
    assert.equal(ticked.clocks[0].filled, 3);
    assert.ok(canUndo(ticked));

    const reverted = undoLastBriefing(ticked);
    assert.equal(reverted.clocks[0].filled, 0);
    assert.equal(reverted.worldClock.currentDay, 1);
    assert.equal(reverted.worldClock.briefingLog.length, 0);
    assert.equal(canUndo(reverted), false);
  });

  test('undo restores agenda progress and blockers', () => {
    const data = baseData({
      npcs: [{ id: 'npc-1', name: 'Vane' }],
      worldClock: {
        ...emptyWorldClock(NOW),
        agendas: [
          {
            id: 'a-1',
            npcId: 'npc-1',
            goal: 'X',
            schedule: 'daily',
            progress: 10,
            blockers: ['old'],
          },
        ],
      },
    });
    const { data: ticked } = applyTicks({ data, toDay: 6, rngSeed: 9, now: NOW });
    const reverted = undoLastBriefing(ticked);
    assert.equal(reverted.worldClock.agendas[0].progress, 10);
    assert.deepStrictEqual(reverted.worldClock.agendas[0].blockers, ['old']);
  });

  test('undoLastBriefing throws when there is nothing to undo', () => {
    assert.throws(() => undoLastBriefing(baseData()), /No briefing to undo/);
  });
});

describe('formatChange', () => {
  test('renders each change type', () => {
    assert.match(
      formatChange({
        type: 'clockAdvanced',
        entityId: 'x',
        entityName: 'X',
        before: { filled: 0 },
        after: { filled: 3 },
        reason: 'r',
      }),
      /from 0 to 3 segments/,
    );
    assert.match(
      formatChange({
        type: 'renownShift',
        entityId: 'x',
        entityName: 'X',
        before: { renown: 1 },
        after: { renown: 3 },
        reason: 'r',
      }),
      /from 1 to 3/,
    );
  });
});

describe('readWorldClock', () => {
  test('returns a fresh clock for empty/malformed data', () => {
    assert.equal(readWorldClock(null, NOW).currentDay, 1);
    assert.equal(readWorldClock({ worldClock: 'nope' } as any, NOW).currentDay, 1);
  });
});
