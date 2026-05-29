'use client';

import React from 'react';
import { Layers, Eye, EyeOff } from 'lucide-react';
import { BookQuote, Section, Example, ListField, Field, InspireGroup, Inspire, CardLabel } from '../prepPrimitives';
import { Phase } from '../phase';
import { type CampaignEditorModel } from '../useCampaignEditor';

interface PitchPhaseProps {
  ed: Pick<CampaignEditorModel,
    | 'done' | 'get' | 'open' | 'phaseOpen' | 'setVal' | 'toggleDone' | 'toggleOpen' | 'togglePhase' | 'tgt'
  >;
}

export function PitchPhase({ ed }: PitchPhaseProps) {
  const { done, get, open, phaseOpen, setVal, toggleDone, toggleOpen, togglePhase, tgt } = ed;
  return (
    <Phase n="0" title="Givens & Pitch" sub="Decide What's Non-Negotiable" methods={['ccd']} audience="solo" icon={Layers} expanded={phaseOpen.p0} onToggle={() => togglePhase('p0')}>
      <BookQuote source="CCD ch. 1">Givens are a set of things your group agrees will feature regardless of how worldbuilding ends up.</BookQuote>
      <Section id="g-world" title="World Facts" methods={['ccd']} done={done['g-world']} onToggle={toggleDone} open={open['g-world']} onToggleOpen={toggleOpen}>
        <Example title="from CCD">&quot;Post-apocalyptic.&quot; &quot;The sun has gone out.&quot; &quot;Magic has died.&quot;</Example>
        <ListField
          items={get('gWorld', [])}
          onChange={(v) => setVal('gWorld', v)}
          placeholder="A world fact"
          target={tgt('gWorld')}
          isShared={(i) => !!get('player', {}).planningVisibility?.gWorld?.[i]}
          onToggleShare={(i) => {
            const curConfig = get('player', {});
            const pv = { ...(curConfig.planningVisibility ?? {}) };
            const curArr = [...(pv.gWorld ?? [])];
            curArr[i] = !curArr[i];
            pv.gWorld = curArr;
            setVal('player', { ...curConfig, planningVisibility: pv });
          }}
        />
      </Section>
      <Section id="g-fnl" title="Required Factions, NPCs & Locations" methods={['ccd']} done={done['g-fnl']} onToggle={toggleDone} open={open['g-fnl']} onToggleOpen={toggleOpen}>
        <ListField
          items={get('gFNL', [])}
          onChange={(v) => setVal('gFNL', v)}
          placeholder="A specific entity"
          target={tgt('gFNL')}
          isShared={(i) => !!get('player', {}).planningVisibility?.gFNL?.[i]}
          onToggleShare={(i) => {
            const curConfig = get('player', {});
            const pv = { ...(curConfig.planningVisibility ?? {}) };
            const curArr = [...(pv.gFNL ?? [])];
            curArr[i] = !curArr[i];
            pv.gFNL = curArr;
            setVal('player', { ...curConfig, planningVisibility: pv });
          }}
        />
      </Section>
      <Section id="g-mech" title="Mechanics & System" methods={['ccd']} done={done['g-mech']} onToggle={toggleDone} open={open['g-mech']} onToggleOpen={toggleOpen}>
        <Field value={get('system', '')} onChange={(v) => setVal('system', v)} placeholder="System (e.g. 5e)" />
        <CardLabel>Tone Keywords</CardLabel>
        <ListField
          items={get('tone', [])}
          onChange={(v) => setVal('tone', v)}
          placeholder="A tone word"
          isShared={(i) => !!get('player', {}).planningVisibility?.tone?.[i]}
          onToggleShare={(i) => {
            const curConfig = get('player', {});
            const pv = { ...(curConfig.planningVisibility ?? {}) };
            const curArr = [...(pv.tone ?? [])];
            curArr[i] = !curArr[i];
            pv.tone = curArr;
            setVal('player', { ...curConfig, planningVisibility: pv });
          }}
        />
      </Section>
      <Section id="g-lines" title="Content Lines (Hard Nos)" methods={['ccd']} done={done['g-lines']} onToggle={toggleDone} open={open['g-lines']} onToggleOpen={toggleOpen}>
        <ListField
          items={get('lines', [])}
          onChange={(v) => setVal('lines', v)}
          placeholder="A topic to avoid"
          target={tgt('lines')}
          isShared={(i) => !!get('player', {}).planningVisibility?.lines?.[i]}
          onToggleShare={(i) => {
            const curConfig = get('player', {});
            const pv = { ...(curConfig.planningVisibility ?? {}) };
            const curArr = [...(pv.lines ?? [])];
            curArr[i] = !curArr[i];
            pv.lines = curArr;
            setVal('player', { ...curConfig, planningVisibility: pv });
          }}
        />
      </Section>
      <Section id="pitch" title="Quick Pitch" methods={['ccd']} done={done.pitch} onToggle={toggleDone} open={open.pitch} onToggleOpen={toggleOpen}>
        <BookQuote source="CCD case study">Pitch the results, not the concept.</BookQuote>
        <Field value={get('pitch', '')} onChange={(v) => setVal('pitch', v)} placeholder="2-3 sentences" rows={4} />
        {(() => {
          const curConfig = get('player', {});
          const pitchShared = !!curConfig.planningVisibility?.pitch;
          return (
            <div className="mt-1 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  const pv = { ...(curConfig.planningVisibility ?? {}) };
                  pv.pitch = !pv.pitch;
                  setVal('player', { ...curConfig, planningVisibility: pv });
                }}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors ${
                  pitchShared ? 'bg-moss/10 font-medium text-moss hover:bg-moss/20' : 'border border-rule bg-parchment-deep text-ink-mute hover:text-ink'
                }`}
              >
                {pitchShared ? <Eye size={12} /> : <EyeOff size={12} />}
                {pitchShared ? 'Shared with Players' : 'Private (Click to share)'}
              </button>
            </div>
          );
        })()}
        <InspireGroup>
          <span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">Goal seeds:</span>
          <Inspire tableId="dungeonGoals" label="Dungeon" onPick={(e) => {
            const cur = get('pitch', '') as string;
            setVal('pitch', cur ? `${cur}\n• ${e}` : `• ${e}`);
          }} />
          <Inspire tableId="wildernessGoals" label="Wilderness" onPick={(e) => {
            const cur = get('pitch', '') as string;
            setVal('pitch', cur ? `${cur}\n• ${e}` : `• ${e}`);
          }} />
          <Inspire tableId="urbanGoals" label="Urban" onPick={(e) => {
            const cur = get('pitch', '') as string;
            setVal('pitch', cur ? `${cur}\n• ${e}` : `• ${e}`);
          }} />
        </InspireGroup>
      </Section>
    </Phase>
  );
}
