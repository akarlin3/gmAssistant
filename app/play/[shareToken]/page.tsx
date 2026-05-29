'use client';

// Public, unauthenticated player entry point. No GM auth gate. The unguessable
// shareToken in the URL is the capability (see docs/player-mode-audit.md §5).
// Flow: validate token -> pick slot (or restore from localStorage) -> view.

import { use, useEffect, useState } from 'react';
import { subscribeShareMeta } from '@/lib/playerMode/playerClient';
import { validateSlotClaim } from '@/lib/playerMode/validateSlot';
import { loadSlotChoice, saveSlotChoice, clearSlotChoice } from '@/lib/playerMode/slotStorage';
import type { ShareMeta } from '@/lib/playerMode/types';
import PlayerCampaignView from '@/components/PlayerCampaignView';

export default function PlayPage({ params }: { params: Promise<{ shareToken: string }> }) {
  const { shareToken } = use(params);
  const [meta, setMeta] = useState<ShareMeta | null | undefined>(undefined);
  const [slotId, setSlotId] = useState<string | null>(null);

  useEffect(() => {
    const unsub = subscribeShareMeta(shareToken, setMeta, () => setMeta(null));
    return unsub;
  }, [shareToken]);

  // Restore a saved slot once meta arrives, if it's still valid for this version.
  useEffect(() => {
    if (!meta) return;
    const saved = loadSlotChoice(shareToken);
    if (!saved) return;
    const res = validateSlotClaim(meta, { shareToken, slotId: saved.slotId, tokenVersion: saved.tokenVersion }, shareToken);
    if (res.ok) setSlotId(saved.slotId);
    else clearSlotChoice(shareToken);
  }, [meta, shareToken]);

  function pick(id: string) {
    if (!meta) return;
    const res = validateSlotClaim(meta, { shareToken, slotId: id }, shareToken);
    if (!res.ok) return;
    saveSlotChoice({ shareToken, tokenVersion: meta.tokenVersion, slotId: id });
    setSlotId(id);
  }

  function switchPlayer() {
    clearSlotChoice(shareToken);
    setSlotId(null);
  }

  if (meta === undefined) {
    return <Centered>Loading…</Centered>;
  }

  if (meta === null) {
    return (
      <Centered>
        <p className="font-serif text-crimson">This link is invalid or has expired.</p>
        <p className="mt-2 font-serif text-sm italic text-ink-soft">Ask your GM for a new link.</p>
      </Centered>
    );
  }

  const roster = meta.roster ?? [];

  if (slotId) {
    const slot = roster.find((s) => s.slotId === slotId);
    return (
      <PlayerCampaignView
        token={shareToken}
        slotId={slotId}
        campaignId={meta.campaignId}
        displayName={slot?.displayName ?? 'Player'}
        campaignName={meta.campaignName}
        onSwitch={switchPlayer}
      />
    );
  }

  // Slot picker
  return (
    <main className="flex min-h-screen items-center justify-center bg-parchment p-5">
      <div className="w-full max-w-md space-y-5 rounded-lg border border-rule bg-parchment-soft p-6 shadow-page">
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

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-parchment p-5">
      <div className="max-w-sm text-center">{children}</div>
    </main>
  );
}
