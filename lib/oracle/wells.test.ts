import { describe, test, expect } from 'vitest';
import {
  askOracle,
  oracleThreshold,
  rollOracle,
  rollRandomEvent,
  rollComplication,
  isYesResult,
  ODDS_TABLE,
  CHAOS_SHIFT,
  FOCUS_TABLE,
  ACTION_TABLE,
  SUBJECT_TABLE,
  COMPLICATION_TABLE,
  type OracleOdds,
} from './wells';

describe('table shapes', () => {
  test('focus is d20, action and subject are d100, complication is d100', () => {
    expect(FOCUS_TABLE).toHaveLength(20);
    expect(ACTION_TABLE).toHaveLength(100);
    expect(SUBJECT_TABLE).toHaveLength(100);
    expect(COMPLICATION_TABLE).toHaveLength(100);
  });
  test('chaos shift is defined for every level 1-9 and symmetric around 5', () => {
    for (let c = 1; c <= 9; c++) expect(typeof CHAOS_SHIFT[c]).toBe('number');
    expect(CHAOS_SHIFT[5]).toBe(0);
    expect(CHAOS_SHIFT[1]).toBeLessThan(0);
    expect(CHAOS_SHIFT[9]).toBeGreaterThan(0);
  });
});

describe('oracleThreshold', () => {
  test('matches the documented yes-threshold table (Appendix C)', () => {
    // [odds, chaos1..chaos9]
    const expected: Array<[OracleOdds, number[]]> = [
      ['Certain', [75, 80, 85, 88, 90, 92, 95, 95, 95]],
      ['NearlyCertain', [65, 70, 75, 78, 80, 82, 85, 90, 95]],
      ['VeryLikely', [55, 60, 65, 68, 70, 72, 75, 80, 85]],
      ['Likely', [45, 50, 55, 58, 60, 62, 65, 70, 75]],
      ['FiftyFifty', [35, 40, 45, 48, 50, 52, 55, 60, 65]],
      ['Unlikely', [25, 30, 35, 38, 40, 42, 45, 50, 55]],
      ['VeryUnlikely', [15, 20, 25, 28, 30, 32, 35, 40, 45]],
      ['NearlyImpossible', [5, 10, 15, 18, 20, 22, 25, 30, 35]],
      ['Impossible', [5, 5, 5, 8, 10, 12, 15, 20, 25]],
    ];
    for (const [odds, row] of expected) {
      for (let chaos = 1; chaos <= 9; chaos++) {
        expect(oracleThreshold(odds, chaos)).toBe(row[chaos - 1]);
      }
    }
  });

  test('clamps between 5 and 95', () => {
    expect(oracleThreshold('Impossible', 1)).toBeGreaterThanOrEqual(5);
    expect(oracleThreshold('Certain', 9)).toBeLessThanOrEqual(95);
  });

  test('base table equals neutral chaos 5', () => {
    for (const odds of Object.keys(ODDS_TABLE) as OracleOdds[]) {
      expect(oracleThreshold(odds, 5)).toBe(ODDS_TABLE[odds]);
    }
  });
});

describe('askOracle result shape', () => {
  test('roll is always 1-100 and result is one of the eight outcomes', () => {
    const outcomes = new Set([
      'Exceptional Yes', 'Yes, And', 'Yes', 'Yes, But',
      'No, But', 'No', 'No, And', 'Exceptional No',
    ]);
    for (let i = 0; i < 500; i++) {
      const r = askOracle({ question: 'q', odds: 'FiftyFifty', chaosFactor: 5 });
      expect(r.roll).toBeGreaterThanOrEqual(1);
      expect(r.roll).toBeLessThanOrEqual(100);
      expect(outcomes.has(r.result)).toBe(true);
      // Yes/No must agree with whether the roll cleared the threshold.
      expect(isYesResult(r.result)).toBe(r.roll <= r.threshold);
    }
  });

  test('rollOracle stamps id + timestamp', () => {
    const r = rollOracle({ question: 'q', odds: 'Likely', chaosFactor: 5 });
    expect(typeof r.id).toBe('string');
    expect(r.id.length).toBeGreaterThan(0);
    expect(typeof r.timestamp).toBe('number');
  });
});

describe('probability curve (Appendix C)', () => {
  function yesRate(odds: OracleOdds, chaosFactor: number, trials = 10_000): number {
    let yeses = 0;
    for (let i = 0; i < trials; i++) {
      const r = askOracle({ question: 'q', odds, chaosFactor });
      if (isYesResult(r.result)) yeses++;
    }
    return yeses / trials;
  }

  test('Likely odds at chaos 5 gives ~60% yes', () => {
    const rate = yesRate('Likely', 5);
    expect(rate).toBeGreaterThan(0.55);
    expect(rate).toBeLessThan(0.65);
  });

  test('chaos 9 with FiftyFifty shifts yes probability up', () => {
    expect(yesRate('FiftyFifty', 9)).toBeGreaterThan(0.6);
  });

  test('low chaos suppresses yes probability', () => {
    expect(yesRate('FiftyFifty', 1)).toBeLessThan(0.4);
  });
});

describe('random events', () => {
  test('rollRandomEvent draws from each table', () => {
    const e = rollRandomEvent();
    expect(FOCUS_TABLE).toContain(e.focus);
    expect(ACTION_TABLE).toContain(e.action);
    expect(SUBJECT_TABLE).toContain(e.subject);
  });

  test('never fires at chaos 0-equivalent edge (no doubles <= chaos when chaos low)', () => {
    // At chaos 1 only "11" fires. Over many rolls the event rate should be low.
    let fired = 0;
    for (let i = 0; i < 5000; i++) {
      const r = askOracle({ question: 'q', odds: 'FiftyFifty', chaosFactor: 1 });
      if (r.randomEvent) fired++;
    }
    // Only roll==11 fires => ~1%. Comfortably under 5%.
    expect(fired / 5000).toBeLessThan(0.05);
  });

  test('higher chaos fires events more often', () => {
    function eventRate(chaos: number): number {
      let fired = 0;
      for (let i = 0; i < 5000; i++) {
        if (askOracle({ question: 'q', odds: 'FiftyFifty', chaosFactor: chaos }).randomEvent) fired++;
      }
      return fired / 5000;
    }
    expect(eventRate(9)).toBeGreaterThan(eventRate(1));
  });
});

describe('rollComplication', () => {
  test('returns a 1-100 roll mapped to a complication string', () => {
    for (let i = 0; i < 200; i++) {
      const { roll, complication } = rollComplication();
      expect(roll).toBeGreaterThanOrEqual(1);
      expect(roll).toBeLessThanOrEqual(100);
      expect(COMPLICATION_TABLE[roll - 1]).toBe(complication);
    }
  });
});
