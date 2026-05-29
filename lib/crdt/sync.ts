/**
 * Per-campaign CRDT sync orchestrator.
 *
 * Lifecycle:
 *   1. Create Y.Doc + attach IndexedDB persistence (instant local hydration).
 *   2. Pull latest snapshot from Firestore and apply it.
 *   3. Pull updates with clock > snapshot.throughClock and apply them.
 *   4. If both local Y.Doc and Firestore are empty, run legacy migration:
 *      seed Y.Doc from campaigns/{id}.data (the pre-CRDT JSON blob).
 *   5. Subscribe to incoming updates (apply on arrival).
 *   6. Observe local Y.Doc changes (origin != REMOTE_ORIGIN) and write them
 *      to the Firestore update log.
 *   7. Periodically (every N updates or M minutes) snapshot + GC.
 */
import * as Y from 'yjs';
import { attachLocalPersistence, type LocalPersistence } from './persistence';
import {
  getLatestSnapshot, getUpdatesSince, subscribeUpdates, writeUpdate,
  writeSnapshotAndGc, REMOTE_ORIGIN, SNAPSHOT_ORIGIN, maxClock, type UpdateDoc,
} from './firestore-transport';
import { applyJsonPatch, getRoot, seedFromJson, yMapToJson } from './yjs-adapter';

// Snapshot triggers — kept conservative; tune if Firestore costs become an issue.
const SNAPSHOT_EVERY_UPDATES = 50;
const SNAPSHOT_EVERY_MS = 5 * 60 * 1000;

export type CrdtSyncOptions = {
  campaignId: string;
  /** Initial JSON to seed from when both local + Firestore have no state. */
  legacyData?: Record<string, any> | null;
  /** Stable client identifier (e.g. browser-tab uuid). */
  clientId: string;
  onError?: (e: Error) => void;
  /** Notify caller when the JSON-shaped data view should be re-read. */
  onChange?: (snapshot: Record<string, any>) => void;
  /** Disable Firestore transport (used for tests / offline-only). */
  remoteEnabled?: boolean;
};

export class CrdtSync {
  readonly doc: Y.Doc;
  readonly campaignId: string;
  readonly clientId: string;
  private local: LocalPersistence | null = null;
  private remoteEnabled: boolean;
  private unsubRemote: (() => void) | null = null;
  private updateHandler: ((update: Uint8Array, origin: any) => void) | null = null;
  private destroyed = false;
  private localClock = 0;
  private highestKnownClock = 0;
  private updatesSinceSnapshot = 0;
  private lastSnapshotAt = Date.now();
  private snapshotPending = false;
  private pendingWrites = new Set<Promise<void>>();
  private hydrated = false;
  private onError: (e: Error) => void;
  private onChange?: (snapshot: Record<string, any>) => void;
  /** Resolves once initial hydration + (best-effort) remote pull complete. */
  readonly ready: Promise<void>;
  /** Resolves once IndexedDB hydration is complete (synchronous-feeling reads). */
  readonly localReady: Promise<void>;

  constructor(opts: CrdtSyncOptions) {
    this.campaignId = opts.campaignId;
    this.clientId = opts.clientId;
    this.remoteEnabled = opts.remoteEnabled !== false;
    this.onError = opts.onError ?? ((e) => console.error('[CrdtSync]', e));
    this.onChange = opts.onChange;
    this.doc = new Y.Doc();
    this.localReady = Promise.resolve();
    this.ready = this.init(opts.legacyData ?? null);
  }

  private async init(legacyData: Record<string, any> | null): Promise<void> {
    try {
      // Local first — instant rehydrate from IndexedDB if available.
      if (typeof window !== 'undefined') {
        this.local = attachLocalPersistence(this.doc, this.campaignId);
        await this.local.whenSynced;
      }

      if (this.remoteEnabled) {
        const snapshot = await getLatestSnapshot(this.campaignId);
        if (snapshot && snapshot.state.length > 0) {
          Y.applyUpdate(this.doc, snapshot.state, SNAPSHOT_ORIGIN);
          this.highestKnownClock = snapshot.throughClock;
        }
        const updates = await getUpdatesSince(this.campaignId, this.highestKnownClock);
        for (const u of updates) {
          Y.applyUpdate(this.doc, u.update, REMOTE_ORIGIN);
        }
        const seen = maxClock(updates);
        if (seen > this.highestKnownClock) this.highestKnownClock = seen;
      }

      // Seed from legacy JSON only when both local and remote were empty.
      const root = getRoot(this.doc);
      const isEmpty = root.size === 0;
      if (isEmpty && legacyData && Object.keys(legacyData).length > 0) {
        seedFromJson(this.doc, legacyData, 'legacy-migration');
      }

      // Wire the update handler AFTER hydration so we don't echo replays as
      // outbound writes. doc.on('update') fires once per transaction with the
      // binary encoding of just that transaction's ops.
      this.updateHandler = (update, origin) => {
        if (this.destroyed) return;
        this.notifyChange();
        if (origin === REMOTE_ORIGIN || origin === SNAPSHOT_ORIGIN) return;
        if (!this.remoteEnabled) return;
        if (!this.hydrated) return; // ignore any updates that fire during init
        this.shipUpdate(update);
      };
      this.doc.on('update', this.updateHandler);

      // Subscribe to live updates from peers.
      if (this.remoteEnabled && typeof window !== 'undefined') {
        this.unsubRemote = subscribeUpdates(
          this.campaignId,
          this.highestKnownClock,
          (u) => this.onRemoteUpdate(u),
          (err) => this.onError(err),
        );
      }
      this.hydrated = true;
      // If we seeded from legacy and remote is enabled, push the seed as an
      // initial update so other devices and future loaders see it.
      if (this.remoteEnabled && isEmpty && legacyData && Object.keys(legacyData).length > 0) {
        await this.captureFullStateAsUpdate();
      }
      // Always notify once after init so React reads the hydrated JSON view.
      this.notifyChange();
    } catch (e: any) {
      this.onError(e);
    }
  }

