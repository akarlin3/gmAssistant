import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import { relativeTime } from '../relativeTime';

describe('relativeTime', () => {
  const OriginalDate = global.Date;

  before(() => {
    // Mock the global Date constructor to return a fixed date when called without arguments
    class MockDate extends OriginalDate {
      constructor(...args: any[]) {
        if (args.length === 0) {
          super('2024-01-01T12:00:00.000Z');
        } else {
          super(...args as [any]);
        }
      }
    }
    global.Date = MockDate as any;
  });

  after(() => {
    global.Date = OriginalDate;
  });

  const getPastDate = (seconds: number): Date => {
    const d = new OriginalDate('2024-01-01T12:00:00.000Z');
    d.setTime(d.getTime() - seconds * 1000);
    return d;
  };

  test('returns "" for null input', () => {
    assert.strictEqual(relativeTime(null), '');
  });

  test('returns "just now" for < 60 seconds ago', () => {
    assert.strictEqual(relativeTime(getPastDate(0)), 'just now');
    assert.strictEqual(relativeTime(getPastDate(30)), 'just now');
    assert.strictEqual(relativeTime(getPastDate(59)), 'just now');
  });

  test('returns "1m ago" for exactly 1 minute ago', () => {
    assert.strictEqual(relativeTime(getPastDate(60)), '1m ago');
    assert.strictEqual(relativeTime(getPastDate(119)), '1m ago');
  });

  test('returns "Xm ago" for < 60 minutes ago', () => {
    assert.strictEqual(relativeTime(getPastDate(120)), '2m ago');
    assert.strictEqual(relativeTime(getPastDate(59 * 60)), '59m ago');
  });

  test('returns "1h ago" for exactly 1 hour ago', () => {
    assert.strictEqual(relativeTime(getPastDate(60 * 60)), '1h ago');
    assert.strictEqual(relativeTime(getPastDate(2 * 60 * 60 - 1)), '1h ago');
  });

  test('returns "Xh ago" for < 24 hours ago', () => {
    assert.strictEqual(relativeTime(getPastDate(2 * 60 * 60)), '2h ago');
    assert.strictEqual(relativeTime(getPastDate(23 * 60 * 60)), '23h ago');
  });

  test('returns "1d ago" for exactly 1 day ago', () => {
    assert.strictEqual(relativeTime(getPastDate(24 * 60 * 60)), '1d ago');
    assert.strictEqual(relativeTime(getPastDate(2 * 24 * 60 * 60 - 1)), '1d ago');
  });

  test('returns "Xd ago" for < 30 days ago', () => {
    assert.strictEqual(relativeTime(getPastDate(2 * 24 * 60 * 60)), '2d ago');
    assert.strictEqual(relativeTime(getPastDate(29 * 24 * 60 * 60)), '29d ago');
  });

  test('returns "1mo ago" for exactly 1 month ago', () => {
    assert.strictEqual(relativeTime(getPastDate(30 * 24 * 60 * 60)), '1mo ago');
    assert.strictEqual(relativeTime(getPastDate(2 * 30 * 24 * 60 * 60 - 1)), '1mo ago');
  });

  test('returns "Xmo ago" for < 12 months ago', () => {
    assert.strictEqual(relativeTime(getPastDate(2 * 30 * 24 * 60 * 60)), '2mo ago');
    assert.strictEqual(relativeTime(getPastDate(11 * 30 * 24 * 60 * 60)), '11mo ago');
  });

  test('returns "1y ago" for exactly 1 year ago', () => {
    // Note: The function uses 365 days for a year
    assert.strictEqual(relativeTime(getPastDate(365 * 24 * 60 * 60)), '1y ago');
    assert.strictEqual(relativeTime(getPastDate(2 * 365 * 24 * 60 * 60 - 1)), '1y ago');
  });

  test('returns "Xy ago" for > 1 year ago', () => {
    assert.strictEqual(relativeTime(getPastDate(2 * 365 * 24 * 60 * 60)), '2y ago');
    assert.strictEqual(relativeTime(getPastDate(10 * 365 * 24 * 60 * 60)), '10y ago');
  });
});
