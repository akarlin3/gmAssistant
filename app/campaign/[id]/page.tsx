'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';
import { subscribeToCampaign, type Campaign } from '@/lib/firebase/campaigns';
import CampaignEditor from '@/components/CampaignEditor';

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading: authLoading, isPro } = useAuth();
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
      (err) => { setError(err.message); setLoading(false); }
    );
    return unsub;
  }, [id, user]);

  if (authLoading || loading) {
    return <main className="flex min-h-screen items-center justify-center text-xs text-zinc-500">Loading…</main>;
  }
  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center p-5">
        <div className="space-y-3 text-center">
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={() => router.replace('/campaign')} className="rounded border border-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-900">
            Back to campaigns
          </button>
        </div>
      </main>
    );
  }
  if (!campaign || !user) return null;

  return <CampaignEditor campaign={campaign} userEmail={user.email ?? ''} isPro={isPro} />;
}
