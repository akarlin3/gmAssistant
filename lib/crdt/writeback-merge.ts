/**
 * Authored, domain-specific merge for player PC write-backs.
 *
 * ## Why this exists (the gap Yjs does not close)
 *
 * Campaign content is a per-campaign Y.Doc (lib/crdt/). Yjs merges *generic*
 * concurrent edits beautifully — but it has no concept of *who* made an edit or
 * *whether they were allowed to*. Two situations the campaign domain cares about
 * that Yjs cannot resolve correctly on its own:
 *
 *   1. **Authority on a contested field.** During live play a player tracks
 *      their own HP / conditions / death-saves while the GM may also be editing
 *      the same sheet. Yjs would resolve a concurrent write by opaque CRDT
 *      tie-break (client id / sequence), which is arbitrary. The *domain* rule
 *      is: for the player-editable fields (lib/player/allowlist.ts), the
 *      character's player is the source of truth; for every other field the GM
 *      is. We encode that as an explicit field-authority policy below.
 *
 *   2. **Ownership / authorization.** A player client is unauthenticated — it
 *      holds only a share token and writes to pcWritebacks/{slotId}. The
 *      Firestore rule proves the *slot* is real but does NOT prove the targeted
 *      `pcId` belongs to that slot. Without this guard, slot A could stage a
 *      writeback referencing slot B's PC and the reconciler would apply it —
 *      one player editing another's character. This is also a redaction-boundary
 *      concern: writebacks must only ever touch the writer's own owned PC, never
 *      cross into another slot's data. We enforce ownership here, fail-closed.
 *
 * Plus a correctness bug this fixes incidentally: the previous reconciler did a
 * stale-snapshot read-modify-write per Firestore change event, so two writebacks
 * landing close together could lose one (last snapshot wins). This merge takes
 * *all* pending writebacks at once and resolves them deterministically (LWW by
 * timestamp, tie-broken by slotId), so the result is independent of arrival
 * order.
 *
 * This module is pure (no Firestore, no React) so it is unit-testable with
 * crafted concurrent scenarios and reusable by the redaction property suite to
 * prove the merge never moves data across the visibility boundary.
 */

import { validatePlayerField, PLAYER_EDITABLE_FIELDS } from '@/lib/player/allowlist';
import {
  buildAnonymousTablePauseSignal,
  sanitizeOutboundWritebackUpdates,
} from '@/lib/playerMode/playerTrackerStorage';
import type { PlayerCharacter, PlayerWritebackTombstone, TablePauseSignal } from '@/lib/pc/types';

const PLAYER_AUTHORITATIVE = new Set<string>(PLAYER_EDITABLE_FIELDS);

/** One staged writeback doc (campaigns/{id}/pcWritebacks/{slotId}). */
export type StagedWriteback = {
  /** The roster slot that staged this writeback (the doc id). */
  slotId: string;
  /** The PC the writeback targets (empty/anonymous when emitting a table_pause_requested signal). */
  pcId: string;
  /** field-path -> proposed value. */
  updates: Record<string, unknown>;
  /** Client wall-clock at stage time; the LWW key for concurrent resolution. */
  updatedAtMs: number;
};

export type RejectReason =
  | 'pc-not-found'
  | 'not-owner'
  | 'field-not-allowed'
  | 'invalid-value'
  | 'superseded';

export type RejectedField = {
  slotId: string;
  pcId: string;
  field: string;
  reason: RejectReason;
};

export type AppliedField = {
  slotId: string;
  pcId: string;
  field: string;
};

export type WritebackMergeResult = {
  /** The reconciled PC list. Referentially unchanged when nothing applied. */
  pcs: PlayerCharacter[];
  changed: boolean;
  applied: AppliedField[];
  rejected: RejectedField[];
  /** Anonymous X-Card / Table Pause signal extracted from writebacks (zero sender identity). */
  pauseSignal?: TablePauseSignal;
};

/** True when the slot is the player-owner of this PC (fail-closed). */
function ownsPc(pc: PlayerCharacter, slotId: string): boolean {
  const o = pc.ownership;
  return !!o && o.ownerType === 'player' && o.playerSlotId === slotId;
}

