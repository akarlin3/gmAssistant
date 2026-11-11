'use client';

import React from 'react';
import { type Campaign } from '@/lib/firebase/campaigns';
import { type World } from '@/lib/firebase/worlds';
import { ChevronDown, Check, X, User, Users, Swords, ScrollText, ArrowLeft, Sparkles, Play, Search, ClipboardList, Globe, Compass } from 'lucide-react';
import dynamic from 'next/dynamic';
import type { HomebrewMonster } from './MonstersTab';
import SummonModal from './SummonModal';
import WellsOracle from './WellsOracle';
import type { OracleRoll } from '@/lib/oracle/wells';
import InitiativePanel from './InitiativePanel';
import { advanceTurn, type InitiativeState } from '@/lib/initiative';
import { applySession0Patch } from '@/lib/session0';
import { WhileYouWereAway } from './world/WhileYouWereAway';
import { AccountMenu } from './AccountMenu';
import { AveryCorpEmblem } from './AveryCorpEmblem';
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
import PlayerCompanionWorkspace, { type PlayerCompanionTabId } from './PlayerCompanionWorkspace';
const RunSessionView = dynamic(() => import('./RunSessionView'));
const PrepWizardView = dynamic(() => import('./PrepWizardView'));
const Session0Wizard = dynamic(() => import('./Session0Wizard'));
import {
  useCampaignEditor,
  type CampaignEditorProps,
} from './campaignEditor/useCampaignEditor';
import { EditorSubviews } from './campaignEditor/EditorSubviews';
import { MasterDetailWorkspace } from './campaignEditor/MasterDetailWorkspace';
import { TopHeaderBar, type GmPrimaryTab, type PlayerPrimaryTab, type PrepScale, type WorkspaceRole } from './TopHeaderBar';
import { TableStageShell } from './tableStage/TableStageShell';
import { GmPartyHudRail } from './tableStage/GmPartyHudRail';
import { EntityPeekProvider } from './ui/EntityPeekDrawer';
import { PreviewAsPartyDrawer } from './ui/PreviewAsPartyDrawer';
import { makeLogEntryId, type PlayerLogEntry } from '@/lib/playerMode/sessionLog';
import type { CampaignWhisper, HandoutCard } from '@/lib/playerMode/types';
import { normalizeWorldClockState } from '@/lib/worldClock';
import { useReactiveWorldEvents } from '@/lib/world/useReactiveWorldEvents';
import { GeminiBridgeModal } from './GeminiBridgeModal';
import { WorkspaceArchitectModal } from './WorkspaceArchitectModal';
import WorldClockBar from './WorldClockBar';
import WhisperDrawer, { TableSafetyBanner } from './WhisperDrawer';
import HandoutOverlay from './HandoutOverlay';
import ExternalTablePiP from './ExternalTablePiP';
import { useAuth } from '@/lib/firebase/auth-context';
import { useWorkspaceCustomization } from '@/lib/useWorkspaceHudPrefs';
import {
  captureVaultSnapshot,
  computeSnapshotDiff,
  getVaultSnapshotsSync,
  loadVaultSnapshots,
  restoreVaultSnapshot,
  type VaultSnapshot,
} from '@/lib/snapshotVault';

