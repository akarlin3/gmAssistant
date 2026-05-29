'use client';

// Combined registered player view. Unifies the dashboard/tab link view
// with the unauthenticated green link view. It reads the GM-published redacted
// SlotProjection from Firestore using the campaign's shareToken and presents the slot picker.

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { type Campaign } from '@/lib/firebase/campaigns';
import { subscribeShareMeta } from '@/lib/playerMode/playerClient';
import { validateSlotClaim } from '@/lib/playerMode/validateSlot';
import { loadSlotChoice, saveSlotChoice, clearSlotChoice } from '@/lib/playerMode/slotStorage';
import type { ShareMeta } from '@/lib/playerMode/types';
import PlayerCampaignView from './PlayerCampaignView';
import { AccountMenu } from './AccountMenu';
import { ChevronLeft } from 'lucide-react';

export default function PlayerView({ campaign, userEmail }: { campaign: Campaign; userEmail: string }) {
  const shareToken = campaign.data?.player?.shareToken;
  const [meta, setMeta] = useState<ShareMeta | null | undefined>(undefined);
  const [slotId, setSlotId] = useState<string | null>(null);

  const playlistUrl = campaign.data?.__sessionPlaylist || '';
  const characters = useMemo(() => Array.isArray(campaign.data?.characters) ? campaign.data.characters : [], [campaign.data?.characters]);
  const sessionLogs = useMemo(() => Array.isArray(campaign.data?.sessionLogs) ? campaign.data.sessionLogs : [], [campaign.data?.sessionLogs]);
  const sessionLogsV2 = useMemo(() => Array.isArray(campaign.data?.sessionLogV2) ? campaign.data.sessionLogV2 : [], [campaign.data?.sessionLogV2]);

  const allRecaps = useMemo(() => {
    const list: any[] = [];
    sessionLogs.forEach(l => {
      list.push({
        id: l.id,
        title: l.title || 'Untitled Session',
        date: l.date || '',
        body: l.body || 'No notes.',
        events: [],
      });
    });
    sessionLogsV2.forEach((l: any) => {
      if (list.some(x => x.id === l.id)) return;
      list.push({
        id: l.id,
        title: l.title || `Session ${l.number || ''}`,
        date: l.date || '',
        body: l.recap || 'No notes.',
        events: l.events || [],
        xpAwarded: l.xpAwarded,
        strongStart: l.strongStart,
        secretsRevealed: l.secretsRevealed || [],
        scenesUsed: l.scenesUsed || [],
        goalUpdates: l.goalUpdates || [],
        linkedPrepItems: l.linkedPrepItems || [],
      });
    });
    return list.sort((a, b) => b.date.localeCompare(a.date));
  }, [sessionLogs, sessionLogsV2]);

  useEffect(() => {
    if (!shareToken) return;
    const unsub = subscribeShareMeta(shareToken, setMeta, () => setMeta(null));
    return unsub;
  }, [shareToken]);

  // Restore a saved slot once meta arrives, if it's still valid for this version.
  useEffect(() => {
    if (!shareToken || !meta) return;
    const saved = loadSlotChoice(shareToken);
    if (!saved) return;
    const res = validateSlotClaim(meta, { shareToken, slotId: saved.slotId, tokenVersion: saved.tokenVersion }, shareToken);
    if (res.ok) setSlotId(saved.slotId);
    else clearSlotChoice(shareToken);
  }, [meta, shareToken]);

  function pick(id: string) {
    if (!shareToken || !meta) return;
    const res = validateSlotClaim(meta, { shareToken, slotId: id }, shareToken);
    if (!res.ok) return;
    saveSlotChoice({ shareToken, tokenVersion: meta.tokenVersion, slotId: id });
    setSlotId(id);
  }

  function switchPlayer() {
    if (!shareToken) return;
    clearSlotChoice(shareToken);
    setSlotId(null);
  }

  if (!shareToken) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-parchment p-5">
        <div className="w-full max-w-md space-y-4 rounded-lg border border-rule bg-parchment-soft p-6 text-center shadow-page">
          <header className="mb-4 flex items-center justify-between border-b border-rule pb-3">
            <Link href="/campaign" className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-brass-deep transition-colors hover:text-crimson">
              <ChevronLeft size={14} /> Back
            </Link>
            <AccountMenu />
          </header>
          <p className="font-serif text-crimson">Sharing is not enabled for this campaign yet.</p>
          <p className="font-serif text-sm italic text-ink-soft">Ask your GM to activate Player Mode sharing.</p>
        </div>
      </main>
    );
  }

  if (meta === undefined) {
    return <Centered campaignName={campaign.name}><p className="font-serif text-sm italic text-ink-mute">Loading Player Mode…</p></Centered>;
  }

  if (meta === null) {
    return (
      <Centered campaignName={campaign.name}>
        <p className="font-serif text-crimson">This campaign link is invalid or has expired.</p>
        <p className="mt-2 font-serif text-sm italic text-ink-soft">Ask your GM to rotate or regenerate the share link.</p>
      </Centered>
    );
  }

  const roster = meta.roster ?? [];

  if (slotId) {
    const slot = roster.find((s) => s.slotId === slotId);
    return (
      <div className="min-h-screen bg-parchment">
        {/* Helper Navigation bar for authenticated players to return to dashboard */}
        <div className="flex items-center justify-between border-b border-rule bg-parchment-deep/40 px-4 py-1.5 text-xs">
          <Link href="/campaign" className="flex items-center gap-1 font-display text-[10px] uppercase tracking-wider text-brass-deep transition-colors hover:text-crimson">
            <ChevronLeft size={12} /> Dashboard
          </Link>
          <AccountMenu />
        </div>
        <PlayerCampaignView
          token={shareToken}
          slotId={slotId}
          campaignId={meta.campaignId}
          displayName={slot?.displayName ?? 'Player'}
          campaignName={meta.campaignName}
          onSwitch={switchPlayer}
          playlistUrl={playlistUrl}
          sessionRecaps={allRecaps}
          unredactedCharacters={characters}
        />
      </div>
    );
  }

  // Slot picker for registered players
  return (
    <main className="flex min-h-screen items-center justify-center bg-parchment p-5">
      <div className="w-full max-w-md space-y-5 rounded-lg border border-rule bg-parchment-soft p-6 shadow-page">
        <div className="flex items-center justify-between border-b border-rule pb-3">
          <Link href="/campaign" className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-brass-deep transition-colors hover:text-crimson">
            <ChevronLeft size={14} /> Back
          </Link>
          <AccountMenu />
        </div>
        <div className="text-center">
          <div className="font-display text-[10px] uppercase tracking-[0.3em] text-brass-deep">Join as a player</div>
          <h1 className="font-display text-2xl tracking-wide text-ink">{meta.campaignName}</h1>
          <p className="mt-1 font-serif text-sm italic text-ink-soft">Pick your name to continue.</p>
        </div>
        {roster.length === 0 ? (
          <p className="text-center font-serif text-sm italic text-ink-mute">
            Your GM hasn’t set up the player roster yet. Check back soon.
          </p>
        ) : (
          <div className="space-y-2">
            {roster.map((s) => (
              <button
                key={s.slotId}
                onClick={() => pick(s.slotId)}
                className="flex w-full items-center gap-3 rounded border border-rule bg-parchment px-4 py-3 text-left font-display tracking-wide text-ink transition-colors hover:border-brass-deep hover:bg-brass/5"
              >
                <span className="size-4 flex-shrink-0 rounded-full border border-rule" style={{ backgroundColor: s.color || '#8a6d3b' }} />
                {s.displayName}
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function Centered({ campaignName, children }: { campaignName: string; children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-parchment p-5">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-rule bg-parchment-soft p-6 text-center shadow-page">
        <header className="flex items-center justify-between border-b border-rule pb-3">
          <Link href="/campaign" className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-brass-deep transition-colors hover:text-crimson">
            <ChevronLeft size={14} /> Back
          </Link>
          <AccountMenu />
        </header>
        <div>
          <h1 className="mb-1 font-display text-lg tracking-wide text-ink">{campaignName}</h1>
          {children}
        </div>
      </div>
    </main>
  );
}