  private notifyChange(): void {
    if (!this.onChange) return;
    try {
      this.onChange(yMapToJson(getRoot(this.doc)));
    } catch (e: any) {
      this.onError(e);
    }
  }

  private onRemoteUpdate(u: UpdateDoc): void {
    if (u.clientId === this.clientId) {
      if (u.clock > this.highestKnownClock) this.highestKnownClock = u.clock;
      return;
    }
    try {
      Y.applyUpdate(this.doc, u.update, REMOTE_ORIGIN);
      if (u.clock > this.highestKnownClock) this.highestKnownClock = u.clock;
    } catch (e: any) {
      this.onError(e);
    }
  }

  private shipUpdate(update: Uint8Array): void {
    if (!this.remoteEnabled) return;
    const clock = this.nextClock();
    const promise = writeUpdate(this.campaignId, update, this.clientId, clock)
      .then(() => {
        this.updatesSinceSnapshot += 1;
        this.maybeSnapshot();
      })
      .catch((e) => this.onError(e))
      .finally(() => {
        this.pendingWrites.delete(promise);
      });
    this.pendingWrites.add(promise);
  }

  private nextClock(): number {
    // Monotonic per-device clock. Highest known remote clock + a strictly
    // increasing local counter. Ties are broken at Yjs's CRDT layer, so
    // ordering on the log is for causality and snapshot GC only.
    this.localClock += 1;
    return this.highestKnownClock + this.localClock;
  }

  /**
   * After legacy seeding, encode the full current state and write it as a
   * single update so peers (and any future cold-start) converge to it.
   */
  private async captureFullStateAsUpdate(): Promise<void> {
    try {
      const full = Y.encodeStateAsUpdate(this.doc);
      const clock = this.nextClock();
      await writeUpdate(this.campaignId, full, this.clientId, clock);
    } catch (e: any) {
      this.onError(e);
    }
  }

  private maybeSnapshot(): void {
    if (this.snapshotPending) return;
    const now = Date.now();
    const tooMany = this.updatesSinceSnapshot >= SNAPSHOT_EVERY_UPDATES;
    const tooLong = now - this.lastSnapshotAt > SNAPSHOT_EVERY_MS && this.updatesSinceSnapshot > 0;
    if (!tooMany && !tooLong) return;
    this.snapshotPending = true;
    void this.compact()
      .catch((e) => this.onError(e))
      .finally(() => {
        this.snapshotPending = false;
      });
  }

  /** Force an immediate snapshot + GC. */
  async compact(): Promise<void> {
    const state = Y.encodeStateAsUpdate(this.doc);
    const stateVector = Y.encodeStateVector(this.doc);
    const throughClock = Math.max(this.highestKnownClock, this.localClock + this.highestKnownClock);
    await writeSnapshotAndGc(this.campaignId, state, stateVector, throughClock);
    this.updatesSinceSnapshot = 0;
    this.lastSnapshotAt = Date.now();
  }

  async flush(): Promise<void> {
    if (this.pendingWrites.size === 0) return;
    await Promise.all(Array.from(this.pendingWrites));
  }

  /**
   * Seed the Y.Doc from legacy `campaign.data` JSON *iff* it is still empty
   * (i.e. no local IndexedDB state and no remote CRDT log). Returns true when
   * a seed actually happened.
   *
   * This exists for the common runtime case where the Firestore campaign
   * metadata — and therefore `campaign.data` — is not yet available at the
   * moment CrdtSync is constructed. Callers invoke this once metadata loads so
   * never-migrated campaigns don't appear blank (which previously popped the
   * Session 0 wizard and looked like data loss).
   */
  async seedFromLegacyIfEmpty(legacyData: Record<string, any> | null): Promise<boolean> {
    await this.ready;
    if (this.destroyed) return false;
    if (!legacyData || Object.keys(legacyData).length === 0) return false;
    const root = getRoot(this.doc);
    if (root.size !== 0) return false; // already has content — never clobber
    // seedFromJson runs in a transaction with origin 'legacy-migration', so
    // the wired update handler ships it to the Firestore log (just like
    // applyJson) and peers / future cold-starts converge to it. flush() waits
    // for that background write to land.
    seedFromJson(this.doc, legacyData, 'legacy-migration');
    this.notifyChange();
    await this.flush();
    return true;
  }

  /** Apply a new JSON snapshot — convenience wrapper for callers that still
   * think in terms of "the campaign.data object as JSON". */
  applyJson(newData: Record<string, any>): Promise<void> {
    applyJsonPatch(this.doc, newData, 'local-patch');
    return this.flush();
  }

  /** Current JSON view of campaign.data. */
  getJson(): Record<string, any> {
    return yMapToJson(getRoot(this.doc));
  }

  async destroy(): Promise<void> {
    this.destroyed = true;
    if (this.updateHandler) {
      this.doc.off('update', this.updateHandler);
    }
    if (this.unsubRemote) this.unsubRemote();
    if (this.local) await this.local.destroy();
    this.doc.destroy();
  }
}
