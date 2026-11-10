// Local-first Player Tracker & Adventurer Companion store with strict
// Player -> GM outbound privacy boundary.
//
// All player quests, lore annotations, and session journal entries are 100%
// private/local by default (`sharedWithGm: false`), persisted in both
// localStorage (for synchronous React reads) and IndexedDB (for durable large
// storage) keyed by `playerTracker:${shareToken}:${pcId}`.
//
// The outbound serializer (`serializeOutboundTrackerWriteback` and
// `sanitizeOutboundWritebackUpdates`) strictly filters out any quest,
// annotation, or journal entry where `sharedWithGm !== true` (and strips
// `privateNotes` when `sharedWithGm === false`) so unshared player notes NEVER
// leave the player's device or touch Firestore. When a previously shared item
// is toggled OFF (`sharedWithGm: false`), a tombstone is emitted so the GM's
// reconciled PC removes the item while the player's local copy remains intact.

import { sanitizeRollEventsForOutbound } from '@/lib/diceRoller';
import { makePcId } from '@/lib/pc/factory';
import type {
  AttitudeTag,
  InventoryItem,
  PlayerJournalEntry,
  PlayerLoreAnnotation,
  PlayerQuest,
  PlayerQuestCategory,
  PlayerQuestStatus,
  PlayerStickyCard,
  PlayerTheoryLink,
  PlayerWritebackTombstone,
  RollEvent,
} from '@/lib/pc/types';

export type PlayerTrackerState = {
  quests: PlayerQuest[];
  annotations: PlayerLoreAnnotation[];
  journal: PlayerJournalEntry[];
  theoryLinks?: PlayerTheoryLink[];
  stickyCards?: PlayerStickyCard[];
  nodePositions?: Record<string, { x: number; y: number }>;
  secretRolls?: RollEvent[];
  /** IDs of items that were previously synced with `sharedWithGm: true`. */
  previouslySharedIds?: string[];
  /** Pending tombstones to remove un-shared items from the GM's view. */
  tombstones?: PlayerWritebackTombstone[];
  pendingTombstones?: PlayerWritebackTombstone[];
  updatedAtMs?: number;
  updatedAt?: number;
};

export type PlayerLocalTrackerState = PlayerTrackerState;

export function emptyPlayerTrackerState(): PlayerTrackerState {
  return {
    quests: [],
    annotations: [],
    journal: [],
    theoryLinks: [],
    stickyCards: [],
    nodePositions: {},
    secretRolls: [],
    previouslySharedIds: [],
    tombstones: [],
    pendingTombstones: [],
    updatedAtMs: 0,
    updatedAt: 0,
  };
}

export function trackerStorageKey(shareToken: string, pcId: string): string {
  return `playerTracker:${shareToken || 'standalone'}:${pcId || 'default'}`;
}

// ---- Factory helpers (strictly default to sharedWithGm: false) -------------

export function createPlayerQuest(partial: Partial<PlayerQuest> = {}): PlayerQuest {
  return {
    id: partial.id || makePcId(),
    title: partial.title ?? '',
    status: partial.status ?? 'active',
    notes: partial.notes ?? '',
    linkedEntityIds: Array.isArray(partial.linkedEntityIds) ? [...partial.linkedEntityIds] : [],
    sharedWithGm: partial.sharedWithGm === true,
    ...(partial.category ? { category: partial.category } : {}),
  };
}

export function createPlayerAnnotation(
  partial: Partial<PlayerLoreAnnotation> & { entityId: string },
): PlayerLoreAnnotation {
  return {
    id: partial.id || makePcId(),
    entityId: partial.entityId,
    ...(partial.entityType ? { entityType: partial.entityType } : {}),
    ...(partial.entityName ? { entityName: partial.entityName } : {}),
    ...(partial.attitudeTag ? { attitudeTag: partial.attitudeTag } : {}),
    privateNotes: partial.privateNotes ?? '',
    ...(partial.sharedNotes !== undefined ? { sharedNotes: partial.sharedNotes } : {}),
    sharedWithGm: partial.sharedWithGm === true,
  };
}

