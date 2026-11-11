// Multi-Monitor Cross-Tab Live Sync (`BroadcastChannel('gmassistant_live_sync')`)
// & 7-Snapshot Rolling Safety Vault (IndexedDB + localStorage + in-memory ring buffer).
//
// 1. Instant Multi-Tab Sync:
//    Broadcasts Yjs binary updates, campaign JSON patches, reveals, map pings,
//    and theme switches across same-origin browser tabs in <16ms with zero
//    state drift.
// 2. 7-Snapshot Rolling Safety Vault:
//    Maintains a capped ring buffer of the last 7 automatic campaign snapshots
//    (captured before JSON import, Gemini Bridge apply, batch character upload,
//    destructive delete, and periodic session checkpoints) with 1-click diff
//    preview and restore.

export const LIVE_SYNC_CHANNEL_NAME = 'gmassistant_live_sync';
export const SNAPSHOT_VAULT_CAPACITY = 7;
export const MAX_VAULT_SNAPSHOTS = SNAPSHOT_VAULT_CAPACITY;

export type VaultSnapshotReason =
  | 'json_import'
  | 'pre_json_import'
  | 'gemini_bridge_apply'
  | 'workspace_architect_apply'
  | 'character_upload'
  | 'batch_character_upload'
  | 'destructive_delete'
  | 'session_checkpoint'
  | 'manual_checkpoint'
  | 'manual';

export const VAULT_REASON_LABELS: Record<VaultSnapshotReason, string> = {
  json_import: 'Pre-JSON Import Backup',
  pre_json_import: 'Pre-JSON Import Backup',
  gemini_bridge_apply: 'Pre-Gemini Bridge Apply',
  workspace_architect_apply: 'Pre-Workspace Customizer Apply',
  character_upload: 'Pre-Character Sheet Upload',
  batch_character_upload: 'Pre-Batch Character Upload',
  destructive_delete: 'Pre-Delete Safety Backup',
  session_checkpoint: 'Session Checkpoint',
  manual_checkpoint: 'Manual Safety Snapshot',
  manual: 'Manual Safety Snapshot',
};

export type VaultSnapshotSummary = {
  pcsCount: number;
  npcsCount: number;
  locationsCount: number;
  factionsCount: number;
  questsCount: number;
  sessionLogCount: number;
  itemsCount: number;
};

export type VaultSnapshot = {
  id: string;
  campaignId: string;
  campaignName: string;
  reason: VaultSnapshotReason;
  label: string;
  createdAtMs: number;
  createdAt: number;
  state: Record<string, any>;
  data: Record<string, any>;
  done?: Record<string, boolean>;
  summary: VaultSnapshotSummary;
};

export type CampaignSnapshotRecord = VaultSnapshot;

export type SnapshotCollectionDiff = {
  key: string;
  label: string;
  currentCount: number;
  snapshotCount: number;
  delta: number;
};

export type SnapshotDiffPreview = {
  snapshotId: string;
  campaignId: string;
  createdAtMs: number;
  reason: VaultSnapshotReason;
  label: string;
  collections: SnapshotCollectionDiff[];
  entityCounts: Record<string, { current: number; snapshot: number; delta: number }>;
  changedTopLevelKeys: string[];
  changedKeys: string[];
  hasChanges: boolean;
  summaryText: string;
};

// ---- Pure Ring Buffer Helpers ----------------------------------------------

