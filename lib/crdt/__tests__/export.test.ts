/**
 * Tests for loadCampaignCrdtJson — the read-only reconstruction used by
 * Google Drive backups and campaign copy. Uses the same in-memory transport
 * mock as sync.test.ts so a CrdtSync can write into the log and the exporter
 * reads it back.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

type InMemoryUpdate = { update: Uint8Array; clientId: string; clock: number };
type InMemorySnapshot = { state: Uint8Array; stateVector: Uint8Array; throughClock: number };
type Subscriber = (u: InMemoryUpdate) => void;

const stores: Record<string, {
  updates: InMemoryUpdate[];
  snapshots: InMemorySnapshot[];
  subs: { sinceClock: number; cb: Subscriber }[];
}> = {};

function storeFor(id: string) {
  if (!stores[id]) stores[id] = { updates: [], snapshots: [], subs: [] };
  return stores[id];
}

vi.mock('../firestore-transport', () => {
  const REMOTE_ORIGIN = Symbol('crdt-remote-test');
  const SNAPSHOT_ORIGIN = Symbol('crdt-snapshot-test');
  return {
    REMOTE_ORIGIN,
    SNAPSHOT_ORIGIN,
    async getLatestSnapshot(id: string) {
      const s = storeFor(id).snapshots;
      if (s.length === 0) return null;
      return s.reduce((a, b) => (b.throughClock > a.throughClock ? b : a));
    },
    async getUpdatesSince(id: string, sinceClock: number) {
      return storeFor(id).updates.filter((u) => u.clock > sinceClock).sort((a, b) => a.clock - b.clock);
    },
    async getAllUpdates(id: string) {
      return storeFor(id).updates.slice().sort((a, b) => a.clock - b.clock);
    },
    subscribeUpdates(id: string, sinceClock: number, onUpdate: Subscriber) {
      const entry = { sinceClock, cb: onUpdate };
      storeFor(id).subs.push(entry);
      return () => {
        const arr = storeFor(id).subs;
        const idx = arr.indexOf(entry);
        if (idx >= 0) arr.splice(idx, 1);
      };
    },
    async writeUpdate(id: string, update: Uint8Array, clientId: string, clock: number) {
      const u = { update, clientId, clock };
      const s = storeFor(id);
      s.updates.push(u);
      for (const sub of s.subs) if (clock > sub.sinceClock) sub.cb(u);
    },
    async writeSnapshotAndGc(id: string, state: Uint8Array, stateVector: Uint8Array, throughClock: number) {
      const s = storeFor(id);
      s.snapshots.push({ state, stateVector, throughClock });
      s.updates = s.updates.filter((u) => u.clock > throughClock);
      s.snapshots = s.snapshots.filter((sn) => sn.throughClock >= throughClock);
    },
    maxClock(updates: InMemoryUpdate[]) {
      let m = -1;
      for (const u of updates) if (u.clock > m) m = u.clock;
      return m;
    },
  };
});

vi.mock('../persistence', () => ({
  attachLocalPersistence: () => ({
    provider: {} as any,
    whenSynced: Promise.resolve(),
    destroy: async () => {},
  }),
}));

import { CrdtSync } from '../sync';
import { loadCampaignCrdtJson } from '../export';

beforeEach(() => {
  for (const k of Object.keys(stores)) delete stores[k];
});

describe('loadCampaignCrdtJson', () => {
  it('reconstructs current content from the CRDT log (not the legacy field)', async () => {
    const sync = new CrdtSync({ campaignId: 'e1', clientId: 'A', legacyData: null });
    await sync.ready;
    await sync.applyJson({ pitch: 'a living world', npcs: [{ id: 'n1', name: 'Mara' }] });
    await sync.applyJson({ pitch: 'a living world', npcs: [{ id: 'n1', name: 'Mara' }, { id: 'n2', name: 'Brom' }] });

    // The legacy field is stale/empty — the exporter must ignore it in favor
    // of the CRDT log.
    const json = await loadCampaignCrdtJson('e1', {});
    expect(json.pitch).toBe('a living world');
    expect(json.npcs.map((n: any) => n.id)).toEqual(['n1', 'n2']);

    await sync.destroy();
  });

  it('survives snapshot+GC: rebuilds from the compacted snapshot alone', async () => {
    const sync = new CrdtSync({ campaignId: 'e2', clientId: 'A', legacyData: { pitch: 'seed' } });
    await sync.ready;
    await sync.applyJson({ pitch: 'seed', secrets: ['the king is a lich'] });
    await sync.compact();
    expect(stores['e2'].updates.length).toBe(0); // GCed into the snapshot

    const json = await loadCampaignCrdtJson('e2', null);
    expect(json.secrets).toEqual(['the king is a lich']);

    await sync.destroy();
  });

  it('falls back to legacy data for a never-migrated campaign (empty log)', async () => {
    const json = await loadCampaignCrdtJson('e3', { pitch: 'legacy only', clocks: [] });
    expect(json.pitch).toBe('legacy only');
    expect(json.clocks).toEqual([]);
  });

  it('returns an empty object when there is neither CRDT state nor legacy data', async () => {
    expect(await loadCampaignCrdtJson('e4', null)).toEqual({});
    expect(await loadCampaignCrdtJson('e5', {})).toEqual({});
  });
});