export function createPlayerJournalEntry(
  partial: Partial<PlayerJournalEntry> = {},
): PlayerJournalEntry {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: partial.id || makePcId(),
    sessionNumber: typeof partial.sessionNumber === 'number' ? partial.sessionNumber : 1,
    date: partial.date ?? today,
    title: partial.title ?? '',
    content: partial.content ?? '',
    sharedWithGm: partial.sharedWithGm === true,
  };
}

export function createPlayerTheoryLink(
  partial: Partial<PlayerTheoryLink> = {},
): PlayerTheoryLink {
  return {
    id: partial.id || makePcId(),
    sourceId: partial.sourceId ?? '',
    targetId: partial.targetId ?? '',
    label: partial.label ?? '',
    color: partial.color ?? '#f59e0b',
    sharedWithGm: partial.sharedWithGm === true,
    ...(typeof partial.updatedAt === 'number' ? { updatedAt: partial.updatedAt } : {}),
  };
}

export function createPlayerStickyCard(
  partial: Partial<PlayerStickyCard> = {},
): PlayerStickyCard {
  return {
    id: partial.id || makePcId(),
    title: partial.title ?? '',
    content: partial.content ?? '',
    color: partial.color ?? '#fef08a',
    ...(typeof partial.x === 'number' ? { x: partial.x } : {}),
    ...(typeof partial.y === 'number' ? { y: partial.y } : {}),
    ...(typeof partial.linkedEntityId === 'string' && partial.linkedEntityId
      ? { linkedEntityId: partial.linkedEntityId }
      : {}),
    sharedWithGm: partial.sharedWithGm === true,
    ...(typeof partial.updatedAt === 'number' ? { updatedAt: partial.updatedAt } : {}),
  };
}

// ---- Sanitization & Outbound Privacy Boundary ------------------------------

/**
 * Strips `privateNotes` when `sharedWithGm === false` and returns `null` for any
 * annotation where `sharedWithGm !== true`.
 */
export function sanitizeAnnotationForGm(
  annotation: PlayerLoreAnnotation | Record<string, unknown>,
): PlayerLoreAnnotation | null {
  if (!annotation || typeof annotation !== 'object') return null;
  const a = annotation as PlayerLoreAnnotation;
  if (a.sharedWithGm !== true) {
    // Explicitly strip privateNotes and drop unshared annotations
    const stripped = { ...a };
    delete (stripped as Partial<PlayerLoreAnnotation>).privateNotes;
    return null;
  }
  const tag = a.attitudeTag;
  const validTag: AttitudeTag | undefined =
    tag === 'friendly' || tag === 'neutral' || tag === 'suspicious' || tag === 'hostile'
      ? tag
      : undefined;
  return {
    id: String(a.id || makePcId()),
    entityId: String(a.entityId || ''),
    ...(a.entityType ? { entityType: String(a.entityType) } : {}),
    ...(a.entityName ? { entityName: String(a.entityName) } : {}),
    ...(validTag ? { attitudeTag: validTag } : {}),
    privateNotes: typeof a.privateNotes === 'string' ? a.privateNotes : '',
    sharedNotes:
      typeof a.sharedNotes === 'string' && a.sharedNotes.length > 0
        ? a.sharedNotes
        : typeof a.privateNotes === 'string'
          ? a.privateNotes
          : '',
    sharedWithGm: true,
  };
}

export function sanitizeQuestForGm(
  quest: PlayerQuest | Record<string, unknown>,
): PlayerQuest | null {
  if (!quest || typeof quest !== 'object') return null;
  const q = quest as PlayerQuest;
  if (q.sharedWithGm !== true) return null;
  const status: PlayerQuestStatus =
    q.status === 'active' || q.status === 'completed' || q.status === 'failed'
      ? q.status
      : 'active';
  const category: PlayerQuestCategory | undefined =
    q.category === 'quest' || q.category === 'goal' || q.category === 'rumor' || q.category === 'mystery'
      ? q.category
      : undefined;
  return {
    id: String(q.id || makePcId()),
    title: typeof q.title === 'string' ? q.title : '',
    status,
    notes: typeof q.notes === 'string' ? q.notes : '',
    linkedEntityIds: Array.isArray(q.linkedEntityIds)
      ? q.linkedEntityIds.filter((x): x is string => typeof x === 'string')
      : [],
    sharedWithGm: true,
    ...(category ? { category } : {}),
  };
}

