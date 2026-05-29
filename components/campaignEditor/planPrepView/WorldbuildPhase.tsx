'use client';

import React from 'react';
import { Users, Eye, EyeOff, Plus } from 'lucide-react';
import { BookQuote, SoloNote, Pitfall, Section, Example, ListField, Field, InspireGroup, Inspire, TargetBar } from '../prepPrimitives';
import { Phase } from '../phase';
import { FactionCard } from '../cards';
import { TARGETS, countFilled } from '@/lib/prepTargets';
import { type CampaignEditorModel } from '../useCampaignEditor';

interface WorldbuildPhaseProps {
  ed: Pick<CampaignEditorModel,
    | 'done' | 'get' | 'open' | 'phaseOpen' | 'setVal' | 'toggleDone' | 'toggleOpen' | 'togglePhase' | 'tgt' | 'trackEvent'
  >;
}

export function WorldbuildPhase({ ed }: WorldbuildPhaseProps) {
  const { done, get, open, phaseOpen, setVal, toggleDone, toggleOpen, togglePhase, tgt, trackEvent } = ed;
  return (
    <Phase n="1" title="Session −1" sub="Collaborative Worldbuilding" methods={['ccd', 'pr']} audience="together" icon={Users} expanded={phaseOpen.p1} onToggle={() => togglePhase('p1')}>
      <BookQuote source="CCD ch. 2">Session −1 is a long creative session in which the group brings ideas to define a setting.</BookQuote>
      <SoloNote>With one player, this becomes a 2-person conversation. Take turns. Hold back on conflict-stage so player gets first authority.</SoloNote>
      <Section id="genre" title="Genre Statement" methods={['ccd']} done={done.genre} onToggle={toggleDone} open={open.genre} onToggleOpen={toggleOpen}>
        <Example title="format">[tone] [genre] in [setting] where [tension]</Example>
        <Field value={get('genre', '')} onChange={(v) => setVal('genre', v)} placeholder="One sentence" rows={2} />
        {(() => {
          const curConfig = get('player', {});
          const genreShared = !!curConfig.planningVisibility?.genre;
          return (
            <div className="mt-1 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  const pv = { ...(curConfig.planningVisibility ?? {}) };
                  pv.genre = !pv.genre;
                  setVal('player', { ...curConfig, planningVisibility: pv });
                }}
                className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors ${
                  genreShared ? 'bg-moss/10 font-medium text-moss hover:bg-moss/20' : 'border border-rule bg-parchment-deep text-ink-mute hover:text-ink'
                }`}
              >
                {genreShared ? <Eye size={12} /> : <EyeOff size={12} />}
                {genreShared ? 'Shared with Players' : 'Private (Click to share)'}
              </button>
            </div>
          );
        })()}
      </Section>
      <Section id="facts" title="Setting Facts" methods={['ccd']} done={done.facts} onToggle={toggleDone} open={open.facts} onToggleOpen={toggleOpen}>
        <Pitfall>Don&apos;t pre-load all the secrets. Players still need new ones to discover.</Pitfall>
        <ListField
          items={get('facts', [])}
          onChange={(v) => setVal('facts', v)}
          placeholder="A fact about the world"
          rows={2}
          target={tgt('facts')}
          isShared={(i) => !!get('player', {}).planningVisibility?.facts?.[i]}
          onToggleShare={(i) => {
            const curConfig = get('player', {});
            const pv = { ...(curConfig.planningVisibility ?? {}) };
            const curArr = [...(pv.facts ?? [])];
            curArr[i] = !curArr[i];
            pv.facts = curArr;
            setVal('player', { ...curConfig, planningVisibility: pv });
          }}
        />
      </Section>
      <Section id="secrets" title="Secrets & Clues" methods={['ccd', 'pr']} done={done.secrets} onToggle={toggleDone} open={open.secrets} onToggleOpen={toggleOpen}>
        <BookQuote source="PR ch. 5">Secrets are the currency of the game. They shouldn&apos;t be gated behind high rolls.</BookQuote>
        <Pitfall>Secrets without context (like &quot;the duke is actually a lizard&quot;) don&apos;t drive action. Tie them to character goals.</Pitfall>
        <TargetBar current={countFilled('secrets', get('secrets', []))} target={tgt('secrets')} source={TARGETS.secrets.source} />
        <ListField
          items={get('secrets', [])}
          onChange={(v) => setVal('secrets', v)}
          placeholder="A secret someone doesn't want known"
          rows={2}
          target={tgt('secrets')}
          isShared={(i) => !!get('player', {}).planningVisibility?.secrets?.[i]}
          onToggleShare={(i) => {
            const curConfig = get('player', {});
            const pv = { ...(curConfig.planningVisibility ?? {}) };
            const curArr = [...(pv.secrets ?? [])];
            curArr[i] = !curArr[i];
            pv.secrets = curArr;
            setVal('player', { ...curConfig, planningVisibility: pv });
          }}
        />
      </Section>

      <Section id="factions" title="Factions" methods={['pr', 'ccd']} done={done.factions} onToggle={toggleDone} open={open.factions} onToggleOpen={toggleOpen} icon={Users}>
        <BookQuote source="PR ch. 2">Think of factions, not individual NPCs, as the GM-controlled counterparts of the party.</BookQuote>
        <Pitfall>Factions whose goals don&apos;t overlap with PC goals are just colour.</Pitfall>
        <TargetBar current={countFilled('factions', get('factions', []))} target={tgt('factions')} source={TARGETS.factions.source} />
        {(get('factions', []) as any[]).map((f: any, i: number) => (
          <div key={i} id={f.id ? `entity-${f.id}` : undefined} data-cp-anchor={`faction:${i}`}>
            <FactionCard data={f} onChange={(v: any) => {
              const next = [...(get('factions', []) as any[])]; next[i] = v; setVal('factions', next);
              const fromR = typeof f.renown === 'number' ? f.renown : 0;
              const toR = typeof v.renown === 'number' ? v.renown : 0;
              if (fromR !== toR) {
                trackEvent(
                  'renown_changed',
                  `${v.name || f.name || `Faction ${i + 1}`} renown: ${fromR} → ${toR}`,
                  fromR, toR,
                );
              }
            }} onRemove={() => setVal('factions', (get('factions', []) as any[]).filter((_: any, j: number) => j !== i))} />
          </div>
        ))}
        <InspireGroup>
          <span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">Add faction from:</span>
          <Inspire tableId="villainArchetypes" label="Villain" onPick={(e) => {
            setVal('factions', [...(get('factions', []) as any[]), { name: '', archetype: '', identity: e, area: '', power: '', ideology: '', shortGoals: [], midGoals: [], longGoal: '' }]);
          }} />
          <Inspire tableId="allyTypes" label="Ally" onPick={(e) => {
            setVal('factions', [...(get('factions', []) as any[]), { name: '', archetype: '', identity: e, area: '', power: '', ideology: '', shortGoals: [], midGoals: [], longGoal: '' }]);
          }} />
          <Inspire tableId="patronTypes" label="Patron" onPick={(e) => {
            setVal('factions', [...(get('factions', []) as any[]), { name: '', archetype: '', identity: e, area: '', power: '', ideology: '', shortGoals: [], midGoals: [], longGoal: '' }]);
          }} />
        </InspireGroup>
        <button onClick={() => setVal('factions', [...(get('factions', []) as any[]), { name: '', archetype: '', identity: '', area: '', power: '', ideology: '', shortGoals: [], midGoals: [], longGoal: '' }])} className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:text-crimson">
          <Plus size={12} /> Add Faction
        </button>
      </Section>
      <Section id="conflicts" title="Active Conflicts" methods={['ccd', 'pr']} done={done.conflicts} onToggle={toggleDone} open={open.conflicts} onToggleOpen={toggleOpen}>
        <BookQuote source="CCD ch. 2">Conflicts are the end goal of worldbuilding.</BookQuote>
        <ListField
          items={get('conflicts', [])}
          onChange={(v) => setVal('conflicts', v)}
          placeholder="Faction A vs Faction B over X"
          rows={2}
          target={tgt('conflicts')}
          isShared={(i) => !!get('player', {}).planningVisibility?.conflicts?.[i]}
          onToggleShare={(i) => {
            const curConfig = get('player', {});
            const pv = { ...(curConfig.planningVisibility ?? {}) };
            const curArr = [...(pv.conflicts ?? [])];
            curArr[i] = !curArr[i];
            pv.conflicts = curArr;
            setVal('player', { ...curConfig, planningVisibility: pv });
          }}
        />
        <InspireGroup>
          <span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">Inspire:</span>
          <Inspire tableId="twists" label="Twist" onPick={(e) => {
            setVal('conflicts', [...(get('conflicts', []) as string[]), e]);
          }} />
          <Inspire tableId="moralQuandaries" label="Quandary" onPick={(e) => {
            setVal('conflicts', [...(get('conflicts', []) as string[]), e]);
          }} />
          <Inspire tableId="sideComplications" label="Complication" onPick={(e) => {
            setVal('conflicts', [...(get('conflicts', []) as string[]), e]);
          }} />
          <Inspire tableId="campaignEvents" label="Event" onPick={(e) => {
            setVal('conflicts', [...(get('conflicts', []) as string[]), e]);
          }} />
        </InspireGroup>
      </Section>
    </Phase>
  );
}
