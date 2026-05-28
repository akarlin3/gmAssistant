'use client';

import React from 'react';
import {
  Undo2,
  Eye,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
} from 'lucide-react';
import { SoloNote } from '@/components/campaignEditor/prepPrimitives';
import { relativeTime } from '@/lib/relativeTime';
import { BriefingView } from './BriefingView';
import { useLivingWorldData } from './livingWorld/useLivingWorldData';
import { TickRulesSection } from './livingWorld/TickRulesSection';
import { AgendasSection } from './livingWorld/AgendasSection';
import { PreviewModal } from './livingWorld/PreviewModal';
import type { GetFn, SetFn } from './livingWorld/types';

type Props = {
  get: GetFn;
  setVal: SetFn;
  isPro: boolean;
  soloMode: boolean;
  campaignName: string;
};

export default function LivingWorldTab({ get, setVal, isPro, soloMode, campaignName }: Props) {
  const {
    clocks,
    downtime,
    factions,
    npcs,
    wc,
    preview,
    setPreview,
    canUndoNow,
    entityNameFor,
    openPreview,
    applyPreview,
    onUndo,
    addRule,
    updateRule,
    removeRule,
    addAgenda,
    updateAgenda,
    removeAgenda,
    setBriefingNarrative,
  } = useLivingWorldData(get, setVal);

  const briefings = [...wc.briefingLog].reverse();

  return (
    <div className="space-y-5">
      <SoloNote>
        The world keeps turning between sessions. Define tick rules so faction clocks advance,
        downtime resolves, and NPCs chase their agendas on their own — then read the &ldquo;While
        You Were Away&rdquo; briefing when you sit back down. No more frozen world waiting on you.
      </SoloNote>

      {/* World status + advance controls */}
      <section className="rounded border border-rule bg-parchment p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CalendarClock size={20} className="text-crimson" />
            <div>
              <div className="font-display text-lg text-ink">In-World Day {wc.currentDay}</div>
              <div className="font-serif text-xs text-ink-mute">
                Last advanced {relativeTime(new Date(wc.lastTickAt))}
              </div>
            </div>
          </div>
          <button
            onClick={onUndo}
            disabled={!canUndoNow}
            className="inline-flex items-center gap-1.5 rounded border border-rule px-2.5 py-1.5 font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep disabled:opacity-40"
          >
            <Undo2 size={12} /> Undo Last Tick
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => openPreview(wc.currentDay + 1, 'Advance 1 Day')}
            className="inline-flex items-center gap-1.5 rounded bg-parchment-deep px-3 py-1.5 font-display text-xs uppercase tracking-wider text-ink hover:bg-rule"
          >
            <CalendarDays size={12} /> Advance 1 Day
          </button>
          <button
            onClick={() => openPreview(wc.currentDay + 7, 'Advance 1 Week')}
            className="inline-flex items-center gap-1.5 rounded bg-parchment-deep px-3 py-1.5 font-display text-xs uppercase tracking-wider text-ink hover:bg-rule"
          >
            <CalendarDays size={12} /> Advance 1 Week
          </button>
          <button
            onClick={() => openPreview(wc.currentDay + 7, 'Advance To Next Session')}
            className="inline-flex items-center gap-1.5 rounded bg-crimson px-3 py-1.5 font-display text-xs uppercase tracking-wider text-parchment hover:bg-wine"
          >
            <CalendarPlus size={12} /> Advance To Next Session
          </button>
        </div>
      </section>

      {!soloMode && (
        <div className="rounded border border-brass/40 bg-brass/5 p-3 font-serif text-sm text-ink-soft">
          <span className="font-display text-xs uppercase tracking-wider text-brass-deep">
            Note ·{' '}
          </span>
          Auto-progression is built for solo play. Your tick rules are saved, but switch to Solo
          mode if you want the world to move on its own between sessions.
        </div>
      )}

      {/* Tick rules */}
      <TickRulesSection
        rules={wc.tickRules}
        clocks={clocks}
        downtime={downtime}
        factions={factions}
        entityNameFor={entityNameFor}
        onAdd={addRule}
        onUpdate={updateRule}
        onRemove={removeRule}
      />

      {/* NPC agendas */}
      <AgendasSection
        agendas={wc.agendas}
        npcs={npcs}
        onAdd={addAgenda}
        onUpdate={updateAgenda}
        onRemove={removeAgenda}
      />

      {/* Briefing log */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-display text-sm uppercase tracking-wider text-brass-deep">
          <Eye size={14} /> Briefing Log
        </h2>
        {briefings.length === 0 ? (
          <p className="rounded border border-dashed border-rule p-3 text-sm italic text-ink-mute">
            No briefings yet. Advance the world to generate one.
          </p>
        ) : (
          briefings.map((b) => (
            <BriefingView
              key={b.id}
              briefing={b}
              isPro={isPro}
              campaignName={campaignName}
              onNarrative={setBriefingNarrative}
            />
          ))
        )}
      </section>

      {preview && (
        <PreviewModal
          preview={preview}
          currentDay={wc.currentDay}
          onChangeDay={(toDay) => openPreview(toDay, preview.label)}
          onApply={applyPreview}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}