export function sanitizeJournalEntryForGm(
  entry: PlayerJournalEntry | Record<string, unknown>,
): PlayerJournalEntry | null {
  if (!entry || typeof entry !== 'object') return null;
  const j = entry as PlayerJournalEntry;
  if (j.sharedWithGm !== true) return null;
  return {
    id: String(j.id || makePcId()),
    sessionNumber: typeof j.sessionNumber === 'number' ? j.sessionNumber : 1,
    date: typeof j.date === 'string' ? j.date : '',
    title: typeof j.title === 'string' ? j.title : '',
    content: typeof j.content === 'string' ? j.content : '',
    sharedWithGm: true,
  };
}

export function sanitizeTheoryLinkForGm(
  link: PlayerTheoryLink | Record<string, unknown>,
): PlayerTheoryLink | null {
  if (!link || typeof link !== 'object') return null;
  const l = link as PlayerTheoryLink;
  if (l.sharedWithGm !== true) return null;
  return {
    id: String(l.id || makePcId()),
    sourceId: typeof l.sourceId === 'string' ? l.sourceId : '',
    targetId: typeof l.targetId === 'string' ? l.targetId : '',
    label: typeof l.label === 'string' ? l.label : '',
    color: typeof l.color === 'string' && l.color ? l.color : '#f59e0b',
    sharedWithGm: true,
    ...(typeof l.updatedAt === 'number' ? { updatedAt: l.updatedAt } : {}),
  };
}

export function sanitizeStickyCardForGm(
  card: PlayerStickyCard | Record<string, unknown>,
): PlayerStickyCard | null {
  if (!card || typeof card !== 'object') return null;
  const c = card as PlayerStickyCard;
  if (c.sharedWithGm !== true) return null;
  return {
    id: String(c.id || makePcId()),
    title: typeof c.title === 'string' ? c.title : '',
    content: typeof c.content === 'string' ? c.content : '',
    color: typeof c.color === 'string' && c.color ? c.color : '#fef08a',
    ...(typeof c.x === 'number' && Number.isFinite(c.x) ? { x: c.x } : {}),
    ...(typeof c.y === 'number' && Number.isFinite(c.y) ? { y: c.y } : {}),
    ...(typeof c.linkedEntityId === 'string' && c.linkedEntityId
      ? { linkedEntityId: c.linkedEntityId }
      : {}),
    sharedWithGm: true,
    ...(typeof c.updatedAt === 'number' ? { updatedAt: c.updatedAt } : {}),
  };
}

export function sanitizeInventoryForGm(
  items: ReadonlyArray<InventoryItem | Record<string, unknown>>,
): InventoryItem[] {
  if (!Array.isArray(items)) return [];
  const out: InventoryItem[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const it = raw as InventoryItem;
    // If a player explicitly marked an inventory item `sharedWithGm: false`, exclude it.
    if (it.sharedWithGm === false) continue;
    out.push({
      id: String(it.id || makePcId()),
      name: typeof it.name === 'string' ? it.name : '',
      qty: typeof it.qty === 'number' ? Math.max(0, Math.round(it.qty)) : 1,
      ...(typeof it.weight === 'number' ? { weight: it.weight } : {}),
      ...(typeof it.description === 'string' ? { description: it.description } : {}),
      equipped: it.equipped === true,
      ...(typeof it.attuned === 'boolean' ? { attuned: it.attuned } : {}),
      ...(typeof it.notes === 'string' ? { notes: it.notes } : {}),
      ...(typeof it.sharedWithGm === 'boolean' ? { sharedWithGm: it.sharedWithGm } : {}),
    });
  }
  return out;
}

/**
 * Compute state transition between previous tracker state and next tracker state,
 * automatically recording tombstones for any previously shared item that was
 * toggled to `sharedWithGm: false` or removed.
 */
