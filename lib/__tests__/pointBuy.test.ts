import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { totalCost, emptyAbilityScores } from '../pointBuy';

describe('totalCost', () => {
  it('returns 0 for all 8s (minimum possible scores)', () => {
    const scores = emptyAbilityScores(8);
    assert.strictEqual(totalCost(scores), 0);
  });

  it('returns 54 for all 15s (maximum possible scores)', () => {
    const scores = emptyAbilityScores(15);
    assert.strictEqual(totalCost(scores), 54);
  });

  it('returns 27 for a standard player ability array (15, 14, 13, 12, 10, 8)', () => {
    const scores = {
      str: 15, // cost: 9
      dex: 14, // cost: 7
      con: 13, // cost: 5
      int: 12, // cost: 4
      wis: 10, // cost: 2
      cha: 8,  // cost: 0
    };
    assert.strictEqual(totalCost(scores), 27);
  });
});
