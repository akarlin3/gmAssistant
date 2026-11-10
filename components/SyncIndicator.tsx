'use client';

import React from 'react';
import { useSyncStatus } from '@/lib/firebase/sync-status';
import { useAuth } from '@/lib/firebase/auth-context';

export interface UnifiedSyncDotProps {
  saveStatus?: 'saved' | 'saving' | 'error';
  idbHydrated?: boolean;
  className?: string;
}

/**
 * Single unified Sync Status indicator dot combining IndexedDB offline persistence
 * + Firestore cloud sync state into one calm green/amber/offline dot with hover tooltip.
 */
export function UnifiedSyncDot({
  saveStatus = 'saved',
  idbHydrated = true,
  className = '',
}: UnifiedSyncDotProps) {
  const { user } = useAuth();
  const cloudStatus = useSyncStatus();

  const state: 'synced' | 'pending' | 'offline' | 'error' = (() => {
    if (saveStatus === 'error') return 'error';
    if (saveStatus === 'saving' || !idbHydrated || cloudStatus === 'pending') {
      return 'pending';
    }
    if (!user || cloudStatus === 'offline') {
      return 'offline';
    }
    return 'synced';
  })();

  const meta = {
    synced: {
      dot: 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.65)]',
      label: 'Synced',
      tooltip:
        'IndexedDB offline store + Cloud Firestore synced. All changes saved.',
    },
    pending: {
      dot: 'bg-amber-400 animate-pulse shadow-[0_0_6px_rgba(251,191,36,0.65)]',
      label: 'Syncing',
      tooltip: 'Saving to local IndexedDB & syncing with Cloud Firestore…',
    },
    offline: {
      dot: 'bg-slate-400',
      label: 'Local IDB',
      tooltip: user
        ? 'Offline — saved locally in IndexedDB; will sync when reconnected.'
        : 'Saved locally on device (IndexedDB + LocalStorage). Sign in for cloud sync.',
    },
    error: {
      dot: 'bg-rose-500',
      label: 'Sync Error',
      tooltip: 'Cloud sync error — your work is still safely stored in local IndexedDB.',
    },
  }[state];

  return (
    <span
      role="status"
      aria-label={`Sync status: ${meta.label}`}
      title={meta.tooltip}
      data-tooltip={meta.tooltip}
      className={`gm-tooltip inline-flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-canvas)]/70 px-2 py-0.5 font-sans text-[11px] font-medium text-[var(--text-muted)] ${className}`}
    >
      <span className={`inline-block size-2 rounded-full ${meta.dot}`} />
      <span className="hidden xl:inline">{meta.label}</span>
    </span>
  );
}

export default function SyncIndicator() {
  // Unified into TopHeaderBar's Left Zone UnifiedSyncDot; kept as a no-op mount in RootLayout
  // so no duplicate floating sync badges clutter the viewport corners.
  return null;
}
