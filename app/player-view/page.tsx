'use client';

import React, { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';
import { subscribeToUserCampaigns, type Campaign } from '@/lib/firebase/campaigns';
import { getLastSessionAt, getLastOpenedAt } from '@/lib/lastPlayed';
import PlayerSafeLoreView from '@/components/PlayerSafeLoreView';

const DEMO_PLAYER_VIEW_DATA = {
  worldClock: { currentDay: 14 },
  locations: [
    {
      id: 'loc-salt-pier',
      name: 'Old Salt Pier',
      type: 'Settlement',
      description:
        'A fog-slicked timber wharf where lanterns sway above black tidewater. ||Hidden smuggling tunnel beneath Pilings 4-7 leads to the Sunken Cistern.||',
      lighting: 'Dim / Foggy Lanterns',
      terrainTags: ['Slick Planks', 'Deep Water', 'Crate Cover'],
      aspects: ['Rotting pilings encrusted with barnacles', 'Echoing foghorns at dusk', 'Smell of brine and alchemical tar'],
      factions: 'The Wells Guard',
      player_visible: true,
      isPublic: true,
    },
  ],
  npcs: [
    {
      id: 'npc-inka',
      name: 'Inka Thorne',
      archetype: 'Harbormaster Informant',
      faction: 'The Wells Guard',
      appearance: 'Salt-streaked oilskin coat, brass spyglass chained to her belt.',
      mannerism: 'Taps her signet ring twice before answering any question.',
      description: 'Watches incoming hulls at @Old Salt Pier. ||Secretly trading manifest ciphers to the Iron Hand.||',
      player_visible: true,
      isPublic: true,
    },
    {
      id: 'npc-hidden-assassin',
      name: 'Vesper the Blade',
      archetype: 'Hidden Assassin',
      goal: 'Eliminate the harbormaster',
      player_visible: false,
      isPublic: false,
    },
  ],
  factions: [
    {
      id: 'fac-wells',
      name: 'The Wells Guard',
      archetype: 'Military',
      identity: 'Harbor watch sworn to keep the sea-lanes taxed and open.',
      area: 'Old Salt Pier & Lower Docks',
      player_visible: true,
      isPublic: true,
    },
  ],
  clocks: [
    {
      id: 'clk-blockade',
      text: 'Harbor Quarantine Lockdown',
      faction: 'The Wells Guard',
      filled: 4,
      max: 6,
      status: 'active',
      triggerNote: 'All ships impounded at Old Salt Pier',
      player_visible: true,
      isPublic: true,
    },
  ],
  items: [
    {
      id: 'item-tidecaller',
      name: 'Tidecaller Horn',
      rarity: 'Rare Artifact',
      description: 'Carved from leviathan bone found near @Old Salt Pier. ||Cursed: sounding it advances the Deep Tide clock by 1.||',
      mechanic: 'Once per dusk, blow to part fog in a 60-foot cone and grant +2 Initiative.',
      player_visible: true,
      playerVisibility: 'full',
    },
  ],
  relationships: [
    {
      id: 'rel-1',
      fromType: 'npc',
      fromId: 'npc-inka',
      toType: 'location',
      toId: 'loc-salt-pier',
      kind: 'locatedAt',
      visibility: 'party',
      createdAt: 1,
    },
    {
      id: 'rel-2',
      fromType: 'npc',
      fromId: 'npc-inka',
      toType: 'faction',
      toId: 'fac-wells',
      kind: 'memberOf',
      visibility: 'party',
      createdAt: 1,
    },
    {
      id: 'rel-3',
      fromType: 'magicItem',
      fromId: 'item-tidecaller',
      toType: 'location',
      toId: 'loc-salt-pier',
      kind: 'locatedAt',
      visibility: 'party',
      createdAt: 1,
    },
  ],
};

function PlayerViewPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const campaignIdParam = searchParams.get('campaignId');
  const { user, loading: authLoading } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(campaignIdParam);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    const unsub = subscribeToUserCampaigns(
      user.uid,
      (list: Campaign[]) => {
        setCampaigns(list);
        if (!selectedId && list.length > 0) {
          const sorted = [...list].sort(
            (a, b) =>
              (getLastSessionAt(b) ?? getLastOpenedAt(b) ?? 0) -
              (getLastSessionAt(a) ?? getLastOpenedAt(a) ?? 0)
          );
          setSelectedId(sorted[0].id);
        }
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [user, authLoading, selectedId]);

  const activeCampaign = campaigns.find((c) => c.id === selectedId) ?? null;

  return (
    <main className="min-h-screen bg-parchment">
      {campaigns.length > 1 && (
        <div className="border-b border-rule bg-parchment-deep/50 px-4 py-2">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-2">
            <label className="flex items-center gap-2 font-display text-xs uppercase tracking-wider text-brass-deep">
              Campaign:
              <select
                value={selectedId ?? ''}
                onChange={(e) => setSelectedId(e.target.value)}
                className="rounded border border-rule bg-parchment px-2 py-1 font-serif text-xs text-ink"
              >
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name || 'Untitled Campaign'}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}
      <PlayerSafeLoreView
        data={activeCampaign ? activeCampaign.data : DEMO_PLAYER_VIEW_DATA}
        campaignName={activeCampaign ? activeCampaign.name : 'Sample Campaign (Preview)'}
        onExitPlayerView={() =>
          router.push(activeCampaign ? `/campaign/${activeCampaign.id}` : '/campaign')
        }
      />
    </main>
  );
}

export default function PlayerViewRoutePage() {
  return (
    <Suspense fallback={<div className="p-6 font-serif text-sm italic text-ink-mute">Loading /player-view…</div>}>
      <PlayerViewPageInner />
    </Suspense>
  );
}
