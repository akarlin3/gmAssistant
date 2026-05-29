'use client';

import { useEffect, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import { CrdtSync } from './sync';
import type { Campaign } from '@/lib/firebase/campaigns';

const CLIENT_ID_KEY = 'gmb-crdt-client-id';

function getOrCreateClientId(): string {
  if (typeof window === 'undefined') return 'ssr';
  try {
    const existing = window.localStorage.getItem(CLIENT_ID_KEY);
    if (existing) return existing;
    const id = nanoid(16);
    window.localStorage.setItem(CLIENT_ID_KEY, id);
    return id;
  } catch {
    return nanoid(16);
  }
}

export type CrdtCampaignState = {
  /** Plain-JSON view of the merged Y.Doc; suitable for React rendering. */
  data: Record<string, any> | null;
  /** True once IndexedDB + remote initial pull are complete. */
  ready: boolean;
  /** Underlying sync handle for advanced callers. */
  sync: CrdtSync | null;
  /** Apply a JSON snapshot of campaign.data to the Y.Doc. */
  applyJson: (next: Record<string, any>) => Promise<void>;
};

/**
 * Subscribe a React component to a campaign's CRDT state. Seeds from the
 * legacy Firestore `data` JSON the first time (when both local + remote logs
 * are empty), then keeps in sync.
 */
export function useCrdtCampaign(
  campaignId: string | null,
  campaign: Campaign | null,
): CrdtCampaignState {
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [ready, setReady] = useState(false);
  const syncRef = useRef<CrdtSync | null>(null);

  useEffect(() => {
    if (!campaignId) return;
    let cancelled = false;
    const clientId = getOrCreateClientId();
    const sync = new CrdtSync({
      campaignId,
      legacyData: campaign?.data ?? null,
      clientId,
      onChange: (snap) => {
        if (!cancelled) setData(snap);
      },
      onError: (e) => console.error('[useCrdtCampaign]', e),
    });
    syncRef.current = sync;
    void sync.ready.then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
      void sync.destroy();
      syncRef.current = null;
    };
    // We intentionally only key off campaignId; the legacyData is only used
    // on first-time seed when both local + remote are empty.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId]);

  return {
    data,
    ready,
    sync: syncRef.current,
    applyJson: (next) => syncRef.current ? syncRef.current.applyJson(next) : Promise.resolve(),
  };
}
