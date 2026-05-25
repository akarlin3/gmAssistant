import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  markOpened,
  markSessionPlayed,
  getLastSessionAt,
  getLastOpenedAt,
  LAST_SESSION_KEY,
  LAST_OPENED_KEY,
} from '../lastPlayed';

describe('lastPlayed (B-06)', () => {
  test('markOpened sets lastOpenedAt but never touches lastSessionAt', () => {
    const before: Record<string, number> = { [LAST_SESSION_KEY]: 1000 };
    const after = markOpened(before, 5000);
    assert.equal(after[LAST_OPENED_KEY], 5000);
    // The session timestamp is untouched — viewing must not move "Last played".
    assert.equal(after[LAST_SESSION_KEY], 1000);
    assert.equal(getLastSessionAt({ data: after }), 1000);
  });

  test('opening a campaign does not change its derived last-played time', () => {
    const campaign = { data: { sessionLogs: [{ date: '2026-01-01' }] } };
    const playedBefore = getLastSessionAt(campaign);
    const opened = { data: markOpened(campaign.data, 9_999_999_999) };
    const playedAfter = getLastSessionAt(opened);
    assert.equal(playedAfter, playedBefore);
  });

  test('markSessionPlayed stamps lastSessionAt', () => {
    const data = markSessionPlayed({} as Record<string, number>, 7777);
    assert.equal(data[LAST_SESSION_KEY], 7777);
    assert.equal(getLastSessionAt({ data }), 7777);
  });

  test('getLastSessionAt prefers the explicit stamp over session-log dates', () => {
    const campaign = {
      data: { [LAST_SESSION_KEY]: 123, sessionLogs: [{ date: '2030-01-01' }] },
    };
    assert.equal(getLastSessionAt(campaign), 123);
  });

  test('getLastSessionAt falls back to newest session-log date for legacy campaigns', () => {
    const campaign = {
      data: {
        sessionLogs: [{ date: '2025-05-01' }, { date: '2025-06-15' }],
        sessionLogV2: [{ date: '2025-07-20' }],
      },
    };
    const expected = new Date('2025-07-20T12:00:00').getTime();
    assert.equal(getLastSessionAt(campaign), expected);
  });

  test('getLastSessionAt is null when there is no play history (no updatedAt fallback)', () => {
    assert.equal(getLastSessionAt({ data: {} }), null);
    assert.equal(getLastSessionAt({}), null);
    // Even a recently-edited campaign with no sessions reads as never played.
    assert.equal(getLastSessionAt({ data: { [LAST_OPENED_KEY]: Date.now() } }), null);
  });

  test('getLastOpenedAt reads only the explicit stamp', () => {
    assert.equal(getLastOpenedAt({ data: { [LAST_OPENED_KEY]: 42 } }), 42);
    assert.equal(getLastOpenedAt({ data: {} }), null);
  });
});
