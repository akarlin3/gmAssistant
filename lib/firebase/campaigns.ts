'use client';

import {
  collection, doc, query, where, orderBy, onSnapshot, addDoc,
  updateDoc, deleteDoc, serverTimestamp, getDoc, getDocs, Timestamp,
  or, arrayUnion
} from 'firebase/firestore';
import { getDb } from './client';

export type Campaign = {
  id: string;
  userId: string;
  name: string;
  data: Record<string, any>;
  done: Record<string, boolean>;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  archivedAt?: Timestamp | null;
  playerIds: string[];
  pendingPlayers: { uid: string; email: string }[];
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

export async function createCampaign(userId: string, name = 'Untitled Campaign') {
  const ref = await addDoc(campaignsCol(), {
    userId, name, data: {}, done: {}, playerIds: [], pendingPlayers: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateCampaign(
  campaignId: string,
  patch: { name?: string; data?: Record<string, any>; done?: Record<string, boolean> }
) {
  const ref = doc(getDb(), 'campaigns', campaignId);
  await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
}

export async function deleteCampaign(campaignId: string) {
  await deleteDoc(doc(getDb(), 'campaigns', campaignId));
}

export async function archiveCampaign(campaignId: string) {
  const ref = doc(getDb(), 'campaigns', campaignId);
  await updateDoc(ref, { archivedAt: serverTimestamp() });
}

export async function unarchiveCampaign(campaignId: string) {
  const ref = doc(getDb(), 'campaigns', campaignId);
  await updateDoc(ref, { archivedAt: null });
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
  const ref = await addDoc(campaignsCol(), {
    userId,
    name,
    data,
    done,
    playerIds: [],
    pendingPlayers: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function copyCampaign(campaignId: string, newName?: string) {
  const original = await getCampaignOnce(campaignId);
  if (!original) throw new Error('Campaign not found');

  const name = newName || `${original.name} (Copy)`;
  const ref = await addDoc(campaignsCol(), {
    userId: original.userId,
    name,
    data: original.data || {},
    done: original.done || {},
    playerIds: original.playerIds || [],
    pendingPlayers: original.pendingPlayers || [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

import { arrayRemove } from 'firebase/firestore';

export async function requestJoinCampaign(campaignId: string, user: { uid: string; email: string }) {
  const ref = doc(getDb(), 'campaigns', campaignId);
  await updateDoc(ref, { pendingPlayers: arrayUnion(user), updatedAt: serverTimestamp() });
}

export async function approvePlayer(campaignId: string, user: { uid: string; email: string }) {
  const ref = doc(getDb(), 'campaigns', campaignId);
  await updateDoc(ref, {
    pendingPlayers: arrayRemove(user),
    playerIds: arrayUnion(user.uid),
    updatedAt: serverTimestamp()
  });
}

export async function rejectPlayer(campaignId: string, user: { uid: string; email: string }) {
  const ref = doc(getDb(), 'campaigns', campaignId);
  await updateDoc(ref, {
    pendingPlayers: arrayRemove(user),
    updatedAt: serverTimestamp()
  });
}
