import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { partyThresholds, XP_THRESHOLDS } from '../encounterMath';

describe('partyThresholds', () => {
  test('single PC standard', () => {
    const thresholds = partyThresholds([{ level: 1, weight: 1, gestalt: false }]);
    assert.deepEqual(thresholds, {
      easy: Math.round(XP_THRESHOLDS[1].easy * 0.75),
      medium: Math.round(XP_THRESHOLDS[1].medium * 0.75),
      hard: Math.round(XP_THRESHOLDS[1].hard * 0.75),
      deadly: Math.round(XP_THRESHOLDS[1].deadly * 0.75),
    });
  });

  test('single PC gestalt', () => {
    const thresholds = partyThresholds([{ level: 1, weight: 1, gestalt: true }]);
    assert.deepEqual(thresholds, {
      easy: XP_THRESHOLDS[1].easy,
      medium: XP_THRESHOLDS[1].medium,
      hard: XP_THRESHOLDS[1].hard,
      deadly: XP_THRESHOLDS[1].deadly,
    });
  });

  test('party of 4 standard PCs', () => {
    const party = [
      { level: 2, weight: 1, gestalt: false },
      { level: 2, weight: 1, gestalt: false },
      { level: 2, weight: 1, gestalt: false },
      { level: 2, weight: 1, gestalt: false },
    ];
    const thresholds = partyThresholds(party);
    assert.deepEqual(thresholds, {
      easy: XP_THRESHOLDS[2].easy * 4,
      medium: XP_THRESHOLDS[2].medium * 4,
      hard: XP_THRESHOLDS[2].hard * 4,
      deadly: XP_THRESHOLDS[2].deadly * 4,
    });
  });

  test('single PC with a sidekick', () => {
    const party = [
      { level: 3, weight: 1, gestalt: false },
      { level: 3, weight: 0.5, gestalt: false },
    ];
    // weight > 1.0001, so no solo penalty
    const thresholds = partyThresholds(party);
    assert.deepEqual(thresholds, {
      easy: Math.round(XP_THRESHOLDS[3].easy * 1 + XP_THRESHOLDS[3].easy * 0.5),
      medium: Math.round(XP_THRESHOLDS[3].medium * 1 + XP_THRESHOLDS[3].medium * 0.5),
      hard: Math.round(XP_THRESHOLDS[3].hard * 1 + XP_THRESHOLDS[3].hard * 0.5),
      deadly: Math.round(XP_THRESHOLDS[3].deadly * 1 + XP_THRESHOLDS[3].deadly * 0.5),
    });
  });

  test('handles fractional and out-of-bounds levels gracefully', () => {
    const party = [
      { level: 0, weight: 1, gestalt: false },
      { level: 25, weight: 1, gestalt: false },
      { level: 2.5, weight: 1, gestalt: false },
    ];
    const thresholds = partyThresholds(party);
    // 0 gets rounded to 1
    // 25 gets capped to 20
    // 2.5 gets rounded to 3
    assert.deepEqual(thresholds, {
      easy: Math.round(XP_THRESHOLDS[1].easy + XP_THRESHOLDS[20].easy + XP_THRESHOLDS[3].easy),
      medium: Math.round(XP_THRESHOLDS[1].medium + XP_THRESHOLDS[20].medium + XP_THRESHOLDS[3].medium),
      hard: Math.round(XP_THRESHOLDS[1].hard + XP_THRESHOLDS[20].hard + XP_THRESHOLDS[3].hard),
      deadly: Math.round(XP_THRESHOLDS[1].deadly + XP_THRESHOLDS[20].deadly + XP_THRESHOLDS[3].deadly),
    });
  });
});
