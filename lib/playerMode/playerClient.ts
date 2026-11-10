'use client';

// Real-time player-side reads. Unauthenticated; relies on the public-read rule
// for playerShares. Returns Firestore unsubscribe functions.

import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { getDb } from '@/lib/firebase/client';
import { validatePlayerField } from '@/lib/player/allowlist';
import {
  sanitizeOutboundWritebackUpdates,
  serializeAnonymousPauseWriteback,
} from './playerTrackerStorage';
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
//
// All updates pass through `sanitizeOutboundWritebackUpdates` before leaving
// the browser so unshared quests, annotations, and journal entries (where
// sharedWithGm !== true) NEVER leave the player's device or touch Firestore.
export async function submitPlayerUpdate(opts: {
  campaignId: string;
  shareToken: string;
  slotId: string;
  pcId: string;
  field: string;
  value: unknown;
}): Promise<void> {
  const sanitized = sanitizeOutboundWritebackUpdates({ [opts.field]: opts.value });
  const sanitizedValue = sanitized[opts.field];
  if (!validatePlayerField(opts.field, sanitizedValue)) {
    throw new Error(`Invalid field update: ${opts.field}`);
  }
  await setDoc(
    doc(getDb(), 'campaigns', opts.campaignId, 'pcWritebacks', opts.slotId),
    {
      shareToken: opts.shareToken,
      pcId: opts.pcId,
      slotId: opts.slotId,
      updates: { [opts.field]: sanitizedValue },
      updatedAt: Date.now(),
    },
    { merge: true },
  );
}

export async function submitPlayerBatchUpdate(opts: {
  campaignId: string;
  shareToken: string;
  slotId: string;
  pcId: string;
  updates: Record<string, unknown>;
}): Promise<void> {
  const sanitized = sanitizeOutboundWritebackUpdates(opts.updates);
  const validatedUpdates: Record<string, unknown> = {};
  for (const [field, val] of Object.entries(sanitized)) {
    if (!validatePlayerField(field, val)) {
      throw new Error(`Invalid field update in batch: ${field}`);
    }
    validatedUpdates[field] = val;
  }
  if (Object.keys(validatedUpdates).length === 0) return;
  await setDoc(
    doc(getDb(), 'campaigns', opts.campaignId, 'pcWritebacks', opts.slotId),
    {
      shareToken: opts.shareToken,
      pcId: opts.pcId,
      slotId: opts.slotId,
      updates: validatedUpdates,
      updatedAt: Date.now(),
    },
    { merge: true },
  );
}

/**
 * Emits an anonymous `{ type: 'table_pause_requested', timestamp }` signal via `pcWritebacks`.
 * Deliberately strips `pcId` and all sender identity from the payload so the GM sees
 * an immediate, respectful pause request without attributing it to a specific PC.
 */
export async function submitAnonymousTablePauseSignal(opts: {
  campaignId: string;
  shareToken: string;
  slotId?: string;
  timestamp?: number;
}): Promise<{ type: 'table_pause_requested'; timestamp: number }> {
  const payload = serializeAnonymousPauseWriteback({ timestamp: opts.timestamp });
  const docId = opts.slotId || 'anonymous_pause';
  await setDoc(
    doc(getDb(), 'campaigns', opts.campaignId, 'pcWritebacks', docId),
    {
      shareToken: opts.shareToken,
      pcId: '',
      slotId: docId,
      updates: payload.updates,
      updatedAt: payload.timestamp,
    },
    { merge: true },
  );
  return {
    type: payload.type,
    timestamp: payload.timestamp,
  };
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
