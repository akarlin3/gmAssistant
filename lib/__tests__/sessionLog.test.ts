import { describe, it, test } from 'node:test';
import * as assert from 'node:assert/strict';
import { formatDuration, summarizeEvents } from '../sessionLog';
import type { ChangeEvent } from '../sessionEvents';

test('summarizeEvents', async (t) => {
  await t.test('returns all zeros for empty array', () => {
    const result = summarizeEvents([]);
    assert.deepEqual(result, { kept: 0, dismissed: 0, starred: 0 });
  });

  await t.test('counts non-dismissed events as kept', () => {
    const events: ChangeEvent[] = [
      { id: '1', ts: 1, kind: 'other', summary: 'event 1' },
      { id: '2', ts: 2, kind: 'other', summary: 'event 2', dismissed: false },
    ];
    const result = summarizeEvents(events);
    assert.deepEqual(result, { kept: 2, dismissed: 0, starred: 0 });
  });

  await t.test('counts dismissed events', () => {
    const events: ChangeEvent[] = [
      { id: '1', ts: 1, kind: 'other', summary: 'event 1', dismissed: true },
      { id: '2', ts: 2, kind: 'other', summary: 'event 2', dismissed: true },
    ];
    const result = summarizeEvents(events);
    assert.deepEqual(result, { kept: 0, dismissed: 2, starred: 0 });
  });

  await t.test('counts starred events independently', () => {
    const events: ChangeEvent[] = [
      { id: '1', ts: 1, kind: 'other', summary: 'event 1', starred: true },
      { id: '2', ts: 2, kind: 'other', summary: 'event 2', dismissed: true, starred: true },
    ];
    const result = summarizeEvents(events);
    assert.deepEqual(result, { kept: 1, dismissed: 1, starred: 2 });
  });

  await t.test('handles mixed events correctly', () => {
    const events: ChangeEvent[] = [
      { id: '1', ts: 1, kind: 'other', summary: 'e1' },
      { id: '2', ts: 2, kind: 'other', summary: 'e2', dismissed: true },
      { id: '3', ts: 3, kind: 'other', summary: 'e3', starred: true },
      { id: '4', ts: 4, kind: 'other', summary: 'e4', dismissed: true, starred: true },
      { id: '5', ts: 5, kind: 'other', summary: 'e5', dismissed: false, starred: false },
    ];
    const result = summarizeEvents(events);
    assert.deepEqual(result, { kept: 3, dismissed: 2, starred: 2 });
  });
});

describe('formatDuration', () => {
  it('returns "0m" for invalid inputs (Infinity, NaN)', () => {
    assert.equal(formatDuration(Infinity), '0m');
    assert.equal(formatDuration(NaN), '0m');
  });

  it('returns "0m" for non-positive values', () => {
    assert.equal(formatDuration(0), '0m');
    assert.equal(formatDuration(-1000), '0m');
  });

  it('returns just minutes when less than 60 minutes', () => {
    assert.equal(formatDuration(3564000), '59m');
  });

  it('handles exact minute boundaries', () => {
    assert.equal(formatDuration(60000), '1m');
    assert.equal(formatDuration(59 * 60000), '59m');
    assert.equal(formatDuration(60 * 60000), '1h');
  });

  it('handles hours and minutes correctly', () => {
    assert.equal(formatDuration(61 * 60000), '1h 1m');
    assert.equal(formatDuration(90 * 60000), '1h 30m');
    assert.equal(formatDuration(125 * 60000), '2h 5m');
  });

  it('handles rounding to nearest minute', () => {
    assert.equal(formatDuration(84000), '1m');
    assert.equal(formatDuration(90000), '2m');
  });

  it('handles rounding up to exact hour', () => {
    assert.equal(formatDuration(59.5 * 60000), '1h');
  });
});
