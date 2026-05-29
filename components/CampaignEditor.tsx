'use client';

import React from 'react';
import { type Campaign } from '@/lib/firebase/campaigns';
import { type World } from '@/lib/firebase/worlds';
import { ChevronDown, Check, X, User, Users, Swords, ScrollText, ArrowLeft, Sparkles, Play, Search, ClipboardList, Globe } from 'lucide-react';
import dynamic from 'next/dynamic';
import type { HomebrewMonster } from './MonstersTab';
import SummonModal from './SummonModal';
import WellsOracle from './WellsOracle';
import type { OracleRoll } from '@/lib/oracle/wells';
import InitiativePanel from './InitiativePanel';
import type { InitiativeState } from '@/lib/initiative';
import { applySession0Patch } from '@/lib/session0';
import { WhileYouWereAway } from './world/WhileYouWereAway';
import { AccountMenu } from './AccountMenu';
import PlayersManager from './PlayersManager';
import CommandPalette from './CommandPalette';
import KeyboardShortcuts from './KeyboardShortcuts';
import { OVERRIDES_STATE_KEY, type PrepTargetKey } from '@/lib/prepTargets';
import PrepTargetsModal from './PrepTargetsModal';
import ModeSwitcherModal from './ModeSwitcherModal';
import { CampaignPlayModeContext } from './CampaignPlayModeContext';
import Tour from './Tour';
import { TOURS, markTourAsSeen } from '@/lib/tutorials/mode-tours';
import ModeNav from './ModeNav';
import { type Mode } from '@/lib/modes';
import { WikiProvider } from './wiki/WikiContext';
const RunSessionView = dynamic(() => import('./RunSessionView'));
const PrepWizardView = dynamic(() => import('./PrepWizardView'));
const Session0Wizard = dynamic(() => import('./Session0Wizard'));
import {
  useCampaignEditor,
  type CampaignEditorProps,
} from './campaignEditor/useCampaignEditor';
import { PlanPrepView } from './campaignEditor/PlanPrepView';
import { EditorSubviews } from './campaignEditor/EditorSubviews';
import { useReactiveWorldEvents } from '@/lib/world/useReactiveWorldEvents';

