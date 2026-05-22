import { describe, it } from 'node:test';
import * as assert from 'node:assert';
import { parseLevelFromClassLevel } from '../encounterMath';

describe('encounterMath', () => {
  describe('parseLevelFromClassLevel', () => {
    it('returns null for empty strings', () => {
      assert.strictEqual(parseLevelFromClassLevel(''), null);
    });

    it('returns null for strings without numbers', () => {
      assert.strictEqual(parseLevelFromClassLevel('Fighter'), null);
      assert.strictEqual(parseLevelFromClassLevel('abc xyz'), null);
    });

    it('parses single class levels correctly', () => {
      assert.strictEqual(parseLevelFromClassLevel('Fighter 3'), 3);
      assert.strictEqual(parseLevelFromClassLevel('Wizard 5'), 5);
      assert.strictEqual(parseLevelFromClassLevel('Cleric 12'), 12);
    });

    it('caps single class levels at 20', () => {
      assert.strictEqual(parseLevelFromClassLevel('Fighter 25'), 20);
      assert.strictEqual(parseLevelFromClassLevel('Wizard 99'), 20);
    });

    it('parses multi-class levels correctly', () => {
      assert.strictEqual(parseLevelFromClassLevel('Fighter 3 / Rogue 2'), 5);
      assert.strictEqual(parseLevelFromClassLevel('Wizard 5/Cleric 1'), 6);
      assert.strictEqual(parseLevelFromClassLevel('Bard 2 / Paladin 2 / Sorcerer 1'), 5);
    });

    it('caps multi-class total levels at 20', () => {
      assert.strictEqual(parseLevelFromClassLevel('Fighter 15 / Rogue 10'), 20);
      assert.strictEqual(parseLevelFromClassLevel('Wizard 10 / Cleric 10 / Fighter 5'), 20);
    });

    it('returns null if there are slashes but no valid numbers', () => {
      assert.strictEqual(parseLevelFromClassLevel('Fighter / Rogue'), null);
    });

    it('handles multiple slashes correctly', () => {
      assert.strictEqual(parseLevelFromClassLevel('Fighter 3 / Rogue 2 / Wizard 1'), 6);
    });
  });
});
