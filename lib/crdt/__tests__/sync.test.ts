/**
 * End-to-end sync tests using an in-memory mock for the Firestore transport.
 * We bypass the real `firestore-transport` module and substitute a shared
 * in-memory log so two CrdtSync instances can converge through the same
 * transport, exercising the same code paths used at runtime.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as Y from 'yjs';

// In-memory replacement for Firestore. Mirrors the surface the orchestrator
// actually uses: snapshots collection + updates collection per campaign,
// plus a pub-sub for live subscribers.
type InMemoryUpdate = { update: Uint8Array; clientId: string; clock: number };
type InMemorySnapshot = { state: Uint8Array; stateVector: Uint8Array; throughClock: number };
type Subscriber = (u: InMemoryUpdate) => void;

const stores: Record<string, {
  updates: InMemoryUpdate[];
  snapshots: InMemorySnapshot[];
  subs: { sinceClock: number; cb: Subscriber }[];
}> = {};

// When set, writeUpdate stages writes in a queue instead of propagating to
// subscribers — used to simulate "device is offline" intervals in tests.
let partitioned = false;
const partitionedQueue: { id: string; u: InMemoryUpdate }[] = [];

function storeFor(id: string) {
  if (!stores[id]) stores[id] = { updates: [], snapshots: [], subs: [] };
  return stores[id];
}

export function setPartitioned(v: boolean) {
  partitioned = v;
  if (!v) {
    // Heal: deliver every buffered update in the order it was queued.
    while (partitionedQueue.length) {
      const { id, u } = partitionedQueue.shift()!;
      for (const sub of storeFor(id).subs) if (u.clock > sub.sinceClock) sub.cb(u);
    }
  }
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
      if (partitioned) {
        partitionedQueue.push({ id, u });
        return;
      }
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

// IndexedDB persistence isn't available in jsdom; stub it out.
vi.mock('../persistence', () => ({
  attachLocalPersistence: () => ({
    provider: {} as any,
    whenSynced: Promise.resolve(),
    destroy: async () => {},
  }),
}));

import { CrdtSync } from '../sync';

function reset() {
  for (const k of Object.keys(stores)) delete stores[k];
}

describe('CrdtSync — transport-level convergence', () => {
  beforeEach(reset);

  it('two clients diverge while partitioned, then converge after heal', async () => {
    const a = new CrdtSync({
      campaignId: 'c1', clientId: 'A',
      legacyData: { npcs: [{ id: 'n1', name: 'Mara' }], factions: [], secrets: [] },
    });
    await a.ready;
    const b = new CrdtSync({
      campaignId: 'c1', clientId: 'B',
      legacyData: null,
    });
    await b.ready;
    expect(b.getJson()).toEqual(a.getJson());

    // Both devices go offline (simulated network partition).
    setPartitioned(true);

    // Divergent edits hit distinct fields so no spurious LWW races.
    a.applyJson({
      npcs: [{ id: 'n1', name: 'Mara the Cleric' }, { id: 'n2', name: 'Brom' }],
      factions: [{ id: 'f1', name: 'Wardens' }],
      secrets: [],
    });
    b.applyJson({
      npcs: [{ id: 'n1', name: 'Mara' }],
      factions: [],
      secrets: ['the king is a lich'],
    });

    // While partitioned, the local state on each device reflects only its
    // own edits.
    expect(a.getJson().npcs.map((n: any) => n.id)).toEqual(['n1', 'n2']);
    expect(b.getJson().secrets).toContain('the king is a lich');
    expect(a.getJson().secrets).not.toContain('the king is a lich');
    expect(b.getJson().factions).toEqual([]);

    // Heal the partition — buffered updates flow to subscribers in order.
    setPartitioned(false);
    await new Promise((r) => setTimeout(r, 10));

    expect(a.getJson()).toEqual(b.getJson());
    const merged = a.getJson();
    // All three divergent edits coexist.
    expect(merged.npcs.find((n: any) => n.id === 'n1').name).toBe('Mara the Cleric');
    expect(merged.npcs.find((n: any) => n.id === 'n2').name).toBe('Brom');
    expect(merged.factions.map((f: any) => f.id)).toContain('f1');
    expect(merged.secrets).toContain('the king is a lich');

    await a.destroy();
    await b.destroy();
  });

  it('snapshot + GC: a snapshot subsumes prior updates and rehydration still works', async () => {
    const a = new CrdtSync({
      campaignId: 'c2', clientId: 'A',
      legacyData: { pitch: 'doomed kingdom' },
    });
    await a.ready;
    // Make a handful of edits, then compact.
    a.applyJson({ pitch: 'doomed kingdom', npcs: [{ id: 'n1', name: 'Mara' }] });
    a.applyJson({ pitch: 'doomed kingdom', npcs: [{ id: 'n1', name: 'Mara' }, { id: 'n2', name: 'Brom' }] });
    await new Promise((r) => setTimeout(r, 10));
    await a.compact();
    expect(stores['c2'].snapshots.length).toBeGreaterThanOrEqual(1);
    expect(stores['c2'].updates.length).toBe(0); // GCed

    // A new device joins after GC and must recover from the snapshot alone.
    const c = new CrdtSync({ campaignId: 'c2', clientId: 'C', legacyData: null });
    await c.ready;
    expect(c.getJson().npcs.map((n: any) => n.id)).toEqual(['n1', 'n2']);

    await a.destroy();
    await c.destroy();
  });

  it('an offline client (never connected) can catch up later via the log', async () => {
    // A goes online first and writes a couple of edits.
    const a = new CrdtSync({
      campaignId: 'c3', clientId: 'A',
      legacyData: { secrets: [] },
    });
    await a.ready;
    a.applyJson({ secrets: ['the king is a lich'] });
    a.applyJson({ secrets: ['the king is a lich', 'the lich is dying'] });
    await new Promise((r) => setTimeout(r, 10));

    // B comes online for the first time — should pull all of A's edits.
    const b = new CrdtSync({ campaignId: 'c3', clientId: 'B', legacyData: null });
    await b.ready;
    expect(b.getJson().secrets).toEqual(['the king is a lich', 'the lich is dying']);

    await a.destroy();
    await b.destroy();
  });

  it('applyJson returns a promise that resolves once background writes are complete', async () => {
    const a = new CrdtSync({
      campaignId: 'c4', clientId: 'A',
      legacyData: null,
    });
    await a.ready;

    const promise = a.applyJson({ secrets: ['async resolved'] });
    expect(promise).toBeInstanceOf(Promise);

    await promise;
    expect(stores['c4'].updates.length).toBe(1);

    await a.destroy();
  });
});