export function reconcileTrackerSharingTransition(
  prev: PlayerTrackerState,
  next: Omit<PlayerTrackerState, 'previouslySharedIds' | 'tombstones' | 'updatedAtMs'> & {
    previouslySharedIds?: string[];
    tombstones?: PlayerWritebackTombstone[];
    pendingTombstones?: PlayerWritebackTombstone[];
  },
  nowMs: number = Date.now(),
): PlayerTrackerState {
  const prevTheoryLinks = prev.theoryLinks ?? [];
  const prevStickyCards = prev.stickyCards ?? [];
  const nextTheoryLinks = next.theoryLinks ?? prevTheoryLinks;
  const nextStickyCards = next.stickyCards ?? prevStickyCards;

  const prevShared = new Set<string>(prev.previouslySharedIds ?? []);
  for (const q of prev.quests) if (q.sharedWithGm === true) prevShared.add(q.id);
  for (const a of prev.annotations) if (a.sharedWithGm === true) prevShared.add(a.id);
  for (const j of prev.journal) if (j.sharedWithGm === true) prevShared.add(j.id);
  for (const l of prevTheoryLinks) if (l.sharedWithGm === true) prevShared.add(l.id);
  for (const c of prevStickyCards) if (c.sharedWithGm === true) prevShared.add(c.id);

  const currentShared = new Set<string>();
  const kindById = new Map<string, PlayerWritebackTombstone['kind']>();

  for (const q of prev.quests) kindById.set(q.id, 'quest');
  for (const a of prev.annotations) kindById.set(a.id, 'annotation');
  for (const j of prev.journal) kindById.set(j.id, 'journal');
  for (const l of prevTheoryLinks) kindById.set(l.id, 'theoryLink');
  for (const c of prevStickyCards) kindById.set(c.id, 'stickyCard');

  for (const q of next.quests) {
    kindById.set(q.id, 'quest');
    if (q.sharedWithGm === true) currentShared.add(q.id);
  }
  for (const a of next.annotations) {
    kindById.set(a.id, 'annotation');
    if (a.sharedWithGm === true) currentShared.add(a.id);
  }
  for (const j of next.journal) {
    kindById.set(j.id, 'journal');
    if (j.sharedWithGm === true) currentShared.add(j.id);
  }
  for (const l of nextTheoryLinks) {
    kindById.set(l.id, 'theoryLink');
    if (l.sharedWithGm === true) currentShared.add(l.id);
  }
  for (const c of nextStickyCards) {
    kindById.set(c.id, 'stickyCard');
    if (c.sharedWithGm === true) currentShared.add(c.id);
  }

  const tombstoneMap = new Map<string, PlayerWritebackTombstone>();
  for (const t of prev.tombstones ?? prev.pendingTombstones ?? []) {
    if (!currentShared.has(t.id)) tombstoneMap.set(t.id, t);
  }
  for (const t of next.tombstones ?? next.pendingTombstones ?? []) {
    if (!currentShared.has(t.id)) tombstoneMap.set(t.id, t);
  }

  for (const id of prevShared) {
    if (!currentShared.has(id)) {
      tombstoneMap.set(id, {
        id,
        kind: kindById.get(id) ?? 'quest',
        removedAtMs: nowMs,
      });
    }
  }

  const tombstonesList = Array.from(tombstoneMap.values());
  return {
    quests: next.quests.map((q) => ({ ...q, sharedWithGm: q.sharedWithGm === true })),
    annotations: next.annotations.map((a) => ({ ...a, sharedWithGm: a.sharedWithGm === true })),
    journal: next.journal.map((j) => ({ ...j, sharedWithGm: j.sharedWithGm === true })),
    theoryLinks: nextTheoryLinks.map((l) => ({ ...l, sharedWithGm: l.sharedWithGm === true })),
    stickyCards: nextStickyCards.map((c) => ({ ...c, sharedWithGm: c.sharedWithGm === true })),
    nodePositions: next.nodePositions ?? prev.nodePositions ?? {},
    secretRolls: next.secretRolls ?? prev.secretRolls ?? [],
    previouslySharedIds: Array.from(currentShared),
    tombstones: tombstonesList,
    pendingTombstones: tombstonesList,
    updatedAtMs: nowMs,
    updatedAt: nowMs,
  };
}

