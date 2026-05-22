'use client';

import {
  collection, doc, query, where, orderBy, onSnapshot, addDoc,
  updateDoc, deleteDoc, serverTimestamp, getDoc, Timestamp
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
};

const campaignsCol = () => collection(getDb(), 'campaigns');

export function subscribeToUserCampaigns(
  userId: string,
  onUpdate: (campaigns: Campaign[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(
    campaignsCol(),
    where('userId', '==', userId),
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
    userId, name, data: {}, done: {},
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

export async function getCampaignOnce(campaignId: string) {
  const snap = await getDoc(doc(getDb(), 'campaigns', campaignId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<Campaign, 'id'>) };
}
