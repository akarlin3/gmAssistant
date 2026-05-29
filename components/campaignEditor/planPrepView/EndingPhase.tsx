'use client';

import React from 'react';
import { Trophy } from 'lucide-react';
import { BookQuote, Section, Field, InspireGroup, Inspire } from '../prepPrimitives';
import { Phase } from '../phase';
import { type CampaignEditorModel } from '../useCampaignEditor';

interface EndingPhaseProps {
  ed: Pick<CampaignEditorModel,
    | 'done' | 'get' | 'open' | 'phaseOpen' | 'setVal' | 'toggleDone' | 'toggleOpen' | 'togglePhase'
  >;
}

export function EndingPhase({ ed }: EndingPhaseProps) {
  const { done, get, open, phaseOpen, setVal, toggleDone, toggleOpen, togglePhase } = ed;
  return (
    <Phase n="6" title="Ending the Campaign" sub="When and How to Wrap" methods={['ccd']} audience="solo" icon={Trophy} expanded={phaseOpen.p6} onToggle={() => togglePhase('p6')}>
      <BookQuote source="CCD ch. 7">Players maintain desire to keep playing until natural conclusion.</BookQuote>
      <Section id="end-ready" title="Is the Campaign Ready to End?" methods={['ccd']} done={done['end-ready']} onToggle={toggleDone} open={open['end-ready']} onToggleOpen={toggleOpen}>
        <Field value={get('endReadiness', '')} onChange={(v) => setVal('endReadiness', v)} placeholder="Where are we?" rows={3} />
      </Section>
      <Section id="end-collect" title="Collect Every Thread" methods={['ccd']} done={done['end-collect']} onToggle={toggleDone} open={open['end-collect']} onToggleOpen={toggleOpen}>
        <Field value={get('endThreads', '')} onChange={(v) => setVal('endThreads', v)} placeholder="Active threads list" rows={6} />
        <InspireGroup>
          <span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">Inspire:</span>
          <Inspire tableId="climaxes" label="Climax" onPick={(e) => {
            const cur = get('endThreads', '') as string;
            setVal('endThreads', cur ? `${cur}\n• ${e}` : `• ${e}`);
          }} />
          <Inspire tableId="campaignEvents" label="Event" onPick={(e) => {
            const cur = get('endThreads', '') as string;
            setVal('endThreads', cur ? `${cur}\n• ${e}` : `• ${e}`);
          }} />
        </InspireGroup>
      </Section>
      <Section id="end-catalyst" title="Add Catalysts" methods={['ccd']} done={done['end-catalyst']} onToggle={toggleDone} open={open['end-catalyst']} onToggleOpen={toggleOpen}>
        <Field value={get('endCatalyst', '')} onChange={(v) => setVal('endCatalyst', v)} placeholder="Forcing events" rows={3} />
      </Section>
    </Phase>
  );
}
