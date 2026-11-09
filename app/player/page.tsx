'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';
import { subscribeToUserCampaigns, type Campaign } from '@/lib/firebase/campaigns';
import { getLastSessionAt, getLastOpenedAt } from '@/lib/lastPlayed';
import PlayerView from '@/components/PlayerView';
import PlayerCampaignView from '@/components/PlayerCampaignView';

function PlayerRouteInner() {
  const searchParams = useSearchParams();
  const tokenParam = searchParams.get('token') || searchParams.get('shareToken');
  const slotIdParam = searchParams.get('slotId') || 'slot-1';
  const campaignIdParam = searchParams.get('campaignId');
  const { user, loading: authLoading } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(campaignIdParam);

  useEffect(() => {
    if (authLoading || !user) return;
    const unsub = subscribeToUserCampaigns(
      user.uid,
      (list: Campaign[]) => {
        setCampaigns(list);
        if (!selectedId && list.length > 0) {
          const sorted = [...list].sort(
            (a, b) =>
              (getLastSessionAt(b) ?? getLastOpenedAt(b) ?? 0) -
              (getLastSessionAt(a) ?? getLastOpenedAt(a) ?? 0),
          );
          setSelectedId(sorted[0].id);
        }
      },
      () => {},
    );
    return () => unsub();
  }, [user, authLoading, selectedId]);

  if (tokenParam) {
    return (
      <PlayerCampaignView
        token={tokenParam}
        slotId={slotIdParam}
        campaignId={campaignIdParam ?? ''}
        displayName={searchParams.get('name') ?? 'Player'}
        campaignName={searchParams.get('campaignName') ?? 'Shared Campaign'}
        onSwitch={() => {}}
      />
    );
  }

  const activeCampaign = campaigns.find((c) => c.id === selectedId) ?? campaigns[0] ?? null;

  if (activeCampaign) {
    return <PlayerView campaign={activeCampaign} userEmail={user?.email ?? ''} />;
  }

  return (
    <PlayerCampaignView
      token="demo-share-token"
      slotId="slot-demo"
      campaignId="demo-campaign"
      displayName="Adventurer"
      campaignName="Player Tracker & Companion"
      onSwitch={() => {}}
    />
  );
}

export default function PlayerPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-parchment font-serif text-ink-soft">
          Loading Player Companion View...
        </div>
      }
    >
      <PlayerRouteInner />
    </Suspense>
  );
}
