import { collection, doc, onSnapshot, writeBatch, serverTimestamp } from 'firebase/firestore';
import { getDb } from '@/lib/firebase/client';
import { type PlayerCharacter } from '@/lib/pc/types';

// Simple helper to set nested fields without mutating the original object
function setNestedField(pc: PlayerCharacter, fieldPath: string, value: any): PlayerCharacter {
  const next = { ...pc };
  const parts = fieldPath.split('.');
  let cur: any = next;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    cur[part] = Array.isArray(cur[part]) ? [...cur[part]] : { ...cur[part] };
    cur = cur[part];
  }

  cur[parts[parts.length - 1]] = value;
  return next;
}

export function startWritebackReconciler(
  campaignId: string,
  getCurrentPcs: () => PlayerCharacter[],
  onPcsUpdate: (nextPcs: PlayerCharacter[]) => void,
  onError?: (err: Error) => void
) {
  const db = getDb();
  const writebacksCol = collection(db, 'campaigns', campaignId, 'pcWritebacks');

  return onSnapshot(
    writebacksCol,
    async (snap) => {
      if (snap.empty) return;

      const currentPcs = getCurrentPcs();
      let updatedPcs = [...currentPcs];
      let changed = false;
      const batch = writeBatch(db);

      for (const changeDoc of snap.docs) {
        const data = changeDoc.data();
        const pcId = data.pcId;
        const updates = data.updates || {};

        const pcIndex = updatedPcs.findIndex((p) => p.id === pcId);
        if (pcIndex !== -1) {
          let pc = updatedPcs[pcIndex];
          for (const [field, value] of Object.entries(updates)) {
            pc = setNestedField(pc, field, value);
            changed = true;
          }
          updatedPcs[pcIndex] = pc;
        }

        // Add deletion of this writeback doc to the batch
        batch.delete(changeDoc.ref);
      }

      if (changed) {
        try {
          // Apply local state update first for immediate response
          onPcsUpdate(updatedPcs);

          // Update the main campaign doc
          const campaignRef = doc(db, 'campaigns', campaignId);
          batch.update(campaignRef, {
            'data.pcs': updatedPcs,
            updatedAt: serverTimestamp(),
          });

          // Commit batch (updates campaign and deletes reconciled writebacks in one transaction)
          await batch.commit();
        } catch (err) {
          console.error('Failed to reconcile player writebacks:', err);
        }
      }
    },
    onError
  );
}
