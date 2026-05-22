'use client';

import { useEffect, useState } from 'react';
import {
  disableNetwork,
  enableNetwork,
  onSnapshotsInSync,
  waitForPendingWrites,
} from 'firebase/firestore';
import { getDb } from './client';

export type SyncStatus = 'synced' | 'pending' | 'offline';

export function useSyncStatus(): SyncStatus {
  const [online, setOnline] = useState<boolean>(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const goOnline = () => {
      setOnline(true);
      void enableNetwork(getDb()).catch(() => {});
    };
    const goOffline = () => {
      setOnline(false);
      void disableNetwork(getDb()).catch(() => {});
    };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;
    const db = getDb();
    const unsub = onSnapshotsInSync(db, () => {
      if (cancelled) return;
      setPending(true);
      waitForPendingWrites(db)
        .then(() => {
          if (!cancelled) setPending(false);
        })
        .catch(() => {
          if (!cancelled) setPending(false);
        });
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  if (!online) return 'offline';
  if (pending) return 'pending';
  return 'synced';
}
