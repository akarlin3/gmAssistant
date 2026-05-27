'use client';

// Real-time player-side reads. Unauthenticated; relies on the public-read rule
// for playerShares. Returns Firestore unsubscribe functions.

import { doc, onSnapshot } from 'firebase/firestore';
import { getDb } from '@/lib/firebase/client';
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
