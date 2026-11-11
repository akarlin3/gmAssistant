// Local `customization_history` Ring Buffer (`lib/customization/history.ts`)
//
// Maintains a bounded ring buffer of the last 10 applied state mutations in
// local storage (with Node/SSR memory fallback) so any conversational tweak
// can be undone with a single click or an "undo last change" prompt.

import {
  deepCloneJson,
  type JsonPatchOp,
  type KeyValueDiffEntry,
} from './jsonPatch';

export const CUSTOMIZATION_HISTORY_STORAGE_KEY = 'customization_history' as const;
export const MAX_CUSTOMIZATION_HISTORY = 10 as const;

export interface CustomizationHistoryEntry<TState = Record<string, unknown>> {
  id: string;
  timestampMs: number;
  scopeKey: string;
  directive: string;
  summary: string;
  /** Forward RFC 6902 patch that produced `afterState` from `beforeState`. */
  jsonPatch: JsonPatchOp[];
  /** Inverse RFC 6902 patch that deterministically restores `beforeState`. */
  inverseJsonPatch: JsonPatchOp[];
  /** Human-readable `[previous_value -> proposed_value]` diff summary. */
  keyValueDiff: KeyValueDiffEntry[];
  /** Snapshot prior to applying this mutation. */
  beforeState: TState;
  /** Snapshot immediately after applying this mutation. */
  afterState: TState;
  /** Optional UI/HUD/PC auxiliary snapshots for full table customizer rollback. */
  auxiliaryUndo?: Record<string, unknown>;
}

const memoryRingBuffers = new Map<string, CustomizationHistoryEntry[]>();

function storageKeyForScope(scopeKey?: string): string {
  if (!scopeKey || scopeKey === 'default') {
    return CUSTOMIZATION_HISTORY_STORAGE_KEY;
  }
  return `${CUSTOMIZATION_HISTORY_STORAGE_KEY}:${scopeKey}`;
}

function readStorageJson(key: string): CustomizationHistoryEntry[] | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.slice(-MAX_CUSTOMIZATION_HISTORY);
      }
    }
  } catch {
    // Fallback to memory store
  }
  return null;
}

function writeStorageJson(key: string, entries: CustomizationHistoryEntry[]): void {
  const bounded = entries.slice(-MAX_CUSTOMIZATION_HISTORY);
  memoryRingBuffers.set(key, deepCloneJson(bounded));
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const serialized = JSON.stringify(bounded);
      window.localStorage.setItem(key, serialized);
      // Mirror active ring buffer onto canonical `customization_history` key as well
      if (key !== CUSTOMIZATION_HISTORY_STORAGE_KEY) {
        window.localStorage.setItem(CUSTOMIZATION_HISTORY_STORAGE_KEY, serialized);
        memoryRingBuffers.set(
          CUSTOMIZATION_HISTORY_STORAGE_KEY,
          deepCloneJson(bounded),
        );
      }
    } else if (key !== CUSTOMIZATION_HISTORY_STORAGE_KEY) {
      memoryRingBuffers.set(CUSTOMIZATION_HISTORY_STORAGE_KEY, deepCloneJson(bounded));
    }
  } catch {
    // Ignore storage quota errors in restricted sandboxes
  }
}

/**
 * Loads the current `customization_history` ring buffer (oldest -> newest, max 10).
 */
export function loadCustomizationHistory<TState = Record<string, unknown>>(
  scopeKey?: string,
): CustomizationHistoryEntry<TState>[] {
  const key = storageKeyForScope(scopeKey);
  const fromDisk = readStorageJson(key);
  if (fromDisk) {
    memoryRingBuffers.set(key, deepCloneJson(fromDisk));
    return deepCloneJson(fromDisk) as CustomizationHistoryEntry<TState>[];
  }
  const fromMem = memoryRingBuffers.get(key);
  return fromMem
    ? (deepCloneJson(fromMem.slice(-MAX_CUSTOMIZATION_HISTORY)) as CustomizationHistoryEntry<TState>[])
    : [];
}

/**
 * Appends a state mutation to the `customization_history` ring buffer,
 * evicting the oldest mutation once capacity exceeds 10 entries.
 */
