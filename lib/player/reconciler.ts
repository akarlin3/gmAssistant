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
import { validatePlayerField } from '@/lib/player/allowlist';
import { type PlayerCharacter } from '@/lib/pc/types';

/**
 * Utility helper to safely set a deeply-nested property value inside a PC object.
 * Adheres strictly to immutable state patterns. It shallow-clones the parent object and
 * each sequential nested dictionary/array down the path to avoid direct state mutation,
 * ensuring React re-renders are triggered correctly.
 * 
 * @param pc The target PlayerCharacter object to clone and modify
 * @param fieldPath The dot-separated nested path (e.g., 'hp.current', 'deathSaves.successes')
 * @param value The value to apply at the target path
 * @returns {PlayerCharacter} A deeply copied, updated copy of the PlayerCharacter object
 */
function setNestedField(pc: PlayerCharacter, fieldPath: string, value: any): PlayerCharacter {
  const next = { ...pc };
  const parts = fieldPath.split('.');
  let cur: any = next;

  // Traverse the path, cloning each intermediate nested layer to preserve immutability
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    cur[part] = Array.isArray(cur[part]) ? [...cur[part]] : { ...cur[part] };
    cur = cur[part];
  }

  // Set the final value on the deep path target
  cur[parts[parts.length - 1]] = value;
  return next;
}

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

      const currentPcs = getCurrentPcs();
      let updatedPcs = [...currentPcs];
      let changed = false;

      // Batch the writeback deletions so cleanup of multiple slots commits atomically.
      const batch = writeBatch(db);

      // Loop through all pending writeback snapshots
      for (const changeDoc of snap.docs) {
        const data = changeDoc.data();
        const pcId = data.pcId;
        const updates = data.updates || {};

        // Locate the target character in our array
        const pcIndex = updatedPcs.findIndex((p) => p.id === pcId);
        if (pcIndex !== -1) {
          let pc = updatedPcs[pcIndex];

          // Apply each field update staged by the player. Re-validate against
          // the allowlist as defense in depth — firestore.rules already locks
          // the keys, but value-type ranges aren't expressible there.
          for (const [field, value] of Object.entries(updates)) {
            if (!validatePlayerField(field, value)) {
              console.warn('Rejecting player writeback with invalid field/value', { field });
              continue;
            }
            pc = setNestedField(pc, field, value);
            changed = true;
          }
          updatedPcs[pcIndex] = pc;
        }

        // Delete the staged writeback once we've copied its contents into
        // local state. The CRDT-aware autosave path in CampaignEditor (driven
        // by the setState below) is responsible for persisting the change —
        // we deliberately do NOT write `data.pcs` to Firestore here, since
        // campaign content is owned by the Y.Doc per CLAUDE.md.
        batch.delete(changeDoc.ref);
      }

      if (changed) {
        // Local React state update — feeds the existing debounced autosave
        // which routes through the Y.Doc / CRDT update log.
        onPcsUpdate(updatedPcs);
      }

      try {
        await batch.commit();
      } catch (err) {
        console.error('Failed to clean up player writebacks:', err);
      }
    },
    onError
  );
}
