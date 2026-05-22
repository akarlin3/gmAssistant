import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseLevelFromClassLevel } from '../encounterMath';

describe('parseLevelFromClassLevel', () => {
  it('returns null for empty or nullish input', () => {
    assert.equal(parseLevelFromClassLevel(''), null);
    // @ts-expect-error testing invalid input
    assert.equal(parseLevelFromClassLevel(null), null);
    // @ts-expect-error testing invalid input
    assert.equal(parseLevelFromClassLevel(undefined), null);
  });

  it('returns null when no digits are present', () => {
    assert.equal(parseLevelFromClassLevel('Fighter'), null);
    assert.equal(parseLevelFromClassLevel('Rogue / Wizard'), null);
  });

  it('parses a single class level', () => {
    assert.equal(parseLevelFromClassLevel('Fighter 3'), 3);
    assert.equal(parseLevelFromClassLevel('Wizard 5'), 5);
    assert.equal(parseLevelFromClassLevel('Level 10'), 10);
  });

  it('parses a multiclass level separated by /', () => {
    assert.equal(parseLevelFromClassLevel('Fighter 3 / Rogue 2'), 5);
    assert.equal(parseLevelFromClassLevel('Wizard 5/Cleric 1'), 6);
    assert.equal(parseLevelFromClassLevel('Barbarian 2 / Bard 2 / Paladin 2'), 6);
  });

  it('ignores non-digit parts in a multiclass string separated by /', () => {
    assert.equal(parseLevelFromClassLevel('Fighter 3 / Rogue'), 3);
    assert.equal(parseLevelFromClassLevel('Fighter / Rogue 2'), 2);
  });

  it('caps the total level at 20 for multiclass', () => {
    assert.equal(parseLevelFromClassLevel('Fighter 15 / Rogue 10'), 20);
    assert.equal(parseLevelFromClassLevel('Wizard 10 / Sorcerer 10 / Warlock 5'), 20);
  });

  it('caps the level at 20 for single class', () => {
    assert.equal(parseLevelFromClassLevel('Cleric 25'), 20);
  });

  it('uses the max value if multiple numbers are present without /', () => {
    assert.equal(parseLevelFromClassLevel('Fighter 3 Rogue 2'), 3);
    assert.equal(parseLevelFromClassLevel('Level 10 (Tier 2)'), 10);
    assert.equal(parseLevelFromClassLevel('Level 2 (Tier 10)'), 10);
  });
});
