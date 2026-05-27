'use client';

import { ref as storageRef, deleteObject } from 'firebase/storage';
import { getStorageClient } from '@/lib/firebase/client';
import type { VoiceCacheEntry } from './types';

// Drops every cached clip belonging to an NPC and returns the pruned cache.
// Called when an NPC's voice profile changes (so stale audio in the old voice
// is regenerated on next speak) or when the NPC is deleted. Storage deletes are
// best-effort and fire-and-forget — a missing object is fine.
export function invalidateNpcVoiceCache(
  voiceCache: VoiceCacheEntry[] | undefined,
  npcId: string,
): VoiceCacheEntry[] {
  const cache = voiceCache ?? [];
  for (const entry of cache) {
    if (entry.npcId === npcId) {
      deleteObject(storageRef(getStorageClient(), entry.storagePath)).catch(() => {});
    }
  }
  return cache.filter((e) => e.npcId !== npcId);
}
