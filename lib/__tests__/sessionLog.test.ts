import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { summarizeEvents } from '../sessionLog';
import type { ChangeEvent, ChangeEventKind } from '../sessionEvents';

describe('summarizeEvents', () => {
  it('handles an empty array', () => {
    const result = summarizeEvents([]);
    assert.deepEqual(result, { kept: 0, dismissed: 0, starred: 0 });
  });

  it('counts kept events properly when none are dismissed', () => {
    const events: ChangeEvent[] = [
      { id: '1', ts: 1, kind: 'other' as ChangeEventKind, summary: 'A' },
      { id: '2', ts: 2, kind: 'other' as ChangeEventKind, summary: 'B' },
    ];
    const result = summarizeEvents(events);
    assert.deepEqual(result, { kept: 2, dismissed: 0, starred: 0 });
  });

  it('counts dismissed and kept events properly', () => {
    const events: ChangeEvent[] = [
      { id: '1', ts: 1, kind: 'other' as ChangeEventKind, summary: 'A', dismissed: true },
      { id: '2', ts: 2, kind: 'other' as ChangeEventKind, summary: 'B', dismissed: false },
      { id: '3', ts: 3, kind: 'other' as ChangeEventKind, summary: 'C', dismissed: true },
    ];
    const result = summarizeEvents(events);
    assert.deepEqual(result, { kept: 1, dismissed: 2, starred: 0 });
  });

  it('counts starred events independently', () => {
    const events: ChangeEvent[] = [
      { id: '1', ts: 1, kind: 'other' as ChangeEventKind, summary: 'A', starred: true },
      { id: '2', ts: 2, kind: 'other' as ChangeEventKind, summary: 'B', starred: false },
      { id: '3', ts: 3, kind: 'other' as ChangeEventKind, summary: 'C', starred: true },
      { id: '4', ts: 4, kind: 'other' as ChangeEventKind, summary: 'D' },
    ];
    const result = summarizeEvents(events);
    assert.deepEqual(result, { kept: 4, dismissed: 0, starred: 2 });
  });

  it('handles complex combinations of dismissed and starred', () => {
    const events: ChangeEvent[] = [
      { id: '1', ts: 1, kind: 'other' as ChangeEventKind, summary: 'A', dismissed: true, starred: false },
      { id: '2', ts: 2, kind: 'other' as ChangeEventKind, summary: 'B', dismissed: false, starred: true },
      { id: '3', ts: 3, kind: 'other' as ChangeEventKind, summary: 'C', dismissed: true, starred: true },
      { id: '4', ts: 4, kind: 'other' as ChangeEventKind, summary: 'D', dismissed: false, starred: false },
    ];
    const result = summarizeEvents(events);
    assert.deepEqual(result, { kept: 2, dismissed: 2, starred: 2 });
  });
});
