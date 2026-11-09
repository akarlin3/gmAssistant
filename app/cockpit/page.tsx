'use client';

import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Compass, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import {
  subscribeToUserCampaigns,
  updateCampaign,
  type Campaign,
} from '@/lib/firebase/campaigns';
import { getLastSessionAt, getLastOpenedAt } from '@/lib/lastPlayed';
import type { Character } from '@/lib/campaign-types';
import LiveSessionCockpit from '@/components/cockpit/LiveSessionCockpit';

const SANDBOX_COCKPIT_STATE: Record<string, any> = {
  cockpitActiveLocationId: 'loc-salt-pier',
  worldClock: { currentDay: 14 },
  locations: [
    {
      id: 'loc-salt-pier',
      name: 'Old Salt Pier',
      type: 'Settlement',
      description:
        'A fog-slicked timber wharf where lanterns sway above black tidewater and @Inka Thorne watches the hulls. ||Hidden smuggling tunnel beneath Pilings 4-7 leads to the Sunken Cistern.||',
      lighting: 'Dim / Torchlight',
      terrainTags: ['Slick Planks', 'Deep Water', 'Crate Cover'],
      aspects: ['Rotting pilings encrusted with barnacles', 'Echoing foghorns at dusk'],
      factions: '@The Wells Guard',
      stl_link: 'https://www.printables.com/model/harbor-pier-terrain.stl',
      print_status: 'queued',
      player_visible: true,
      isPublic: true,
    },
  ],
  npcs: [
    {
      id: 'npc-inka',
      name: 'Inka Thorne',
      type: 'Friendly / Ally',
      archetype: 'Harbormaster Informant',
      faction: '@The Wells Guard',
      mannerism: 'Taps her signet ring twice before answering any question.',
      goal: 'Keep the sea-lanes open without triggering a blockade',
      flaw: 'Secretly trading manifest ciphers',
      stl_link: 'https://www.printables.com/model/harbormaster-mini.stl',
      print_status: 'sliced',
      player_visible: true,
      isPublic: true,
    },
  ],
  factions: [
    {
      id: 'fac-wells',
      name: 'The Wells Guard',
      archetype: 'Military',
      identity: 'Harbor watch sworn to keep the sea-lanes taxed and open.',
      area: 'Old Salt Pier & Lower Docks',
      heat: 3,
      renown: 1,
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
      status: 'threat',
      triggerNote: 'All ships impounded at @Old Salt Pier',
      player_visible: true,
      isPublic: true,
    },
  ],
  items: [
    {
      id: 'item-tidecaller',
      name: 'Tidecaller Horn',
      rarity: 'Rare Artifact',
      description:
        'Carved from leviathan bone found near @Old Salt Pier. ||Cursed: sounding it advances the Deep Tide clock by 1.||',
      mechanic: 'Once per dusk, blow to part fog in a 60-foot cone and grant +2 Initiative.',
      player_visible: true,
      isPublic: true,
    },
  ],
};

export default function CockpitRootPage() {
  const { user, loading: authLoading } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sandboxState, setSandboxState] = useState<Record<string, any>>(SANDBOX_COCKPIT_STATE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    const unsub = subscribeToUserCampaigns(
      user.uid,
      (list) => {
        setCampaigns(list);
        setActiveId((prev) => {
          if (prev && list.some((c) => c.id === prev)) return prev;
          if (list.length === 0) return null;
          const sorted = [...list].sort(
            (a, b) =>
              (getLastSessionAt(b) ?? getLastOpenedAt(b) ?? 0) -
              (getLastSessionAt(a) ?? getLastOpenedAt(a) ?? 0)
          );
          return sorted[0].id;
        });
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [user, authLoading]);

  const activeCampaign = campaigns.find((c) => c.id === activeId) ?? null;

  const setState: React.Dispatch<React.SetStateAction<Record<string, any>>> = useCallback(
    (updater) => {
      if (!activeCampaign) {
        setSandboxState((prev) => (typeof updater === 'function' ? updater(prev) : updater));
        return;
      }
      const nextData =
        typeof updater === 'function' ? updater(activeCampaign.data || {}) : updater;
      setCampaigns((prev) =>
        prev.map((c) => (c.id === activeCampaign.id ? { ...c, data: nextData } : c))
      );
      void updateCampaign(activeCampaign.id, { data: nextData });
    },
    [activeCampaign]
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-parchment font-display text-sm uppercase tracking-wider text-ink-mute">
        Loading Live Session Cockpit…
      </div>
    );
  }

  const effectiveState = activeCampaign ? activeCampaign.data || {} : sandboxState;
  const effectiveName = activeCampaign ? activeCampaign.name : 'Old Salt Pier (Live Cockpit Demo)';
  const characters = Array.isArray(effectiveState.characters)
    ? (effectiveState.characters as Character[])
    : [];

  return (
    <div className="min-h-screen bg-parchment text-ink">
      <header className="sticky top-0 z-20 border-b-2 border-brass-deep/60 bg-parchment/95 px-4 py-2.5 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href={activeCampaign ? `/campaign/${activeCampaign.id}` : '/campaign'}
              className="inline-flex items-center gap-1 rounded border border-rule bg-parchment-soft px-2.5 py-1 font-display text-[10px] uppercase tracking-wider text-ink-soft hover:border-brass-deep hover:text-ink"
            >
              <ArrowLeft size={12} /> Campaign Editor
            </Link>
            <div className="flex items-center gap-2">
              <Compass size={16} className="text-crimson" />
              <h1 className="font-display text-sm uppercase tracking-wider text-ink sm:text-base">
                Live Session Cockpit
              </h1>
            </div>
            {campaigns.length > 1 && (
              <select
                value={activeId || activeCampaign?.id || ''}
                onChange={(e) => setActiveId(e.target.value)}
                className="rounded border border-rule bg-parchment-soft px-2.5 py-1 font-display text-xs text-ink"
              >
                {campaigns.map((c: Campaign) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Link
              href={
                activeCampaign
                  ? `/campaign/${activeCampaign.id}/player-view`
                  : '/player-view'
              }
              className="inline-flex items-center gap-1 rounded border border-moss/50 bg-moss/10 px-2.5 py-1 font-display text-[10px] uppercase tracking-wider text-moss hover:bg-moss hover:text-parchment"
            >
              <ShieldCheck size={12} /> /player-view
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-4">
        <LiveSessionCockpit
          campaignId={activeCampaign?.id}
          campaignName={effectiveName}
          state={effectiveState}
          setState={setState}
          characters={characters}
        />
      </main>
    </div>
  );
}