export function makeSnapshotId(nowMs: number = Date.now()): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `snap_${nowMs}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `snap_${nowMs}_${Math.random().toString(36).slice(2, 10)}`;
}

export function summarizeCampaignState(state: Record<string, any> | null | undefined): VaultSnapshotSummary {
  const s = state && typeof state === 'object' ? state : {};
  const countArr = (k: string) => (Array.isArray(s[k]) ? s[k].length : 0);
  return {
    pcsCount: countArr('pcs') || countArr('characters'),
    npcsCount: countArr('npcs'),
    locationsCount: countArr('locations'),
    factionsCount: countArr('factions'),
    questsCount: countArr('pcGoals') + countArr('__playerCompanionQuests'),
    sessionLogCount: countArr('sessionLogV2') || countArr('sessionLogs') || countArr('playerLog'),
    itemsCount: countArr('items'),
  };
}

function normalizeSnapshotEntry(raw: Partial<VaultSnapshot> & { id: string }): VaultSnapshot {
  const ts =
    typeof raw.createdAtMs === 'number'
      ? raw.createdAtMs
      : typeof raw.createdAt === 'number'
        ? raw.createdAt
        : 0;
  const payloadState =
    raw.state && typeof raw.state === 'object'
      ? raw.state
      : raw.data && typeof raw.data === 'object'
        ? raw.data
        : {};
  const reason: VaultSnapshotReason = raw.reason || 'manual';
  return {
    id: raw.id,
    campaignId: raw.campaignId || 'campaign',
    campaignName: raw.campaignName || 'Campaign',
    reason,
    label: raw.label || VAULT_REASON_LABELS[reason] || 'Snapshot',
    createdAtMs: ts,
    createdAt: ts,
    state: payloadState,
    data: payloadState,
    ...(raw.done ? { done: raw.done } : {}),
    summary: raw.summary || summarizeCampaignState(payloadState),
  };
}

/**
 * Pure ring-buffer rotation: appends `incoming` and retains at most `capacity`
 * (default 7) most recent snapshots ordered newest-first.
 */
export function pushToSnapshotRing(
  existing: ReadonlyArray<Partial<VaultSnapshot> & { id: string }>,
  incoming: Partial<VaultSnapshot> & { id: string },
  capacity: number = SNAPSHOT_VAULT_CAPACITY,
): VaultSnapshot[] {
  const cap = Math.max(1, Math.floor(capacity));
  const normIncoming = normalizeSnapshotEntry(incoming);
  const deduped = existing
    .filter((s) => s.id !== normIncoming.id)
    .map((s) => normalizeSnapshotEntry(s));
  const combined = [normIncoming, ...deduped];
  combined.sort((a, b) => b.createdAtMs - a.createdAtMs);
  return combined.slice(0, cap);
}

/**
 * Computes a human-readable and structured diff between the current live
 * campaign state and a target VaultSnapshot before restoring.
 */
export function computeSnapshotDiff(
  currentState: Record<string, any> | null | undefined,
  snapshot: Partial<VaultSnapshot> & { id: string },
): SnapshotDiffPreview {
  const normSnap = normalizeSnapshotEntry(snapshot);
  const cur = currentState && typeof currentState === 'object' ? currentState : {};
  const snapState = normSnap.state;

  const trackedCollections: ReadonlyArray<{ key: string; label: string }> = [
    { key: 'pcs', label: 'PCs' },
    { key: 'npcs', label: 'NPCs' },
    { key: 'locations', label: 'Locations' },
    { key: 'factions', label: 'Factions' },
    { key: 'items', label: 'Magic Items' },
    { key: 'secrets', label: 'Secrets' },
    { key: 'scenes', label: 'Scenes' },
    { key: 'clocks', label: 'Clocks' },
    { key: 'pcGoals', label: 'Goals / Quests' },
    { key: 'sessionLogV2', label: 'Session Logs' },
    { key: 'playerLog', label: 'Party Narration Feed' },
    { key: 'maps', label: 'Maps' },
  ];

  const collections: SnapshotCollectionDiff[] = [];
  const entityCounts: Record<string, { current: number; snapshot: number; delta: number }> = {};

  for (const { key, label } of trackedCollections) {
    const currentCount = Array.isArray(cur[key]) ? cur[key].length : 0;
    const snapshotCount = Array.isArray(snapState[key]) ? snapState[key].length : 0;
    const delta = snapshotCount - currentCount;
    entityCounts[key] = {
      current: currentCount,
      snapshot: snapshotCount,
      delta,
    };
    if (currentCount !== snapshotCount || currentCount > 0 || snapshotCount > 0) {
      collections.push({
        key,
        label,
        currentCount,
        snapshotCount,
        delta,
      });
    }
  }

  const allKeys = new Set<string>([...Object.keys(cur), ...Object.keys(snapState)]);
  const changedTopLevelKeys: string[] = [];
  for (const k of allKeys) {
    if (k.startsWith('__')) continue;
    if (JSON.stringify(cur[k]) !== JSON.stringify(snapState[k])) {
      changedTopLevelKeys.push(k);
    }
  }

  const deltaParts = collections
    .filter((c) => c.delta !== 0)
    .map((c) => `${c.label}: ${c.currentCount} → ${c.snapshotCount} (${c.delta > 0 ? `+${c.delta}` : c.delta})`);

  const summaryText =
    deltaParts.length > 0
      ? deltaParts.join(' · ')
      : changedTopLevelKeys.length > 0
        ? `${changedTopLevelKeys.length} section${changedTopLevelKeys.length === 1 ? '' : 's'} modified (${changedTopLevelKeys.slice(0, 4).join(', ')})`
        : 'No structural differences from current state';

  return {
    snapshotId: normSnap.id,
    campaignId: normSnap.campaignId,
    createdAtMs: normSnap.createdAtMs,
    reason: normSnap.reason,
    label: normSnap.label,
    collections,
    entityCounts,
    changedTopLevelKeys,
    changedKeys: changedTopLevelKeys,
    hasChanges: changedTopLevelKeys.length > 0,
    summaryText,
  };
}

// ---- Storage Engine (In-Memory + localStorage + IndexedDB) -----------------

const IDB_NAME = 'gmAssistant_snapshotVault_v1';
const IDB_STORE = 'vault_rings';
const LS_PREFIX = 'gmAssistant:snapshotVault:';

const memoryVault = new Map<string, VaultSnapshot[]>();

function openVaultIdb(): Promise<IDBDatabase | null> {
  if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function writeRingToIdb(campaignId: string, ring: VaultSnapshot[]): Promise<void> {
  const db = await openVaultIdb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(ring, campaignId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function readRingFromIdb(campaignId: string): Promise<VaultSnapshot[] | null> {
  const db = await openVaultIdb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(campaignId);
      req.onsuccess = () => {
        if (Array.isArray(req.result)) {
          resolve((req.result as any[]).map((s) => normalizeSnapshotEntry(s)));
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

function readRingFromLocalStorage(campaignId: string): VaultSnapshot[] | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${LS_PREFIX}${campaignId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((s) => normalizeSnapshotEntry(s)) : null;
  } catch {
    return null;
  }
}

function writeRingToLocalStorage(campaignId: string, ring: VaultSnapshot[]): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  try {
    window.localStorage.setItem(`${LS_PREFIX}${campaignId}`, JSON.stringify(ring));
  } catch {
    /* ignore quota errors; IndexedDB + memory still hold the ring */
  }
}

/**
 * Synchronously read the current 7-snapshot ring for `campaignId` from memory
 * or localStorage.
 */
export function getVaultSnapshotsSync(campaignId: string): VaultSnapshot[] {
  const mem = memoryVault.get(campaignId);
  if (mem) return [...mem];
  const ls = readRingFromLocalStorage(campaignId);
  if (ls) {
    const capped = ls.slice(0, SNAPSHOT_VAULT_CAPACITY);
    memoryVault.set(campaignId, capped);
    return [...capped];
  }
  return [];
}

/**
 * Asynchronously load the 7-snapshot ring for `campaignId`, hydrating from
 * IndexedDB when available.
 */
export async function loadVaultSnapshots(campaignId: string): Promise<VaultSnapshot[]> {
  const idb = await readRingFromIdb(campaignId);
  const sync = getVaultSnapshotsSync(campaignId);
  if (idb && idb.length > 0) {
    let merged: VaultSnapshot[] = [];
    for (const snap of [...idb, ...sync]) {
      merged = pushToSnapshotRing(merged, snap, SNAPSHOT_VAULT_CAPACITY);
    }
    memoryVault.set(campaignId, merged);
    return [...merged];
  }
  return sync;
}

/**
 * Capture a new snapshot into the 7-snapshot rolling safety vault for `campaignId`.
 */
export function captureVaultSnapshot(args: {
  campaignId: string;
  campaignName?: string;
  reason: VaultSnapshotReason;
  label?: string;
  state?: Record<string, any>;
  data?: Record<string, any>;
  done?: Record<string, boolean>;
  nowMs?: number;
  now?: number;
  id?: string;
}): VaultSnapshot {
  const nowMs = args.nowMs ?? args.now ?? Date.now();
  const rawState = args.state ?? args.data ?? {};
  const clonedState = structuredClone(rawState);
  const clonedDone = args.done ? structuredClone(args.done) : undefined;
  const snapshot: VaultSnapshot = {
    id: args.id || makeSnapshotId(nowMs),
    campaignId: args.campaignId,
    campaignName: args.campaignName || 'Campaign',
    reason: args.reason,
    label: args.label?.trim() || VAULT_REASON_LABELS[args.reason] || 'Safety Snapshot',
    createdAtMs: nowMs,
    createdAt: nowMs,
    state: clonedState,
    data: clonedState,
    ...(clonedDone ? { done: clonedDone } : {}),
    summary: summarizeCampaignState(clonedState),
  };

  const existing = getVaultSnapshotsSync(args.campaignId);
  const nextRing = pushToSnapshotRing(existing, snapshot, SNAPSHOT_VAULT_CAPACITY);
  memoryVault.set(args.campaignId, nextRing);
  writeRingToLocalStorage(args.campaignId, nextRing);
  void writeRingToIdb(args.campaignId, nextRing);
  return snapshot;
}

/**
 * Restore a snapshot by ID from the campaign's rolling vault. Returns a deep
 * clone of the restored snapshot and its diff against `currentState`.
 */
export function restoreVaultSnapshot(
  campaignId: string,
  snapshotId: string,
  currentState?: Record<string, any>,
): {
  snapshot: VaultSnapshot;
  restoredState: Record<string, any>;
  data: Record<string, any>;
  restoredDone?: Record<string, boolean>;
  diff: SnapshotDiffPreview;
} | null {
  const ring = getVaultSnapshotsSync(campaignId);
  const found = ring.find((s) => s.id === snapshotId);
  if (!found) return null;
  const restoredState = structuredClone(found.state);
  const restoredDone = found.done ? structuredClone(found.done) : undefined;
  const diff = computeSnapshotDiff(currentState ?? {}, found);
  return {
    snapshot: found,
    restoredState,
    data: restoredState,
    restoredDone,
    diff,
  };
}

export function clearVaultSnapshotsForTest(campaignId?: string): void {
  if (campaignId) {
    memoryVault.delete(campaignId);
    if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
      try {
        window.localStorage.removeItem(`${LS_PREFIX}${campaignId}`);
      } catch {
        /* ignore */
      }
    }
  } else {
    memoryVault.clear();
  }
}

export const clearVaultSnapshots = clearVaultSnapshotsForTest;

// ---- Multi-Monitor Cross-Tab Live Sync (`BroadcastChannel`) ----------------

export type LiveSyncMapPing = {
  id: string;
  pcId: string;
  x: number;
  y: number;
  color: string;
  label?: string;
  timestamp: number;
};

export type LiveSyncMessage =
  | {
      type: 'state_patch';
      campaignId: string;
      senderId: string;
      timestamp: number;
      state: Record<string, any>;
      name?: string;
      done?: Record<string, boolean>;
      playMode?: 'solo' | 'duet' | 'standard' | 'player';
    }
  | {
      type: 'yjs_update';
      campaignId: string;
      senderId: string;
      timestamp: number;
      update: number[];
    }
  | {
      type: 'theme_switch';
      senderId: string;
      timestamp: number;
      theme: string;
    }
  | {
      type: 'map_ping';
      campaignId: string;
      senderId: string;
      timestamp: number;
      ping: LiveSyncMapPing;
    };

export type LiveSyncBridgeOptions = {
  campaignId?: string;
  senderId?: string;
  onStatePatch?: (msg: Extract<LiveSyncMessage, { type: 'state_patch' }>) => void;
  onYjsUpdate?: (update: Uint8Array, msg: Extract<LiveSyncMessage, { type: 'yjs_update' }>) => void;
  onThemeSwitch?: (theme: string, msg: Extract<LiveSyncMessage, { type: 'theme_switch' }>) => void;
  onMapPing?: (ping: LiveSyncMapPing, msg: Extract<LiveSyncMessage, { type: 'map_ping' }>) => void;
};

export type LiveSyncGenericMessage = {
  type: string;
  campaignId?: string;
  senderId?: string;
  timestamp?: number;
  payload?: Record<string, any>;
  [key: string]: any;
};

export type LiveSyncBridge = {
  postStatePatch: (payload: {
    state: Record<string, any>;
    name?: string;
    done?: Record<string, boolean>;
    playMode?: 'solo' | 'duet' | 'standard' | 'player';
  }) => void;
  postYjsUpdate: (update: Uint8Array) => void;
  postThemeSwitch: (theme: string) => void;
  postMapPing: (ping: LiveSyncMapPing) => void;
  subscribe: (cb: (msg: LiveSyncGenericMessage) => void) => () => void;
  publish: (msg: LiveSyncGenericMessage) => void;
  close: () => void;
};

const inProcessListeners = new Set<(msg: any) => void>();

export function createLiveSyncBridge(rawOpts?: LiveSyncBridgeOptions): LiveSyncBridge {
  const opts: Required<Pick<LiveSyncBridgeOptions, 'campaignId' | 'senderId'>> & LiveSyncBridgeOptions = {
    campaignId: rawOpts?.campaignId || 'default',
    senderId: rawOpts?.senderId || makeSnapshotId(),
    ...rawOpts,
  };
  let channel: BroadcastChannel | null = null;
  let closed = false;
  const localSubscribers = new Set<(msg: LiveSyncGenericMessage) => void>();

  const handleIncoming = (raw: unknown) => {
    if (closed || !raw || typeof raw !== 'object') return;
    const msg = raw as LiveSyncMessage & LiveSyncGenericMessage;
    if (msg.senderId && msg.senderId === opts.senderId) return;

    for (const sub of localSubscribers) {
      try {
        sub(msg);
      } catch {
        /* ignore */
      }
    }

    if (msg.type === 'state_patch' && msg.campaignId === opts.campaignId) {
      opts.onStatePatch?.(msg as Extract<LiveSyncMessage, { type: 'state_patch' }>);
    } else if (msg.type === 'yjs_update' && msg.campaignId === opts.campaignId) {
      if (Array.isArray(msg.update)) {
        opts.onYjsUpdate?.(new Uint8Array(msg.update), msg as Extract<LiveSyncMessage, { type: 'yjs_update' }>);
      }
    } else if (msg.type === 'theme_switch') {
      opts.onThemeSwitch?.(msg.theme, msg as Extract<LiveSyncMessage, { type: 'theme_switch' }>);
    } else if (msg.type === 'map_ping' && msg.campaignId === opts.campaignId) {
      opts.onMapPing?.(msg.ping, msg as Extract<LiveSyncMessage, { type: 'map_ping' }>);
    }
  };

  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(LIVE_SYNC_CHANNEL_NAME);
      channel.onmessage = (ev: MessageEvent) => {
        handleIncoming(ev.data);
      };
    } catch {
      channel = null;
    }
  }

  inProcessListeners.add(handleIncoming);

  const broadcast = (msg: any) => {
    if (closed) return;
    if (channel) {
      try {
        channel.postMessage(msg);
      } catch {
        /* ignore */
      }
    }
    for (const listener of inProcessListeners) {
      if (listener !== handleIncoming) {
        try {
          listener(msg);
        } catch {
          /* ignore */
        }
      }
    }
  };

  return {
    postStatePatch(payload) {
      broadcast({
        type: 'state_patch',
        campaignId: opts.campaignId,
        senderId: opts.senderId,
        timestamp: Date.now(),
        state: payload.state,
        name: payload.name,
        done: payload.done,
        playMode: payload.playMode,
      });
    },
    postYjsUpdate(update: Uint8Array) {
      broadcast({
        type: 'yjs_update',
        campaignId: opts.campaignId,
        senderId: opts.senderId,
        timestamp: Date.now(),
        update: Array.from(update),
      });
    },
    postThemeSwitch(theme: string) {
      broadcast({
        type: 'theme_switch',
        senderId: opts.senderId,
        timestamp: Date.now(),
        theme,
      });
    },
    postMapPing(ping: LiveSyncMapPing) {
      broadcast({
        type: 'map_ping',
        campaignId: opts.campaignId,
        senderId: opts.senderId,
        timestamp: Date.now(),
        ping,
      });
    },
    subscribe(cb: (msg: LiveSyncGenericMessage) => void) {
      localSubscribers.add(cb);
      return () => {
        localSubscribers.delete(cb);
      };
    },
    publish(msg: LiveSyncGenericMessage) {
      broadcast({
        ...msg,
        senderId: msg.senderId || opts.senderId,
        timestamp: msg.timestamp ?? Date.now(),
      });
    },
    close() {
      closed = true;
      localSubscribers.clear();
      inProcessListeners.delete(handleIncoming);
      if (channel) {
        try {
          channel.close();
        } catch {
          /* ignore */
        }
        channel = null;
      }
    },
  };
}
