'use client';

// Real-time player-side reads. Unauthenticated; relies on the public-read rule
// for playerShares. Returns Firestore unsubscribe functions.

import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getDb } from '@/lib/firebase/client';
import { validatePlayerField } from '@/lib/player/allowlist';
import type { ShareMeta, SlotProjection } from './types';

export function subscribeShareMeta(
  token: string,
  onUpdate: (meta: ShareMeta | null) => void,
  onError?: (e: Error) => void,
) {
  // Gracefully handle short/invalid share tokens to prevent unauthorized Firestore reads
  // from triggering 'permission-denied' uncaught console errors.
  if (!token || token.length < 20) {
    setTimeout(() => onUpdate(null), 0);
    return () => {};
  }
  return onSnapshot(
    doc(getDb(), 'playerShares', token),
    (snap) => onUpdate(snap.exists() ? (snap.data() as ShareMeta) : null),
    onError,
  );
}

// Stage a player-initiated PC sheet edit. The unauthenticated player writes
// directly to campaigns/{campaignId}/pcWritebacks/{slotId}; firestore.rules
// validates the shareToken capability and locks the doc shape. The GM's
// writeback reconciler picks the doc up, merges the change into the campaign
// CRDT state, and deletes it. We use merge:true so multiple field updates
// across separate calls coalesce into a single staged doc.
export async function submitPlayerUpdate(opts: {
  campaignId: string;
  shareToken: string;
  slotId: string;
  pcId: string;
  field: string;
  value: unknown;
}): Promise<void> {
  if (!validatePlayerField(opts.field, opts.value)) {
    throw new Error(`Invalid field update: ${opts.field}`);
  }
  await setDoc(
    doc(getDb(), 'campaigns', opts.campaignId, 'pcWritebacks', opts.slotId),
    {
      shareToken: opts.shareToken,
      pcId: opts.pcId,
      slotId: opts.slotId,
      updates: { [opts.field]: opts.value },
      updatedAt: Date.now(),
    },
    { merge: true },
  );
}

export function subscribeSlotProjection(
  token: string,
  slotId: string,
  onUpdate: (proj: SlotProjection | null) => void,
  onError?: (e: Error) => void,
) {
  // Gracefully handle short/invalid share tokens to prevent unauthorized Firestore reads
  // from triggering 'permission-denied' uncaught console errors.
  if (!token || token.length < 20) {
    setTimeout(() => onUpdate(null), 0);
    return () => {};
  }
  return onSnapshot(
    doc(getDb(), 'playerShares', token, 'slots', slotId),
    (snap) => onUpdate(snap.exists() ? (snap.data() as SlotProjection) : null),
    onError,
  );
}
