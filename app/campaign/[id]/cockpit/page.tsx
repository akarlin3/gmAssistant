'use client';

import React, { use, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Compass, ShieldCheck } from 'lucide-react';
import { useCampaignAndWorld } from '@/lib/useCampaignAndWorld';
import type { Character } from '@/lib/campaign-types';
import LiveSessionCockpit from '@/components/cockpit/LiveSessionCockpit';

export default function CampaignCockpitPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const {
    loading,
    campaign,
    applyCampaignData,
  } = useCampaignAndWorld(id);

  const setState: React.Dispatch<React.SetStateAction<Record<string, any>>> = useCallback(
    (updater) => {
      if (!campaign) return;
      const nextData =
        typeof updater === 'function' ? updater(campaign.data || {}) : updater;
      applyCampaignData(nextData);
    },
    [campaign, applyCampaignData]
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-parchment font-display text-sm uppercase tracking-wider text-ink-mute">
        Loading Live Session Cockpit…
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="mx-auto max-w-xl p-8 text-center">
        <p className="font-serif text-sm text-ink-soft">Campaign not found.</p>
        <Link
          href="/campaign"
          className="mt-4 inline-flex items-center gap-1.5 rounded border border-rule bg-parchment px-3 py-1.5 font-display text-xs uppercase tracking-wider text-ink hover:bg-parchment-deep"
        >
          <ArrowLeft size={12} /> Back to Campaigns
        </Link>
      </div>
    );
  }

  const characters = Array.isArray(campaign.data?.characters)
    ? (campaign.data.characters as Character[])
    : [];

  return (
    <div className="min-h-screen bg-parchment text-ink">
      <header className="sticky top-0 z-20 border-b-2 border-brass-deep/60 bg-parchment/95 px-4 py-2.5 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Link
              href={`/campaign/${campaign.id}`}
              className="inline-flex items-center gap-1 rounded border border-rule bg-parchment-soft px-2.5 py-1 font-display text-[10px] uppercase tracking-wider text-ink-soft hover:border-brass-deep hover:text-ink"
            >
              <ArrowLeft size={12} /> Editor
            </Link>
            <div className="flex items-center gap-2">
              <Compass size={16} className="text-crimson" />
              <h1 className="font-display text-sm uppercase tracking-wider text-ink sm:text-base">
                {campaign.name} · Live Session Cockpit
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={`/campaign/${campaign.id}/player-view`}
              className="inline-flex items-center gap-1 rounded border border-moss/50 bg-moss/10 px-2.5 py-1 font-display text-[10px] uppercase tracking-wider text-moss hover:bg-moss hover:text-parchment"
            >
              <ShieldCheck size={12} /> /player-view
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl p-4">
        <LiveSessionCockpit
          campaignId={campaign.id}
          campaignName={campaign.name}
          state={campaign.data || {}}
          setState={setState}
          characters={characters}
        />
      </main>
    </div>
  );
}
