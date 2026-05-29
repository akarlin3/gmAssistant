'use client';

import React from 'react';
import { type Campaign } from '@/lib/firebase/campaigns';
import { type World } from '@/lib/firebase/worlds';
import { Plus, X, Users, Map, Swords, Gift, Layers, Calendar, Target, Trophy, Clock, Eye, EyeOff } from 'lucide-react';
import StrongStartPicker from '../StrongStartPicker';
import SummonButton from '../SummonButton';
import { SECTION_GENERATORS, getLastUsed } from '@/lib/generators/sectionMap';
import { makeLogId } from '@/lib/campaign/migrations';
import { parseMonsterName } from '@/lib/sessionLog';
import PlayerModePanel from '../PlayerModePanel';
import type { PlayerConfig } from '@/lib/playerMode/types';
import type { PlayerLogEntry } from '@/lib/playerMode/sessionLog';
import { makeEntityId } from '@/lib/playerMode/share';
import PartyTab from '../PartyTab';
import { TARGETS, countFilled } from '@/lib/prepTargets';
import { BookQuote, SoloNote, Pitfall, Inspire, InspireGroup, TargetBar, Example, Field, ListField, Section, CardLabel, GoalCard, NPCCard, LocationCard } from './prepPrimitives';
import type { EncounterCalcState } from './prepTypes';
import { FactionCard, ClockCard } from './cards';
import { EncounterHelper } from './EncounterHelper';
import { Phase } from './phase';
import { type CampaignEditorModel } from './useCampaignEditor';