/**
 * Serializes a player's local tracker state into the outbound `pcWritebacks`
 * `updates` payload.
 *
 * SECURITY BOUNDARY (Player -> GM Privacy):
 * - Strictly filters out any quest, annotation, journal entry, theory link, or
 *   sticky card where `sharedWithGm !== true`.
 * - Strips `privateNotes` when `sharedWithGm === false`.
 * - Emits tombstones (`sharedTombstones`) for any item that was previously shared
 *   and then toggled OFF (`sharedWithGm: false`), containing only opaque item IDs.
 */
export function serializeOutboundTrackerWriteback(
  state: Pick<PlayerTrackerState, 'quests' | 'annotations' | 'journal'> & {
    theoryLinks?: PlayerTheoryLink[];
    stickyCards?: PlayerStickyCard[];
    tombstones?: PlayerWritebackTombstone[];
    pendingTombstones?: PlayerWritebackTombstone[];
  },
): {
  sharedQuests: PlayerQuest[];
  sharedAnnotations: PlayerLoreAnnotation[];
  sharedJournal: PlayerJournalEntry[];
  sharedTheoryLinks: PlayerTheoryLink[];
  sharedStickyCards: PlayerStickyCard[];
  sharedTombstones: PlayerWritebackTombstone[];
} {
  const sharedQuests: PlayerQuest[] = [];
  for (const q of state.quests ?? []) {
    const clean = sanitizeQuestForGm(q);
    if (clean) sharedQuests.push(clean);
  }

  const sharedAnnotations: PlayerLoreAnnotation[] = [];
  for (const a of state.annotations ?? []) {
    const clean = sanitizeAnnotationForGm(a);
    if (clean) sharedAnnotations.push(clean);
  }

  const sharedJournal: PlayerJournalEntry[] = [];
  for (const j of state.journal ?? []) {
    const clean = sanitizeJournalEntryForGm(j);
    if (clean) sharedJournal.push(clean);
  }

  const sharedTheoryLinks: PlayerTheoryLink[] = [];
  for (const l of state.theoryLinks ?? []) {
    const clean = sanitizeTheoryLinkForGm(l);
    if (clean) sharedTheoryLinks.push(clean);
  }

  const sharedStickyCards: PlayerStickyCard[] = [];
  for (const c of state.stickyCards ?? []) {
    const clean = sanitizeStickyCardForGm(c);
    if (clean) sharedStickyCards.push(clean);
  }

  const activeSharedIds = new Set<string>([
    ...sharedQuests.map((q) => q.id),
    ...sharedAnnotations.map((a) => a.id),
    ...sharedJournal.map((j) => j.id),
    ...sharedTheoryLinks.map((l) => l.id),
    ...sharedStickyCards.map((c) => c.id),
  ]);

  const rawTombstones = state.tombstones ?? state.pendingTombstones ?? [];
  const sharedTombstones: PlayerWritebackTombstone[] = rawTombstones
    .filter((t) => t && typeof t.id === 'string' && !activeSharedIds.has(t.id))
    .map((t) => ({
      id: t.id,
      kind:
        t.kind === 'annotation' ||
        t.kind === 'journal' ||
        t.kind === 'theoryLink' ||
        t.kind === 'stickyCard'
          ? t.kind
          : 'quest',
      removedAtMs: typeof t.removedAtMs === 'number' ? t.removedAtMs : Date.now(),
    }));

  return {
    sharedQuests,
    sharedAnnotations,
    sharedJournal,
    sharedTheoryLinks,
    sharedStickyCards,
    sharedTombstones,
  };
}

/**
 * Sanitizes an arbitrary outbound `updates` map before staging to `pcWritebacks`
 * or applying in `mergePcWritebacks`. Guarantees that even if a caller passes
 * unfiltered arrays into `sharedQuests`, `sharedAnnotations`, `sharedJournal`,
 * `sharedTheoryLinks`, `sharedStickyCards`, `rollEvents`, or `inventory`, any
 * item with `sharedWithGm === false` or `secretRoll === true` is stripped before
 * leaving the client or merging into CRDT state.
 */
