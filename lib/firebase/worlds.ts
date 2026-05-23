import {
  collection, doc, query, where, orderBy, onSnapshot, addDoc,
  updateDoc, deleteDoc, serverTimestamp, getDoc, getDocs, Timestamp
} from 'firebase/firestore';
import { getDb } from './client';

export type World = {
  id: string;
  userId: string;
  name: string;
  data: Record<string, any>;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
};

const worldsCol = () => collection(getDb(), 'worlds');

export function subscribeToUserWorlds(
  userId: string,
  onUpdate: (worlds: World[]) => void,
  onError?: (err: Error) => void
) {
  const q = query(
    worldsCol(),
    where('userId', '==', userId),
    orderBy('updatedAt', 'desc')
  );
  return onSnapshot(
    q,
    (snap) => {
      const items: World[] = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<World, 'id'>) }));
      onUpdate(items);
    },
    onError
  );
}

export function subscribeToWorld(
  worldId: string,
  onUpdate: (world: World | null) => void,
  onError?: (err: Error) => void
) {
  const ref = doc(getDb(), 'worlds', worldId);
  return onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) { onUpdate(null); return; }
      onUpdate({ id: snap.id, ...(snap.data() as Omit<World, 'id'>) });
    },
    onError
  );
}

export async function createWorld(userId: string, name: string, initialData: Record<string, any> = {}) {
  const ref = await addDoc(worldsCol(), {
    userId,
    name,
    data: initialData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function updateWorld(
  worldId: string,
  patch: { name?: string; data?: Record<string, any> }
) {
  const ref = doc(getDb(), 'worlds', worldId);
  await updateDoc(ref, { ...patch, updatedAt: serverTimestamp() });
}

export async function deleteWorld(worldId: string) {
  await deleteDoc(doc(getDb(), 'worlds', worldId));
}

export async function getWorldOnce(worldId: string) {
  const snap = await getDoc(doc(getDb(), 'worlds', worldId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...(snap.data() as Omit<World, 'id'>) };
}