export function PlanPrepView({ ed }: { ed: CampaignEditorModel }) {
  const {
    addPc,
    campaign,
    characters,
    completedCount,
    confirmModal,
    done,
    get,
    getFilteredPrepArray,
    highlightEntityId,
    isPro,
    jumpToNextUp,
    mode,
    name,
    nextUp,
    open,
    openPcs,
    pcFileInputRef,
    pcUploadError,
    pcs,
    phaseOpen,
    playerConfig,
    playerLog,
    removePc,
    roster,
    setOpenPcs,
    setSummonState,
    setVal,
    state,
    subview,
    tgt,
    toggleDone,
    toggleOpen,
    togglePhase,
    trackEvent,
    updatePc,
    uploadPcSheet,
    uploadingPc,
    usedPrep,
    world,
  } = ed;
  return (
    <>
            {mode === 'prep' && subview === 'flow' && (
              nextUp ? (
                <div className="flex items-center gap-3 rounded border border-brass/40 bg-brass/5 p-3 shadow-card">
                  <div className="flex-shrink-0 font-display text-[10px] uppercase tracking-wider text-brass-deep">
                    Next Up
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-display text-sm text-ink">{nextUp.label}</div>
                    <div className="font-serif text-xs italic text-ink-soft">
                      {nextUp.current} of {nextUp.target} — {nextUp.target - nextUp.current} to go
                    </div>
                  </div>
                  <button
                    onClick={jumpToNextUp}
                    className="flex-shrink-0 rounded border border-brass-deep/60 px-3 py-1.5 font-display text-xs uppercase tracking-wider text-brass-deep transition-colors hover:border-brass hover:bg-brass hover:text-parchment"
                  >
                    Jump To
                  </button>
                </div>
              ) : completedCount > 0 ? (
                <div className="rounded border border-moss/40 bg-moss/5 p-3 text-center font-serif text-sm italic text-moss">
                  All prep targets met. Ready to run.
                </div>
              ) : null
            )}
            {mode === 'plan' && subview === 'pitch' && (
            <Phase n="0" title="Givens & Pitch" sub="Decide What's Non-Negotiable" methods={['ccd']} audience="solo" icon={Layers} expanded={phaseOpen.p0} onToggle={() => togglePhase('p0')}>
              <BookQuote source="CCD ch. 1">Givens are a set of things your group agrees will feature regardless of how worldbuilding ends up.</BookQuote>
              <Section id="g-world" title="World Facts" methods={['ccd']} done={done['g-world']} onToggle={toggleDone} open={open['g-world']} onToggleOpen={toggleOpen}>
                <Example title="from CCD">"Post-apocalyptic." "The sun has gone out." "Magic has died."</Example>
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
            )}

            {mode === 'plan' && subview === 'worldbuild' && (
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
                <Pitfall>Don't pre-load all the secrets. Players still need new ones to discover.</Pitfall>
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
                <BookQuote source="PR ch. 5">Secrets are the currency of the game. They shouldn't be gated behind high rolls.</BookQuote>
                <Pitfall>Secrets without context (like "the duke is actually a lizard") don't drive action. Tie them to character goals.</Pitfall>
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
                <Pitfall>Factions whose goals don't overlap with PC goals are just colour.</Pitfall>
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
            )}

            {mode === 'plan' && subview === 'party' && (
            <Phase n="2" title="Session 0 — Party & Goals" sub="PCs Created After the World Exists" methods={['pr', 'shea']} audience="together" icon={Users} expanded={phaseOpen.p2} onToggle={() => togglePhase('p2')}>
              <SoloNote>Solo Session 0 is fast. Spend the saved time on goal craft.</SoloNote>
              <Section id="pc" title="Player Characters" methods={['shea']} done={done.pc} onToggle={toggleDone} open={open.pc} onToggleOpen={toggleOpen}>
                <BookQuote source="Lazy DM (Chris Perkins)">Nothing's more important to a campaign than the stories of the player characters.</BookQuote>
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
                <Example title="Bad → Good">"Become powerful" → "Win a duel against the captain of the guard"</Example>
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
            )}

            {mode === 'prep' && subview === 'flow' && (
            <Phase n="3" title="Per-Session Prep" sub="Lazy DM 8-Step Checklist" methods={['shea']} audience="solo" icon={Calendar} expanded={phaseOpen.p3} onToggle={() => togglePhase('p3')}>
              <BookQuote source="Lazy DM (Jeremy Crawford)">Prep as little as you can.</BookQuote>
              <Section id="s1-review" title="1 · Review the Characters" methods={['shea']} done={done['s1-review']} onToggle={toggleDone} open={open['s1-review']} onToggleOpen={toggleOpen}>
                <Field value={get('reviewNotes', '')} onChange={(v) => setVal('reviewNotes', v)} placeholder="Mental priming notes" rows={3} />
              </Section>
              <Section id="s2-start" title="2 · Create a Strong Start" methods={['shea']} done={done['s2-start']} onToggle={toggleDone} open={open['s2-start']} onToggleOpen={toggleOpen}>
                <SoloNote>Solo level-1 cannot reliably survive opening combat. Substitute action that isn't a losable fight.</SoloNote>
                <TargetBar current={countFilled('strongStart', get('strongStart', ''))} target={tgt('strongStart')} source={TARGETS.strongStart.source} />
                <Field value={get('strongStart', '')} onChange={(v) => setVal('strongStart', v)} placeholder="One sentence or paragraph" rows={4} />
                <InspireGroup>
                  <Inspire tableId="introductions" label="Introduction" onPick={(e) => {
                    const cur = (get('strongStart', '') as string).trim();
                    if (cur && !confirm('Replace the current strong start?')) return;
                    setVal('strongStart', e);
                  }} />
                  <StrongStartPicker onUse={(body) => {
                    const cur = (get('strongStart', '') as string).trim();
                    if (cur && !confirm('Replace the current strong start?')) return;
                    setVal('strongStart', body);
                  }} />
                </InspireGroup>
              </Section>
              <Section id="s3-scenes" title="3 · Outline Potential Scenes" methods={['shea']} done={done['s3-scenes']} onToggle={toggleDone} open={open['s3-scenes']} onToggleOpen={toggleOpen}>
                <BookQuote source="Lazy DM (Perkins)">Be prepared to throw what you have away.</BookQuote>
                <ListField
                  items={(get('scenes', []) as string[]).filter(s => !usedPrep.usedScenes.has(s.trim()))}
                  onChange={(v) => {
                    const used = (get('scenes', []) as string[]).filter(s => usedPrep.usedScenes.has(s.trim()));
                    setVal('scenes', [...used, ...v]);
                  }}
                  placeholder="A scene"
                  target={tgt('scenes')}
                />
                <InspireGroup>
                  <span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">Inspire:</span>
                  <Inspire tableId="sideQuests" label="Side Quest" onPick={(e) => {
                    setVal('scenes', [...(get('scenes', []) as string[]), e]);
                  }} />
                  <Inspire tableId="sideComplications" label="Complication" onPick={(e) => {
                    setVal('scenes', [...(get('scenes', []) as string[]), e]);
                  }} />
                </InspireGroup>
              </Section>
              <Section id="s4-secrets" title="4 · Define Secrets & Clues" methods={['shea']} done={done['s4-secrets']} onToggle={toggleDone} open={open['s4-secrets']} onToggleOpen={toggleOpen}>
                <BookQuote source="Lazy DM ch. 6">Secrets and clues are the connective tissue of an adventure.</BookQuote>
                <Pitfall>Tying a secret to a specific NPC means if players skip them, the secret never surfaces.</Pitfall>
                <ListField
                  items={(get('secrets', []) as string[]).filter(s => !usedPrep.usedSecrets.has(s.trim()))}
                  onChange={(v) => {
                    const used = (get('secrets', []) as string[]).filter(s => usedPrep.usedSecrets.has(s.trim()));
                    setVal('secrets', [...used, ...v]);
                  }}
                  placeholder="A single-sentence secret"
                  rows={2}
                  target={tgt('secrets')}
                />
                <InspireGroup>
                  <span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">Inspire:</span>
                  <Inspire tableId="villainSchemes" label="Scheme" onPick={(e) => {
                    setVal('secrets', [...(get('secrets', []) as string[]), e]);
                  }} />
                  <Inspire tableId="villainWeaknesses" label="Weakness" onPick={(e) => {
                    setVal('secrets', [...(get('secrets', []) as string[]), e]);
                  }} />
                  <Inspire tableId="campaignEvents" label="Event" onPick={(e) => {
                    setVal('secrets', [...(get('secrets', []) as string[]), e]);
                  }} />
                </InspireGroup>
              </Section>
              <Section id="s5-loc" title="5 · Develop Fantastic Locations" methods={['shea']} done={done['s5-loc']} onToggle={toggleDone} open={open['s5-loc']} onToggleOpen={toggleOpen} icon={Map}>
                <BookQuote source="Lazy DM ch. 7">When in doubt, go for scale.</BookQuote>
                <TargetBar current={countFilled('locations', getFilteredPrepArray('locations', get('locations', [])), get('player', {}))} target={tgt('locations')} source={TARGETS.locations.source} />
                {(get('locations', []) as any[])
                  .map((l: any, originalIndex: number) => ({ l, originalIndex }))
                  .filter(({ l }) => !usedPrep.linkedLocIds.has(l.id) && !usedPrep.linkedLocNames.has(l.name))
                  .map(({ l, originalIndex }) => {
                    const entityId = l?.id ?? `loc-${originalIndex}`;
                    const highlighted = highlightEntityId === entityId;
                    const playerConfig = get('player', {});
                    const isShared = l.isPublic === true ||
                      playerConfig?.entityVisibility?.locations?.[l.id]?.mode === 'party' ||
                      playerConfig?.entityVisibility?.locations?.[l.id]?.mode === 'custom';
                    return (
                      <div
                        key={originalIndex}
                        id={`entity-${entityId}`}
                        data-cp-anchor={`location:${originalIndex}`}
                        className={`rounded transition-shadow ${
                          highlighted ? 'ring-2 ring-crimson ring-offset-2 ring-offset-parchment-soft' : ''
                        } ${
                          isShared ? 'border border-moss/20 bg-moss/5 ring-1 ring-moss/30' : ''
                        }`}
                      >
                        <LocationCard
                          data={l}
                          onChange={(v: any) => {
                            const next = [...(get('locations', []) as any[])];
                            next[originalIndex] = v;
                            setVal('locations', next);
                            
                            // Synchronize playerConfig.entityVisibility
                            const curConfig = get('player', {});
                            const ev = { ...(curConfig.entityVisibility ?? {}) };
                            const bucket = { ...(ev.locations ?? {}) };
                            if (v.isPublic) {
                              bucket[l.id] = { mode: 'party' };
                            } else {
                              delete bucket[l.id];
                            }
                            ev.locations = bucket;
                            setVal('player', { ...curConfig, entityVisibility: ev });
                          }}
                          onRemove={() => setVal('locations', (get('locations', []) as any[]).filter((_: any, j: number) => j !== originalIndex))}
                        />
                      </div>
                    );
                  })}
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => {
                    setVal('locations', [...(get('locations', []) as any[]), { id: makeEntityId(), name: '', type: '', aspects: ['', '', ''], factions: '' }]);
                    trackEvent('location_added', 'Added a new location');
                  }} className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:text-crimson">
                    <Plus size={12} /> Add Location
                  </button>
                  {SECTION_GENERATORS.locations.length > 0 && (() => {
                    const lastUsed = getLastUsed(state, 'locations');
                    if (!lastUsed) return null;
                    return (
                      <SummonButton
                        section="locations"
                        lastUsed={lastUsed}
                        options={SECTION_GENERATORS.locations}
                        onSummon={(meta) => setSummonState({ section: 'locations', generator: meta })}
                      />
                    );
                  })()}
                </div>
              </Section>
              <Section id="s6-npc" title="6 · Outline Important NPCs" methods={['shea', 'pr']} done={done['s6-npc']} onToggle={toggleDone} open={open['s6-npc']} onToggleOpen={toggleOpen}>
                <BookQuote source="PR ch. 3">Villains form goals in response to PC goals.</BookQuote>
                <TargetBar current={countFilled('npcs', getFilteredPrepArray('npcs', get('npcs', [])), get('player', {}))} target={tgt('npcs')} source={TARGETS.npcs.source} />
                {(get('npcs', []) as any[])
                  .map((n: any, originalIndex: number) => ({ n, originalIndex }))
                  .filter(({ n }) => !usedPrep.linkedNpcIds.has(n.id) && !usedPrep.linkedNpcNames.has(n.name))
                  .map(({ n, originalIndex }) => {
                    const entityId = n?.id ?? `npc-${originalIndex}`;
                    const highlighted = highlightEntityId === entityId;
                    const playerConfig = get('player', {});
                    const isShared = n.isPublic === true ||
                      playerConfig?.entityVisibility?.npcs?.[n.id]?.mode === 'party' ||
                      playerConfig?.entityVisibility?.npcs?.[n.id]?.mode === 'custom';
                    return (
                      <div
                        key={originalIndex}
                        id={`entity-${entityId}`}
                        data-cp-anchor={`npc:${originalIndex}`}
                        className={`rounded transition-shadow ${
                          highlighted ? 'ring-2 ring-crimson ring-offset-2 ring-offset-parchment-soft' : ''
                        } ${
                          isShared ? 'border border-moss/20 bg-moss/5 ring-1 ring-moss/30' : ''
                        }`}
                      >
                        <NPCCard
                          data={n}
                          onChange={(v: any) => {
                            const next = [...(get('npcs', []) as any[])];
                            next[originalIndex] = v;
                            setVal('npcs', next);

                            // Synchronize playerConfig.entityVisibility
                            const curConfig = get('player', {});
                            const ev = { ...(curConfig.entityVisibility ?? {}) };
                            const bucket = { ...(ev.npcs ?? {}) };
                            if (v.isPublic) {
                              bucket[n.id] = { mode: 'party' };
                            } else {
                              delete bucket[n.id];
                            }
                            ev.npcs = bucket;
                            setVal('player', { ...curConfig, entityVisibility: ev });
                          }}
                          onRemove={() => setVal('npcs', (get('npcs', []) as any[]).filter((_: any, j: number) => j !== originalIndex))}
                        />
                      </div>
                    );
                  })}
                <InspireGroup>
                  <span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">Add new NPC seeded by:</span>
                  <Inspire tableId="villainArchetypes" label="Villain" onPick={(e) => {
                    setVal('npcs', [...(get('npcs', []) as any[]), { id: makeEntityId(), name: '', type: 'Villain', faction: '', archetype: e, goal: '', method: '' }]);
                  }} />
                  <Inspire tableId="npcBackgroundConcepts" label="Background" onPick={(e) => {
                    setVal('npcs', [...(get('npcs', []) as any[]), { id: makeEntityId(), name: '', type: '', faction: '', archetype: e, goal: '', method: '' }]);
                  }} />
                  <Inspire tableId="raceCharacterNotes" label="Species" onPick={(e) => {
                    setVal('npcs', [...(get('npcs', []) as any[]), { id: makeEntityId(), name: '', type: '', faction: '', archetype: e, goal: '', method: '' }]);
                  }} />
                </InspireGroup>
                <p className="-mt-1 font-serif text-[10px] italic text-ink-mute">
                  Trait inspirations (mannerism, talent, ideal, bond, etc.) live inside each NPC card under &quot;Show Details&quot;.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => {
                    setVal('npcs', [...(get('npcs', []) as any[]), { id: makeEntityId(), name: '', type: '', faction: '', archetype: '', goal: '', method: '' }]);
                    trackEvent('npc_added', 'Added a new NPC');
                  }} className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:text-crimson">
                    <Plus size={12} /> Add NPC
                  </button>
                  {SECTION_GENERATORS.npcs.length > 0 && (() => {
                    const lastUsed = getLastUsed(state, 'npcs');
                    if (!lastUsed) return null;
                    return (
                      <SummonButton
                        section="npcs"
                        lastUsed={lastUsed}
                        options={SECTION_GENERATORS.npcs}
                        onSummon={(meta) => setSummonState({ section: 'npcs', generator: meta })}
                      />
                    );
                  })()}
                </div>
              </Section>
              <Section id="s7-mon" title="7 · Choose Relevant Monsters" methods={['shea']} done={done['s7-mon']} onToggle={toggleDone} open={open['s7-mon']} onToggleOpen={toggleOpen} icon={Swords}>
                <SoloNote>Solo level-1 ~8-12 HP. CR 1/8 one-at-a-time. Narrative outs always.</SoloNote>
                <ListField
                  items={(get('monsters', []) as string[]).filter(m => !usedPrep.linkedMonsterIds.has(m) && !usedPrep.linkedMonsterNames.has(parseMonsterName(m)))}
                  onChange={(v) => {
                    const used = (get('monsters', []) as string[]).filter(m => usedPrep.linkedMonsterIds.has(m) || usedPrep.linkedMonsterNames.has(parseMonsterName(m)));
                    setVal('monsters', [...used, ...v]);
                  }}
                  placeholder="Monster — CR — use case"
                  target={tgt('monsters')}
                  rowIdFor={(i) => `monsters-${i}`}
                  highlightId={highlightEntityId}
                  isShared={(i) => {
                    const visibleMonsters = (get('monsters', []) as string[]).filter(m => !usedPrep.linkedMonsterIds.has(m) && !usedPrep.linkedMonsterNames.has(parseMonsterName(m)));
                    const m = visibleMonsters[i];
                    if (!m) return false;
                    const name = typeof m === 'string' ? m.split(' — ')[0] : (m as any).name || '';
                    const playerLog = (get('playerLog', []) as any[]) || [];
                    return playerLog.some(entry => entry.text && entry.text.includes(`Encountered: ${name}`));
                  }}
                  onToggleShare={(i) => {
                    const visibleMonsters = (get('monsters', []) as string[]).filter(m => !usedPrep.linkedMonsterIds.has(m) && !usedPrep.linkedMonsterNames.has(parseMonsterName(m)));
                    const m = visibleMonsters[i];
                    if (!m) return;
                    const name = typeof m === 'string' ? m.split(' — ')[0] : (m as any).name || '';
                    const playerLog = (get('playerLog', []) as any[]) || [];
                    const isCurrentlyShared = playerLog.some(entry => entry.text && entry.text.includes(`Encountered: ${name}`));
                    
                    if (isCurrentlyShared) {
                      // Remove it from playerLog
                      const nextLog = playerLog.filter(entry => !(entry.text && entry.text.includes(`Encountered: ${name}`)));
                      setVal('playerLog', nextLog);
                    } else {
                      // Add it to playerLog
                      const nextLog = [...playerLog, {
                        id: makeLogId(),
                        text: `Encountered: ${name}`,
                        mentions: [],
                        visibility: { mode: 'party' },
                        authorRef: 'gm',
                        postedAtMs: Date.now(),
                      }];
                      setVal('playerLog', nextLog);
                    }
                  }}
                />
                {SECTION_GENERATORS.monsters.length > 0 && (() => {
                  const lastUsed = getLastUsed(state, 'monsters');
                  if (!lastUsed) return null;
                  return (
                    <div className="flex">
                      <SummonButton
                        section="monsters"
                        lastUsed={lastUsed}
                        options={SECTION_GENERATORS.monsters}
                        onSummon={(meta) => setSummonState({ section: 'monsters', generator: meta })}
                      />
                    </div>
                  );
                })()}
                <EncounterHelper
                  state={(get('__encounterCalc', { pcLevel: 1, monsters: [] })) as EncounterCalcState}
                  onChange={(s) => setVal('__encounterCalc', s)}
                />
              </Section>
              <Section id="s8-rew" title="8 · Select Magic Item Rewards" methods={['shea', 'pr']} done={done['s8-rew']} onToggle={toggleDone} open={open['s8-rew']} onToggleOpen={toggleOpen} icon={Gift}>
                <BookQuote source="PR ch. 6">Your +1 needs to be actionable.</BookQuote>
                <Example title="from PR">Sword from a stone. +1: right to rule Albion.</Example>
                <TargetBar current={countFilled('items', getFilteredPrepArray('items', get('items', [])), get('player', {}))} target={tgt('items')} source={TARGETS.items.source} />
                {(() => {
                  const allItems = (get('items', []) as any[]) || [];
                  const assignedItems = allItems.filter(item => {
                    if (typeof item === 'object' && item) {
                      const isAssigned = !!item.assignedPlayerId;
                      const id = String(item.id || '').trim();
                      const name = String(item.name || '').trim();
                      const isLinked = usedPrep.linkedLootIds.has(id) || usedPrep.linkedLootNames.has(name);
                      return isAssigned || isLinked;
                    }
                    if (typeof item === 'string') {
                      const trimmed = item.trim();
                      const isLinked = usedPrep.linkedLootIds.has(trimmed) || usedPrep.linkedLootNames.has(trimmed);
                      return isLinked;
                    }
                    return false;
                  });
                  const visibleItems = allItems.filter(item => {
                    if (typeof item === 'object' && item) {
                      const isAssigned = !!item.assignedPlayerId;
                      const id = String(item.id || '').trim();
                      const name = String(item.name || '').trim();
                      const isLinked = usedPrep.linkedLootIds.has(id) || usedPrep.linkedLootNames.has(name);
                      return !isAssigned && !isLinked;
                    }
                    if (typeof item === 'string') {
                      const trimmed = item.trim();
                      const isLinked = usedPrep.linkedLootIds.has(trimmed) || usedPrep.linkedLootNames.has(trimmed);
                      return !isLinked;
                    }
                    return true;
                  });
                  return (
                    <ListField
                      items={visibleItems}
                      onChange={(nextUnassigned) => setVal('items', [...assignedItems, ...nextUnassigned])}
                      placeholder="Item · what +1 hook it delivers"
                      rows={2}
                      target={tgt('items')}
                      rowIdFor={(i) => `items-${i}`}
                      highlightId={highlightEntityId}
                    />
                  );
                })()}
                {SECTION_GENERATORS.magicItems.length > 0 && (() => {
                  const lastUsed = getLastUsed(state, 'magicItems');
                  if (!lastUsed) return null;
                  return (
                    <div className="flex">
                      <SummonButton
                        section="magicItems"
                        lastUsed={lastUsed}
                        options={SECTION_GENERATORS.magicItems}
                        onSummon={(meta) => setSummonState({ section: 'magicItems', generator: meta })}
                      />
                    </div>
                  );
                })()}
                <div className="border-t border-rule/60 pt-3">
                  <p className="mb-1.5 font-display text-xs uppercase tracking-wider text-brass-deep">Treasure</p>
                  <p className="mb-1.5 font-serif text-[11px] italic text-ink-mute">
                    Coins, gems, art, trinkets, and other rewards — generated entries land here.
                  </p>
                  <ListField
                    items={(get('treasure', []) as string[]).filter(t => !usedPrep.linkedLootIds.has(t.trim()) && !usedPrep.linkedLootNames.has(t.trim()))}
                    onChange={(v) => {
                      const used = (get('treasure', []) as string[]).filter(t => usedPrep.linkedLootIds.has(t.trim()) || usedPrep.linkedLootNames.has(t.trim()));
                      setVal('treasure', [...used, ...v]);
                    }}
                    placeholder="Treasure item — coins · gem · art · trinket"
                    rows={2}
                    rowIdFor={(i) => `treasure-${i}`}
                    highlightId={highlightEntityId}
                  />
                </div>
              </Section>
            </Phase>
            )}

            {mode === 'organize' && subview === 'players' && state.player && (
              <PlayerModePanel
                campaignId={campaign.id}
                campaignName={name}
                data={state}
                config={state.player as PlayerConfig}
                onConfigChange={(cfg) => setVal('player', cfg)}
                confirm={confirmModal}
                playerLog={get('playerLog', []) as PlayerLogEntry[]}
                onPlayerLogChange={(entries) => setVal('playerLog', entries)}
              />
            )}

            {mode === 'prep' && subview === 'clocks' && (
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
            )}

            {mode === 'prep' && subview === 'arc' && (
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
            )}

            {mode === 'prep' && subview === 'ending' && (
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
            )}
    </>
  );
}
