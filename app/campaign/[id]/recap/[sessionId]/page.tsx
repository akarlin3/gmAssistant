'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';
import { subscribeToCampaign, type Campaign } from '@/lib/firebase/campaigns';
import RecapView from '@/components/RecapView';
import type { SessionLogEntry } from '@/lib/sessionLog';

type Params = { id: string; sessionId: string };

export default function RecapPage({ params }: { params: Promise<Params> }) {
  const { id, sessionId } = use(params);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToCampaign(
      id,
      (c) => {
        if (!c) { setError('Campaign not found'); setLoading(false); return; }
        if (c.userId !== user.uid) { setError('Access denied'); setLoading(false); return; }
        setCampaign(c);
        setLoading(false);
      },
      (err) => { setError(err.message); setLoading(false); },
    );
    return unsub;
  }, [id, user]);

  const entry = useMemo<SessionLogEntry | null>(() => {
    if (!campaign) return null;
    const entries = (campaign.data?.sessionLogV2 as SessionLogEntry[] | undefined) || [];
    return entries.find(e => e.id === sessionId) || null;
  }, [campaign, sessionId]);

  if (authLoading || loading) {
    return <main className="flex min-h-screen items-center justify-center text-xs text-ink-mute">Loading…</main>;
  }
  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center p-5">
        <div className="space-y-3 text-center">
          <p className="text-sm text-crimson">{error}</p>
          <button onClick={() => router.replace(`/campaign/${id}`)} className="rounded border border-rule px-3 py-1 text-xs text-ink-soft hover:bg-parchment-deep">
            Back to campaign
          </button>
        </div>
      </main>
    );
  }
  if (!campaign || !user) return null;
  if (!entry) {
    return (
      <main className="flex min-h-screen items-center justify-center p-5">
        <div className="space-y-3 text-center">
          <p className="text-sm text-ink-soft">Session log not found.</p>
          <button onClick={() => router.replace(`/campaign/${id}`)} className="rounded border border-rule px-3 py-1 text-xs text-ink-soft hover:bg-parchment-deep">
            Back to campaign
          </button>
        </div>
      </main>
    );
  }

  return <RecapView campaign={campaign} entry={entry} />;
}
