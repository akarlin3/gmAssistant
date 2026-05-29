'use client';

import React from 'react';
import { type Campaign } from '@/lib/firebase/campaigns';
import { ChevronDown, ChevronRight, X, User, Play, ClipboardList } from 'lucide-react';
import dynamic from 'next/dynamic';
import DiceRoller, { type Macro } from '../DiceRoller';
import type { Spell } from '../SpellsTab';
import type { HomebrewMonster } from '../MonstersTab';
import WellsOracle from '../WellsOracle';
import type { OracleRoll } from '@/lib/oracle/wells';
import VivifyPanel, { type VivifyHistoryEntry } from '../VivifyPanel';
import SceneModePanel from '../SceneModePanel';
import CampaignAssistant from '../CampaignAssistant';
import { SCENE_SESSIONS_KEY, type SceneEntry } from '@/lib/scene/types';
import { sceneToMarkdown } from '@/lib/scene/export';
import ChaseTracker from '../ChaseTracker';
import type { Chase } from '@/lib/chaseTables';
import TrapBuilder from '../TrapBuilder';
import type { Trap } from '@/lib/trapTables';
import { emptyLogistics, type LogisticsState } from '../LogisticsTab';
import { emptyGraph, type RelationshipGraphState } from '../NPCRelationshipWeb';
import { emptyWorld, type FactionWorld } from '@/lib/factionEngine';
import { type SessionLogEntry, todayISO } from '@/lib/sessionLog';
import { makeLogId } from '@/lib/campaign/migrations';
import { nextSessionNumber, recalculatePartyState } from '@/lib/sessionLog';
import { applyNarrationReveal } from '@/lib/playerMode/sessionLog';
import type { PrepWizardRun } from '@/lib/prepWizard';
import type { GeneratorLogs } from '@/lib/generators/log';
import { LockedPanel } from '../LockedFeature';
import type { PlayerConfig } from '@/lib/playerMode/types';
import type { PlayerLogEntry } from '@/lib/playerMode/sessionLog';
import { type Mode } from '@/lib/modes';
import { Tag, Inspire, ListField } from './prepPrimitives';
import WikiTab from '../wiki/WikiTab';
import type { DowntimeEntry } from './prepTypes';
import { DowntimeCard, DOWNTIME_TYPES, makeDowntimeId } from './cards';
import { LookupView } from './LookupView';
import { Phase } from './phase';
import { RunSessionInline } from './runSessionInline';
const SpellsTab = dynamic(() => import('../SpellsTab'));
const DMRefTab = dynamic(() => import('../DMRefTab'));
const NamesTab = dynamic(() => import('../NamesTab'));
const LocationsTab = dynamic(() => import('../LocationsTab'));
const MonstersTab = dynamic(() => import('../MonstersTab'));
const GeneratorsTab = dynamic(() => import('../generators/GeneratorsTab'));
const ToolsTab = dynamic(() => import('../ToolsTab'));
const SessionLogTab = dynamic(() => import('../SessionLogTab'));
const LoggedTab = dynamic(() => import('../LoggedTab'));
const HazardCalculator = dynamic(() => import('../HazardCalculator'));
const LogisticsTab = dynamic(() => import('../LogisticsTab'));
const NPCRelationshipWeb = dynamic(() => import('../NPCRelationshipWeb'));
const FactionEngineTab = dynamic(() => import('../FactionEngineTab'));
const LivingWorldTab = dynamic(() => import('../world/LivingWorldTab'));
const MapsTab = dynamic(() => import('../maps/MapsTab'));
import { type CampaignEditorModel } from './useCampaignEditor';

