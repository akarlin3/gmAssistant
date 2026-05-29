'use client';

import React from 'react';
import { Layers } from 'lucide-react';
import { Section, Field } from '../prepPrimitives';
import { Phase } from '../phase';
import { type CampaignEditorModel } from '../useCampaignEditor';

interface ArcPhaseProps {
  ed: Pick<CampaignEditorModel,
    | 'done' | 'get' | 'open' | 'phaseOpen' | 'setVal' | 'toggleDone' | 'toggleOpen' | 'togglePhase'
  >;
}

export function ArcPhase({ ed }: ArcPhaseProps) {
  const { done, get, open, phaseOpen, setVal, toggleDone, toggleOpen, togglePhase } = ed;
  return (
    <Phase n="5" title="Mid-Campaign · Arc Planning" sub="Periodic Review (Every 5-10 Sessions)" methods={['ccd', 'pr']} audience="solo" icon={Layers} expanded={phaseOpen.p5} onToggle={() => togglePhase('p5')}>
      <Section id="audit-goals" title="PC Goal Audit" methods={['pr']} done={done['audit-goals']} onToggle={toggleDone} open={open['audit-goals']} onToggleOpen={toggleOpen}>
        <Field value={get('auditGoals', '')} onChange={(v) => setVal('auditGoals', v)} placeholder="Still active? Completed? Boring?" rows={5} />
      </Section>
      <Section id="audit-factions" title="Faction Audit" methods={['pr', 'ccd']} done={done['audit-factions']} onToggle={toggleDone} open={open['audit-factions']} onToggleOpen={toggleOpen}>
        <Field value={get('auditFactions', '')} onChange={(v) => setVal('auditFactions', v)} placeholder="..." rows={5} />
      </Section>
      <Section id="audit-secrets" title="Secrets Audit" methods={['shea']} done={done['audit-secrets']} onToggle={toggleDone} open={open['audit-secrets']} onToggleOpen={toggleOpen}>
        <Field value={get('auditSecrets', '')} onChange={(v) => setVal('auditSecrets', v)} placeholder="Which secrets never landed?" rows={4} />
      </Section>
    </Phase>
  );
}