export function sanitizeOutboundWritebackUpdates(
  updates: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(updates)) {
    // Strictly block any local-only tracker fields if passed directly
    if (
      field === 'secretRolls' ||
      field === 'nodePositions' ||
      field === 'privateNotes' ||
      field === 'gmSecrets' ||
      field === 'gmNotes'
    ) {
      continue;
    }
    if (field === 'sharedQuests' && Array.isArray(value)) {
      out[field] = value
        .map((q) => sanitizeQuestForGm(q))
        .filter((q): q is PlayerQuest => q !== null);
    } else if (field === 'sharedAnnotations' && Array.isArray(value)) {
      out[field] = value
        .map((a) => sanitizeAnnotationForGm(a))
        .filter((a): a is PlayerLoreAnnotation => a !== null);
    } else if (field === 'sharedJournal' && Array.isArray(value)) {
      out[field] = value
        .map((j) => sanitizeJournalEntryForGm(j))
        .filter((j): j is PlayerJournalEntry => j !== null);
    } else if (field === 'sharedTheoryLinks' && Array.isArray(value)) {
      out[field] = value
        .map((l) => sanitizeTheoryLinkForGm(l))
        .filter((l): l is PlayerTheoryLink => l !== null);
    } else if (field === 'sharedStickyCards' && Array.isArray(value)) {
      out[field] = value
        .map((c) => sanitizeStickyCardForGm(c))
        .filter((c): c is PlayerStickyCard => c !== null);
    } else if (field === 'rollEvents' && Array.isArray(value)) {
      out[field] = sanitizeRollEventsForOutbound(value as RollEvent[]);
    } else if (field === 'inventory' && Array.isArray(value)) {
      out[field] = sanitizeInventoryForGm(value);
    } else {
      out[field] = value;
    }
  }
  return out;
}

// ---- Toggle helpers --------------------------------------------------------

export function toggleQuestShareWithGm(
  state: PlayerTrackerState,
  questId: string,
  sharedWithGm?: boolean,
  nowMs: number = Date.now(),
): PlayerTrackerState {
  const nextQuests = state.quests.map((q) =>
    q.id === questId
      ? { ...q, sharedWithGm: sharedWithGm !== undefined ? sharedWithGm : !q.sharedWithGm }
      : q,
  );
  return reconcileTrackerSharingTransition(
    state,
    { ...state, quests: nextQuests },
    nowMs,
  );
}

export function toggleAllQuestsShareWithGm(
  state: PlayerTrackerState,
  sharedWithGm: boolean,
  nowMs: number = Date.now(),
): PlayerTrackerState {
  const nextQuests = state.quests.map((q) => ({ ...q, sharedWithGm }));
  return reconcileTrackerSharingTransition(
    state,
    { ...state, quests: nextQuests },
    nowMs,
  );
}

export function toggleAnnotationShareWithGm(
  state: PlayerTrackerState,
  entityId: string,
  sharedWithGm?: boolean,
  nowMs: number = Date.now(),
): PlayerTrackerState {
  const nextAnnotations = state.annotations.map((a) =>
    a.entityId === entityId
      ? { ...a, sharedWithGm: sharedWithGm !== undefined ? sharedWithGm : !a.sharedWithGm }
      : a,
  );
  return reconcileTrackerSharingTransition(
    state,
    { ...state, annotations: nextAnnotations },
    nowMs,
  );
}

export function toggleJournalShareWithGm(
  state: PlayerTrackerState,
  entryId: string,
  sharedWithGm?: boolean,
  nowMs: number = Date.now(),
): PlayerTrackerState {
  const nextJournal = state.journal.map((j) =>
    j.id === entryId
      ? { ...j, sharedWithGm: sharedWithGm !== undefined ? sharedWithGm : !j.sharedWithGm }
      : j,
  );
  return reconcileTrackerSharingTransition(
    state,
    { ...state, journal: nextJournal },
    nowMs,
  );
}