export default function CampaignEditor(props: CampaignEditorProps) {
  const { user: authUser } = useAuth();
  const ed = useCampaignEditor(props);
  const [companionTab, setCompanionTab] = React.useState<PlayerCompanionTabId>('sheet');
  const [previewAsPartyOpen, setPreviewAsPartyOpen] = React.useState(false);
  const [vaultSnapshots, setVaultSnapshots] = React.useState<VaultSnapshot[]>([]);
  const [previewSnapshotId, setPreviewSnapshotId] = React.useState<string | null>(null);
  const {
    PREP_GROUPS,
    SyncPill,
    activePauseSignal,
    activeTourMode,
    addPc,
    campaign,
    characters,
    closePrepWizard,
    completedCount,
    confirmModal,
    confirmUnsavedNav,
    done,
    exportJSON,
    fileInputRef,
    flashHighlight,
    geminiBridgeOpen,
    generatorCampaignContext,
    generatorLogs,
    get,
    getFilteredPrepArray,
    handleArchive,
    handleConvertToWorld,
    handleEndSession,
    importJSON,
    isArchived,
    isPro,
    mode,
    modeSwitcherOpen,
    name,
    navigateToEntity,
    nextUp,
    onSummonSave,
    openPcs,
    oracleOpen,
    paletteItems,
    paletteOpen,
    pcFileInputRef,
    pcUploadError,
    pcs,
    playMode,
    playerConfig,
    playerLog,
    prepTargetOverrides,
    prepTargetsOpen,
    progressMenuRef,
    progressOpen,
    removePc,
    roster,
    router,
    scrollToEntity,
    session0Open,
    sessionPlaylistAnchor,
    setActivePauseSignal,
    setActiveTourMode,
    setDone,
    setGeminiBridgeOpen,
    setLogEntriesFor,
    setMode,
    setModeSwitcherOpen,
    setName,
    setOpenPcs,
    setOracleOpen,
    setPaletteOpen,
    setPlayMode,
    setPrepTargetsOpen,
    setProgressOpen,
    setSession0Open,
    setSessionPlaylistAnchor,
    setShortcutsOpen,
    setSnapshotVaultOpen,
    setState,
    setSubview,
    setSummonState,
    setVal,
    shortcutsOpen,
    showUndoToast,
    snapshotVaultOpen,
    soloMode,
    startSessionFromPrep,
    state,
    subview,
    summonState,
    summonToast,
    syncState,
    totalPrepSteps,
    tourUid,
    undoToast,
    updatePc,
    uploadPcSheet,
    uploadingPc,
    wikiValue,
    worldOnlyMode,
    workspaceArchitectOpen,
    setWorkspaceArchitectOpen,
    writePcs,
  } = ed;

  React.useEffect(() => {
    if (!snapshotVaultOpen) return;
    setVaultSnapshots(getVaultSnapshotsSync(campaign.id));
    void loadVaultSnapshots(campaign.id).then((list) => setVaultSnapshots(list));
  }, [campaign.id, snapshotVaultOpen]);

  // Reactive world-events observer (propose-only): watches NPC death
  // transitions and enqueues bounded propagation into data.pendingWorldEvents.
  useReactiveWorldEvents(get, setVal);

  // Decoupled Role vs. Prep Scale
  const workspaceRole: WorkspaceRole = playMode === 'player' ? 'player' : 'gm';
  const isCampaignOwner =
    workspaceRole === 'gm' &&
    (!authUser || !campaign.userId || campaign.userId === authUser.uid);

  const workspaceCust = useWorkspaceCustomization({
    campaignId: campaign.id,
    role: workspaceRole,
    campaignStateOrProjectedConfig: state,
  });
  const prepScale: PrepScale =
    playMode === 'solo' || playMode === 'duet' || playMode === 'standard'
      ? playMode
      : ((state.__prepScale as PrepScale) || 'standard');

  const handleRoleChange = (nextRole: WorkspaceRole) => {
    if (nextRole === 'player') {
      setState((s) => ({
        ...s,
        __prepScale: prepScale,
        mode: 'player',
      }));
      setPlayMode('player');
    } else {
      const targetScale: PrepScale = prepScale || 'standard';
      setPlayMode(targetScale);
      setState((s) => ({
        ...s,
        mode: targetScale,
        __soloMode: targetScale === 'solo' || targetScale === 'duet',
      }));
    }
  };

  const handlePrepScaleChange = (nextScale: PrepScale) => {
    setState((s) => ({
      ...s,
      __prepScale: nextScale,
      ...(workspaceRole === 'gm'
        ? {
            mode: nextScale,
            __soloMode: nextScale === 'solo' || nextScale === 'duet',
          }
        : {}),
    }));
    if (workspaceRole === 'gm') {
      setPlayMode(nextScale);
    }
  };

  // Map GM mode to TopHeaderBar 4 Primary Tabs (Prep | World & Roster | Run | Reference)
  const gmActiveTab: GmPrimaryTab =
    mode === 'organize'
      ? 'world_roster'
      : mode === 'run'
        ? 'run'
        : mode === 'library' || mode === 'oracle'
          ? 'reference'
          : 'prep';

  const handleGmTabChange = (tab: GmPrimaryTab) => {
    if (!confirmUnsavedNav()) return;
    if (tab === 'prep') {
      setMode('prep');
      setSubview('flow');
    } else if (tab === 'world_roster') {
      setMode('organize');
      setSubview('party');
    } else if (tab === 'run') {
      setMode('run');
      setSubview('cockpit');
    } else if (tab === 'reference') {
      setMode('library');
      setSubview('spells');
    }
  };

  const playerActiveHeaderTab: PlayerPrimaryTab =
    companionTab === 'world' ? 'world_journal' : companionTab;

  const handlePlayerHeaderTabChange = (tab: PlayerPrimaryTab) => {
    setCompanionTab(tab === 'world_journal' ? 'world' : tab);
  };

  const handlePostQuickNarration = (text: string) => {
    const entry: PlayerLogEntry = {
      id: makeLogEntryId(),
      text,
      mentions: [],
      visibility: { mode: 'party' },
      authorRef: 'gm',
      postedAtMs: Date.now(),
    };
    setVal('playerLog', [entry, ...playerLog]);
    showUndoToast('Posted to Live Party Narration Feed', 2500);
  };

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
          pcs={pcs}
          onUpdatePcs={writePcs}
          activePauseSignal={activePauseSignal}
          onDismissPauseSignal={() => setActivePauseSignal(null)}
          onOpenGeminiBridge={() => setGeminiBridgeOpen(true)}
          onOpenWorkspaceArchitect={() => setWorkspaceArchitectOpen(true)}
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
        <GeminiBridgeModal
          open={geminiBridgeOpen}
          onClose={() => setGeminiBridgeOpen(false)}
          campaignId={campaign.id}
          campaignName={name}
          campaignData={state}
          prepScale={prepScale}
          role={playMode === 'player' ? 'player' : 'gm'}
          onApplyCampaignData={(nextData) => {
            setState(nextData);
            showUndoToast('Applied Gemini Studio payload to campaign', 3500);
          }}
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

  const runInitRaw = (state.__initiative ?? state.initiative) as InitiativeState | null;
  const runActiveTurnLabel =
    runInitRaw && Array.isArray(runInitRaw.combatants) && runInitRaw.combatants.length > 0
      ? runInitRaw.combatants[runInitRaw.activeIndex ?? 0]?.name
      : undefined;
  const runHandoutGallery = ((state.handoutGallery as HandoutCard[] | undefined) ?? []);
  const runActiveHandoutFlash = state.activeHandoutFlashId
    ? runHandoutGallery.find((h) => h.id === state.activeHandoutFlashId) ?? null
    : null;
  const runWhispers = ((state.whispers as CampaignWhisper[] | undefined) ?? []);
  const runEntitiesForWhisper = [
    ...((Array.isArray(state.npcs) ? state.npcs : []).map((n: any, i: number) => ({
      id: String(n?.id || `npc-${i}`),
      name: String(n?.name || `NPC ${i + 1}`),
      category: 'npcs',
    }))),
    ...((Array.isArray(state.locations) ? state.locations : []).map((l: any, i: number) => ({
      id: String(l?.id || `loc-${i}`),
      name: String(l?.name || `Location ${i + 1}`),
      category: 'locations',
    }))),
  ];

  return (
    <WikiProvider value={wikiValue}>
    <CampaignPlayModeContext.Provider value={playMode}>
    <EntityPeekProvider
      campaignData={state}
      playerSlots={roster}
      onUpdateCampaign={(mutator) =>
        setState((prev) => {
          const next = JSON.parse(JSON.stringify(prev));
          mutator(next);
          return next;
        })
      }
      onJumpToEntity={(type, id) => navigateToEntity(type as any, id)}
    >
    <main className="min-h-screen w-full max-w-none bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      {/* 3-Zone Top Header Bar (h-12 px-4) */}
      <TopHeaderBar
        campaignName={name}
        onRenameCampaign={setName}
        role={workspaceRole}
        onRoleChange={handleRoleChange}
        gmActiveTab={gmActiveTab}
        onGmTabChange={handleGmTabChange}
        playerActiveTab={playerActiveHeaderTab}
        onPlayerTabChange={handlePlayerHeaderTabChange}
        prepScale={prepScale}
        onPrepScaleChange={handlePrepScaleChange}
        saveStatus={
          syncState === 'error'
            ? 'error'
            : syncState === 'saving' || syncState === 'pending'
              ? 'saving'
              : 'saved'
        }
        onOpenCommandPalette={() => setPaletteOpen(true)}
        onOpenGeminiBridge={() => setGeminiBridgeOpen(true)}
        onOpenSnapshotVault={() => setSnapshotVaultOpen(true)}
        onOpenWorkspaceArchitect={() => setWorkspaceArchitectOpen(true)}
        terminologyMap={workspaceCust.terminologyMap}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onOpenPreviewAsParty={() => setPreviewAsPartyOpen(true)}
        onSyncCapsule={() => setPreviewAsPartyOpen(true)}
        onExportCampaignJson={exportJSON}
        onImportCampaignJson={(file) => {
          const reader = new FileReader();
          reader.onload = (ev) => {
            try {
              const data = JSON.parse(ev.target?.result as string);
              if (data._format !== 'campaign_prep_v1') {
                showUndoToast('Import failed: unsupported file format', 4000);
                return;
              }
              captureVaultSnapshot({
                campaignId: campaign.id,
                campaignName: name,
                reason: 'pre_json_import',
                label: 'Pre-JSON Import Backup',
                data: state,
                done,
              });
              if (data.campaignName) setName(data.campaignName);
              setState(data.state || {});
              setDone(data.done || {});
              showUndoToast('Campaign imported (previous state saved to Snapshot Vault)', 4000);
            } catch {
              showUndoToast('Import failed: invalid JSON file', 4000);
            }
          };
          reader.readAsText(file);
        }}
        onUploadCharacterSheet={() => pcFileInputRef.current?.click()}
        onOpenSessionZeroSetup={() => setSession0Open(true)}
        onArchiveCampaign={handleArchive}
      />

      <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={importJSON} className="hidden" />
      <input
        ref={pcFileInputRef}
        type="file"
        multiple
        accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.json,application/pdf,image/png,image/jpeg,image/webp,image/gif,text/plain,application/json,text/markdown"
        onChange={uploadPcSheet}
        className="hidden"
      />

      {/* Contextual Action Strip (GM Mode Quick Actions, Gemini Studio Bridge, Snapshot Vault & Shared World Status) */}
      {workspaceRole === 'gm' && gmActiveTab !== 'run' && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/60 px-4 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => { if (confirmUnsavedNav()) router.push('/campaign'); }}
              className="flex items-center gap-1 font-sans text-xs font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            >
              <ArrowLeft size={12} /> All Campaigns
            </button>
            {isArchived && (
              <span className="rounded border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] uppercase text-amber-500">
                Archived
              </span>
            )}
            {worldOnlyMode ? (
              <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 font-mono text-[10px] uppercase text-emerald-500">
                Shared World
              </span>
            ) : campaign.worldId ? (
              <button
                onClick={() => router.push(`/world/${campaign.worldId}`)}
                className="flex items-center gap-1 rounded border border-indigo-500/40 bg-indigo-500/10 px-2 py-0.5 font-mono text-[10px] uppercase text-indigo-400 hover:bg-indigo-500/20"
              >
                <Globe size={10} /> World Linked
              </button>
            ) : (
              <button
                type="button"
                onClick={handleConvertToWorld}
                className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2 py-0.5 font-sans text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                Convert to Shared World
              </button>
            )}
            {playMode !== 'solo' && <PlayersManager campaign={campaign} />}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setGeminiBridgeOpen(true)}
              title="Zero-Key Gemini Studio & Recap Bridge (⌘G)"
              className="flex items-center gap-1.5 rounded-md border border-indigo-500/40 bg-indigo-500/10 px-2.5 py-1 font-sans text-xs font-medium text-indigo-400 hover:bg-indigo-500/20"
            >
              <Sparkles size={12} /> Gemini Bridge
              <kbd className="rounded border border-indigo-500/30 px-1 py-px font-mono text-[10px]">⌘G</kbd>
            </button>
            <button
              type="button"
              onClick={() => setSnapshotVaultOpen(true)}
              title="7-Snapshot Rolling Safety Vault"
              className="flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 font-sans text-xs font-medium text-amber-400 hover:bg-amber-500/20"
            >
              🛡️ Snapshot Vault
            </button>
            <button
              type="button"
              onClick={() => {
                setVal('__prepWizardOpen', true);
                setVal('__prepWizardStep', 1);
              }}
              disabled={!!get('__activeSessionId', '')}
              className="flex items-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 font-sans text-xs font-medium text-emerald-500 hover:bg-emerald-500/20 disabled:opacity-40"
            >
              <ClipboardList size={12} /> 8-Step Prep Wizard
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
              className="flex items-center gap-1.5 rounded-md bg-[var(--accent-primary)] px-3 py-1 font-sans text-xs font-semibold text-white shadow-sm hover:opacity-90"
            >
              <Play size={12} /> Run Live Session
            </button>

            <div className="relative" ref={progressMenuRef}>
              <button
                type="button"
                onClick={() => setProgressOpen(!progressOpen)}
                className="flex items-center gap-1.5 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1 font-mono text-[11px] tabular-nums text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <span>{completedCount}/{totalPrepSteps} Prep Done</span>
                <ChevronDown size={11} className={`transition-transform ${progressOpen ? 'rotate-180' : ''}`} />
              </button>
              {progressOpen && (
                <div className="absolute right-0 top-full z-30 mt-2 max-h-[80vh] w-64 overflow-y-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-2 shadow-2xl">
                  <div className="border-b border-[var(--border-subtle)] px-2 py-1.5 font-sans text-xs font-semibold text-[var(--text-primary)]">
                    Uncompleted Prep Steps
                  </div>
                  <div className="space-y-2.5 p-2">
                    {PREP_GROUPS.map(g => {
                      const uncompleted = g.keys.map((k, i) => ({ k, label: g.labels[i] })).filter(x => !done?.[x.k]);
                      if (uncompleted.length === 0) return null;
                      return (
                        <div key={g.name}>
                          <div className="mb-1 font-sans text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-primary)]">
                            {g.name}
                          </div>
                          <ul className="space-y-1">
                            {uncompleted.map(u => (
                              <li key={u.k} className="flex items-start gap-1.5 font-sans text-xs text-[var(--text-muted)]">
                                <span>•</span> <span>{u.label}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MAIN WORKSPACE BODY */}
      <div className="w-full max-w-none">
        {workspaceRole === 'player' ? (
          <div key={`player:${companionTab}`} className="gm-tab-enter w-full max-w-none p-3 sm:p-5">
            <PlayerCompanionWorkspace
              activeTab={companionTab}
              onSelectTab={setCompanionTab}
              pcs={pcs}
              openPcMap={openPcs}
              isPro={isPro}
              uploadingChar={uploadingPc}
              uploadError={pcUploadError}
              onTogglePcOpen={(id) => setOpenPcs(o => ({ ...o, [id]: !o[id] }))}
              onAddPc={addPc}
              onUpdatePc={updatePc}
              onRemovePc={removePc}
              onUploadClick={() => pcFileInputRef.current?.click()}
              get={get}
              setVal={setVal}
            />
          </div>
        ) : gmActiveTab === 'run' ? (
          /* 3-PANE TABLE STAGE FOR GM RUN MODE */
          <div className="w-full max-w-none">
            <div className="space-y-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/80 px-4 py-2">
              {activePauseSignal && (
                <TableSafetyBanner
                  signal={activePauseSignal}
                  onDismiss={() => setActivePauseSignal(null)}
                />
              )}
              <WorldClockBar
                role="gm"
                worldClock={normalizeWorldClockState(state.worldClock)}
                pcs={pcs}
                factionClocksCount={Array.isArray(state.clocks) ? state.clocks.length : 0}
                onChangeWorldClock={(nextClock) => setVal('worldClock', nextClock)}
                onUpdatePcs={writePcs}
                onAwardPartyDowntimeDay={() => {
                  writePcs(
                    pcs.map((pc) => ({
                      ...pc,
                      downtimeDays: (pc.downtimeDays ?? 0) + 1,
                    })),
                  );
                  showUndoToast('Awarded +1 Downtime Day to all party PCs!', 3000);
                }}
                onOpenFactionClocks={() => {
                  setMode('run');
                  setSubview('cockpit');
                }}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <ExternalTablePiP
                  role="gm"
                  campaignName={name}
                  activeTurnLabel={runActiveTurnLabel}
                  round={runInitRaw?.round ?? 1}
                  activePc={pcs[0] ?? null}
                  latestFeedLine={playerLog[0]?.text}
                  onAdvanceTurn={() => {
                    if (
                      runInitRaw &&
                      Array.isArray(runInitRaw.combatants) &&
                      runInitRaw.combatants.length > 0
                    ) {
                      const nextInit = advanceTurn(runInitRaw);
                      setState((s) => ({ ...s, __initiative: nextInit, initiative: nextInit }));
                    }
                  }}
                  onAdjustPcHp={(delta) => {
                    const first = pcs[0];
                    if (!first) return;
                    const maxHpVal = first.maxHp ?? first.hp?.max ?? 10;
                    const curHpVal = first.currentHp ?? first.hp?.current ?? maxHpVal;
                    const nextHp = Math.max(0, Math.min(maxHpVal, curHpVal + delta));
                    writePcs(
                      pcs.map((p, idx) =>
                        idx === 0
                          ? { ...p, currentHp: nextHp, hp: { ...p.hp, current: nextHp } }
                          : p,
                      ),
                    );
                  }}
                  onAdjustPcAc={(delta) => {
                    const first = pcs[0];
                    if (!first) return;
                    const nextAc = Math.max(1, (first.ac || 10) + delta);
                    writePcs(pcs.map((p, idx) => (idx === 0 ? { ...p, ac: nextAc } : p)));
                  }}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <WhisperDrawer
                    role="gm"
                    roster={roster}
                    gmWhispers={runWhispers}
                    pcs={pcs}
                    entities={runEntitiesForWhisper}
                    activePauseSignal={activePauseSignal}
                    onDismissPauseSignal={() => setActivePauseSignal(null)}
                    tableSafetyEnabled={playerConfig.tableSafetyEnabled !== false}
                    onToggleTableSafetyEnabled={(enabled) =>
                      setVal('player', { ...playerConfig, tableSafetyEnabled: enabled })
                    }
                    onGmSendWhisper={(w) => {
                      setVal('whispers', [...runWhispers, w]);
                      showUndoToast('Sent secret whisper to selected player slot(s)', 2500);
                    }}
                  />
                  <HandoutOverlay
                    role="gm"
                    handouts={runHandoutGallery}
                    activeFlash={runActiveHandoutFlash}
                    onFlashHandout={(card) => {
                      const existing = runHandoutGallery.filter((h) => h.id !== card.id);
                      setState((s) => ({
                        ...s,
                        handoutGallery: [card, ...existing],
                        activeHandoutFlashId: card.id,
                      }));
                      showUndoToast(`Flashed "${card.title}" to party screens!`, 3000);
                    }}
                    onClearActiveFlash={() => setVal('activeHandoutFlashId', null)}
                  />
                  <button
                    type="button"
                    onClick={() => setGeminiBridgeOpen(true)}
                    className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-500 hover:bg-amber-500/25"
                    title="Zero-Key Gemini Studio & Recap Bridge (⌘G)"
                  >
                    <Sparkles size={12} /> Gemini Bridge (⌘G)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSnapshotVaultOpen(true)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent-primary)]"
                    title="Preview & Restore Snapshot (7-Snapshot Vault)"
                  >
                    🛡️ Vault
                  </button>
                </div>
              </div>
            </div>
            <TableStageShell
              rightHudTitle="Party HUD & Passive Stats"
              campaignData={state}
              onUpdateCampaignKey={setVal}
              onPostQuickNarration={handlePostQuickNarration}
              centerToolbar={
                <div className="flex flex-wrap items-center gap-1">
                  {(
                    [
                      { id: 'cockpit', label: 'Cockpit' },
                      { id: 'session', label: 'Session Feed' },
                      { id: 'scene', label: 'Scene AI' },
                      { id: 'maps', label: 'Maps' },
                      { id: 'lookup', label: 'Lookup' },
                      { id: 'assistant', label: 'Assistant' },
                    ] as const
                  ).map((sv) => (
                    <button
                      key={sv.id}
                      type="button"
                      onClick={() => {
                        setMode('run');
                        setSubview(sv.id);
                      }}
                      className={`rounded-md px-2.5 py-1 font-sans text-xs font-medium transition-colors ${
                        subview === sv.id
                          ? 'bg-[var(--accent-primary)] text-white shadow-sm'
                          : 'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      {sv.label}
                    </button>
                  ))}
                </div>
              }
              centerStage={<EditorSubviews ed={ed} />}
              rightHudRail={
                <GmPartyHudRail
                  pcs={pcs}
                  onUpdatePcs={writePcs}
                  onAddPc={addPc}
                />
              }
            />
          </div>
        ) : (
          /* 2-PANE MASTER-DETAIL WORKSPACE FOR PREP, WORLD & ROSTER, AND REFERENCE */
          <MasterDetailWorkspace
            ed={ed}
            primaryTab={gmActiveTab}
            prepScale={prepScale}
            onPrepScaleChange={handlePrepScaleChange}
          />
        )}
      </div>

      {/* 1-Click "Preview as Party" Slide-Over Split Pane */}
      <PreviewAsPartyDrawer
        open={previewAsPartyOpen}
        onClose={() => setPreviewAsPartyOpen(false)}
        campaignId={campaign.id}
        campaignName={name}
        data={state}
        config={playerConfig}
        onConfigChange={(next) => setVal('player', next)}
        confirm={confirmModal}
        playerLog={playerLog}
        onPlayerLogChange={(next) => setVal('playerLog', next)}
        onPcsChange={writePcs}
      />

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

      <GeminiBridgeModal
        open={geminiBridgeOpen}
        onClose={() => setGeminiBridgeOpen(false)}
        campaignId={campaign.id}
        campaignName={name}
        campaignData={state}
        prepScale={prepScale}
        role={playMode === 'player' ? 'player' : 'gm'}
        playerState={
          playMode === 'player'
            ? {
                pcName: pcs[0]?.name,
                quests: Array.isArray(state.__playerCompanionQuests)
                  ? state.__playerCompanionQuests
                  : [],
                journal: Array.isArray(state.__playerCompanionJournal)
                  ? state.__playerCompanionJournal
                  : [],
                revealedEntities: runEntitiesForWhisper,
              }
            : undefined
        }
        onApplyCampaignData={(nextData) => {
          setState(nextData);
          showUndoToast('Applied Gemini Studio payload to campaign', 3500);
        }}
      />

      <WorkspaceArchitectModal
        open={workspaceArchitectOpen}
        onClose={() => setWorkspaceArchitectOpen(false)}
        campaignId={campaign.id}
        campaignName={name}
        campaignOwnerUid={campaign.userId}
        campaignData={state}
        role={workspaceRole}
        isCampaignOwner={isCampaignOwner}
        pcs={pcs}
        onApplyCampaignData={(nextData, nextMode) => {
          setState(nextData);
          if (nextMode) setPlayMode(nextMode);
        }}
        onApplyPlayerPcWriteback={(pcId, updates) => {
          const existing = pcs.find((p) => p.id === pcId);
          if (existing) updatePc({ ...existing, ...(updates as any) });
        }}
        onNotify={(msg) => showUndoToast(msg, 3500)}
      />

      {snapshotVaultOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="7-Snapshot Rolling Safety Vault"
        >
          <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-amber-500/40 bg-[var(--bg-elevated)] p-5 text-[var(--text-primary)] shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border-subtle)] pb-3">
              <div>
                <h2 className="font-display text-lg font-bold text-amber-500 dark:text-amber-300">
                  🛡️ 7-Snapshot Rolling Safety Vault
                </h2>
                <p className="text-xs text-[var(--text-muted)]">
                  Automatic rolling ring buffer of the last 7 campaign snapshots (captured before JSON imports, Gemini Bridge applies, batch PC uploads, destructive deletes, and session checkpoints).
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSnapshotVaultOpen(false);
                  setPreviewSnapshotId(null);
                }}
                className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-2.5 py-1 text-xs text-[var(--text-primary)] hover:border-[var(--accent-primary)]"
              >
                ✕ Close
              </button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-[var(--text-muted)]">
                Stored Snapshots: {vaultSnapshots.length} / 7
              </span>
              <button
                type="button"
                onClick={() => {
                  captureVaultSnapshot({
                    campaignId: campaign.id,
                    campaignName: name,
                    reason: 'manual_checkpoint',
                    label: 'Manual Safety Checkpoint',
                    data: state,
                  });
                  setVaultSnapshots(getVaultSnapshotsSync(campaign.id));
                  showUndoToast('Saved manual checkpoint to Snapshot Vault', 3000);
                }}
                className="rounded-lg border border-sky-500/50 bg-sky-500/20 px-3 py-1 text-xs font-semibold text-sky-600 dark:text-sky-200 hover:bg-sky-500/30"
              >
                + Capture Checkpoint Now
              </button>
            </div>

            {vaultSnapshots.length === 0 ? (
              <p className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-xs text-[var(--text-muted)]">
                No automatic snapshots recorded yet for this campaign. Click &ldquo;+ Capture Checkpoint Now&rdquo; or run an import/Gemini apply to populate the ring buffer.
              </p>
            ) : (
              <div className="space-y-2">
                {vaultSnapshots.map((snap) => {
                  const isPreviewing = previewSnapshotId === snap.id;
                  const diff = isPreviewing ? computeSnapshotDiff(state, snap) : null;
                  return (
                    <div
                      key={snap.id}
                      className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3 text-xs space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-bold text-amber-600 dark:text-amber-200">{snap.label}</span>
                          <span className="ml-2 rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-1.5 py-0.5 text-[10px] text-[var(--text-muted)]">
                            {snap.reason}
                          </span>
                          <div className="text-[11px] text-[var(--text-muted)]">
                            {new Date(snap.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewSnapshotId(isPreviewing ? null : snap.id)
                            }
                            className="rounded border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs text-[var(--text-primary)] hover:border-[var(--accent-primary)]"
                          >
                            {isPreviewing ? 'Hide Diff' : '🔍 Preview Diff'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const restored = restoreVaultSnapshot(campaign.id, snap.id);
                              if (restored) {
                                setState(restored.data);
                                setSnapshotVaultOpen(false);
                                setPreviewSnapshotId(null);
                                showUndoToast(`Restored snapshot: ${snap.label}`, 4000);
                              }
                            }}
                            className="rounded border border-emerald-500/50 bg-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-200 hover:bg-emerald-500/30"
                          >
                            ⏪ Restore Snapshot
                          </button>
                        </div>
                      </div>
                      {isPreviewing && diff && (
                        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-canvas)] p-2.5 text-[11px] text-[var(--text-primary)] space-y-1">
                          <div className="font-semibold text-sky-600 dark:text-sky-300">
                            Diff Verification (Current → Snapshot):
                          </div>
                          <div>
                            Changed top-level keys ({diff.changedKeys.length}):{' '}
                            {diff.changedKeys.join(', ') || 'None (identical)'}
                          </div>
                          <div className="flex flex-wrap gap-2 text-[var(--text-muted)]">
                            {Object.entries(diff.entityCounts).map(([k, v]) => (
                              <span key={k} className="rounded border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-1.5 py-0.5">
                                {k}: {v.current} → {v.snapshot}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </main>
    </EntityPeekProvider>
    </CampaignPlayModeContext.Provider>
    </WikiProvider>
  );
}
