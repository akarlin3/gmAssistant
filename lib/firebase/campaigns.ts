'use client';

import {
  collection, doc, query, where, orderBy, onSnapshot, addDoc,
  updateDoc, deleteDoc, serverTimestamp, getDoc, getDocs, Timestamp,
  or, arrayUnion
} from 'firebase/firestore';
import { getDb, stripUndefined } from './client';
import { initPlayerMode } from '@/lib/playerMode/migration';
import { withRetry } from './retry';

const MAX_CAMPAIGN_DATA_SIZE = 900_000; // bytes

export type Campaign = {
  id: string;
  userId: string;
  worldId?: string;
  name: string;
  data: Record<string, any>;
  done: Record<string, boolean>;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  archivedAt?: Timestamp | null;
  playerIds: string[];
  pendingPlayers: { uid: string; email: string }[];
  playerEmails?: Record<string, string>;
};

const campaignsCol = () => collection(getDb(), 'campaigns');

export function subscribeToUserCampaigns(
  userId: string,
  onUpdate: (campaigns: Campaign[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(
    campaignsCol(),
    or(
      where('userId', '==', userId),
      where('playerIds', 'array-contains', userId)
    ),
    orderBy('updatedAt', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: Campaign[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Campaign, 'id'>) }));
      onUpdate(items);
    },
    onError
  );
}

export function subscribeToCampaign(
  campaignId: string,
  onUpdate: (campaign: Campaign | null) => void,
  onError?: (err: Error) => void
) {
  const ref = doc(getDb(), 'campaigns', campaignId);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) { onUpdate(null); return; }
      onUpdate({ id: snap.id, ...(snap.data() as Omit<Campaign, 'id'>) });
    },
    onError
  );
}

export async function createCampaign(userId: string, name = 'Untitled Campaign', worldId?: string) {
  const payload: any = {
    userId, name, data: {}, done: {}, playerIds: [], pendingPlayers: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (worldId) payload.worldId = worldId;
  const ref = await withRetry(() => addDoc(campaignsCol(), payload));
  return ref.id;
}

// Create a campaign with initial data in a single write. Used by the New
// Campaign wizard so the Firestore doc is only created once the user finishes
// the wizard (B-03) — closing it before then writes nothing.
export async function createCampaignFromWizard(
  userId: string,
  opts: { name: string; data: Record<string, any>; worldId?: string },
) {
  const payload: any = {
    userId,
    name: opts.name,
    data: opts.data ?? {},
    done: {},
    playerIds: [],
    pendingPlayers: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (opts.worldId) payload.worldId = opts.worldId;
  const ref = await withRetry(() => addDoc(campaignsCol(), payload));
  return ref.id;
}

export async function updateCampaign(
  campaignId: string,
  patch: {
    name?: string;
    data?: Record<string, any>;
    done?: Record<string, boolean>;
    worldId?: string;
    archivedAt?: Timestamp | null;
    pendingPlayers?: Array<{ uid: string; email: string }>;
  }
) {
  if (patch.data !== undefined) {
    const serialized = JSON.stringify(patch.data || {});
    if (serialized.length > MAX_CAMPAIGN_DATA_SIZE) {
      throw new Error(
        `Campaign data too large: ${serialized.length} bytes exceeds the ${MAX_CAMPAIGN_DATA_SIZE}-byte limit. ` +
        `Please reduce the amount of data stored in this campaign.`
      );
    }
  }
  const ref = doc(getDb(), 'campaigns', campaignId);
  await withRetry(() => updateDoc(ref, stripUndefined({ ...patch, updatedAt: serverTimestamp() })));
}

export async function deleteCampaign(campaignId: string) {
  await withRetry(() => deleteDoc(doc(getDb(), 'campaigns', campaignId)));
}

export async function archiveCampaign(campaignId: string) {
  const ref = doc(getDb(), 'campaigns', campaignId);
  await withRetry(() => updateDoc(ref, { archivedAt: serverTimestamp() }));
}

export async function unarchiveCampaign(campaignId: string) {
  const ref = doc(getDb(), 'campaigns', campaignId);
  await withRetry(() => updateDoc(ref, { archivedAt: null }));
}

// Idempotently initialize player-mode config + backfill entity ids on a
// campaign. Safe to call on every GM open; writes only when something changed.
// Pure logic lives in lib/playerMode/migration.ts (unit-tested).
export async function ensurePlayerModeInitialized(campaign: Campaign): Promise<Campaign> {
  const { data, changed } = initPlayerMode(campaign.data || {});
  if (!changed) return campaign;
  await updateCampaign(campaign.id, { data });
  return { ...campaign, data };
}

export async function getCampaignOnce(campaignId: string) {
  const snap = await getDoc(doc(getDb(), 'campaigns', campaignId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Campaign, 'id'>) };
}

export async function getUserCampaignsOnce(userId: string): Promise<Campaign[]> {
  const q = query(
    campaignsCol(),
    or(
      where('userId', '==', userId),
      where('playerIds', 'array-contains', userId)
    ),
    orderBy('updatedAt', 'desc')
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Campaign, 'id'>) }));
}

export async function importCampaign(
  userId: string,
  name: string,
  data: Record<string, any>,
  done: Record<string, boolean>
) {
  const ref = await withRetry(() => addDoc(campaignsCol(), {
    userId,
    name,
    data,
    done,
    playerIds: [],
    pendingPlayers: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
  return ref.id;
}

export async function copyCampaign(campaignId: string, newName?: string) {
  const original = await getCampaignOnce(campaignId);
  if (!original) throw new Error('Campaign not found');

  // Current content lives in the CRDT log, not the legacy `data` field, so
  // rebuild it from the snapshot+updates (falling back to the legacy field for
  // never-migrated campaigns). Copying `original.data` directly would produce
  // a blank campaign for anything edited after the CRDT migration.
  const { loadCampaignCrdtJson } = await import('@/lib/crdt/export');
  const data = await loadCampaignCrdtJson(campaignId, original.data || null);

  const name = newName || `${original.name} (Copy)`;
  const ref = await withRetry(() => addDoc(campaignsCol(), {
    userId: original.userId,
    name,
    data,
    done: original.done || {},
    playerIds: original.playerIds || [],
    pendingPlayers: original.pendingPlayers || [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
  return ref.id;
}

import { arrayRemove, deleteField } from 'firebase/firestore';

export async function requestJoinCampaign(campaignId: string, user: { uid: string; email: string }) {
  const ref = doc(getDb(), 'campaigns', campaignId);
  await withRetry(() => updateDoc(ref, { pendingPlayers: arrayUnion(user), updatedAt: serverTimestamp() }));
}

export async function approvePlayer(campaignId: string, user: { uid: string; email: string }) {
  const ref = doc(getDb(), 'campaigns', campaignId);
  await withRetry(() => updateDoc(ref, {
    pendingPlayers: arrayRemove(user),
    playerIds: arrayUnion(user.uid),
    [`playerEmails.${user.uid}`]: user.email,
    updatedAt: serverTimestamp()
  }));
}

export async function rejectPlayer(campaignId: string, user: { uid: string; email: string }) {
  const ref = doc(getDb(), 'campaigns', campaignId);
  await withRetry(() => updateDoc(ref, {
    pendingPlayers: arrayRemove(user),
    updatedAt: serverTimestamp()
  }));
}

export async function removePlayer(campaignId: string, uid: string) {
  const ref = doc(getDb(), 'campaigns', campaignId);
  await withRetry(() => updateDoc(ref, {
    playerIds: arrayRemove(uid),
    [`playerEmails.${uid}`]: deleteField(),
    updatedAt: serverTimestamp()
  }));
}
