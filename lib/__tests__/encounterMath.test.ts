import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { partyThresholds, XP_THRESHOLDS } from '../encounterMath';

describe('partyThresholds', () => {
  it('returns zeros for an empty party', () => {
    const result = partyThresholds([]);
    assert.deepStrictEqual(result, { easy: 0, medium: 0, hard: 0, deadly: 0 });
  });

  it('applies a 0.75x penalty for a single non-gestalt PC (solo)', () => {
    const result = partyThresholds([{ level: 1, weight: 1, gestalt: false }]);
    const t = XP_THRESHOLDS[1];
    assert.deepStrictEqual(result, {
      easy: Math.round(t.easy * 0.75),
      medium: Math.round(t.medium * 0.75),
      hard: Math.round(t.hard * 0.75),
      deadly: Math.round(t.deadly * 0.75),
    });
  });

  it('applies no solo penalty (1.0x) for a single gestalt PC', () => {
    const result = partyThresholds([{ level: 1, weight: 1, gestalt: true }]);
    const t = XP_THRESHOLDS[1];
    assert.deepStrictEqual(result, {
      easy: t.easy,
      medium: t.medium,
      hard: t.hard,
      deadly: t.deadly,
    });
  });

  it('applies no solo penalty for multiple PCs', () => {
    const party = [
      { level: 2, weight: 1, gestalt: false },
      { level: 2, weight: 1, gestalt: false },
    ];
    const result = partyThresholds(party);
    const t = XP_THRESHOLDS[2];
    assert.deepStrictEqual(result, {
      easy: t.easy * 2,
      medium: t.medium * 2,
      hard: t.hard * 2,
      deadly: t.deadly * 2,
    });
  });

  it('scales thresholds correctly for sidekicks (weight 0.5)', () => {
    // Total weight is 1.5, which is > 1.0001, so no solo penalty is applied.
    const party = [
      { level: 3, weight: 1, gestalt: false },
      { level: 3, weight: 0.5, gestalt: false },
    ];
    const result = partyThresholds(party);
    const t = XP_THRESHOLDS[3];
    assert.deepStrictEqual(result, {
      easy: Math.round(t.easy * 1.5),
      medium: Math.round(t.medium * 1.5),
      hard: Math.round(t.hard * 1.5),
      deadly: Math.round(t.deadly * 1.5),
    });
  });

  it('applies the solo penalty if the total weight is exactly 1 (e.g., two 0.5 weight sidekicks)', () => {
    // Total weight is 1.0, which is <= 1.0001, so solo penalty applies.
    // The solo penalty logic: `isSolo && !p.gestalt`. It checks gestalt per-character.
    // Since these aren't gestalt, penalty 0.75 applies.
    const party = [
      { level: 4, weight: 0.5, gestalt: false },
      { level: 4, weight: 0.5, gestalt: false },
    ];
    const result = partyThresholds(party);
    const t = XP_THRESHOLDS[4];

    // Each character contributes t * 0.5 * 0.75
    // Total contribution is t * 1.0 * 0.75
    assert.deepStrictEqual(result, {
      easy: Math.round(t.easy * 0.75),
      medium: Math.round(t.medium * 0.75),
      hard: Math.round(t.hard * 0.75),
      deadly: Math.round(t.deadly * 0.75),
    });
  });

  it('handles level clamping for out-of-bounds levels', () => {
    // level < 1 clamps to 1
    // level > 20 clamps to 20
    const party = [
      { level: 0, weight: 1, gestalt: false },
      { level: 25, weight: 1, gestalt: false },
    ];
    const result = partyThresholds(party);
    const t1 = XP_THRESHOLDS[1];
    const t20 = XP_THRESHOLDS[20];
    assert.deepStrictEqual(result, {
      easy: t1.easy + t20.easy,
      medium: t1.medium + t20.medium,
      hard: t1.hard + t20.hard,
      deadly: t1.deadly + t20.deadly,
    });
  });

  it('handles floating-point levels by rounding', () => {
    const party = [
      { level: 3.4, weight: 1, gestalt: false }, // rounds to 3
      { level: 3.6, weight: 1, gestalt: false }, // rounds to 4
    ];
    const result = partyThresholds(party);
    const t3 = XP_THRESHOLDS[3];
    const t4 = XP_THRESHOLDS[4];
    assert.deepStrictEqual(result, {
      easy: t3.easy + t4.easy,
      medium: t3.medium + t4.medium,
      hard: t3.hard + t4.hard,
      deadly: t3.deadly + t4.deadly,
    });
  });
});