/**
 * Immutably set a dot-path field on a PC, shallow-cloning each layer on the way
 * down so React reference-equality checks fire correctly.
 */
function setNestedField(pc: PlayerCharacter, fieldPath: string, value: unknown): PlayerCharacter {
  const next: any = { ...pc };
  const parts = fieldPath.split('.');
  let cur: any = next;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    cur[part] = Array.isArray(cur[part]) ? [...cur[part]] : { ...(cur[part] ?? {}) };
    cur = cur[part];
  }
  cur[parts[parts.length - 1]] = value;
  return next;
}

/**
 * Apply tombstones to remove any previously-shared quest, annotation, or journal
 * entry that the player subsequently toggled back to private (`sharedWithGm: false`).
 */
function applyTombstonesToPc(
  pc: PlayerCharacter,
  tombstones: PlayerWritebackTombstone[],
): PlayerCharacter {
  if (!Array.isArray(tombstones) || tombstones.length === 0) return pc;
  const questIds = new Set<string>();
  const annotationIds = new Set<string>();
  const journalIds = new Set<string>();
  const allIds = new Set<string>();

  for (const t of tombstones) {
    if (!t || typeof t.id !== 'string') continue;
    allIds.add(t.id);
    if (t.kind === 'quest') questIds.add(t.id);
    else if (t.kind === 'annotation') annotationIds.add(t.id);
    else if (t.kind === 'journal') journalIds.add(t.id);
  }

  const next: PlayerCharacter = { ...pc };
  if (Array.isArray(next.sharedQuests)) {
    next.sharedQuests = next.sharedQuests.filter(
      (q) => !questIds.has(q.id) && !allIds.has(q.id) && q.sharedWithGm === true,
    );
  }
  if (Array.isArray(next.sharedAnnotations)) {
    next.sharedAnnotations = next.sharedAnnotations.filter(
      (a) => !annotationIds.has(a.id) && !allIds.has(a.id) && a.sharedWithGm === true,
    );
  }
  if (Array.isArray(next.sharedJournal)) {
    next.sharedJournal = next.sharedJournal.filter(
      (j) => !journalIds.has(j.id) && !allIds.has(j.id) && j.sharedWithGm === true,
    );
  }
  return next;
}

/**
 * The chosen value for one (pcId, field) after concurrent resolution, plus the
 * losers (for telemetry).
 */
type FieldWinner = { wb: StagedWriteback; value: unknown };

/**
 * Merge all pending player writebacks into the current authoritative PC list,
 * applying the field-authority + ownership policy described in the file header.
 *
 * @param currentPcs The current (GM-merged, Y.Doc-derived) PC array.
 * @param writebacks All pending staged writebacks, in any order.
 */
