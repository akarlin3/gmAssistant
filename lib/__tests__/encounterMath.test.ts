import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { encounterMultiplier } from '../encounterMath';

describe('encounterMultiplier', () => {
  it('returns correct multipliers based on monster count', () => {
    assert.equal(encounterMultiplier(1), 1);
    assert.equal(encounterMultiplier(2), 1.5);

    assert.equal(encounterMultiplier(3), 2);
    assert.equal(encounterMultiplier(6), 2);

    assert.equal(encounterMultiplier(7), 2.5);
    assert.equal(encounterMultiplier(10), 2.5);

    assert.equal(encounterMultiplier(11), 3);
    assert.equal(encounterMultiplier(14), 3);

    assert.equal(encounterMultiplier(15), 4);
    assert.equal(encounterMultiplier(100), 4);
  });

  it('handles edge cases gracefully', () => {
    // What if monsterCount is 0 or negative? The current logic says:
    // if (monsterCount <= 6) return 2;
    // Let's verify what happens with 0.
    assert.equal(encounterMultiplier(0), 2);
    assert.equal(encounterMultiplier(-1), 2);
  });
});
