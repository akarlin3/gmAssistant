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
  // `localReady` flips once IndexedDB hydration + remote pull complete.
  // `seeded` flips once we've had a chance to seed from the legacy
  // `campaign.data` blob (which only becomes available after the Firestore
  // metadata subscription resolves — strictly *after* this hook first runs).
  const [localReady, setLocalReady] = useState(false);
  const [seeded, setSeeded] = useState(false);
  const syncRef = useRef<CrdtSync | null>(null);
  const seedAttemptedRef = useRef(false);

  useEffect(() => {
    if (!campaignId) return;
    let cancelled = false;
    setLocalReady(false);
    setSeeded(false);
    seedAttemptedRef.current = false;
    const clientId = getOrCreateClientId();
    const sync = new CrdtSync({
      campaignId,
      // legacyData is intentionally null here: `campaign` is not loaded yet on
      // the first render, so we can't trust it at construction time. The
      // legacy seed is handled by the effect below once metadata arrives.
      legacyData: null,
      clientId,
      onChange: (snap) => {
        if (!cancelled) setData(snap);
      },
      onError: (e) => console.error('[useCrdtCampaign]', e),
    });
    syncRef.current = sync;
    void sync.ready.then(() => {
      if (!cancelled) setLocalReady(true);
    });
    return () => {
      cancelled = true;
      void sync.destroy();
      syncRef.current = null;
    };
    // We intentionally only key off campaignId; the legacy seed is performed
    // separately once campaign metadata is available.
  }, [campaignId]);

  // Legacy seed: runs exactly once per campaign, after both the CRDT layer is
  // locally ready and the Firestore campaign metadata has loaded. For
  // never-migrated campaigns (empty local + remote) this seeds the Y.Doc from
  // `campaign.data` so the editor doesn't mount blank and clobber the legacy
  // blob. For already-migrated campaigns it's a no-op (doc isn't empty).
  useEffect(() => {
    const sync = syncRef.current;
    if (!sync || !localReady) return;
    if (!campaign) return; // wait for metadata so legacyData is correct
    if (seedAttemptedRef.current) return;
    seedAttemptedRef.current = true;
    let cancelled = false;
    void sync
      .seedFromLegacyIfEmpty(campaign.data ?? null)
      .catch((e) => console.error('[useCrdtCampaign] legacy seed failed', e))
      .finally(() => {
        if (!cancelled) setSeeded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [localReady, campaign, campaignId]);

  return {
    data,
    // Gate downstream consumers (and the editor mount) until the legacy seed
    // attempt has completed, so the editor never initializes from blank state.
    ready: localReady && seeded,
    sync: syncRef.current,
    applyJson: (next) => syncRef.current ? syncRef.current.applyJson(next) : Promise.resolve(),
  };
}
