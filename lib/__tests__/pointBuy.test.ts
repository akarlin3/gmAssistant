import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { normalizePointBuy, POINT_BUY_MIN, emptyAbilityScores } from '../pointBuy';

describe('normalizePointBuy', () => {
  it('handles null and undefined', () => {
    const fromNull = normalizePointBuy(null);
    const fromUndefined = normalizePointBuy(undefined);

    assert.deepEqual(fromNull.base, emptyAbilityScores(POINT_BUY_MIN));
    assert.deepEqual(fromNull.racial, emptyAbilityScores(0));

    assert.deepEqual(fromUndefined.base, emptyAbilityScores(POINT_BUY_MIN));
    assert.deepEqual(fromUndefined.racial, emptyAbilityScores(0));
  });

  it('handles primitive types by returning defaults', () => {
    const fromString = normalizePointBuy('some string');
    const fromNumber = normalizePointBuy(123);
    const fromBoolean = normalizePointBuy(true);

    assert.deepEqual(fromString.base, emptyAbilityScores(POINT_BUY_MIN));
    assert.deepEqual(fromString.racial, emptyAbilityScores(0));

    assert.deepEqual(fromNumber.base, emptyAbilityScores(POINT_BUY_MIN));
    assert.deepEqual(fromNumber.racial, emptyAbilityScores(0));

    assert.deepEqual(fromBoolean.base, emptyAbilityScores(POINT_BUY_MIN));
    assert.deepEqual(fromBoolean.racial, emptyAbilityScores(0));
  });

  it('handles empty object', () => {
    const result = normalizePointBuy({});
    assert.deepEqual(result.base, emptyAbilityScores(POINT_BUY_MIN));
    assert.deepEqual(result.racial, emptyAbilityScores(0));
  });

  it('normalizes valid input', () => {
    const valid = {
      base: { str: 10, dex: 12, con: 14, int: 8, wis: 15, cha: 11 },
      racial: { str: 2, dex: 1, con: 0, int: 0, wis: 0, cha: 1 },
    };
    const result = normalizePointBuy(valid);
    assert.deepEqual(result.base, valid.base);
    assert.deepEqual(result.racial, valid.racial);
  });

  it('handles partial ability scores by filling defaults', () => {
    const partial = {
      base: { str: 14, dex: 10 },
      racial: { cha: 2 },
    };
    const result = normalizePointBuy(partial);

    // Unspecified base should be POINT_BUY_MIN (8)
    assert.equal(result.base.str, 14);
    assert.equal(result.base.dex, 10);
    assert.equal(result.base.con, 8);
    assert.equal(result.base.int, 8);
    assert.equal(result.base.wis, 8);
    assert.equal(result.base.cha, 8);

    // Unspecified racial should be 0
    assert.equal(result.racial.str, 0);
    assert.equal(result.racial.dex, 0);
    assert.equal(result.racial.con, 0);
    assert.equal(result.racial.int, 0);
    assert.equal(result.racial.wis, 0);
    assert.equal(result.racial.cha, 2);
  });

  it('clamps out-of-range base scores', () => {
    const outOfRange = {
      base: { str: 5, dex: 20 },
    };
    const result = normalizePointBuy(outOfRange);

    assert.equal(result.base.str, 8); // clamped up to 8
    assert.equal(result.base.dex, 15); // clamped down to 15
  });

  it('parses valid numeric strings and clamps them correctly', () => {
    const strings = {
      base: { str: '12', con: '16' }, // 16 should be clamped to 15
      racial: { dex: '2' },
    };
    const result = normalizePointBuy(strings);

    assert.equal(result.base.str, 12);
    assert.equal(result.base.con, 15);
    assert.equal(result.racial.dex, 2);
  });

  it('falls back on invalid strings or objects by applying fallback values', () => {
    const invalid = {
      base: { str: 'invalid', dex: {}, con: [] },
      racial: { str: 'nope', dex: NaN },
    };
    const result = normalizePointBuy(invalid);

    assert.equal(result.base.str, 8);
    assert.equal(result.base.dex, 8);
    assert.equal(result.base.con, 8);

    assert.equal(result.racial.str, 0);
    assert.equal(result.racial.dex, 0);
  });

  it('rounds decimal inputs to nearest integer or drops decimals from strings', () => {
    const decimals = {
      // asInt uses Math.round for numbers, parseInt for strings
      base: { str: 10.1, dex: 12.8, con: '14.9' }, // Math.round(12.8)->13, parseInt("14.9")->14
      racial: { int: 1.1, wis: 1.9, cha: '2.5' }, // Math.round(1.9)->2, parseInt("2.5")->2
    };
    const result = normalizePointBuy(decimals);

    assert.equal(result.base.str, 10);
    assert.equal(result.base.dex, 13);
    assert.equal(result.base.con, 14); // parseInt("14.9") -> 14

    assert.equal(result.racial.int, 1);
    assert.equal(result.racial.wis, 2); // Math.round(1.9)
    assert.equal(result.racial.cha, 2); // parseInt("2.5")
  });

  it('handles special numeric values gracefully by defaulting to min or 0', () => {
    const specials = {
      base: { str: NaN, dex: Infinity, con: -Infinity },
      racial: { str: NaN, dex: Infinity, con: -Infinity },
    };
    const result = normalizePointBuy(specials);

    assert.equal(result.base.str, 8);
    assert.equal(result.base.dex, 8);
    assert.equal(result.base.con, 8);

    assert.equal(result.racial.str, 0);
    assert.equal(result.racial.dex, 0);
    assert.equal(result.racial.con, 0);
  });
});
