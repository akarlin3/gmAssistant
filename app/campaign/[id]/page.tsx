'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';
import { type Campaign } from '@/lib/firebase/campaigns';
import { useCampaignAndWorld } from '@/lib/useCampaignAndWorld';
import CampaignEditor from '@/components/CampaignEditor';
import PlayerView from '@/components/PlayerView';

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading: authLoading, isPro } = useAuth();
  const router = useRouter();
  const { campaign, rawCampaign, world, loading, error, crdt, applyCampaignData, crdtReady } = useCampaignAndWorld(id);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [user, authLoading, router]);

  if (campaign && user) {
    const isOwner = campaign.userId === user.uid;
    const isPlayer = (campaign.playerIds || []).includes(user.uid);
    if (!isOwner && !isPlayer) {
      return (
        <main className="flex min-h-screen items-center justify-center p-5">
          <div className="space-y-3 text-center">
            <p className="text-sm text-red-400">Access denied. You are not a member of this campaign.</p>
            <button onClick={() => router.replace('/campaign')} className="rounded border border-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-900">
              Back to campaigns
            </button>
          </div>
        </main>
      );
    }
  }

  // Block first render of the editor until the CRDT layer has hydrated from
  // IndexedDB and reconciled with the Firestore log. This avoids mounting the
  // editor with the stale legacy `campaign.data` JSON and overwriting newer
  // CRDT state on the first auto-save.
  if (authLoading || loading || (campaign && user && campaign.userId === user.uid && !crdtReady)) {
    return (
      <main className="flex min-h-screen flex-col bg-parchment">
        <header className="flex h-14 items-center gap-3 border-b border-rule bg-parchment px-4">
          <div className="size-5 animate-pulse rounded-sm bg-parchment-deep" />
          <div className="h-4 w-32 animate-pulse rounded-sm bg-parchment-deep" />
        </header>
        <div className="flex flex-1">
          <aside className="hidden w-[240px] flex-col gap-3 border-r border-rule bg-parchment-soft p-4 md:flex">
            <div className="mb-2 h-3 w-16 animate-pulse rounded-sm bg-parchment-deep" />
            <div className="h-8 w-full animate-pulse rounded-sm bg-parchment-deep" />
            <div className="h-8 w-full animate-pulse rounded-sm bg-parchment-deep" />
            <div className="h-8 w-full animate-pulse rounded-sm bg-parchment-deep" />
          </aside>
          <div className="flex-1 p-6">
            <div className="mx-auto max-w-4xl space-y-4">
              <div className="h-8 w-48 animate-pulse rounded-sm bg-parchment-deep" />
              <div className="h-4 w-full animate-pulse rounded-sm bg-parchment-deep" />
              <div className="h-4 w-full animate-pulse rounded-sm bg-parchment-deep" />
              <div className="h-4 w-2/3 animate-pulse rounded-sm bg-parchment-deep" />
              <div className="mt-6 h-32 w-full animate-pulse rounded-sm bg-parchment-deep" />
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
          <p className="text-sm text-red-400">{error.message}</p>
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

  return <CampaignEditor campaign={campaign} rawCampaign={rawCampaign ?? undefined} world={world ?? undefined} userEmail={user.email ?? ''} isPro={isPro} crdtApply={applyCampaignData} />;
}