export default function CampaignEditor(props: CampaignEditorProps) {
  const ed = useCampaignEditor(props);
  const {
    PREP_GROUPS,
    SyncIndicator,
    SyncPill,
    ToolBtn,
    activeTourMode,
    campaign,
    characters,
    closePrepWizard,
    completedCount,
    confirmUnsavedNav,
    done,
    exportJSON,
    fileInputRef,
    flashHighlight,
    generatorCampaignContext,
    generatorLogs,
    get,
    getFilteredPrepArray,
    handleArchive,
    handleConvertToWorld,
    handleCopy,
    handleDelete,
    handleEndSession,
    handleModeChange,
    handleSubviewChange,
    importJSON,
    isArchived,
    isPro,
    mode,
    modeSwitcherOpen,
    name,
    nextUp,
    onSummonSave,
    open,
    oracleOpen,
    paletteItems,
    paletteOpen,
    pcs,
    playMode,
    prepTargetOverrides,
    prepTargetsOpen,
    progressMenuRef,
    progressOpen,
    router,
    scrollToEntity,
    session0Open,
    sessionPlaylistAnchor,
    setActiveTourMode,
    setLogEntriesFor,
    setMode,
    setModeSwitcherOpen,
    setName,
    setOracleOpen,
    setPaletteOpen,
    setPlayMode,
    setPrepTargetsOpen,
    setProgressOpen,
    setSession0Open,
    setSessionPlaylistAnchor,
    setShortcutsOpen,
    setState,
    setSubview,
    setSummonState,
    setVal,
    shortcutsOpen,
    soloMode,
    startSessionFromPrep,
    state,
    subview,
    summonState,
    summonToast,
    totalPrepSteps,
    tourUid,
    undoToast,
    userEmail,
    wikiValue,
    world,
    worldOnlyMode,
  } = ed;

  // Reactive world-events observer (propose-only): watches NPC death
  // transitions and enqueues bounded propagation into data.pendingWorldEvents.
  useReactiveWorldEvents(get, setVal);

  if (get('__runSessionOpen', false)) {
    return (
      <>
        <div className="mx-auto max-w-3xl px-4 pt-4">
          <WhileYouWereAway get={get} setVal={setVal} isPro={isPro} campaignName={name} />
        </div>
        <RunSessionView
          get={get}
          setVal={setVal}
          characters={characters}
          onEndSession={handleEndSession}
          onExitWithoutEnding={() => setVal('__runSessionOpen', false)}
          onOpenLibrary={() => {
            setVal('__runSessionOpen', false);
            setState(s => ({ ...s, __mode: 'library', __subview: 'generators' }));
          }}
          campaignContext={generatorCampaignContext}
          campaignId={campaign.id}
          campaignName={name}
          sessionPlaylistAnchor={sessionPlaylistAnchor}
          setSessionPlaylistAnchor={setSessionPlaylistAnchor}
        />
        <SyncPill />
      </>
    );
  }

  if (get('__prepWizardOpen', false)) {
    return (
      <PrepWizardView
        get={(key, fb) => {
          const raw = get(key, fb);
          return getFilteredPrepArray(key as PrepTargetKey, raw);
        }}
        setVal={setVal}
        soloMode={soloMode}
        overrides={prepTargetOverrides}
        onExit={closePrepWizard}
        onClose={closePrepWizard}
        onStartSession={startSessionFromPrep}
      />
    );
  }

  if (session0Open) {
    return (
      <Session0Wizard
        initialName={name}
        initialSoloMode={soloMode}
        onClose={() => {
          // Closing without finishing still marks done so the user is not
          // re-prompted on every load. They can re-run from the menu.
          setState(s => ({ ...s, __session0Done: true }));
          setSession0Open(false);
        }}
        onFinish={(patch) => {
          if (patch.name) setName(patch.name);
          if (patch.mode) setPlayMode(patch.mode);
          else if (patch.soloMode !== undefined) setPlayMode(patch.soloMode ? 'duet' : 'standard');
          setState(s => applySession0Patch(s, patch));
          setSession0Open(false);
          setMode('plan');
          setSubview('pitch');
        }}
      />
    );
  }

  return (
    <WikiProvider value={wikiValue}>
    <CampaignPlayModeContext.Provider value={playMode}>
    <main className="min-h-screen p-3 sm:p-5 md:p-8">
      <div className="mx-auto max-w-5xl">
        <div className="space-y-4 rounded-lg border border-rule bg-parchment-soft p-3 shadow-page sm:p-5 md:p-8">
          <header className="border-b border-rule pb-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => { if (confirmUnsavedNav()) router.push('/campaign'); }}
                className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:text-crimson"
              >
                <ArrowLeft size={12} /> All Campaigns
              </button>
              <div className="flex items-center gap-2">
                <SyncIndicator />
                <AccountMenu
                  onExport={exportJSON}
                  onImport={() => fileInputRef.current?.click()}
                  onArchive={handleArchive}
                  isArchived={isArchived}
                  onDelete={handleDelete}
                  onRerunSession0={() => setSession0Open(true)}
                  onOpenPrepTargets={() => setPrepTargetsOpen(true)}
                  onCopy={handleCopy}
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ScrollText size={20} className="flex-shrink-0 text-crimson" />
              <textarea rows={1} value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign Name"
                className="min-w-48 flex-1 resize-none whitespace-pre-wrap break-words border-b border-rule bg-transparent pb-1 font-display text-xl tracking-wide text-ink [field-sizing:content] placeholder:text-ink-faint focus:border-crimson focus:outline-none sm:text-2xl" />
              {isArchived && (
                <span
                  title="This campaign is archived — hidden from your main list. Unarchive from the Account menu."
                  className="flex-shrink-0 rounded-sm border border-brass-deep/60 bg-brass/10 px-1.5 py-0.5 font-display text-[10px] uppercase not-italic tracking-wider text-brass-deep"
                >
                  Archived
                </span>
              )}
              {worldOnlyMode ? (
                <span className="flex-shrink-0 rounded-sm border border-moss/60 bg-moss/10 px-1.5 py-0.5 font-display text-[10px] uppercase not-italic tracking-wider text-moss">
                  Shared World
                </span>
              ) : campaign.worldId ? (
                <button
                  onClick={() => router.push(`/world/${campaign.worldId}`)}
                  className="flex flex-shrink-0 items-center gap-1 rounded border border-indigo-700/60 bg-indigo-50 px-2 py-0.5 font-display text-[10px] uppercase not-italic tracking-wider text-indigo-700 transition-colors hover:bg-indigo-100"
                >
                  <Globe size={10} /> World Linked
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConvertToWorld}
                  className="flex-shrink-0 rounded border border-brass-deep/60 bg-brass/5 px-2 py-0.5 font-display text-[10px] uppercase not-italic tracking-wider text-brass-deep transition-colors hover:bg-brass/10"
                >
                  Convert to Shared World
                </button>
              )}
              <button
                type="button"
                onClick={() => setModeSwitcherOpen(true)}
                className={`flex items-center gap-1 rounded border px-2 py-0.5 font-display text-[10px] font-semibold uppercase tracking-wider transition-all hover:opacity-85 ${
                  playMode === 'solo'
                    ? 'border-pink-500/30 bg-pink-950/20 text-pink-400'
                    : playMode === 'duet'
                    ? 'border-teal-500/30 bg-teal-950/20 text-teal-400'
                    : 'border-amber-500/30 bg-amber-950/20 text-amber-400'
                }`}
                title="Click to change campaign play mode"
              >
                {playMode === 'solo' && <Sparkles size={10} />}
                {playMode === 'duet' && <User size={10} />}
                {playMode === 'standard' && <Users size={10} />}
                {playMode} Mode
              </button>
              {playMode !== 'solo' && (
                <PlayersManager campaign={campaign} />
              )}
            </div>
            <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={importJSON} className="hidden" />

            <div className="mt-2.5 flex flex-wrap items-center justify-between gap-1.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <ToolBtn onClick={() => setPaletteOpen(true)} title="Open command palette (⌘K)">
                  <Search size={12} /> Search
                  <kbd className="ml-1 rounded border border-rule px-1 py-px font-display text-[10px] uppercase tracking-wider text-ink-mute">⌘K</kbd>
                </ToolBtn>
                <button
                  type="button"
                  onClick={() => {
                    setVal('__prepWizardOpen', true);
                    setVal('__prepWizardStep', 1);
                  }}
                  disabled={!!get('__activeSessionId', '')}
                  className="flex items-center gap-1.5 rounded border border-moss/60 bg-moss/10 px-3 py-1 font-display text-xs uppercase tracking-wider text-moss shadow-sm hover:bg-moss hover:text-parchment disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-moss/10 disabled:hover:text-moss"
                  title={get('__activeSessionId', '') ? 'Finish your current session first' : 'Walk through Lazy DM\'s 8-step prep'}
                >
                  <ClipboardList size={12} /> Prep Next Session
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (nextUp) {
                      if (!window.confirm(`You have unfinished prep targets (e.g. ${nextUp.label}). Are you sure you want to start the session anyway?`)) {
                        return;
                      }
                    }
                    const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                    setState(s => ({
                      ...s,
                      __activeSessionId: sessionId,
                      __sessionStartedAt: Date.now(),
                      __sessionChangeEvents: [],
                      __sessionUsedScenes: [],
                      __runSessionOpen: true,
                    }));
                  }}
                  className="flex items-center gap-1.5 rounded border border-crimson/60 bg-crimson/10 px-3 py-1 font-display text-xs uppercase tracking-wider text-crimson shadow-sm hover:bg-crimson hover:text-parchment"
                  title="Enter Run Session mode for live play"
                >
                  <Play size={12} /> Run Session
                </button>
              </div>
              <div className="relative" ref={progressMenuRef}>
                <button
                  type="button"
                  onClick={() => setProgressOpen(!progressOpen)}
                  className="flex items-center gap-1.5 rounded-full border border-moss/45 bg-moss/5 px-2.5 py-1 transition-colors hover:bg-moss/10"
                >
                  <div className="flex items-center gap-1 font-display text-[10px] uppercase tracking-wider text-moss">
                    {completedCount}/{totalPrepSteps} Steps Done <ChevronDown size={10} className={`transition-transform ${progressOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                {progressOpen && (
                  <div className="absolute right-0 top-full z-30 mt-2 max-h-[80vh] w-64 overflow-y-auto rounded border border-rule bg-parchment-soft shadow-page">
                    <div className="border-b border-rule bg-parchment-deep/50 p-3 font-display text-xs uppercase tracking-wider text-ink">
                      Uncompleted Tasks
                    </div>
                    <div className="space-y-3 p-2">
                      {PREP_GROUPS.map(g => {
                        const uncompleted = g.keys.map((k, i) => ({ k, label: g.labels[i] })).filter(x => !done?.[x.k]);
                        if (uncompleted.length === 0) return null;
                        return (
                          <div key={g.name}>
                            <div className="mb-1 px-1 font-display text-[10px] uppercase tracking-wider text-brass-deep">
                              {g.name}
                            </div>
                            <ul className="space-y-1">
                              {uncompleted.map(u => (
                                <li key={u.k} className="flex items-start gap-1.5 px-1 font-serif text-xs leading-tight text-ink-soft">
                                  <span className="mt-0.5 text-crimson/60">•</span> <span>{u.label}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                      {PREP_GROUPS.every(g => g.keys.every(k => done?.[k])) && (
                        <div className="p-2 text-center font-serif text-xs italic text-moss">
                          All standard prep steps are complete!
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          <ModeNav
            mode={mode}
            subview={subview}
            onModeChange={handleModeChange}
            onSubviewChange={handleSubviewChange}
            worldOnlyMode={worldOnlyMode}
            playMode={playMode}
          />

        <div key={`${mode}:${subview}`} className="gm-tab-enter space-y-4">
          <div className="space-y-3">
            <PlanPrepView ed={ed} />
          </div>
          <EditorSubviews ed={ed} />
        </div>

        <footer className="mt-4 border-t border-rule pt-3 text-center font-serif text-xs italic text-ink-mute">
          {userEmail}
          {isPro && (
            <span className="ml-1.5 rounded-sm border border-crimson/60 bg-crimson/10 px-1.5 py-0.5 font-display text-[10px] uppercase not-italic tracking-wider text-crimson">
              Pro
            </span>
          )}
          {' · auto-syncs to Firestore every 1.5s'}
        </footer>
        </div>
      </div>

      {get('__runSessionOpen', false) && !get('__initiativeOpen', false) && (
        <button
          onClick={() => setVal('__initiativeOpen', true)}
          className="fixed bottom-[88px] right-4 z-20 flex items-center gap-1.5 rounded-full border border-crimson/60 bg-parchment px-3 py-2 font-display text-xs uppercase tracking-wider text-crimson shadow-page hover:bg-crimson hover:text-parchment"
          title="Open initiative tracker"
        >
          <Swords size={14} /> Initiative
        </button>
      )}

      {get('__runSessionOpen', false) && get('__initiativeOpen', false) && (
        <InitiativePanel
          state={(get('__initiative', null) as InitiativeState | null)}
          onChange={(next) => setVal('__initiative', next)}
          monsters={get('homebrewMonsters', []) as HomebrewMonster[]}
          pcs={pcs}
          onClose={() => setVal('__initiativeOpen', false)}
        />
      )}

      {/* finalizerModal removed */}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        items={paletteItems}
      />

      <KeyboardShortcuts open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <PrepTargetsModal
        open={prepTargetsOpen}
        initialOverrides={prepTargetOverrides}
        onClose={() => setPrepTargetsOpen(false)}
        onSave={(next) => setVal(OVERRIDES_STATE_KEY, next)}
      />
      <ModeSwitcherModal
        open={modeSwitcherOpen}
        currentMode={playMode}
        onClose={() => setModeSwitcherOpen(false)}
        onSave={(newMode) => {
          setPlayMode(newMode);
          setState((s) => ({
            ...s,
            mode: newMode,
            __soloMode: newMode === 'solo' || newMode === 'duet',
          }));
        }}
      />

      {playMode === 'solo' && (
        <button
          type="button"
          data-oracle-button
          onClick={() => setOracleOpen((o) => !o)}
          title="Open Wells Oracle"
          className={`fixed right-4 z-40 flex size-10 items-center justify-center rounded-full border border-pink-500/30 bg-pink-950/20 text-pink-400 shadow-page transition-all hover:bg-pink-900/35 hover:text-pink-300 ${
            get('__runSessionOpen', false) ? 'bottom-[88px]' : 'bottom-4'
          }`}
        >
          <Sparkles size={18} />
        </button>
      )}

      {playMode === 'solo' && oracleOpen && (
        <div
          data-oracle-floating
          className={`fixed right-4 z-40 flex max-h-[500px] w-[380px] max-w-[calc(100vw-2rem)] flex-col overflow-y-auto rounded-lg border border-rule bg-parchment shadow-page ${
            get('__runSessionOpen', false) ? 'bottom-[148px]' : 'bottom-16'
          }`}
        >
          <div className="flex items-center justify-between border-b border-rule bg-parchment-deep px-3 py-2">
            <span className="flex items-center gap-1.5 font-display text-xs font-bold uppercase tracking-wider text-pink-500">
              <Sparkles size={12} /> Wells Oracle
            </span>
            <button
              type="button"
              onClick={() => setOracleOpen(false)}
              className="text-ink-mute transition-colors hover:text-crimson"
            >
              <X size={14} />
            </button>
          </div>
          <div className="flex-1 p-3">
            <WellsOracle
              log={get('oracleLog', []) as OracleRoll[]}
              onLog={(next) => setVal('oracleLog', next)}
              chaos={get('__oracleChaos', 5) as number}
              onChaosChange={(c) => setVal('__oracleChaos', c)}
              inline={true}
            />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setShortcutsOpen(true)}
        title="Keyboard shortcuts (press ?)"
        aria-label="Keyboard shortcuts"
        className={`fixed left-4 z-30 flex size-8 items-center justify-center rounded-full border border-rule bg-parchment-soft font-display text-sm leading-none text-brass-deep shadow-page transition-all hover:bg-brass hover:text-parchment ${
          get('__runSessionOpen', false) ? 'bottom-[88px]' : 'bottom-4'
        }`}
      >
        ?
      </button>

      <SyncPill />

      {undoToast && (
        <div
          role="status"
          className={`gm-toast fixed left-16 z-40 flex items-center gap-2 rounded-full border border-brass-deep/70 bg-parchment px-3 py-1.5 font-display text-xs uppercase tracking-wider text-brass-deep shadow-page transition-all ${
            get('__runSessionOpen', false) ? 'bottom-[88px]' : 'bottom-4'
          }`}
        >
          {undoToast}
        </div>
      )}

      {summonToast && (
        <button
          type="button"
          onClick={() => {
            scrollToEntity(summonToast.primaryEntityId);
            flashHighlight(summonToast.primaryEntityId);
          }}
          className={`fixed left-1/2 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-brass-deep/70 bg-parchment px-3 py-1.5 font-display text-xs uppercase tracking-wider text-brass-deep shadow-page transition-all hover:bg-brass hover:text-parchment ${
            get('__runSessionOpen', false) ? 'bottom-[88px]' : 'bottom-4'
          }`}
          title="Click to re-scroll"
        >
          <Check size={12} /> {summonToast.text}
        </button>
      )}

      {summonState && (
        <SummonModal
          section={summonState.section}
          generator={summonState.generator}
          isPro={isPro}
          onClose={() => setSummonState(null)}
          onSave={(action) =>
            onSummonSave(summonState.section, summonState.generator, action)
          }
          campaignContext={generatorCampaignContext}
          logs={generatorLogs}
          setLogEntries={setLogEntriesFor}
        />
      )}
      {activeTourMode && (
        <Tour
          mode={activeTourMode}
          steps={TOURS[activeTourMode]}
          onComplete={() => {
            markTourAsSeen(tourUid || 'default', activeTourMode);
            setActiveTourMode(null);
          }}
        />
      )}
    </main>
    </CampaignPlayModeContext.Provider>
    </WikiProvider>
  );
}
