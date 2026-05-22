import { test, describe } from "node:test";
import assert from "node:assert";
import { difficultyForSolo, encounterMultiplier, partyThresholds, suggestCombosForBand, parseLevelFromClassLevel } from "../encounterMath.js";

describe("encounterMath", () => {
  describe("difficultyForSolo", () => {
    test("returns correct difficulty for solo player (level 1)", () => {
      // Level 1 threshold: { easy: 25, medium: 50, hard: 75, deadly: 100 }
      // Solo thresholds (x0.75): easy: 19, medium: 38, hard: 56, deadly: 75

      assert.deepStrictEqual(difficultyForSolo(10, 1, false).rating, "Trivial");
      assert.deepStrictEqual(difficultyForSolo(19, 1, false).rating, "Easy");
      assert.deepStrictEqual(difficultyForSolo(37, 1, false).rating, "Easy");
      assert.deepStrictEqual(difficultyForSolo(38, 1, false).rating, "Medium");
      assert.deepStrictEqual(difficultyForSolo(55, 1, false).rating, "Medium");
      assert.deepStrictEqual(difficultyForSolo(56, 1, false).rating, "Hard");
      assert.deepStrictEqual(difficultyForSolo(74, 1, false).rating, "Hard");
      assert.deepStrictEqual(difficultyForSolo(75, 1, false).rating, "Deadly");
      assert.deepStrictEqual(difficultyForSolo(112, 1, false).rating, "Deadly");
      assert.deepStrictEqual(difficultyForSolo(113, 1, false).rating, "Lethal");
    });

    test("returns correct difficulty for gestalt player (level 1)", () => {
      // Level 1 threshold: { easy: 25, medium: 50, hard: 75, deadly: 100 }
      // Gestalt thresholds (x1.0): easy: 25, medium: 50, hard: 75, deadly: 100

      assert.deepStrictEqual(difficultyForSolo(24, 1, true).rating, "Trivial");
      assert.deepStrictEqual(difficultyForSolo(25, 1, true).rating, "Easy");
      assert.deepStrictEqual(difficultyForSolo(49, 1, true).rating, "Easy");
      assert.deepStrictEqual(difficultyForSolo(50, 1, true).rating, "Medium");
      assert.deepStrictEqual(difficultyForSolo(74, 1, true).rating, "Medium");
      assert.deepStrictEqual(difficultyForSolo(75, 1, true).rating, "Hard");
      assert.deepStrictEqual(difficultyForSolo(99, 1, true).rating, "Hard");
      assert.deepStrictEqual(difficultyForSolo(100, 1, true).rating, "Deadly");
      assert.deepStrictEqual(difficultyForSolo(149, 1, true).rating, "Deadly");
      assert.deepStrictEqual(difficultyForSolo(150, 1, true).rating, "Lethal");
    });

    test("defaults to level 1 if missing from threshold table", () => {
      const res1 = difficultyForSolo(50, -5, false);
      const res2 = difficultyForSolo(50, 1, false);
      assert.deepStrictEqual(res1, res2);
    });
  });

  describe("encounterMultiplier", () => {
    test("returns standard DMG encounter multipliers based on monster count", () => {
      assert.strictEqual(encounterMultiplier(1), 1);
      assert.strictEqual(encounterMultiplier(2), 1.5);
      assert.strictEqual(encounterMultiplier(3), 2);
      assert.strictEqual(encounterMultiplier(6), 2);
      assert.strictEqual(encounterMultiplier(7), 2.5);
      assert.strictEqual(encounterMultiplier(10), 2.5);
      assert.strictEqual(encounterMultiplier(11), 3);
      assert.strictEqual(encounterMultiplier(14), 3);
      assert.strictEqual(encounterMultiplier(15), 4);
      assert.strictEqual(encounterMultiplier(20), 4);
    });
  });

  describe("partyThresholds", () => {
    test("calculates sum of member thresholds for standard party", () => {
      const party = [
        { level: 1, weight: 1, gestalt: false }, // 25/50/75/100
        { level: 1, weight: 1, gestalt: false }, // 25/50/75/100
      ];
      assert.deepStrictEqual(partyThresholds(party), {
        easy: 50, medium: 100, hard: 150, deadly: 200
      });
    });

    test("applies solo penalty ONLY when party total weight <= 1", () => {
      const party = [
        { level: 1, weight: 1, gestalt: false }, // 25/50/75/100 -> x0.75 -> 18.75/37.5/56.25/75
      ];
      assert.deepStrictEqual(partyThresholds(party), {
        easy: 19, medium: 38, hard: 56, deadly: 75
      });
    });

    test("gestalt PCs avoid solo penalty", () => {
      const party = [
        { level: 1, weight: 1, gestalt: true },
      ];
      assert.deepStrictEqual(partyThresholds(party), {
        easy: 25, medium: 50, hard: 75, deadly: 100
      });
    });

    test("sidekicks scale properly by weight", () => {
      const party = [
        { level: 1, weight: 1, gestalt: false },
        { level: 1, weight: 0.5, gestalt: false }, // sidekick
      ];
      // total weight 1.5 -> not solo. Thresholds:
      // PC: 25/50/75/100
      // Sidekick: 12.5/25/37.5/50
      // Total: 37.5/75/112.5/150 -> rounded -> 38/75/113/150
      assert.deepStrictEqual(partyThresholds(party), {
        easy: 38, medium: 75, hard: 113, deadly: 150
      });
    });

    test("handles out of bounds levels", () => {
      const party = [
        { level: 25, weight: 1, gestalt: false }, // clamps to 20
        { level: 0, weight: 1, gestalt: false }, // clamps to 1
      ];
      // Level 20: 2800/5700/8500/12700
      // Level 1: 25/50/75/100
      assert.deepStrictEqual(partyThresholds(party), {
        easy: 2825, medium: 5750, hard: 8575, deadly: 12800
      });
    });
  });

  describe("suggestCombosForBand", () => {
    test("returns empty array for invalid band", () => {
      assert.deepStrictEqual(suggestCombosForBand(100, 50), []);
      assert.deepStrictEqual(suggestCombosForBand(100, 100), []);
    });

    test("suggests appropriate encounters", () => {
      // Band 100-200. Target is 150.
      const combos = suggestCombosForBand(100, 200);
      assert(combos.length > 0);
      for (const combo of combos) {
        assert(combo.adjustedXP >= 100 && combo.adjustedXP < 200);
      }
    });

    test("limits count to maxCount", () => {
      const combos = suggestCombosForBand(500, 1000, { maxCount: 3 });
      assert(combos.length > 0);
      for (const combo of combos) {
        assert(combo.count <= 3);
      }
    });
  });

  describe("parseLevelFromClassLevel", () => {
    test("parses single class", () => {
      assert.strictEqual(parseLevelFromClassLevel("Wizard 5"), 5);
      assert.strictEqual(parseLevelFromClassLevel("Fighter 12"), 12);
    });

    test("parses multiclass", () => {
      assert.strictEqual(parseLevelFromClassLevel("Fighter 3 / Rogue 2"), 5);
      assert.strictEqual(parseLevelFromClassLevel("Wizard 2/Cleric 1/Fighter 2"), 5);
    });

    test("handles non-standard formats gracefully", () => {
      // If there is a slash, it sums all numbers.
      assert.strictEqual(parseLevelFromClassLevel("Level 5 / Some other 2"), 7);
      // If no slash, it takes max number.
      assert.strictEqual(parseLevelFromClassLevel("Level 5 some 2"), 5);
    });

    test("returns null for no numbers", () => {
      assert.strictEqual(parseLevelFromClassLevel("Fighter"), null);
      assert.strictEqual(parseLevelFromClassLevel(""), null);
    });

    test("clamps to 20", () => {
      assert.strictEqual(parseLevelFromClassLevel("Fighter 25"), 20);
      assert.strictEqual(parseLevelFromClassLevel("Wizard 15 / Cleric 10"), 20);
    });
  });
});