export function pushCustomizationHistory<TState = Record<string, unknown>>(
  entry: Omit<CustomizationHistoryEntry<TState>, 'id' | 'timestampMs' | 'scopeKey'> & {
    id?: string;
    timestampMs?: number;
    scopeKey?: string;
  },
  scopeKey?: string,
): CustomizationHistoryEntry<TState>[] {
  const resolvedScope = entry.scopeKey ?? scopeKey ?? 'default';
  const key = storageKeyForScope(resolvedScope);
  const current = loadCustomizationHistory<TState>(resolvedScope);

  const normalized: CustomizationHistoryEntry<TState> = {
    id:
      entry.id ||
      `cust_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    timestampMs: entry.timestampMs ?? Date.now(),
    scopeKey: resolvedScope,
    directive: entry.directive,
    summary: entry.summary,
    jsonPatch: deepCloneJson(entry.jsonPatch),
    inverseJsonPatch: deepCloneJson(entry.inverseJsonPatch),
    keyValueDiff: deepCloneJson(entry.keyValueDiff),
    beforeState: deepCloneJson(entry.beforeState),
    afterState: deepCloneJson(entry.afterState),
    ...(entry.auxiliaryUndo
      ? { auxiliaryUndo: deepCloneJson(entry.auxiliaryUndo) }
      : {}),
  };

  const next = [...current, normalized].slice(-MAX_CUSTOMIZATION_HISTORY);
  writeStorageJson(key, next as CustomizationHistoryEntry[]);
  return next;
}

/**
 * Peeks at the most recent mutation in the `customization_history` ring buffer without removing it.
 */
export function peekLatestCustomizationHistory<TState = Record<string, unknown>>(
  scopeKey?: string,
): CustomizationHistoryEntry<TState> | null {
  const current = loadCustomizationHistory<TState>(scopeKey);
  return current.length > 0 ? current[current.length - 1] : null;
}

/**
 * Pops and returns the most recent mutation from the `customization_history` ring buffer.
 */
export function popCustomizationHistory<TState = Record<string, unknown>>(
  scopeKey?: string,
): {
  popped: CustomizationHistoryEntry<TState> | null;
  remaining: CustomizationHistoryEntry<TState>[];
} {
  const resolvedScope = scopeKey ?? 'default';
  const key = storageKeyForScope(resolvedScope);
  const current = loadCustomizationHistory<TState>(resolvedScope);
  if (current.length === 0) {
    return { popped: null, remaining: [] };
  }
  const popped = current[current.length - 1];
  const remaining = current.slice(0, -1);
  writeStorageJson(key, remaining as CustomizationHistoryEntry[]);
  return { popped, remaining };
}

/**
 * Removes a specific entry (and any newer dependent entries if `cascadeNewer` is true,
 * or just the entry when reverting to a checkpoint) from the ring buffer.
 */
export function removeCustomizationHistoryFromId<TState = Record<string, unknown>>(
  entryId: string,
  scopeKey?: string,
): {
  target: CustomizationHistoryEntry<TState> | null;
  remaining: CustomizationHistoryEntry<TState>[];
} {
  const resolvedScope = scopeKey ?? 'default';
  const key = storageKeyForScope(resolvedScope);
  const current = loadCustomizationHistory<TState>(resolvedScope);
  const idx = current.findIndex((e) => e.id === entryId);
  if (idx < 0) {
    return { target: null, remaining: current };
  }
  const target = current[idx];
  const remaining = current.slice(0, idx);
  writeStorageJson(key, remaining as CustomizationHistoryEntry[]);
  return { target, remaining };
}

/**
 * Clears the `customization_history` ring buffer for a scope (or all scopes when omitted).
 */
export function clearCustomizationHistory(scopeKey?: string): void {
  if (!scopeKey) {
    memoryRingBuffers.clear();
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const toRemove: string[] = [];
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (
            k === CUSTOMIZATION_HISTORY_STORAGE_KEY ||
            k?.startsWith(`${CUSTOMIZATION_HISTORY_STORAGE_KEY}:`)
          ) {
            toRemove.push(k);
          }
        }
        for (const k of toRemove) window.localStorage.removeItem(k);
      }
    } catch {
      // ignore
    }
    return;
  }

  const key = storageKeyForScope(scopeKey);
  memoryRingBuffers.delete(key);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // ignore
  }
}

const UNDO_DIRECTIVE_PATTERNS: readonly RegExp[] = [
  /^\s*(?:please\s+)?(?:undo|revert|rollback|roll\s+back)\s*[.!]?\s*$/i,
  /^\s*(?:please\s+)?(?:undo|revert|roll\s*back)\s+(?:my\s+|the\s+)?(?:last|previous|recent|latest|that)\s*(?:change|tweak|mutation|customization|update|edit|setting|action)?\s*[.!]?\s*$/i,
  /^\s*(?:please\s+)?(?:go\s+back|step\s+back)\s+(?:one\s+(?:step|change)|to\s+previous(?:\s+state|\s+config)?)\s*[.!]?\s*$/i,
];

/**
 * Detects whether a user's natural-language prompt is asking to undo/revert
 * the most recent customization mutation.
 */
export function isUndoDirective(directive: string): boolean {
  const trimmed = directive.trim();
  if (!trimmed || trimmed.length > 120) return false;
  return UNDO_DIRECTIVE_PATTERNS.some((rx) => rx.test(trimmed));
}
