'use client';

import React from 'react';
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
import type { GeneratorLogs } from '@/lib/generators/log';
import { LockedPanel } from '../LockedFeature';
import type { PlayerConfig } from '@/lib/playerMode/types';
import type { PlayerLogEntry } from '@/lib/playerMode/sessionLog';
import WikiTab from '../wiki/WikiTab';
import { LookupView } from './LookupView';
import { RunSessionInline } from './runSessionInline';
import { WorldbuildView } from './editorSubviews/WorldbuildView';
import { PrepWizardView } from './editorSubviews/PrepWizardView';
import { PrepArcView, PrepEndingView } from './editorSubviews/PrepArcAndEndingView';
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
    sessionPlaylistAnchor,
    setLogEntriesFor,
    setSessionPlaylistAnchor,
    setState,
    setVal,
    soloMode,
    state,
    subview,
    trackEvent,
    updateCharacter,
    usedPrep,
  } = ed;
  return (
    <>
        {mode === 'plan' && subview === 'worldbuild' && <WorldbuildView ed={ed} />}

        {mode === 'prep' && subview === 'arc' && <PrepArcView ed={ed} />}

        {mode === 'prep' && subview === 'ending' && <PrepEndingView ed={ed} />}

        {mode === 'prep' && subview === 'wizard' && <PrepWizardView ed={ed} />}

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
