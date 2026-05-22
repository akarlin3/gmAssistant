import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import { summarizeEvents } from '../sessionLog';
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
    // event 1 is kept, event 2 is dismissed. Both are starred.
    assert.deepEqual(result, { kept: 1, dismissed: 1, starred: 2 });
  });

  await t.test('handles mixed events correctly', () => {
    const events: ChangeEvent[] = [
      { id: '1', ts: 1, kind: 'other', summary: 'e1' }, // kept
      { id: '2', ts: 2, kind: 'other', summary: 'e2', dismissed: true }, // dismissed
      { id: '3', ts: 3, kind: 'other', summary: 'e3', starred: true }, // kept, starred
      { id: '4', ts: 4, kind: 'other', summary: 'e4', dismissed: true, starred: true }, // dismissed, starred
      { id: '5', ts: 5, kind: 'other', summary: 'e5', dismissed: false, starred: false }, // kept
    ];
    const result = summarizeEvents(events);
    assert.deepEqual(result, { kept: 3, dismissed: 2, starred: 2 });
  });
});
