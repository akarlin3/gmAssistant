'use client';

import React from 'react';
import { Target, Plus } from 'lucide-react';
import { BookQuote, TargetBar } from '../prepPrimitives';
import { Phase } from '../phase';
import { ClockCard } from '../cards';
import { TARGETS, countFilled } from '@/lib/prepTargets';
import { makeEntityId } from '@/lib/playerMode/share';
import { syncEntityPlayerVisibility } from '@/lib/playerMode/spoilers';
import SessionDeltaLogPanel from '@/components/world/SessionDeltaLogPanel';
import { type CampaignEditorModel } from '../useCampaignEditor';

interface ClocksPhaseProps {
  ed: Pick<CampaignEditorModel,
    | 'done' | 'get' | 'open' | 'phaseOpen' | 'setVal' | 'setState' | 'state' | 'toggleDone' | 'toggleOpen' | 'togglePhase' | 'tgt' | 'trackEvent'
  >;
}

export function ClocksPhase({ ed }: ClocksPhaseProps) {
  const { get, phaseOpen, setVal, setState, state, togglePhase, tgt, trackEvent } = ed;
  return (
    <Phase n="4" title="Between Sessions · Faction Clocks & Session Delta Log" sub="Update Faction Progress & World-State Engine" methods={['ccd']} audience="solo" icon={Target} expanded={phaseOpen.p4} onToggle={() => togglePhase('p4')}>
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
        <div key={c.id || i} id={c.id ? `entity-${c.id}` : undefined}>
          <ClockCard data={c} onChange={(v: any) => {
            const cid = v.id || c.id || makeEntityId();
            const updated = { ...v, id: cid };
            const next = [...(get('clocks', []) as any[])]; next[i] = updated; setVal('clocks', next);
            const curConfig = get('player', {});
            setVal('player', syncEntityPlayerVisibility(curConfig, 'clocks', cid, Boolean(updated.player_visible ?? updated.isPublic)));
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
        </div>
      ))}
      <button onClick={() => setVal('clocks', [...(get('clocks', []) as any[]), { id: makeEntityId(), text: '', faction: '', max: 6, filled: 0, status: 'active', triggerNote: '' }])} className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:text-crimson">
        <Plus size={12} /> Add Clock
      </button>

      {/* Module 3: Session Delta Log */}
      <div className="border-t border-rule pt-3">
        <SessionDeltaLogPanel state={state} setState={setState} />
      </div>
    </Phase>
  );
}
