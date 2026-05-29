'use client';

import React from 'react';
import { Target, Plus } from 'lucide-react';
import { BookQuote, TargetBar } from '../prepPrimitives';
import { Phase } from '../phase';
import { ClockCard } from '../cards';
import { TARGETS, countFilled } from '@/lib/prepTargets';
import { type CampaignEditorModel } from '../useCampaignEditor';

interface ClocksPhaseProps {
  ed: Pick<CampaignEditorModel,
    | 'done' | 'get' | 'open' | 'phaseOpen' | 'setVal' | 'toggleDone' | 'toggleOpen' | 'togglePhase' | 'tgt' | 'trackEvent'
  >;
}

export function ClocksPhase({ ed }: ClocksPhaseProps) {
  const { get, phaseOpen, setVal, togglePhase, tgt, trackEvent } = ed;
  return (
    <Phase n="4" title="Between Sessions · Faction Clocks" sub="Update Faction Progress" methods={['ccd']} audience="solo" icon={Target} expanded={phaseOpen.p4} onToggle={() => togglePhase('p4')}>
      <BookQuote source="CCD ch. 6">Glance at faction clocks once per session.</BookQuote>
      <div className="rounded border border-rule bg-parchment-deep/40 p-3 font-serif text-sm">
        <p className="mb-1.5 font-display text-xs uppercase tracking-wider text-ink">Clock Sizes</p>
        <div className="grid grid-cols-2 gap-1 text-ink-soft">
          <p>4 — quick task</p><p>6 — short-term goal</p>
          <p>8 — multi-session</p><p>12 — long project</p>
          <p>16 — arc-defining</p>
        </div>
      </div>
      <div id="section-clocks" />
      <TargetBar current={countFilled('clocks', get('clocks', []))} target={tgt('clocks')} source={TARGETS.clocks.source} />
      {(get('clocks', []) as any[]).map((c: any, i: number) => (
        <ClockCard key={i} data={c} onChange={(v: any) => {
          const next = [...(get('clocks', []) as any[])]; next[i] = v; setVal('clocks', next);
          if ((c.filled || 0) !== (v.filled || 0)) {
            trackEvent(
              'faction_clock_ticked',
              `${v.faction || c.faction || 'Faction'}: ${v.text || c.text || 'clock'} ${c.filled || 0} → ${v.filled || 0} / ${v.max || c.max || 6}`,
              c.filled || 0, v.filled || 0,
            );
          }
          if ((c.notes || '') !== (v.notes || '')) {
            trackEvent(
              'other',
              `Updated notes on clock: ${v.faction || c.faction || 'Faction'} — ${v.text || c.text || 'clock'}`,
            );
          }
        }} onRemove={() => setVal('clocks', (get('clocks', []) as any[]).filter((_: any, j: number) => j !== i))} />
      ))}
      <button onClick={() => setVal('clocks', [...(get('clocks', []) as any[]), { text: '', faction: '', max: 6, filled: 0 }])} className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:text-crimson">
        <Plus size={12} /> Add Clock
      </button>
    </Phase>
  );
}
