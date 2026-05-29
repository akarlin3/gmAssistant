'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { updateCampaign, deleteCampaign as deleteCampaignDoc, archiveCampaign, unarchiveCampaign, copyCampaign, type Campaign } from '@/lib/firebase/campaigns';
import { deleteWorld, type World } from '@/lib/firebase/worlds';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { type ChangeEvent, type ChangeEventKind, makeEvent } from '@/lib/sessionEvents';
import { markOpened, markSessionPlayed } from '@/lib/lastPlayed';
import { todayISO } from '@/lib/sessionLog';
import { type SessionLog, makeLogId, migrateCharactersAndPcs, migrateSessionLogs } from '@/lib/campaign/migrations';
import { useConfirm } from '@/components/ConfirmDialog';
import { initPlayerMode } from '@/lib/playerMode/migration';
import type { PlayerConfig } from '@/lib/playerMode/types';
import type { PlayerLogEntry } from '@/lib/playerMode/sessionLog';
import { normalizePcs } from '@/lib/pc/factory';
import { type PcMacros } from '@/lib/pc/macros';
import { pushSnapshot, type Snapshot } from '@/lib/undoStack';
import { getTarget, OVERRIDES_STATE_KEY, type PrepTargetKey, type PrepTargetOverrides } from '@/lib/prepTargets';
import { hasSeenTour } from '@/lib/tutorials/mode-tours';
import { type Mode, defaultSubview, isValidSubview, resolveInitialMode } from '@/lib/modes';
import { mapPcToLegacyCharacter } from './mapPcToLegacyCharacter';

// Sub-modules
import { type CampaignEditorProps } from './useCampaignEditor/types';
import {
  PREP_GROUPS, SECTION_TO_PHASE, PHASE_TO_VIEW, VIEW_META, PREP_SECTION_META,
} from './useCampaignEditor/constants';
import { buildSaveToDB, buildHandleConvertToWorld, buildSyncIndicator, buildSyncPill } from './useCampaignEditor/useSyncAndSave';
import { useUsedPrep, useGetFilteredPrepArray } from './useCampaignEditor/usePrepHelpers';
import { useWikiValue } from './useCampaignEditor/useWikiValue';
import { usePlayerWriteback } from './useCampaignEditor/usePlayerWriteback';
import { usePaletteItems } from './useCampaignEditor/usePaletteItems';
import { useHandleEndSession } from './useCampaignEditor/useEndSession';
import { useAutoPublish } from './useCampaignEditor/useAutoPublish';
import { useKeyboardShortcuts } from './useCampaignEditor/useKeyboardShortcuts';
import { useNextUp, useJumpToNextUp } from './useCampaignEditor/useNextUp';
import { useSummonSave } from './useCampaignEditor/useSummonSave';
import { useGeneratorLog } from './useCampaignEditor/useGeneratorLog';
import { buildPcManagement } from './useCampaignEditor/usePcManagement';

export type { CampaignEditorProps };
export { PREP_GROUPS, SECTION_TO_PHASE, PHASE_TO_VIEW, VIEW_META, PREP_SECTION_META };

/**
 * All campaign-editor state, derived data, effects and handlers. Returns the
 * full model consumed by `CampaignEditor` and its view components. The JSX
 * lives in the view components; this hook is the single source of behavior.
 */
