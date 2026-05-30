/**
 * @file reconciler.ts
 * @description Real-time reconciliation engine that merges player-initiated PC state modifications
 * into the campaign's PC list.
 *
 * Players write to `campaigns/{id}/pcWritebacks/{slotId}` via the Web SDK
 * (firestore.rules validates the shareToken capability). This module runs in
 * the GM's browser. On each change, it merges the staged updates into the
 * local React PC array via the `onPcsUpdate` callback — that triggers the
 * existing CRDT-aware autosave path in `CampaignEditor`, which routes the
 * write through the Y.Doc rather than writing `data.pcs` directly. Once the
 * change is in local state, the writeback doc is deleted as cleanup. We
 * re-validate each field with `validatePlayerField` as defense in depth.
 */

import { collection, onSnapshot, writeBatch } from 'firebase/firestore';
import { getDb } from '@/lib/firebase/client';
import { type PlayerCharacter } from '@/lib/pc/types';
import { mergePcWritebacks, type StagedWriteback } from '@/lib/crdt/writeback-merge';

/**
 * Initializes a real-time Firestore listener on the `pcWritebacks` subcollection.
 * Listens for modifications staged by players and reconciles them into the master PC records.
 * 
 * @param campaignId The unique ID of the active campaign
 * @param getCurrentPcs Getter function retrieving the current list of PC states from React state
 * @param onPcsUpdate Callback triggered to update the local React state immediately (optimistic UI)
 * @param onError Optional error handler callback (used for retry backoff on permission errors)
 * @returns {Unsubscribe} The unsubscription function to cleanly detach the real-time listener
 */
export function startWritebackReconciler(
  campaignId: string,
  getCurrentPcs: () => PlayerCharacter[],
  onPcsUpdate: (nextPcs: PlayerCharacter[]) => void,
  onError?: (err: Error) => void
) {
  const db = getDb();
  const writebacksCol = collection(db, 'campaigns', campaignId, 'pcWritebacks');

  // Establish real-time Firestore snapshot listener on the staged writebacks collection
  return onSnapshot(
    writebacksCol,
    async (snap) => {
      // Exit early if there are no pending writebacks to reconcile
      if (snap.empty) return;

      // Collect EVERY pending writeback and resolve them in a single
      // deterministic pass (lib/crdt/writeback-merge). Doing this per-doc with a
      // fresh read was the old lost-update bug: two near-simultaneous events
      // each read a stale snapshot and the second clobbered the first. The
      // authored merge also enforces the ownership guard (a slot may only edit
      // its own PC) and the field-authority policy (player-editable fields win;
      // everything else is GM-owned and dropped) — neither of which Firestore
      // rules can express.
      const staged: StagedWriteback[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          slotId: typeof data.slotId === 'string' ? data.slotId : d.id,
          pcId: data.pcId,
          updates: data.updates || {},
          updatedAtMs: typeof data.updatedAt === 'number' ? data.updatedAt : 0,
        };
      });

      const result = mergePcWritebacks(getCurrentPcs(), staged);

      for (const r of result.rejected) {
        console.warn('Rejecting player writeback', { ...r });
      }

      if (result.changed) {
        // Local React state update — feeds the existing debounced autosave
        // which routes through the Y.Doc / CRDT update log. We deliberately do
        // NOT write `data.pcs` to Firestore here; campaign content is owned by
        // the Y.Doc per CLAUDE.md.
        onPcsUpdate(result.pcs);
      }

      // Delete the staged writebacks now that they've been folded into local
      // state (or rejected). Batch so multi-slot cleanup commits atomically.
      const batch = writeBatch(db);
      for (const changeDoc of snap.docs) batch.delete(changeDoc.ref);
      try {
        await batch.commit();
      } catch (err) {
        console.error('Failed to clean up player writebacks:', err);
      }
    },
    onError
  );
}
