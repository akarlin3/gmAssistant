import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  allowedDestsFor,
  buildPatch,
  defaultDestFor,
  itemsFor,
  mapItem,
  DEST_LABEL,
  type CampaignDestKey,
} from '../addToCampaign';
import type { PlotSegueResult } from '../types';

function mkResult(overrides: Partial<PlotSegueResult> = {}): PlotSegueResult {
  return {
    kind: 'plot-segue',
    id: 'plot-segue_abc',
    inputs: { segueType: 'bridge', count: 2, tone: 'escalating', currentScene: '' },
    segues: [
      { title: 'A Knock at Midnight', readAloud: 'A rain-soaked rider hammers on the door.', gmNote: 'opens Insight check' },
      { title: 'The Coin Spins', readAloud: 'A coin spins on the table and refuses to fall.' },
    ],
    enhanced: true,
    ...overrides,
  };
}

describe('plot-segue addToCampaign', () => {
  it('itemsFor returns one selectable per segue', () => {
    const r = mkResult();
    const items = itemsFor('plot-segue', r);
    assert.equal(items.length, 2);
    assert.equal(items[0].label, 'A Knock at Midnight');
    assert.equal(items[1].label, 'The Coin Spins');
  });

  it('allowedDestsFor includes all four destinations', () => {
    const allowed = allowedDestsFor('plot-segue');
    const set = new Set<CampaignDestKey>(allowed);
    assert.ok(set.has('scenes'));
    assert.ok(set.has('secrets'));
    assert.ok(set.has('facts'));
    assert.ok(set.has('session-log'));
  });

  it('defaultDestFor is "scenes"', () => {
    assert.equal(defaultDestFor('plot-segue'), 'scenes');
  });

  it('DEST_LABEL has a label for session-log', () => {
    assert.equal(DEST_LABEL['session-log'], 'Session Log (live)');
  });

  it('mapItem shapes a "title — readAloud" string for scenes/secrets/facts', () => {
    const r = mkResult();
    const item = itemsFor('plot-segue', r)[0];
    for (const dest of ['scenes', 'secrets', 'facts'] as const) {
      const row = mapItem('plot-segue', dest, item);
      assert.equal(typeof row, 'string');
      assert.equal(row, 'A Knock at Midnight — A rain-soaked rider hammers on the door.');
    }
  });

  it('mapItem returns a ChangeEvent for session-log', () => {
    const r = mkResult();
    const item = itemsFor('plot-segue', r)[0];
    const row = mapItem('plot-segue', 'session-log', item) as { id: string; kind: string; summary: string };
    assert.equal(typeof row, 'object');
    assert.equal(row.kind, 'other');
    assert.match(row.summary, /^Segue: A Knock at Midnight — /);
    assert.ok(typeof row.id === 'string' && row.id.length > 0);
  });

  it('mapItem returns null for session-log when kind is not plot-segue', () => {
    const r = mkResult();
    const item = itemsFor('plot-segue', r)[0];
    assert.equal(mapItem('treasure-hoard', 'session-log', item), null);
  });

  it('buildPatch appends segue strings to existing scenes array', () => {
    const r = mkResult();
    const items = itemsFor('plot-segue', r);
    const existing = ['preset scene'];
    const { patch, added } = buildPatch(existing, 'plot-segue', 'scenes', items);
    assert.equal(added, 2);
    assert.equal(patch.key, 'scenes');
    assert.equal((patch.value as string[]).length, 3);
    assert.equal((patch.value as string[])[0], 'preset scene');
    assert.equal((patch.value as string[])[1], 'A Knock at Midnight — A rain-soaked rider hammers on the door.');
  });

  it('buildPatch appends ChangeEvents to existing session-log array', () => {
    const r = mkResult();
    const items = itemsFor('plot-segue', r);
    const existing = [{ id: 'evt_old', ts: 1, kind: 'other', summary: 'prior' }];
    const { patch, added } = buildPatch(existing, 'plot-segue', 'session-log', items);
    assert.equal(added, 2);
    assert.equal(patch.key, 'session-log');
    const value = patch.value as Array<{ kind: string; summary: string }>;
    assert.equal(value.length, 3);
    assert.equal(value[0].summary, 'prior');
    assert.match(value[1].summary, /^Segue: A Knock at Midnight/);
    assert.match(value[2].summary, /^Segue: The Coin Spins/);
  });
});
