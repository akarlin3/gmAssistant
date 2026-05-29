'use client';

import { useEffect, useRef } from 'react';
import { startWritebackReconciler } from '@/lib/player/reconciler';
import { getFirebaseAuth } from '@/lib/firebase/client';
import type { PlayerCharacter } from '@/lib/pc/types';

/**
 * Registers an active subscription to the player writebacks collection in
 * Duet or Standard modes. When a player modifies their sheet this hook catches
 * the staged change, reconciles it, and commits it to the master campaign doc.
 */
export function usePlayerWriteback(
  campaignId: string,
  campaignUserId: string,
  playMode: 'solo' | 'duet' | 'standard',
  worldOnlyMode: boolean,
  pcs: PlayerCharacter[],
  writePcs: (next: PlayerCharacter[]) => void,
) {
  const pcsRef = useRef(pcs);
  useEffect(() => {
    pcsRef.current = pcs;
  }, [pcs]);

  // Reconciler is inactive in world-only modes, stub campaigns, or Solo
  // campaigns (where there are no players).
  useEffect(() => {
    if (worldOnlyMode || campaignId === 'world-stub' || playMode === 'solo') return;

    let unsubscribe: (() => void) | null = null;
    let retryCount = 0;
    let timeoutId: NodeJS.Timeout;

    const start = () => {
      try {
        unsubscribe = startWritebackReconciler(
          campaignId,
          () => pcsRef.current,
          (nextPcs) => writePcs(nextPcs),
          (err) => {
            if (err.message.includes('permission') || err.message.includes('Permission')) {
              console.warn(
                `[Writeback Reconciler] Warning: Firestore returned 'Missing or insufficient permissions' (attempt ${retryCount + 1}).\n` +
                `If you are running in local development, please make sure:\n` +
                ` 1. Your local 'firestore.rules' have been deployed to your Firebase console (run 'npx firebase deploy --only firestore').\n` +
                ` 2. The logged-in user in your browser (${getFirebaseAuth().currentUser?.email}) matches the campaign owner's ID (${campaignUserId}).`
              );
            } else {
              console.warn(`Failed to reconcile player writebacks (attempt ${retryCount + 1}):`, err.message);
            }

            if (retryCount < 3) {
              retryCount++;
              timeoutId = setTimeout(() => {
                if (unsubscribe) unsubscribe();
                start();
              }, 1000 * retryCount);
            } else {
              if (err.message.includes('permission') || err.message.includes('Permission')) {
                console.warn('[Writeback Reconciler] Reconciler paused due to persistent permission errors. Player writebacks will not sync in this session.');
              } else {
                console.error('Failed to reconcile player writebacks after maximum retries:', err);
              }
            }
          },
        );
      } catch (err) {
        console.error('Failed to start writeback reconciler:', err);
      }
    };

    start();

    return () => {
      if (unsubscribe) unsubscribe();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [campaignId, playMode, worldOnlyMode, campaignUserId]); // eslint-disable-line react-hooks/exhaustive-deps

  return pcsRef;
}
