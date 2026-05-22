import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { difficultyForSolo } from "../encounterMath";

describe("difficultyForSolo", () => {
  it("defaults to level 1 thresholds if pcLevel is invalid or missing from XP_THRESHOLDS", () => {
    // Level 1: easy=25, medium=50, hard=75, deadly=100
    // Non-gestalt mod = 0.75.
    // soloEasy = round(25 * 0.75) = 19
    const resLevel99 = difficultyForSolo(18, 99); // 18 < 19 -> Trivial
    const resLevel1 = difficultyForSolo(18, 1);

    assert.deepEqual(resLevel99, resLevel1);
    assert.equal(resLevel99.rating, 'Trivial');
  });

  describe("non-gestalt (mod = 0.75)", () => {
    // Level 1:
    // soloEasy = 19
    // soloMedium = 38
    // soloHard = 56
    // soloDeadly = 75
    // Deadly max = 75 * 1.5 = 112.5

    it("returns Trivial for XP below soloEasy", () => {
      const res = difficultyForSolo(18, 1);
      assert.equal(res.rating, 'Trivial');
      assert.equal(res.rationale, 'Below solo easy threshold (19)');
    });

    it("returns Easy for XP between soloEasy and soloMedium", () => {
      const resMin = difficultyForSolo(19, 1);
      assert.equal(resMin.rating, 'Easy');
      assert.equal(resMin.rationale, 'Solo easy: 19–37');

      const resMax = difficultyForSolo(37, 1);
      assert.equal(resMax.rating, 'Easy');
    });

    it("returns Medium for XP between soloMedium and soloHard", () => {
      const resMin = difficultyForSolo(38, 1);
      assert.equal(resMin.rating, 'Medium');
      assert.equal(resMin.rationale, 'Solo medium: 38–55');

      const resMax = difficultyForSolo(55, 1);
      assert.equal(resMax.rating, 'Medium');
    });

    it("returns Hard for XP between soloHard and soloDeadly", () => {
      const resMin = difficultyForSolo(56, 1);
      assert.equal(resMin.rating, 'Hard');
      assert.equal(resMin.rationale, 'Solo hard: 56–74');

      const resMax = difficultyForSolo(74, 1);
      assert.equal(resMax.rating, 'Hard');
    });

    it("returns Deadly for XP between soloDeadly and soloDeadly * 1.5", () => {
      const resMin = difficultyForSolo(75, 1);
      assert.equal(resMin.rating, 'Deadly');
      assert.equal(resMin.rationale, 'Solo deadly: 75+');

      const resMax = difficultyForSolo(112, 1);
      assert.equal(resMax.rating, 'Deadly');
    });

    it("returns Lethal for XP well above soloDeadly", () => {
      const res = difficultyForSolo(113, 1);
      assert.equal(res.rating, 'Lethal');
      assert.equal(res.rationale, 'Well above solo deadly threshold (75). Reconsider.');
    });
  });

  describe("gestalt (mod = 1.0)", () => {
    // Level 1:
    // soloEasy = 25
    // soloMedium = 50
    // soloHard = 75
    // soloDeadly = 100
    // Deadly max = 100 * 1.5 = 150

    it("returns Trivial for XP below easy", () => {
      const res = difficultyForSolo(24, 1, true);
      assert.equal(res.rating, 'Trivial');
      assert.equal(res.rationale, 'Below gestalt easy threshold (25)');
    });

    it("returns Easy for XP between easy and medium", () => {
      const resMin = difficultyForSolo(25, 1, true);
      assert.equal(resMin.rating, 'Easy');
      assert.equal(resMin.rationale, 'Gestalt easy: 25–49');

      const resMax = difficultyForSolo(49, 1, true);
      assert.equal(resMax.rating, 'Easy');
    });

    it("returns Medium for XP between medium and hard", () => {
      const resMin = difficultyForSolo(50, 1, true);
      assert.equal(resMin.rating, 'Medium');
      assert.equal(resMin.rationale, 'Gestalt medium: 50–74');

      const resMax = difficultyForSolo(74, 1, true);
      assert.equal(resMax.rating, 'Medium');
    });

    it("returns Hard for XP between hard and deadly", () => {
      const resMin = difficultyForSolo(75, 1, true);
      assert.equal(resMin.rating, 'Hard');
      assert.equal(resMin.rationale, 'Gestalt hard: 75–99');

      const resMax = difficultyForSolo(99, 1, true);
      assert.equal(resMax.rating, 'Hard');
    });

    it("returns Deadly for XP between deadly and deadly * 1.5", () => {
      const resMin = difficultyForSolo(100, 1, true);
      assert.equal(resMin.rating, 'Deadly');
      assert.equal(resMin.rationale, 'Gestalt deadly: 100+');

      const resMax = difficultyForSolo(149, 1, true);
      assert.equal(resMax.rating, 'Deadly');
    });

    it("returns Lethal for XP well above deadly", () => {
      const res = difficultyForSolo(150, 1, true);
      assert.equal(res.rating, 'Lethal');
      assert.equal(res.rationale, 'Well above gestalt deadly threshold (100). Reconsider.');
    });
  });
});