export function useCampaignEditor(props: CampaignEditorProps) {
  const {
    campaign,
    rawCampaign,
    world,
    userEmail,
    isPro = false,
    worldOnlyMode = false,
    crdtApply,
  } = props;
  const router = useRouter();
  const confirmModal = useConfirm();
  const [name, setName] = useState(campaign.name);
  const [initialMigration] = useState(() => migrateSessionLogs(campaign.data || {}));
  const [state, setState] = useState<Record<string, any>>(() => initPlayerMode(migrateCharactersAndPcs(initialMigration.initialState)).data);
  const pcs = useMemo(() => normalizePcs(state.pcs), [state.pcs]);
  const characters = useMemo(() => pcs.map(mapPcToLegacyCharacter), [pcs]);
  const [done, setDone] = useState<Record<string, boolean>>(campaign.done || {});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [openLogs, setOpenLogs] = useState<Record<string, boolean>>(
    initialMigration.initialOpenId ? { [initialMigration.initialOpenId]: true } : {}
  );
  const [openChars, setOpenChars] = useState<Record<string, boolean>>({});
  const [openPcs, setOpenPcs] = useState<Record<string, boolean>>({});
  const [uploadingPc, setUploadingPc] = useState(false);
  const [pcUploadError, setPcUploadError] = useState<string>('');
  const pcFileInputRef = useRef<HTMLInputElement>(null);
  const [phaseOpen, setPhaseOpen] = useState<Record<string, boolean>>({ p0: true });
  const initialModeState = useMemo(() => resolveInitialMode(initialMigration.initialState), [initialMigration.initialState]);
  const [mode, setMode] = useState<Mode>(initialModeState.mode);
  const [subview, setSubview] = useState<string>(initialModeState.subview);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // Persist mode + subview so users return to wherever they left. Skip the
  // undo snapshot for these — switching tabs shouldn't compete with Cmd+Z.
  useEffect(() => {
    setState(s => {
      if (s.__mode === mode && s.__subview === subview) return s;
      skipNextSnapshotRef.current = true;
      return { ...s, __mode: mode, __subview: subview };
    });
    window.scrollTo(0, 0);
  }, [mode, subview]);
  const [playMode, setPlayMode] = useState<'solo' | 'duet' | 'standard'>(() => {
    return campaign.data?.mode ?? (campaign.data?.__soloMode === true ? 'duet' : 'standard');
  });
  const roster = state.player?.roster || [];
  const soloMode = playMode === 'solo' || playMode === 'duet';
  const [modeSwitcherOpen, setModeSwitcherOpen] = useState(false);
  const [oracleOpen, setOracleOpen] = useState(false);
  const [activeTourMode, setActiveTourMode] = useState<'solo' | 'duet' | null>(null);

  useEffect(() => {
    if (campaign.data && !campaign.data.modeMigratedAt) {
      const wasSolo = campaign.data.__soloMode === true || campaign.data.soloMode === true || campaign.data.solo === true;
      const modeVal = wasSolo ? 'duet' : 'standard';
      const runMigration = async () => {
        try {
          const nextData = { ...state, mode: modeVal, modeMigratedAt: Date.now(), legacySoloMode: wasSolo };
          await updateCampaign(campaign.id, { data: nextData });
          setState(nextData);
          setPlayMode(modeVal);
        } catch (err) {
          console.error('Client-side campaign play mode migration failed:', err);
        }
      };
      runMigration();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.id, campaign.data]);

  const [progressOpen, setProgressOpen] = useState(false);
  const progressMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!progressOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!progressMenuRef.current?.contains(e.target as Node)) setProgressOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setProgressOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [progressOpen]);

  const [prepTargetsOpen, setPrepTargetsOpen] = useState(false);
  const [syncState, setSyncState] = useState<'synced' | 'pending' | 'saving' | 'error'>('synced');
  const [syncError, setSyncError] = useState<string>('');
  const [uploadingChar, setUploadingChar] = useState(false);
  const [charUploadError, setCharUploadError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const characterFileInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialLoadRef = useRef(true);
  const lastCrdtSnapshotRef = useRef<string>('');
  const undoStackRef = useRef<Snapshot[]>([]);
  const previousSnapRef = useRef<Snapshot | null>(null);
  const skipNextSnapshotRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [undoToast, setUndoToast] = useState('');
  const [session0Open, setSession0Open] = useState<boolean>(() => {
    if (campaign.data?.__session0Done) return false;
    const d = campaign.data || {};
    return !d.pitch && (!Array.isArray(d.gWorld) || d.gWorld.length === 0) && (!Array.isArray(d.clocks) || d.clocks.length === 0);
  });
  const undoToastTimerRef = useRef<NodeJS.Timeout | null>(null);
  const showUndoToast = useCallback((msg: string, ms = 2000) => {
    if (undoToastTimerRef.current) clearTimeout(undoToastTimerRef.current);
    setUndoToast(msg);
    undoToastTimerRef.current = setTimeout(() => setUndoToast(''), ms);
  }, []);

  const [highlightEntityId, setHighlightEntityId] = useState<string | null>(null);
  const highlightTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [sessionPlaylistAnchor, setSessionPlaylistAnchor] = useState<
    { positionSec: number; anchorWallTimeMs: number; playlistIndex: number } | null
  >(null);

  const scrollToEntity = useCallback((entityId: string) => {
    setTimeout(() => {
      const el = document.getElementById(`entity-${entityId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  }, []);

  const flashHighlight = useCallback((entityId: string) => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightEntityId(entityId);
    highlightTimerRef.current = setTimeout(() => setHighlightEntityId(null), 1500);
  }, []);

  const {
    summonState, setSummonState, summonToast, setSummonToast, summonToastTimerRef,
    handlePostSummonSave, onSummonSave,
  } = useSummonSave(setState, scrollToEntity, flashHighlight);

  // ── Save to DB ──────────────────────────────────────────────────────────
  const saveToDB = useCallback(
    buildSaveToDB({ campaign, world, crdtApply, lastCrdtSnapshotRef, setSyncState, setSyncError }),
    [campaign.id, campaign.worldId, world, crdtApply], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleConvertToWorld = buildHandleConvertToWorld({ campaign, state, setState, setSyncState, setSyncError, confirmModal });

  // ── Undo / auto-save ────────────────────────────────────────────────────
  useEffect(() => {
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      previousSnapRef.current = { state, done, name, ts: Date.now() };
      return;
    }
    if (!skipNextSnapshotRef.current && previousSnapRef.current) {
      undoStackRef.current = pushSnapshot(undoStackRef.current, previousSnapRef.current);
      setCanUndo(undoStackRef.current.length > 0);
    }
    skipNextSnapshotRef.current = false;
    previousSnapRef.current = { state, done, name, ts: Date.now() };
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSyncState('pending');
    saveTimeoutRef.current = setTimeout(() => { saveToDB({ name, data: { ...state, mode: playMode, __soloMode: soloMode }, done }); }, 1500);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [name, state, done, playMode, soloMode, saveToDB]);

  // ── Remote-merge from CRDT layer ────────────────────────────────────────
  useEffect(() => {
    if (!crdtApply) return;
    if (!campaign.data) return;
    if (syncState === 'pending' || syncState === 'saving') return;
    const { mode: _m, __soloMode: _s, ...incoming } = campaign.data as Record<string, any>;
    const incomingStr = JSON.stringify(incoming);
    if (incomingStr === lastCrdtSnapshotRef.current) return;
    lastCrdtSnapshotRef.current = incomingStr;
    skipNextSnapshotRef.current = true;
    setState((prev) => ({ ...prev, ...incoming }));
  }, [campaign.data, crdtApply, syncState]);

  // ── Mark opened once ────────────────────────────────────────────────────
  const openedMarkedRef = useRef(false);
  useEffect(() => {
    if (openedMarkedRef.current) return;
    openedMarkedRef.current = true;
    skipNextSnapshotRef.current = true;
    setState(s => markOpened(s));
  }, []);

  const get = useCallback((k: string, fb: any) => state[k] !== undefined ? state[k] : fb, [state]);
  const setVal = (k: string, v: any) => setState(s => ({ ...s, [k]: v }));

  const tourUid = useMemo(
    () => getFirebaseAuth().currentUser?.uid ?? campaign.userId ?? null,
    [campaign.userId],
  );

  useEffect(() => {
    if (playMode === 'solo' || playMode === 'duet') {
      const uid = tourUid || 'default';
      setActiveTourMode(!hasSeenTour(uid, playMode) ? playMode : null);
    } else {
      setActiveTourMode(null);
    }
  }, [playMode, tourUid]);

  // ── Player config + auto-publish ────────────────────────────────────────
  const playerConfig = useMemo(() => (get('player', {}) as PlayerConfig) || {}, [get]);
  const playerLog = useMemo(() => (get('playerLog', []) as PlayerLogEntry[]) || [], [get]);
  const { contentSignature, musicSignature, prevContentSignatureRef, prevMusicSignatureRef } = useAutoPublish(
    campaign.id, name, playerConfig, playerLog, get, sessionPlaylistAnchor,
  );

  // ── Prep helpers ────────────────────────────────────────────────────────
  const usedPrep = useUsedPrep(state);
  const getFilteredPrepArray = useGetFilteredPrepArray(usedPrep);
  const prepTargetOverrides = useMemo(() => (state[OVERRIDES_STATE_KEY] as PrepTargetOverrides | undefined) || {}, [state]);
  const tgt = useCallback(
    (key: PrepTargetKey) => getTarget(key, soloMode, prepTargetOverrides),
    [soloMode, prepTargetOverrides],
  );

  const trackEvent = useCallback((kind: ChangeEventKind, summary: string, before?: unknown, after?: unknown) => {
    setState(s => {
      if (!s.__activeSessionId) return s;
      const events = (s.__sessionChangeEvents as ChangeEvent[]) || [];
      return { ...s, __sessionChangeEvents: [...events, makeEvent(kind, summary, before, after)] };
    });
  }, []);

  const handleEndSession = useHandleEndSession(
    state, get, name, playMode, soloMode, done, saveToDB, campaign.id, router, characters, saveTimeoutRef, setState,
  );

  const toggleDone = (id: string) => setDone(d => ({ ...d, [id]: !d[id] }));
  const toggleOpen = (id: string) => setOpen(o => ({ ...o, [id]: !o[id] }));
  const togglePhase = (id: string) => setPhaseOpen(p => ({ ...p, [id]: !p[id] }));

  const { generatorLogs, logEntriesFor, setLogEntriesFor, addToCampaignFor, generatorDisabledDests } =
    useGeneratorLog(state, setVal, trackEvent);

  const parsedLevels = pcs.map(p => p.level).filter((lvl): lvl is number => typeof lvl === 'number' && lvl > 0);
  const partyLevel = parsedLevels.length > 0
    ? Math.round(parsedLevels.reduce((a, b) => a + b, 0) / parsedLevels.length)
    : undefined;

  const generatorCampaignContext = {
    genre: typeof state.genre === 'string' ? state.genre : '',
    tone: Array.isArray(state.tone) ? (state.tone as string[]) : [],
    pitch: typeof state.pitch === 'string' ? state.pitch : '',
    worldFacts: Array.isArray(state.gWorld) ? (state.gWorld as string[]) : [],
    settingFacts: Array.isArray(state.facts) ? (state.facts as string[]) : [],
    partyLevel,
  };

  const totalPrepSteps = PREP_GROUPS.reduce((acc, g) => acc + g.keys.length, 0);
  const completedCount = PREP_GROUPS.reduce((acc, g) => acc + g.keys.filter(k => done?.[k]).length, 0);

  const nextUp = useNextUp(state, soloMode, prepTargetOverrides, getFilteredPrepArray);
  const jumpToNextUp = useJumpToNextUp(nextUp, setMode, setSubview, setPhaseOpen, setOpen);

  const sessionLogs = (get('sessionLogs', []) as any[]);
  const sortedSessionLogs = [...sessionLogs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const sessionLogsV2 = (get('sessionLogV2', []) as any[]);
  const addSessionLog = () => {
    const id = makeLogId();
    const next: SessionLog = { id, title: `Session ${sessionLogs.length + 1}`, date: todayISO(), body: '' };
    setVal('sessionLogs', [next, ...sessionLogs]);
    setOpenLogs(o => ({ ...o, [id]: true }));
  };
  const updateSessionLog = (id: string, patch: Partial<SessionLog>) => {
    setVal('sessionLogs', sessionLogs.map(l => l.id === id ? { ...l, ...patch } : l));
  };
  const removeSessionLog = (id: string) => {
    const log = sessionLogs.find(l => l.id === id);
    setVal('sessionLogs', sessionLogs.filter(l => l.id !== id));
    setOpenLogs(o => { const next = { ...o }; delete next[id]; return next; });
    showUndoToast(`Deleted "${log?.title || 'session log'}" — Press ⌘Z to undo`, 5000);
  };

  // ── PCs ─────────────────────────────────────────────────────────────────
  const pcMacros = (state.pcMacros as PcMacros) || {};
  const {
    writePcs, addPc, updatePc, removePc,
    addCharacter, updateCharacter, removeCharacter,
    uploadCharacterSheet, uploadPcSheet,
  } = buildPcManagement(
    pcs, characters, pcMacros, setState, setOpenPcs, setOpenChars,
    setCharUploadError, setUploadingChar, setPcUploadError, setUploadingPc, showUndoToast, setVal,
  );
  const pcsRef = usePlayerWriteback(campaign.id, campaign.userId, playMode, worldOnlyMode, pcs, writePcs);

  // ── Export / Import ─────────────────────────────────────────────────────
  const exportJSON = () => {
    const safe = (name || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const payload = { _format: 'campaign_prep_v1', _exported: new Date().toISOString(), campaignName: name, state, done };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${safe || 'campaign'}_prep.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showUndoToast('Campaign exported as JSON', 4000);
  };

  const importJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data._format !== 'campaign_prep_v1') { showUndoToast('Import failed: unsupported file format', 4000); return; }
        if (data.campaignName) setName(data.campaignName);
        setState(data.state || {});
        setDone(data.done || {});
        showUndoToast('Campaign imported successfully', 4000);
      } catch { showUndoToast('Import failed: invalid JSON file', 4000); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ── Campaign actions ────────────────────────────────────────────────────
  const handleDelete = async () => {
    const ok = await confirmModal({ title: 'Delete Campaign', message: `Delete "${name}"? This cannot be undone.`, confirmText: 'Delete', isDestructive: true });
    if (!ok) return;
    try {
      if (campaign.worldId) await deleteWorld(campaign.worldId);
      await deleteCampaignDoc(campaign.id);
      router.push('/campaign');
    } catch (err: any) { alert(`Delete failed: ${err?.message || err}`); }
  };

  const isArchived = Boolean(campaign.archivedAt);
  const handleArchive = async () => {
    try {
      if (isArchived) {
        await unarchiveCampaign(campaign.id);
      } else {
        const ok = await confirmModal({ title: 'Archive Campaign', message: `Archive "${name}"? It will be hidden from your main list — you can restore it from the Archived section.`, confirmText: 'Archive', isDestructive: true });
        if (!ok) return;
        await archiveCampaign(campaign.id);
        router.push('/campaign');
      }
    } catch (err: any) { alert(`${isArchived ? 'Unarchive' : 'Archive'} failed: ${err?.message || err}`); }
  };

  const handleCopy = async () => {
    if (!confirm(`Create a copy of "${name}"?`)) return;
    try {
      const newId = await copyCampaign(campaign.id);
      router.push(`/campaign/${newId}`);
    } catch (err: any) { alert(`Copy failed: ${err?.message || err}`); }
  };

  // ── Sync UI components ──────────────────────────────────────────────────
  const SyncIndicator = buildSyncIndicator(syncState, syncError);

  const retrySave = useCallback(() => {
    if (saveTimeoutRef.current) { clearTimeout(saveTimeoutRef.current); saveTimeoutRef.current = null; }
    saveToDB({ name, data: { ...state, mode: playMode, __soloMode: soloMode }, done });
  }, [saveToDB, name, state, playMode, soloMode, done]);

  const SyncPill = buildSyncPill(syncState, syncError, retrySave, get);

  const ToolBtn = ({ onClick, children, danger = false, title }: { onClick: () => void; children: React.ReactNode; danger?: boolean; title?: string }) => (
    <button onClick={onClick} title={title} className={`flex items-center gap-1.5 rounded border px-3 py-1 font-display text-xs uppercase tracking-wider transition-colors ${
      danger ? 'border-crimson/50 text-crimson hover:bg-crimson hover:text-parchment' : 'border-brass-deep/50 text-brass-deep hover:border-brass hover:bg-brass hover:text-parchment'
    }`}>{children}</button>
  );

  const confirmUnsavedNav = useCallback((): boolean => {
    if (syncState !== 'error') return true;
    return window.confirm('Your last change failed to save. Switching may lose unsaved data. Switch anyway?');
  }, [syncState]);

  // ── Navigation ──────────────────────────────────────────────────────────
  const scrollToAnchor = (anchor: string) => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-cp-anchor="${anchor}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('cp-highlight');
      setTimeout(() => el.classList.remove('cp-highlight'), 1600);
    }));
  };

  const navigateTo = (target: { mode: Mode; subview?: string; sectionId?: string; sessionId?: string; characterId?: string; anchor?: string }) => {
    const nextSubview = target.subview && isValidSubview(target.mode, target.subview) ? target.subview : defaultSubview(target.mode);
    setMode(target.mode);
    setSubview(nextSubview);
    if (target.sectionId) {
      const phase = SECTION_TO_PHASE[target.sectionId];
      if (phase) setPhaseOpen(p => ({ ...p, [phase]: true }));
      setOpen(o => ({ ...o, [target.sectionId!]: true }));
    }
    if (target.sessionId) setOpenLogs(o => ({ ...o, [target.sessionId!]: true }));
    if (target.characterId) setOpenChars(o => ({ ...o, [target.characterId!]: true }));
    if (target.anchor) scrollToAnchor(target.anchor);
  };

  const viewForSection = (sectionId: string): { mode: Mode; subview: string } => {
    const phase = SECTION_TO_PHASE[sectionId];
    return PHASE_TO_VIEW[phase] ?? { mode: 'prep', subview: 'flow' };
  };

  const handleModeChange = (m: Mode) => {
    if (!confirmUnsavedNav()) return;
    if (m === mode) return;
    setMode(m);
    setSubview(defaultSubview(m));
  };

  const handleSubviewChange = (sv: string) => {
    if (!confirmUnsavedNav()) return;
    if (sv === subview) return;
    if (isValidSubview(mode, sv)) setSubview(sv);
  };

  // ── Wiki ─────────────────────────────────────────────────────────────────
  const { wikiIndex, wikiRelationships, wikiValue, navigateToEntity, rescanForSuggestions } = useWikiValue(state, setState, navigateTo, scrollToAnchor);

  // ── Keyboard shortcuts ───────────────────────────────────────────────────
  useKeyboardShortcuts(
    paletteOpen, shortcutsOpen, syncState, syncError, mode, subview,
    confirmUnsavedNav, showUndoToast, undoStackRef, skipNextSnapshotRef,
    setState, setDone, setName, setCanUndo, setPaletteOpen, setShortcutsOpen, setMode, setSubview,
  );

  // ── Command palette ──────────────────────────────────────────────────────
  const paletteItems = usePaletteItems(
    state, soloMode, sortedSessionLogs, pcs, generatorLogs,
    navigateTo, get, addPc, addSessionLog, exportJSON, fileInputRef,
    setModeSwitcherOpen, setPrepTargetsOpen, setPhaseOpen,
  );

  // ── Prep wizard helpers ──────────────────────────────────────────────────
  const closePrepWizard = () => {
    setState(s => {
      const next = { ...s };
      delete next.__prepWizardOpen; delete next.__prepWizardStep;
      delete next.__prepWizardCompleted; delete next.__prepWizardStepNotes;
      return next;
    });
  };

  const startSessionFromPrep = () => {
    if (nextUp) {
      if (!window.confirm(`You have unfinished prep targets (e.g. ${nextUp.label}). Are you sure you want to start the session anyway?`)) return;
    }
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setState(s => {
      const next = { ...s };
      delete next.__prepWizardOpen; delete next.__prepWizardStep;
      delete next.__prepWizardCompleted; delete next.__prepWizardStepNotes;
      next.__activeSessionId = sessionId;
      next.__sessionStartedAt = Date.now();
      next.__sessionChangeEvents = [];
      next.__sessionUsedScenes = [];
      next.__runSessionOpen = true;
      next.__livingWorldPromptDismissed = false;
      return markSessionPlayed(next);
    });
  };

  return {
    PHASE_TO_VIEW,
    PREP_GROUPS,
    PREP_SECTION_META,
    SECTION_TO_PHASE,
    SyncIndicator,
    SyncPill,
    ToolBtn,
    VIEW_META,
    activeTourMode,
    addCharacter,
    addPc,
    addSessionLog,
    addToCampaignFor,
    campaign,
    canUndo,
    charUploadError,
    characterFileInputRef,
    characters,
    closePrepWizard,
    completedCount,
    confirmModal,
    confirmUnsavedNav,
    contentSignature,
    done,
    exportJSON,
    fileInputRef,
    flashHighlight,
    generatorCampaignContext,
    generatorDisabledDests,
    generatorLogs,
    get,
    getFilteredPrepArray,
    handleArchive,
    handleConvertToWorld,
    handleCopy,
    handleDelete,
    handleEndSession,
    handleModeChange,
    handlePostSummonSave,
    handleSubviewChange,
    highlightEntityId,
    highlightTimerRef,
    importJSON,
    initialLoadRef,
    initialMigration,
    initialModeState,
    isArchived,
    isPro,
    jumpToNextUp,
    lastCrdtSnapshotRef,
    logEntriesFor,
    mode,
    modeSwitcherOpen,
    musicSignature,
    name,
    navigateTo,
    navigateToEntity,
    nextUp,
    onSummonSave,
    open,
    openChars,
    openLogs,
    openPcs,
    openedMarkedRef,
    oracleOpen,
    paletteItems,
    paletteOpen,
    parsedLevels,
    partyLevel,
    pcFileInputRef,
    pcMacros,
    pcUploadError,
    pcs,
    pcsRef,
    phaseOpen,
    playMode,
    playerConfig,
    playerLog,
    prepTargetOverrides,
    prepTargetsOpen,
    prevContentSignatureRef,
    prevMusicSignatureRef,
    previousSnapRef,
    progressMenuRef,
    progressOpen,
    removeCharacter,
    removePc,
    removeSessionLog,
    rescanForSuggestions,
    retrySave,
    roster,
    router,
    saveTimeoutRef,
    saveToDB,
    scrollToAnchor,
    scrollToEntity,
    session0Open,
    sessionLogs,
    sessionLogsV2,
    sessionPlaylistAnchor,
    setActiveTourMode,
    setCanUndo,
    setCharUploadError,
    setDone,
    setHighlightEntityId,
    setLogEntriesFor,
    setMode,
    setModeSwitcherOpen,
    setName,
    setOpen,
    setOpenChars,
    setOpenLogs,
    setOpenPcs,
    setOracleOpen,
    setPaletteOpen,
    setPcUploadError,
    setPhaseOpen,
    setPlayMode,
    setPrepTargetsOpen,
    setProgressOpen,
    setSession0Open,
    setSessionPlaylistAnchor,
    setShortcutsOpen,
    setState,
    setSubview,
    setSummonState,
    setSummonToast,
    setSyncError,
    setSyncState,
    setUndoToast,
    setUploadingChar,
    setUploadingPc,
    setVal,
    shortcutsOpen,
    showUndoToast,
    skipNextSnapshotRef,
    soloMode,
    sortedSessionLogs,
    startSessionFromPrep,
    state,
    subview,
    summonState,
    summonToast,
    summonToastTimerRef,
    syncError,
    syncState,
    tgt,
    toggleDone,
    toggleOpen,
    togglePhase,
    totalPrepSteps,
    tourUid,
    trackEvent,
    undoStackRef,
    undoToast,
    undoToastTimerRef,
    updateCharacter,
    updatePc,
    updateSessionLog,
    uploadCharacterSheet,
    uploadPcSheet,
    uploadingChar,
    uploadingPc,
    usedPrep,
    userEmail,
    viewForSection,
    wikiIndex,
    wikiRelationships,
    wikiValue,
    world,
    worldOnlyMode,
    writePcs,
  };
}

export type CampaignEditorModel = ReturnType<typeof useCampaignEditor>;