export function mergePcWritebacks(
  currentPcs: PlayerCharacter[],
  writebacks: StagedWriteback[],
): WritebackMergeResult {
  const applied: AppliedField[] = [];
  const rejected: RejectedField[] = [];
  let pauseSignal: TablePauseSignal | undefined;

  const pcById = new Map<string, number>();
  currentPcs.forEach((pc, i) => pcById.set(pc.id, i));

  // Resolve concurrent writes per (pcId, field): keep the value with the
  // highest updatedAtMs, tie-broken by slotId (lexicographic) for total
  // determinism regardless of arrival order. Earlier candidates that lose are
  // recorded as 'superseded'.
  const winners = new Map<string, FieldWinner>(); // key = `${pcId} ${field}`

  for (const wb of writebacks) {
    // Check for anonymous table_pause_requested signal BEFORE PC ownership check,
    // because anonymous safety signals deliberately strip pcId / sender identity.
    const rawPause = wb.updates?.tablePauseSignal;
    if (
      rawPause &&
      typeof rawPause === 'object' &&
      (rawPause as any).type === 'table_pause_requested'
    ) {
      const cleanSignal = buildAnonymousTablePauseSignal(rawPause, wb.updatedAtMs);
      if (!pauseSignal || cleanSignal.timestamp >= pauseSignal.timestamp) {
        pauseSignal = cleanSignal;
      }
    }

    const remainingEntries = Object.entries(wb.updates ?? {}).filter(
      ([field]) => field !== 'tablePauseSignal',
    );
    if (remainingEntries.length === 0) {
      continue;
    }

    const idx = pcById.get(wb.pcId);
    if (idx === undefined) {
      for (const [field] of remainingEntries) {
        rejected.push({ slotId: wb.slotId, pcId: wb.pcId, field, reason: 'pc-not-found' });
      }
      continue;
    }
    const pc = currentPcs[idx];

    // Ownership guard — the security fix. A writeback may only touch the PC its
    // staging slot owns.
    if (!ownsPc(pc, wb.slotId)) {
      for (const [field] of remainingEntries) {
        rejected.push({ slotId: wb.slotId, pcId: wb.pcId, field, reason: 'not-owner' });
      }
      continue;
    }

    for (const [field, rawValue] of remainingEntries) {
      if (!PLAYER_AUTHORITATIVE.has(field)) {
        rejected.push({ slotId: wb.slotId, pcId: wb.pcId, field, reason: 'field-not-allowed' });
        continue;
      }
      if (!validatePlayerField(field, rawValue)) {
        rejected.push({ slotId: wb.slotId, pcId: wb.pcId, field, reason: 'invalid-value' });
        continue;
      }
      // Enforce Player -> GM privacy boundary at merge time as well: strip any
      // quest, annotation, journal entry, or inventory item where sharedWithGm !== true.
      const value = sanitizeOutboundWritebackUpdates({ [field]: rawValue })[field];

      const key = `${wb.pcId} ${field}`;
      const prior = winners.get(key);
      if (!prior || isNewer(wb, prior.wb)) {
        if (prior) {
          rejected.push({ slotId: prior.wb.slotId, pcId: wb.pcId, field, reason: 'superseded' });
        }
        winners.set(key, { wb, value });
      } else {
        rejected.push({ slotId: wb.slotId, pcId: wb.pcId, field, reason: 'superseded' });
      }
    }
  }

  if (winners.size === 0) {
    return {
      pcs: currentPcs,
      changed: false,
      applied,
      rejected,
      ...(pauseSignal ? { pauseSignal } : {}),
    };
  }

  // Apply non-tombstone winners first, then apply tombstones so any item toggled
  // back to private is guaranteed to be removed from the GM's PC state.
  const nextByIdx = new Map<number, PlayerCharacter>();
  const pendingTombstones = new Map<number, { wb: StagedWriteback; tombstones: PlayerWritebackTombstone[] }>();

  for (const [key, { wb, value }] of winners) {
    const field = key.slice(key.indexOf(' ') + 1);
    const idx = pcById.get(wb.pcId)!;
    if (field === 'sharedTombstones') {
      pendingTombstones.set(idx, { wb, tombstones: value as PlayerWritebackTombstone[] });
      continue;
    }
    const base = nextByIdx.get(idx) ?? currentPcs[idx];
    nextByIdx.set(idx, setNestedField(base, field, value));
    applied.push({ slotId: wb.slotId, pcId: wb.pcId, field });
  }

  for (const [idx, { wb, tombstones }] of pendingTombstones) {
    const base = nextByIdx.get(idx) ?? currentPcs[idx];
    nextByIdx.set(idx, applyTombstonesToPc(base, tombstones));
    applied.push({ slotId: wb.slotId, pcId: wb.pcId, field: 'sharedTombstones' });
  }

  const pcs = currentPcs.map((pc, i) => nextByIdx.get(i) ?? pc);
  return {
    pcs,
    changed: true,
    applied,
    rejected,
    ...(pauseSignal ? { pauseSignal } : {}),
  };
}

/** a strictly newer than b: later timestamp, or equal timestamp + higher slotId. */
function isNewer(a: StagedWriteback, b: StagedWriteback): boolean {
  if (a.updatedAtMs !== b.updatedAtMs) return a.updatedAtMs > b.updatedAtMs;
  return a.slotId > b.slotId;
}