export function toggleTheoryLinkShareWithGm(
  state: PlayerTrackerState,
  linkId: string,
  sharedWithGm?: boolean,
  nowMs: number = Date.now(),
): PlayerTrackerState {
  const nextTheoryLinks = (state.theoryLinks ?? []).map((l) =>
    l.id === linkId
      ? { ...l, sharedWithGm: sharedWithGm !== undefined ? sharedWithGm : !l.sharedWithGm }
      : l,
  );
  return reconcileTrackerSharingTransition(
    state,
    { ...state, theoryLinks: nextTheoryLinks },
    nowMs,
  );
}

export function toggleStickyCardShareWithGm(
  state: PlayerTrackerState,
  cardId: string,
  sharedWithGm?: boolean,
  nowMs: number = Date.now(),
): PlayerTrackerState {
  const nextStickyCards = (state.stickyCards ?? []).map((c) =>
    c.id === cardId
      ? { ...c, sharedWithGm: sharedWithGm !== undefined ? sharedWithGm : !c.sharedWithGm }
      : c,
  );
  return reconcileTrackerSharingTransition(
    state,
    { ...state, stickyCards: nextStickyCards },
    nowMs,
  );
}

// ---- LocalStorage + IndexedDB Persistence ----------------------------------

const IDB_NAME = 'gmAssistant_playerTracker_v1';
const IDB_STORE = 'trackers';

