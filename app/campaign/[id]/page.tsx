'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';
import { subscribeToCampaign, type Campaign } from '@/lib/firebase/campaigns';
import CampaignEditor from '@/components/CampaignEditor';
import PlayerView from '@/components/PlayerView';

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
        const isOwner = c.userId === user.uid;
        const isPlayer = (c.playerIds || []).includes(user.uid);
        if (!isOwner && !isPlayer) { setError('Access denied. You are not a member of this campaign.'); setLoading(false); return; }
        setCampaign(c);
        setLoading(false);
      },
      (err) => { setError(err.message); setLoading(false); }
    );
    return unsub;
  }, [id, user]);

  if (authLoading || loading) {
    return (
      <main className="min-h-screen bg-parchment flex flex-col">
        <header className="h-14 border-b border-rule bg-parchment px-4 flex items-center gap-3">
          <div className="h-5 w-5 bg-parchment-deep animate-pulse rounded-sm" />
          <div className="h-4 w-32 bg-parchment-deep animate-pulse rounded-sm" />
        </header>
        <div className="flex flex-1">
          <aside className="w-[240px] border-r border-rule bg-parchment-soft p-4 hidden md:flex flex-col gap-3">
            <div className="h-3 w-16 bg-parchment-deep animate-pulse rounded-sm mb-2" />
            <div className="h-8 w-full bg-parchment-deep animate-pulse rounded-sm" />
            <div className="h-8 w-full bg-parchment-deep animate-pulse rounded-sm" />
            <div className="h-8 w-full bg-parchment-deep animate-pulse rounded-sm" />
          </aside>
          <div className="flex-1 p-6">
            <div className="max-w-4xl mx-auto space-y-4">
              <div className="h-8 w-48 bg-parchment-deep animate-pulse rounded-sm" />
              <div className="h-4 w-full bg-parchment-deep animate-pulse rounded-sm" />
              <div className="h-4 w-full bg-parchment-deep animate-pulse rounded-sm" />
              <div className="h-4 w-2/3 bg-parchment-deep animate-pulse rounded-sm" />
              <div className="h-32 w-full mt-6 bg-parchment-deep animate-pulse rounded-sm" />
            </div>
          </div>
        </div>
      </main>
    );
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

  const isOwner = campaign.userId === user.uid;

  if (!isOwner) {
    return <PlayerView campaign={campaign} userEmail={user.email ?? ''} />;
  }

  return <CampaignEditor campaign={campaign} userEmail={user.email ?? ''} isPro={isPro} />;
}
