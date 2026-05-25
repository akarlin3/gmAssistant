'use client';

// Client-side projection publisher — the GM browser's replacement for the
// Cloud Function the original plan assumed (which isn't deployable here; see
// docs/player-mode-audit.md §3). On any relevant change the GM session calls
// publishProjections() to (re)write the public share docs that players read.

import {
  collection, doc, getDocs, writeBatch, setDoc,
} from 'firebase/firestore';
import { getDb } from '@/lib/firebase/client';
import { buildShareMeta, buildSlotProjection } from './projection';
import { makeShareToken } from './share';
import type { PlayerConfig } from './types';

// Slot docs present in Firestore that no longer correspond to a roster slot and
// must be deleted. Pure for testing.
export function staleSlotIds(existingIds: string[], rosterSlotIds: string[]): string[] {
  const keep = new Set(rosterSlotIds);
  return existingIds.filter((id) => !keep.has(id));
}

// Rotate the share token: new unguessable token + bumped version. Invalidates
// every outstanding player link (their path no longer resolves). Pure.
export function rotateShareToken(config: PlayerConfig): PlayerConfig {
  return {
    ...config,
    shareToken: makeShareToken(),
    tokenVersion: (config.tokenVersion ?? 1) + 1,
  };
}

export type AnyData = Record<string, any>;

// (Re)publish the meta doc and every roster slot's redacted projection, and
// prune slot docs for removed roster members. Idempotent.
export async function publishProjections(
  campaignId: string,
  campaignName: string,
  data: AnyData,
): Promise<void> {
  const config: PlayerConfig | undefined = data.player;
  if (!config?.shareToken) return;
  const db = getDb();
  const token = config.shareToken;

  await setDoc(doc(db, 'playerShares', token), buildShareMeta(campaignId, data, campaignName));

  const roster = Array.isArray(config.roster) ? config.roster : [];
  const batch = writeBatch(db);
  for (const slot of roster) {
    batch.set(
      doc(db, 'playerShares', token, 'slots', slot.slotId),
      buildSlotProjection(data, campaignName, slot.slotId),
    );
  }
  const existing = await getDocs(collection(db, 'playerShares', token, 'slots'));
  const stale = staleSlotIds(
    existing.docs.map((d) => d.id),
    roster.map((s) => s.slotId),
  );
  for (const id of stale) {
    batch.delete(doc(db, 'playerShares', token, 'slots', id));
  }
  await batch.commit();
}

// Delete a whole share (meta + all slot docs) — used when rotating the token so
// the old link's docs don't linger. Best-effort; safe to call on a missing doc.
export async function deleteShare(token: string): Promise<void> {
  if (!token) return;
  const db = getDb();
  const slots = await getDocs(collection(db, 'playerShares', token, 'slots'));
  const batch = writeBatch(db);
  slots.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, 'playerShares', token));
  await batch.commit();
}

export function playUrl(shareToken: string, origin?: string): string {
  const base = origin ?? (typeof window !== 'undefined' ? window.location.origin : '');
  return `${base}/play/${shareToken}`;
}