function openTrackerIdb(): Promise<IDBDatabase | null> {
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

async function writeTrackerIdb(key: string, state: PlayerTrackerState): Promise<void> {
  const db = await openTrackerIdb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(state, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export async function loadPlayerTrackerIdb(
  shareToken: string,
  pcId: string,
): Promise<PlayerTrackerState | null> {
  const db = await openTrackerIdb();
  if (!db) return null;
  const key = trackerStorageKey(shareToken, pcId);
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => {
        if (req.result && typeof req.result === 'object') {
          resolve(normalizeTrackerState(req.result));
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

export function normalizeTrackerState(raw: unknown): PlayerTrackerState {
  if (!raw || typeof raw !== 'object') return emptyPlayerTrackerState();
  const o = raw as Record<string, unknown>;
  const quests = Array.isArray(o.quests)
    ? o.quests.map((q) => createPlayerQuest(q as Partial<PlayerQuest>))
    : [];
  const annotations = Array.isArray(o.annotations)
    ? o.annotations
        .filter((a) => a && typeof a === 'object' && typeof (a as any).entityId === 'string')
        .map((a) => createPlayerAnnotation(a as Partial<PlayerLoreAnnotation> & { entityId: string }))
    : [];
  const journal = Array.isArray(o.journal)
    ? o.journal.map((j) => createPlayerJournalEntry(j as Partial<PlayerJournalEntry>))
    : [];
  const theoryLinks = Array.isArray(o.theoryLinks)
    ? o.theoryLinks
        .filter((l) => l && typeof l === 'object')
        .map((l) => createPlayerTheoryLink(l as Partial<PlayerTheoryLink>))
    : [];
  const stickyCards = Array.isArray(o.stickyCards)
    ? o.stickyCards
        .filter((c) => c && typeof c === 'object')
        .map((c) => createPlayerStickyCard(c as Partial<PlayerStickyCard>))
    : [];
  const nodePositions: Record<string, { x: number; y: number }> = {};
  if (o.nodePositions && typeof o.nodePositions === 'object') {
    for (const [k, v] of Object.entries(o.nodePositions as Record<string, unknown>)) {
      if (v && typeof v === 'object') {
        const pt = v as Record<string, unknown>;
        if (typeof pt.x === 'number' && typeof pt.y === 'number' && Number.isFinite(pt.x) && Number.isFinite(pt.y)) {
          nodePositions[k] = { x: pt.x, y: pt.y };
        }
      }
    }
  }
  const secretRolls: RollEvent[] = Array.isArray(o.secretRolls)
    ? (o.secretRolls as RollEvent[]).filter((r) => r && typeof r === 'object' && typeof r.id === 'string').slice(-50)
    : [];
  const previouslySharedIds = Array.isArray(o.previouslySharedIds)
    ? o.previouslySharedIds.filter((x): x is string => typeof x === 'string')
    : [];
  const tombstones = Array.isArray(o.tombstones)
    ? o.tombstones
        .filter((t) => t && typeof t === 'object' && typeof (t as any).id === 'string')
        .map((t: any) => ({
          id: String(t.id),
          kind: (t.kind === 'annotation' ||
          t.kind === 'journal' ||
          t.kind === 'theoryLink' ||
          t.kind === 'stickyCard'
            ? t.kind
            : 'quest') as PlayerWritebackTombstone['kind'],
          removedAtMs: typeof t.removedAtMs === 'number' ? t.removedAtMs : 0,
        }))
    : [];
  return {
    quests,
    annotations,
    journal,
    theoryLinks,
    stickyCards,
    nodePositions,
    secretRolls,
    previouslySharedIds,
    tombstones,
    pendingTombstones: tombstones,
    updatedAtMs: typeof o.updatedAtMs === 'number' ? o.updatedAtMs : 0,
    updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : 0,
  };
}

export function loadPlayerTracker(shareToken: string, pcId: string): PlayerTrackerState {
  if (typeof window === 'undefined') return emptyPlayerTrackerState();
  try {
    const raw = window.localStorage.getItem(trackerStorageKey(shareToken, pcId));
    if (!raw) return emptyPlayerTrackerState();
    return normalizeTrackerState(JSON.parse(raw));
  } catch {
    return emptyPlayerTrackerState();
  }
}

export function savePlayerTracker(
  shareToken: string,
  pcId: string,
  state: PlayerTrackerState,
): void {
  const key = trackerStorageKey(shareToken, pcId);
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* localStorage full or unavailable */
    }
    void writeTrackerIdb(key, state);
  }
}

export const loadLocalTrackerState = loadPlayerTracker;
export const saveLocalTrackerState = savePlayerTracker;

export async function loadLocalTrackerStateIdb(
  shareToken: string,
  pcId: string,
): Promise<PlayerTrackerState> {
  const res = await loadPlayerTrackerIdb(shareToken, pcId);
  return res ?? emptyPlayerTrackerState();
}

export function upsertAnnotation(
  state: PlayerTrackerState,
  data: {
    entityId: string;
    entityName?: string;
    entityCategory?: string;
    entityType?: string;
    attitudeTag?: AttitudeTag;
    privateNotes: string;
    sharedNotes?: string;
    sharedWithGm?: boolean;
  },
  nowMs: number = Date.now(),
): PlayerTrackerState {
  const existingIdx = state.annotations.findIndex((a) => a.entityId === data.entityId);
  let nextAnnotations: PlayerLoreAnnotation[];
  if (existingIdx >= 0) {
    const prev = state.annotations[existingIdx];
    const updated: PlayerLoreAnnotation = {
      ...prev,
      ...(data.entityName !== undefined ? { entityName: data.entityName } : {}),
      ...(data.entityCategory !== undefined ? { entityType: data.entityCategory } : {}),
      ...(data.entityType !== undefined ? { entityType: data.entityType } : {}),
      ...(data.attitudeTag !== undefined ? { attitudeTag: data.attitudeTag } : {}),
      privateNotes: data.privateNotes,
      ...(data.sharedNotes !== undefined ? { sharedNotes: data.sharedNotes } : {}),
      sharedWithGm: data.sharedWithGm !== undefined ? data.sharedWithGm : prev.sharedWithGm,
    };
    nextAnnotations = state.annotations.map((a, i) => (i === existingIdx ? updated : a));
  } else {
    const created = createPlayerAnnotation({
      entityId: data.entityId,
      entityName: data.entityName,
      entityType: data.entityType ?? data.entityCategory,
      attitudeTag: data.attitudeTag,
      privateNotes: data.privateNotes,
      sharedNotes: data.sharedNotes,
      sharedWithGm: data.sharedWithGm === true,
    });
    nextAnnotations = [...state.annotations, created];
  }
  return reconcileTrackerSharingTransition(
    state,
    { ...state, annotations: nextAnnotations },
    nowMs,
  );
}

