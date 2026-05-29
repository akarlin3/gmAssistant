'use client';

import React from 'react';
import { Users, Target, Plus } from 'lucide-react';
import { BookQuote, SoloNote, Pitfall, Section, Example, InspireGroup, TargetBar, GoalCard } from '../prepPrimitives';
import { Phase } from '../phase';
import PartyTab from '../../PartyTab';
import { TARGETS, countFilled } from '@/lib/prepTargets';
import { type CampaignEditorModel } from '../useCampaignEditor';

interface PartyPhaseProps {
  ed: Pick<CampaignEditorModel,
    | 'addPc' | 'done' | 'get' | 'isPro' | 'open' | 'openPcs' | 'pcFileInputRef' | 'pcUploadError'
    | 'pcs' | 'phaseOpen' | 'removePc' | 'roster' | 'setOpenPcs' | 'setVal'
    | 'toggleDone' | 'toggleOpen' | 'togglePhase' | 'tgt' | 'updatePc' | 'uploadPcSheet' | 'uploadingPc'
  >;
}

export function PartyPhase({ ed }: PartyPhaseProps) {
  const {
    addPc, done, get, isPro, open, openPcs, pcFileInputRef, pcUploadError,
    pcs, phaseOpen, removePc, roster, setOpenPcs, setVal,
    toggleDone, toggleOpen, togglePhase, tgt, updatePc, uploadPcSheet, uploadingPc,
  } = ed;
  return (
    <Phase n="2" title="Session 0 — Party & Goals" sub="PCs Created After the World Exists" methods={['pr', 'shea']} audience="together" icon={Users} expanded={phaseOpen.p2} onToggle={() => togglePhase('p2')}>
      <SoloNote>Solo Session 0 is fast. Spend the saved time on goal craft.</SoloNote>
      <Section id="pc" title="Player Characters" methods={['shea']} done={done.pc} onToggle={toggleDone} open={open.pc} onToggleOpen={toggleOpen}>
        <BookQuote source="Lazy DM (Chris Perkins)">Nothing&apos;s more important to a campaign than the stories of the player characters.</BookQuote>
        <div className="space-y-3">
          <PartyTab
            pcs={pcs}
            openMap={openPcs}
            isPro={isPro}
            uploading={uploadingPc}
            uploadError={pcUploadError}
            onToggleOpen={(id) => setOpenPcs(o => ({ ...o, [id]: !o[id] }))}
            onAdd={addPc}
            onUpdate={updatePc}
            onRemove={removePc}
            onUploadClick={() => pcFileInputRef.current?.click()}
            roster={roster}
          />
          <input
            ref={pcFileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.json,application/pdf,image/png,image/jpeg,image/webp,image/gif,text/plain,application/json,text/markdown"
            onChange={uploadPcSheet}
            className="hidden"
          />
        </div>
      </Section>
      <Section id="goals" title="PC Goals (5 Rules of Proactive Fun)" methods={['pr']} done={done.goals} onToggle={toggleDone} open={open.goals} onToggleOpen={toggleOpen} icon={Target}>
        <div className="space-y-1.5 rounded border border-wine/40 bg-wine/5 p-3 font-serif text-sm text-ink-soft">
          <p><span className="font-display text-xs uppercase tracking-wider text-wine">1 · </span>Multiple Goals (3+ concurrent)</p>
          <p><span className="font-display text-xs uppercase tracking-wider text-wine">2 · </span>Varying Timeframes</p>
          <p><span className="font-display text-xs uppercase tracking-wider text-wine">3 · </span>Achievable (measurable)</p>
          <p><span className="font-display text-xs uppercase tracking-wider text-wine">4 · </span>Consequences for Failure</p>
          <p><span className="font-display text-xs uppercase tracking-wider text-wine">5 · </span>Fun to Pursue</p>
        </div>
        <Example title="Bad → Good">&quot;Become powerful&quot; → &quot;Win a duel against the captain of the guard&quot;</Example>
        <Pitfall>Long-term goals locked in Session 0 are usually worse than ones locked after Session 1.</Pitfall>
        <TargetBar current={countFilled('pcGoals', get('pcGoals', []))} target={tgt('pcGoals')} source={TARGETS.pcGoals.source} />
        {(get('pcGoals', []) as any[]).map((g: any, i: number) => (
          <GoalCard key={i} data={g} onChange={(v: any) => {
            const next = [...(get('pcGoals', []) as any[])]; next[i] = v; setVal('pcGoals', next);
          }} onRemove={() => setVal('pcGoals', (get('pcGoals', []) as any[]).filter((_: any, j: number) => j !== i))} />
        ))}
        <button onClick={() => setVal('pcGoals', [...(get('pcGoals', []) as any[]), { text: '', timeframe: 'short', success: '', failure: '', linked: '' }])} className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:text-crimson">
          <Plus size={12} /> Add Goal
        </button>
      </Section>
    </Phase>
  );
}
