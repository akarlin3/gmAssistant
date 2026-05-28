/**
 * @file reconciler.ts
 * @description Real-time reconciliation engine that merges player-initiated PC state modifications
 * back into the master campaign document.
 * 
 * Since unauthenticated player clients cannot write directly to the master campaign document (which
 * is protected by strict ownership rules), they instead stage their changes in the `pcWritebacks` subcollection.
 * 
 * This module runs within the authenticated GM's browser workspace. It listens to additions in the
 * `pcWritebacks` subcollection, performs an immutable merge of the new values into the campaign's `pcs` array,
 * and commits the merged result back to Firestore while atomically pruning the staged writebacks in a single
 * transactional write batch.
 */

import { collection, doc, onSnapshot, writeBatch, serverTimestamp } from 'firebase/firestore';
import { getDb } from '@/lib/firebase/client';
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
      
      // Initialize an atomic write batch to ensure consistency.
      // All reconciliations and deletions MUST succeed or fail as a single unit.
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
          
          // Apply each field update staged by the player
          for (const [field, value] of Object.entries(updates)) {
            pc = setNestedField(pc, field, value);
            changed = true;
          }
          updatedPcs[pcIndex] = pc;
        }

        // Critically, we delete the staged writeback doc within the same batch.
        // This acts as our lock: once successfully written to the campaign doc,
        // the writeback is removed so it won't be processed again on subsequent snapshots.
        batch.delete(changeDoc.ref);
      }

      // If state changes occurred, write them back to Firestore
      if (changed) {
        try {
          // 1. Trigger optimistic local React state update first for ultra-fast table rendering
          onPcsUpdate(updatedPcs);

          // 2. Queue the update on the main campaign document
          const campaignRef = doc(db, 'campaigns', campaignId);
          batch.update(campaignRef, {
            'data.pcs': updatedPcs,
            updatedAt: serverTimestamp(),
          });

          // 3. Commit the transaction atomically
          await batch.commit();
        } catch (err) {
          console.error('Failed to reconcile player writebacks:', err);
        }
      }
    },
    onError
  );
}
