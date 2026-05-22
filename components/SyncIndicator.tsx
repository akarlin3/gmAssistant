'use client';

import { Cloud, CloudOff, RefreshCw } from 'lucide-react';
import { useSyncStatus } from '@/lib/firebase/sync-status';
import { useAuth } from '@/lib/firebase/auth-context';

export default function SyncIndicator() {
  const { user } = useAuth();
  const status = useSyncStatus();

  if (!user) return null;

  const meta = {
    synced:  { icon: Cloud,     label: 'Synced',        cls: 'text-emerald-700 border-emerald-700/40 bg-emerald-100/40' },
    pending: { icon: RefreshCw, label: 'Saving locally',cls: 'text-brass-deep border-brass/50 bg-brass/10' },
    offline: { icon: CloudOff,  label: 'Offline — local only', cls: 'text-crimson border-crimson/40 bg-crimson/10' },
  }[status];

  const Icon = meta.icon;
  const spin = status === 'pending' ? 'animate-spin' : '';

  return (
    <div
      title={status === 'offline'
        ? 'No connection — changes are saved on this device and will sync when reconnected.'
        : status === 'pending'
          ? 'Saving changes to the cloud…'
          : 'All changes saved to the cloud.'}
      className={`pointer-events-none fixed bottom-2 right-2 z-40 flex items-center gap-1 rounded-full border px-2 py-0.5 font-display text-[10px] uppercase tracking-wider shadow-sm sm:bottom-3 sm:right-3 ${meta.cls}`}
    >
      <Icon size={10} className={spin} />
      <span className="hidden sm:inline">{meta.label}</span>
    </div>
  );
}