export function EditorSubviews({ ed }: { ed: CampaignEditorModel }) {
  const {
    addToCampaignFor,
    campaign,
    characters,
    generatorCampaignContext,
    generatorDisabledDests,
    generatorLogs,
    get,
    handleEndSession,
    isPro,
    jumpToNextUp,
    logEntriesFor,
    mode,
    name,
    navigateTo,
    nextUp,
    pcMacros,
    pcs,
    playMode,
    playerConfig,
    playerLog,
    roster,
    sessionPlaylistAnchor,
    setLogEntriesFor,
    setSessionPlaylistAnchor,
    setState,
    setVal,
    showUndoToast,
    soloMode,
    state,
    subview,
    trackEvent,
    updateCharacter,
    usedPrep,
    world,
  } = ed;
  return (
    <>
        {mode === 'plan' && subview === 'worldbuild' && (
          <div className="space-y-3 text-sm">
            <div className="rounded border border-rule bg-parchment p-4 shadow-card">
              <h2 className="mb-2 font-display text-lg tracking-wide text-ink">The Three Methodologies</h2>
              <div className="space-y-3 font-serif text-sm text-ink-soft">
                <div>
                  <div className="mb-1 flex items-center gap-2"><Tag m="shea" /><span className="font-display tracking-wide text-ink">Return of the Lazy Dungeon Master</span> <span className="italic text-ink-mute">· Shea</span></div>
                  <p>8-step per-session checklist. Strong start, secrets & clues, fantastic locations.</p>
                </div>
                <div>
                  <div className="mb-1 flex items-center gap-2"><Tag m="ccd" /><span className="font-display tracking-wide text-ink">Collaborative Campaign Design</span> <span className="italic text-ink-mute">· Fishel</span></div>
                  <p>Session −1 worldbuilding before character creation. Faction clocks.</p>
                </div>
                <div>
                  <div className="mb-1 flex items-center gap-2"><Tag m="pr" /><span className="font-display tracking-wide text-ink">Proactive Roleplaying</span> <span className="italic text-ink-mute">· Fishel</span></div>
                  <p>5 Rules of Proactive Fun. "+1" reward principle.</p>
                </div>
              </div>
            </div>
            <div className="rounded border border-rule bg-parchment p-4 shadow-card">
              <h2 className="mb-2 font-display text-lg tracking-wide text-ink">Five Rules of Proactive Fun</h2>
              <ol className="list-inside list-decimal space-y-2 font-serif text-sm text-ink-soft">
                <li><span className="font-semibold text-ink">Multiple Goals.</span> 3-4 concurrent.</li>
                <li><span className="font-semibold text-ink">Varying Timeframes.</span> Short / Mid / Long.</li>
                <li><span className="font-semibold text-ink">Achievable.</span> Measurable success state.</li>
                <li><span className="font-semibold text-ink">Consequences for Failure.</span> If retryable, it was a skill check.</li>
                <li><span className="font-semibold text-ink">Fun to Pursue.</span> GM can imagine obstacles.</li>
              </ol>
            </div>
            <div className="rounded border border-rule bg-parchment p-4 shadow-card">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="font-display text-lg tracking-wide text-ink">Campaign Events Between Sessions</h2>
                <Inspire tableId="campaignEvents" label="Roll Event" onPick={(e) => {
                  const log = (get('campaignEventLog', []) as string[]) || [];
                  setVal('campaignEventLog', [...log, e]);
                }} />
              </div>
              <p className="mb-2 font-serif text-sm text-ink-soft">
                Quick &quot;while the party was away&quot; events for solo or sandbox play.
              </p>
              {((get('campaignEventLog', []) as string[]) || []).length === 0 ? (
                <p className="font-serif text-sm italic text-ink-mute">No events logged yet. Click &quot;Roll Event&quot; to add one.</p>
              ) : (
                <ol className="space-y-1 font-serif text-sm text-ink-soft">
                  {((get('campaignEventLog', []) as string[]) || []).map((evt, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="flex-1">
                        <span className="mr-1 font-display text-xs text-brass-deep">{i + 1}.</span>
                        {evt}
                      </span>
                      <button
                        onClick={() => {
                          const log = (get('campaignEventLog', []) as string[]) || [];
                          setVal('campaignEventLog', log.filter((_, j) => j !== i));
                        }}
                        className="text-ink-mute hover:text-crimson"
                        title="Remove this event"
                      >
                        <X size={12} />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div className="rounded border border-rule bg-parchment p-4 shadow-card">
              <h2 className="mb-2 font-display text-lg tracking-wide text-ink">The 10-Sentence NPC</h2>
              <p className="font-serif text-sm text-ink-soft">
                Detailed NPCs benefit from a roughly ten-sentence sketch: occupation and history,
                appearance, abilities, talent, mannerism, interactions, useful knowledge, ideal, bond,
                and flaw or secret. Click &quot;Show Details&quot; on any NPC card to expand the full set.
              </p>
            </div>
            <div className="rounded border border-wine/40 bg-wine/5 p-4 shadow-card">
              <h2 className="mb-2 flex items-center gap-2 font-display text-lg tracking-wide text-ink"><User size={16} className="text-wine" /> Solo Play Adaptations</h2>
              <div className="space-y-2 font-serif text-sm text-ink-soft">
                <p><span className="font-display text-xs uppercase tracking-wider text-wine">Session −1 · </span>2-person conversation.</p>
                <p><span className="font-display text-xs uppercase tracking-wider text-wine">Goals · </span>Rule 4 matters more.</p>
                <p><span className="font-display text-xs uppercase tracking-wider text-wine">Combat · </span>Solo level-1 ~8-12 HP. Narrative outs always.</p>
                <p><span className="font-display text-xs uppercase tracking-wider text-wine">Strong Start · </span>Action without losable fight.</p>
                <p><span className="font-display text-xs uppercase tracking-wider text-wine">Pacing · </span>2-3 scenes/hour instead of 1-2.</p>
              </div>
            </div>
          </div>
        )}

        {mode === 'prep' && subview === 'arc' && (
          <div className="space-y-3 text-sm">
            <div className="rounded border border-rule bg-parchment p-3 shadow-card">
              <h3 className="mb-2 font-display tracking-wide text-ink">Revealed Secrets</h3>
              <div className="space-y-1">
                {(get('secrets', []) as string[]).map((s: string, i: number) => (
                  <label key={i} className="flex cursor-pointer items-start gap-2 font-serif text-sm">
                    <input type="checkbox" checked={(get('revSec', {}) as Record<number, boolean>)[i] || false} onChange={(e) => {
                      const wasRevealed = !!(get('revSec', {}) as Record<number, boolean>)[i];
                      const r = { ...(get('revSec', {}) as Record<number, boolean>) }; r[i] = e.target.checked; setVal('revSec', r);
                      if (!wasRevealed && e.target.checked) trackEvent('secret_revealed', s);
                    }} className="mt-1 accent-crimson" />
                    <span className={((get('revSec', {}) as Record<number, boolean>)[i]) ? 'text-ink-mute line-through' : 'text-ink-soft'}>{s}</span>
                  </label>
                ))}
                {(get('secrets', []) as string[]).length === 0 && <p className="font-serif text-sm italic text-ink-mute">Add secrets in Phase 3 step 4.</p>}
              </div>
            </div>
            <div className="rounded border border-rule bg-parchment p-3 shadow-card">
              <h3 className="mb-2 font-display tracking-wide text-ink">Goal Progress</h3>
              <div className="space-y-2">
                {(get('pcGoals', []) as any[]).map((g: any, i: number) => (
                  <div key={i} className="rounded border border-rule bg-parchment-soft p-2.5 font-serif text-sm">
                    <p className="text-ink-soft">{g.text}</p>
                    <div className="mt-1.5 flex gap-1">
                      {['Active', 'Progressed', 'Completed', 'Failed'].map(s => (
                        <button key={s} onClick={() => {
                          const from = g.status || 'Active';
                          if (from === s) return;
                          const next = [...(get('pcGoals', []) as any[])];
                          next[i] = { ...g, status: s };
                          setVal('pcGoals', next);
                          trackEvent('goal_status', `${g.text || `Goal ${i + 1}`}: ${from} → ${s}`, from, s);
                        }} className={`rounded-sm border px-2 py-0.5 font-display text-[10px] uppercase tracking-wider ${g.status === s ? 'border-crimson bg-crimson text-parchment' : 'border-rule text-ink-mute'}`}>{s}</button>
                      ))}
                    </div>
                  </div>
                ))}
                {(get('pcGoals', []) as any[]).length === 0 && <p className="font-serif text-sm italic text-ink-mute">Add goals in Phase 2.</p>}
              </div>
            </div>
          </div>
        )}

        {mode === 'prep' && subview === 'ending' && (
          <div className="space-y-3 text-sm">
            <div className="rounded border border-rule bg-parchment p-3 shadow-card">
              <h3 className="mb-2 font-display tracking-wide text-ink">Dropped Threads</h3>
              <ListField items={get('dropped', [])} onChange={(v) => setVal('dropped', v)} placeholder="A thread to follow up" />
            </div>
          </div>
        )}

        {mode === 'plan' && subview === 'worldbuild' && (() => {
          const downtime = (get('downtime', []) as DowntimeEntry[]) || [];
          const active = downtime.filter(e => !e.archived);
          const archived = downtime.filter(e => !!e.archived);
          const [archivedOpen, setArchivedOpen] = [(get('__archivedDowntimeOpen', false) as boolean), (v: boolean) => setVal('__archivedDowntimeOpen', v)];

          const addEntry = (typeId: string) => {
            const next: DowntimeEntry = {
              id: makeDowntimeId(),
              type: typeId,
              fields: {},
              createdAt: new Date().toISOString(),
            };
            setVal('downtime', [...downtime, next]);
            const label = DOWNTIME_TYPES.find(t => t.id === typeId)?.label || typeId;
            trackEvent('downtime_added', `Started downtime: ${label}`);
          };
          const updateEntry = (id: string, patch: DowntimeEntry) => {
            setVal('downtime', downtime.map(e => e.id === id ? patch : e));
          };
          const setArchived = (id: string, archived: boolean) => {
            setVal('downtime', downtime.map(e => e.id === id ? { ...e, archived } : e));
          };
          const removeEntry = (id: string) => {
            const entry = downtime.find(e => e.id === id);
            const typeLabel = DOWNTIME_TYPES.find(t => t.id === entry?.type)?.label || 'entry';
            setVal('downtime', downtime.filter(e => e.id !== id));
            showUndoToast(`Deleted "${typeLabel}" — Press ⌘Z to undo`, 5000);
          };

          const groupedActive = DOWNTIME_TYPES
            .map(t => ({ type: t, entries: active.filter(e => e.type === t.id) }))
            .filter(g => g.entries.length > 0);

          return (
            <div className="space-y-3 text-sm">
              <div className="rounded border border-rule bg-parchment p-4 shadow-card">
                <p className="font-serif text-ink-soft">
                  Downtime activities take place between adventures. Each activity has a cost, a duration,
                  and consequences. Track them here so the time between sessions feels lived-in rather than skipped.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 rounded border border-rule bg-parchment p-3 shadow-card">
                <label className="font-display text-xs uppercase tracking-wider text-ink-soft">Add Downtime Activity</label>
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      addEntry(e.target.value);
                      e.target.value = '';
                    }
                  }}
                  className="rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-sm text-ink"
                >
                  <option value="">— Choose Activity —</option>
                  {DOWNTIME_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>

              {active.length === 0 && (
                <p className="font-serif text-sm italic text-ink-mute">No active downtime activities yet.</p>
              )}

              {groupedActive.map(({ type, entries }) => (
                <div key={type.id} className="space-y-2">
                  <h3 className="font-display text-sm tracking-wide text-ink">{type.label}</h3>
                  {entries.map(entry => (
                    <DowntimeCard
                      key={entry.id}
                      entry={entry}
                      onChange={(v) => updateEntry(entry.id, v)}
                      onArchive={() => setArchived(entry.id, true)}
                      onUnarchive={() => setArchived(entry.id, false)}
                      onRemove={() => removeEntry(entry.id)}
                    />
                  ))}
                </div>
              ))}

              <div className="rounded border border-rule bg-parchment p-3 shadow-card">
                <button
                  onClick={() => setArchivedOpen(!archivedOpen)}
                  className="flex items-center gap-1.5 font-display text-sm tracking-wide text-ink hover:text-crimson"
                >
                  {archivedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  Archived ({archived.length})
                </button>
                {archivedOpen && (
                  <div className="mt-3 space-y-2">
                    {archived.length === 0 && (
                      <p className="font-serif text-sm italic text-ink-mute">No archived downtime activities yet.</p>
                    )}
                    {archived.map(entry => (
                      <DowntimeCard
                        key={entry.id}
                        entry={entry}
                        onChange={(v) => updateEntry(entry.id, v)}
                        onArchive={() => setArchived(entry.id, true)}
                        onUnarchive={() => setArchived(entry.id, false)}
                        onRemove={() => removeEntry(entry.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {mode === 'prep' && subview === 'wizard' && (() => {
          const runs = (get('prepWizardRuns', []) as PrepWizardRun[]) || [];
          const sortedRuns = [...runs].sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
          const launch = () => {
            setVal('__prepWizardOpen', true);
            setVal('__prepWizardStep', 1);
          };
          const sessionOpen = !!get('__activeSessionId', '');
          return (
            <div className="space-y-3">
              <div className="rounded border border-rule bg-parchment p-4 shadow-card">
                <h2 className="mb-1 font-display text-lg tracking-wide text-ink">Prep Wizard</h2>
                <p className="mb-3 font-serif text-sm text-ink-soft">
                  An 8-step guided walkthrough of Lazy DM's per-session prep — Review, Strong
                  Start, Scenes, Secrets, Locations, NPCs, Monsters, Magic Items.
                </p>
                <button
                  type="button"
                  onClick={launch}
                  disabled={sessionOpen}
                  title={sessionOpen ? 'Finish your current session first' : 'Walk through the 8-step prep'}
                  className="flex items-center gap-1.5 rounded border border-moss/60 bg-moss/10 px-3 py-1.5 font-display text-xs uppercase tracking-wider text-moss hover:bg-moss hover:text-parchment disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ClipboardList size={12} /> Start Wizard
                </button>
              </div>
              <div className="rounded border border-rule bg-parchment p-4 shadow-card">
                <h3 className="mb-2 font-display text-sm tracking-wide text-ink">Past Runs</h3>
                {sortedRuns.length === 0 ? (
                  <p className="font-serif text-xs italic text-ink-mute">No wizard runs yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {sortedRuns.slice(0, 8).map(r => (
                      <li key={r.id} className="flex items-center gap-2 font-serif text-xs text-ink-soft">
                        <span className="w-16 font-display text-[10px] uppercase tracking-wider text-brass-deep">
                          {(r.stepsCompleted || []).length}/8
                        </span>
                        <span className="flex-1">
                          Session {r.forSessionNumber}
                          {r.completedAt && <span className="ml-2 italic text-ink-mute">{new Date(r.completedAt).toLocaleDateString()}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          );
        })()}

        {mode === 'run' && subview === 'session' && (
          <RunSessionInline
            get={get}
            setVal={setVal}
            setState={setState}
            characters={characters}
            campaignContext={generatorCampaignContext}
            nextUp={nextUp}
            jumpToNextUp={jumpToNextUp}
            trackEvent={trackEvent}
            navigateTo={navigateTo}
            onEndSession={handleEndSession}
            usedPrep={usedPrep}
            sessionPlaylistAnchor={sessionPlaylistAnchor}
            setSessionPlaylistAnchor={setSessionPlaylistAnchor}
          />
        )}

        {mode === 'run' && subview === 'scene' && (isPro ? (
          <SceneModePanel
            data={state}
            scenes={(get(SCENE_SESSIONS_KEY, []) as SceneEntry[])}
            onScenesChange={(next) => setVal(SCENE_SESSIONS_KEY, next)}
            onReveal={(npcIds) => {
              const cfg = get('player', null) as PlayerConfig | null;
              if (!cfg) return;
              const npcsArr = get('npcs', []) as Array<{ id?: string; name?: string }>;
              const mentions = npcIds.map((id) => ({
                entityType: 'npcs' as const,
                entityId: id,
                label: npcsArr.find((n) => n.id === id)?.name ?? '',
              }));
              setVal('player', applyNarrationReveal(cfg, mentions, { mode: 'party' }));
            }}
            onSceneEnded={(scene) => {
              const npcsArr = get('npcs', []) as Array<{ id?: string; name?: string }>;
              const locsArr = get('locations', []) as Array<{ id?: string; name?: string }>;
              const locName = locsArr.find((l) => l.id === scene.locationId)?.name || 'a location';
              const md = sceneToMarkdown(scene, {
                locationName: (id) => locsArr.find((l) => l.id === id)?.name || 'Unknown Location',
                npcName: (id) => npcsArr.find((n) => n.id === id)?.name || 'Unknown NPC',
              });
              const existing = (get('sessionLogV2', []) as SessionLogEntry[]) || [];
              const entry: SessionLogEntry = {
                id: makeLogId(),
                number: nextSessionNumber(existing),
                date: todayISO(),
                startedAt: scene.startedAt,
                endedAt: scene.endedAt ?? Date.now(),
                title: `Scene at ${locName}`,
                recap: scene.summary?.trim() || md,
                events: [],
                secretsRevealed: [],
                scenesUsed: [],
                goalUpdates: [],
              };
              setVal('sessionLogV2', [...existing, entry]);
              trackEvent('scene_used', `Ran a scene at ${locName} (${scene.turns.length} turns)`);
            }}
          />
        ) : (
          <LockedPanel title="Scene Mode">
            Run a location turn-by-turn at the table: pick where you are and who&apos;s present, then describe what
            your PC does. Claude voices the NPCs in character, paints the sensory beat, and suggests what to roll —
            grounded in your campaign. The only during-play AI feature.
          </LockedPanel>
        ))}

        {mode === 'run' && subview === 'maps' && (
          <MapsTab
            data={state}
            isPro={isPro}
            onMapsChange={(maps) => setVal('maps', maps)}
            onDataChange={setState}
          />
        )}

        {mode === 'run' && subview === 'assistant' && (isPro ? (
          <CampaignAssistant
            data={state}
            campaignName={name}
            setData={(next) => setState(next)}
          />
        ) : (
          <LockedPanel title="Campaign Assistant">
            A persistent chat agent with read access to your whole campaign — NPCs, factions, secrets,
            sessions, world clock — and write access via proposals you approve. It plans your next
            session, surfaces neglected entities, drafts new content, and answers &quot;what should
            happen next?&quot;
          </LockedPanel>
        ))}

        {mode === 'run' && subview === 'lookup' && (() => {
          const playerConfig = (get('player', {}) as any) || {};
          const roster = playerConfig.roster || [];
          return <LookupView
            npcs={get('npcs', []) as any[]}
            locations={get('locations', []) as any[]}
            secrets={get('secrets', []) as string[]}
            factions={get('factions', []) as any[]}
            magicItems={get('items', []) as any[]}
            revealedSecrets={get('revSec', {}) as Record<number, boolean>}
            roster={roster}
            playerConfig={playerConfig}
          />;
        })()}

        {mode === 'organize' && subview === 'log' && (() => {
          const handleSessionLogChange = (updatedEntries: SessionLogEntry[]) => {
            const { partyXP, partyInventory, updatedCharacters } = recalculatePartyState(updatedEntries, characters);
            setState(s => ({
              ...s,
              sessionLogV2: updatedEntries,
              partyXP,
              partyInventory,
              characters: updatedCharacters
            }));
          };
          return (
            <SessionLogTab
              entries={(get('sessionLogV2', []) as SessionLogEntry[])}
              onChange={handleSessionLogChange}
              campaignId={campaign.id}
              campaignSecrets={get('secrets', []) as string[]}
              campaignScenes={get('scenes', []) as string[]}
              npcs={get('npcs', [])}
              locations={get('locations', [])}
              monsters={get('monsters', [])}
              items={get('items', [])}
              treasure={get('treasure', [])}
              characters={characters}
              campaignStrongStart={get('strongStart', '') as string}
              onStrongStartChange={(v) => setVal('strongStart', v)}
            />
          );
        })()}

        {mode === 'run' && subview === 'dice' && (
          <DiceRoller
            macros={get('macros', []) as Macro[]}
            onMacrosChange={(v) => setVal('macros', v)}
            pcMacroGroups={pcs
              .map((pc) => ({ pcId: pc.id, pcName: pc.name || 'Unnamed PC', macros: pcMacros[pc.id] ?? [] }))
              .filter((g) => g.macros.length > 0)}
            logEntries={logEntriesFor('dice')}
            onLogEntriesChange={setLogEntriesFor('dice')}
          />
        )}

        {mode === 'run' && subview === 'spells' && (
          <SpellsTab
            favorites={get('spellFavs', []) as string[]}
            onFavoritesChange={(v) => setVal('spellFavs', v)}
            homebrewSpells={get('homebrewSpells', []) as Spell[]}
            onHomebrewSpellsChange={(v) => setVal('homebrewSpells', v)}
          />
        )}

        {mode === 'library' && subview === 'generators' && (
          <GeneratorsTab
            logs={generatorLogs}
            onLogsChange={(next) => setVal('generatorLogs', next)}
            campaignContext={generatorCampaignContext}
            onAddToCampaign={addToCampaignFor}
            disabledDestsByKind={generatorDisabledDests}
            renderNames={() => (isPro ? (
              <NamesTab
                logEntries={logEntriesFor('names')}
                onLogEntriesChange={setLogEntriesFor('names')}
                onAddToCampaign={addToCampaignFor('names')}
              />
            ) : (
              <LockedPanel title="Names Generator">
                Generate culture-rooted first and last names for NPCs, towns, and places — powered by Claude.
              </LockedPanel>
            ))}
            renderLocations={() => (isPro ? (
              <LocationsTab
                logEntries={logEntriesFor('locations')}
                onLogEntriesChange={setLogEntriesFor('locations')}
                onAddToCampaign={addToCampaignFor('locations')}
              />
            ) : (
              <LockedPanel title="Locations Generator">
                Generate evocative location names with type tag, cultural tradition, and a one-line atmospheric blurb. Powered by Claude.
              </LockedPanel>
            ))}
          />
        )}

        {mode === 'library' && subview === 'monsters' && (
          <MonstersTab
            characters={characters}
            homebrewMonsters={get('homebrewMonsters', []) as HomebrewMonster[]}
            onHomebrewMonstersChange={(v) => {
              const prev = (get('homebrewMonsters', []) as HomebrewMonster[]);
              setVal('homebrewMonsters', v);
              if (v.length > prev.length) {
                const added = v[v.length - 1];
                trackEvent('monster_added', `Added monster: ${added?.name || 'unnamed'}`);
              }
            }}
            rollLogEntries={logEntriesFor('monster-roll')}
            onRollLogEntriesChange={setLogEntriesFor('monster-roll')}
            scaleLogEntries={logEntriesFor('monster-scale')}
            onScaleLogEntriesChange={setLogEntriesFor('monster-scale')}
            onAddRollToCampaign={addToCampaignFor('monster-roll')}
            onAddScaleToCampaign={addToCampaignFor('monster-scale')}
          />
        )}

        {mode === 'library' && subview === 'vivify' && (isPro ? (
          <VivifyPanel
            data={state}
            history={(get('vivifyHistory', []) as VivifyHistoryEntry[])}
            onHistoryChange={(h) => setVal('vivifyHistory', h)}
          />
        ) : (
          <LockedPanel title="Vivify">
            Generate vivid, campaign-aware descriptions — places, NPCs, scene openings, rumors,
            aftermath, magic items, foreshadowing — powered by Claude. Streams in real time and
            saves the generations you want to keep.
          </LockedPanel>
        ))}

        {mode === 'library' && subview === 'traps' && (
          <TrapBuilder
            traps={(get('traps', []) as Trap[])}
            onChange={(traps) => setVal('traps', traps)}
          />
        )}

        {mode === 'run' && subview === 'dmref' && <DMRefTab />}

        {mode === 'run' && subview === 'logged' && (
          <LoggedTab
            logs={(state.generatorLogs as GeneratorLogs) || {}}
            onChangeLogs={(next) => setVal('generatorLogs', next)}
            playerLog={(get('playerLog', []) as PlayerLogEntry[])}
            onShareToPlayerLog={(text) => {
              const currentLog = (get('playerLog', []) as PlayerLogEntry[]) || [];
              const nextLog = [...currentLog, {
                id: makeLogId(),
                text: text.trim(),
                mentions: [],
                visibility: { mode: 'party' },
                authorRef: 'gm',
                postedAtMs: Date.now(),
              }];
              setVal('playerLog', nextLog);
            }}
          />
        )}

        {mode === 'run' && subview === 'chase' && (
          <ChaseTracker
            chases={(get('chases', []) as Chase[])}
            onChange={(chases) => setVal('chases', chases)}
          />
        )}

        {mode === 'library' && subview === 'pointbuy' && (
          <ToolsTab
            characters={characters}
            onChangeCharacter={updateCharacter}
          />
        )}

        {mode === 'library' && subview === 'hazards' && (
          <HazardCalculator />
        )}

        {mode === 'library' && subview === 'logistics' && (
          <LogisticsTab
            characters={characters}
            state={(get('logistics', emptyLogistics()) as LogisticsState)}
            onChange={(s) => setVal('logistics', s)}
          />
        )}

        {mode === 'library' && subview === 'web' && (
          <NPCRelationshipWeb
            npcs={get('npcs', []) as any[]}
            characters={characters}
            graph={(get('relationshipGraph', emptyGraph()) as RelationshipGraphState)}
            onChange={(g) => setVal('relationshipGraph', g)}
          />
        )}

        {mode === 'library' && subview === 'wiki' && <WikiTab />}

        {mode === 'library' && subview === 'livingworld' && (
          <LivingWorldTab
            get={get}
            setVal={setVal}
            isPro={isPro}
            soloMode={soloMode}
            campaignName={name}
          />
        )}

        {mode === 'library' && subview === 'factions' && (
          <FactionEngineTab
            campaignId={campaign.id}
            world={(get('factionWorld', emptyWorld()) as FactionWorld)}
            onChange={(w) => setVal('factionWorld', w)}
          />
        )}

        {playMode !== 'solo' && mode === 'oracle' && subview === 'wells' && (
          <WellsOracle
            log={get('oracleLog', []) as OracleRoll[]}
            onLog={(next) => setVal('oracleLog', next)}
            chaos={get('__oracleChaos', 5) as number}
            onChaosChange={(c) => setVal('__oracleChaos', c)}
            inline={true}
          />
        )}
    </>
  );
}
