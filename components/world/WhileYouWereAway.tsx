'use client';

import { useState } from 'react';
import { CalendarClock, X } from 'lucide-react';
import { applyTicks } from '@/lib/world/tick';
import { readWorldClock, STALE_WORLD_MS, type WorldClock } from '@/lib/world/types';
import { BriefingView } from './BriefingView';

type GetFn = (k: string, fb: any) => any;
type SetFn = (k: string, v: any) => void;

// Pinned at the top of Session Mode on open. Two states:
//   1. A pending briefing (a tick was just applied) — show it, dismissable.
//   2. A stale world (last tick > 24h ago) with rules/agendas defined —
//      prompt "Advance the world?" with a day-count input.
export function WhileYouWereAway({
  get,
  setVal,
  isPro,
  campaignName,
}: {
  get: GetFn;
  setVal: SetFn;
  isPro: boolean;
  campaignName: string;
}) {
  const [days, setDays] = useState(7);

  const wc: WorldClock = readWorldClock({ worldClock: get('worldClock', null) });
  const pendingId = (get('__livingWorldBriefingPendingId', '') as string) || '';
  const promptDismissed = !!get('__livingWorldPromptDismissed', false);

  const pending = pendingId ? wc.briefingLog.find((b) => b.id === pendingId) : undefined;

  const buildData = () => ({
    worldClock: wc,
    clocks: get('clocks', []),
    downtime: get('downtime', []),
    factions: get('factions', []),
    npcs: get('npcs', []),
  });

  const setBriefingNarrative = (briefingId: string, narrative: string) => {
    const next = structuredClone(wc);
    const b = next.briefingLog.find((x) => x.id === briefingId);
    if (b) b.narrative = narrative;
    setVal('worldClock', next);
  };

  // State 1: a briefing is pending — show it.
  if (pending) {
    return (
      <div className="relative mb-4">
        <button
          onClick={() => setVal('__livingWorldBriefingPendingId', '')}
          title="Dismiss"
          className="absolute right-2 top-2 z-10 text-ink-mute hover:text-crimson"
        >
          <X size={16} />
        </button>
        <BriefingView
          briefing={pending}
          isPro={isPro}
          campaignName={campaignName}
          onNarrative={setBriefingNarrative}
        />
      </div>
    );
  }

  // State 2: stale world with something to advance — offer to advance.
  const stale = Date.now() - wc.lastTickAt > STALE_WORLD_MS;
  const hasMechanisms = wc.tickRules.some((r) => !r.paused) || wc.agendas.length > 0;
  if (!stale || !hasMechanisms || promptDismissed) return null;

  const advance = () => {
    const toDay = wc.currentDay + Math.max(1, days);
    const { data: next, briefing } = applyTicks({ data: buildData(), toDay });
    setVal('clocks', next.clocks);
    setVal('downtime', next.downtime);
    setVal('factions', next.factions);
    setVal('worldClock', next.worldClock);
    setVal('__livingWorldBriefingPendingId', briefing.id);
  };

  return (
    <div className="mb-4 rounded-lg border border-wine/40 bg-wine/5 p-4">
      <div className="flex items-center gap-2">
        <CalendarClock size={18} className="text-wine" />
        <h3 className="font-display text-sm uppercase tracking-wider text-wine">
          Advance The World?
        </h3>
        <button
          onClick={() => setVal('__livingWorldPromptDismissed', true)}
          className="ml-auto text-ink-mute hover:text-crimson"
          title="Not now"
        >
          <X size={16} />
        </button>
      </div>
      <p className="mt-1.5 font-serif text-sm text-ink-soft">
        It&rsquo;s been a while since the world last moved. Roll faction clocks, downtime, and NPC
        agendas forward before you begin.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-sm">
          <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
            Days
          </span>
          <input
            name="targetDay"
            type="number"
            min={1}
            value={days}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              setDays(isNaN(v) ? 1 : Math.max(1, v));
            }}
            className="w-20 rounded border border-rule bg-parchment px-2 py-1 text-ink"
          />
        </label>
        <button
          onClick={advance}
          className="rounded bg-crimson px-3 py-1.5 font-display text-xs uppercase tracking-wider text-parchment hover:bg-wine"
        >
          Advance
        </button>
        <button
          onClick={() => setVal('__livingWorldPromptDismissed', true)}
          className="rounded border border-rule px-3 py-1.5 font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep"
        >
          Not Now
        </button>
      </div>
    </div>
  );
}
