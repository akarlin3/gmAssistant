'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { updateCampaign, deleteCampaign as deleteCampaignDoc, archiveCampaign, unarchiveCampaign, copyCampaign, type Campaign } from '@/lib/firebase/campaigns';
import { startWritebackReconciler } from '@/lib/player/reconciler';
import { updateWorld, createWorld, deleteWorld, type World } from '@/lib/firebase/worlds';
import { WORLD_KEYS } from '@/lib/worldData';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { Plus, X, User, Users, Map, Swords, Gift, Layers, Calendar, Target, Trophy, Clock, Download, Upload, ScrollText, ArrowLeft, ArrowRight, Cloud, CloudOff, Sparkles, Search, BookOpen, Dice5, Wand2, Skull, Footprints, Hash, ClipboardList, Wrench, SlidersHorizontal, Copy, Compass, Bot } from 'lucide-react';
import { pickPrimaryRef, setLastUsed, type GeneratorMeta, type PrepSection } from '@/lib/generators/sectionMap';
import type { EntityRef } from '@/lib/generators/types';
import { applySummonAction, type SummonSaveAction } from '@/lib/generators/summon-actions';
import type { Chase } from '@/lib/chaseTables';
import type { Trap } from '@/lib/trapTables';
import { type ChangeEvent, type ChangeEventKind, makeEvent } from '@/lib/sessionEvents';
import { markOpened, markSessionPlayed } from '@/lib/lastPlayed';
import { todayISO } from '@/lib/sessionLog';
import { type SessionLog, makeLogId, migrateCharactersAndPcs, migrateSessionLogs } from '@/lib/campaign/migrations';
import { recalculatePartyState, parseMonsterName } from '@/lib/sessionLog';
import type { GeneratorLogs, LogEntry, LogKind } from '@/lib/generators/log';
import { buildPatch as buildCampaignPatch, type CampaignDestKey, type SelectableItem } from '@/lib/generators/addToCampaign';
import { AccountMenu } from '../AccountMenu';
import { useConfirm } from '@/components/ConfirmDialog';
import { publishProjections } from '@/lib/playerMode/publish';
import { initPlayerMode } from '@/lib/playerMode/migration';
import type { PlayerConfig } from '@/lib/playerMode/types';
import type { PlayerLogEntry } from '@/lib/playerMode/sessionLog';
import { type CommandItem } from '../CommandPalette';
import { type Character, makeCharacterId, normalizeCharacter } from '@/lib/character-schema';
import { type PlayerCharacter, PC_CAP } from '@/lib/pc/types';
import { emptyPc, normalizePcs, capPcs } from '@/lib/pc/factory';
import { syncAttackMacros, dropPcMacros, type PcMacros } from '@/lib/pc/macros';
import { mapParsedToPc } from '@/lib/pc/from-parser';
import { pushSnapshot, popSnapshot, type Snapshot } from '@/lib/undoStack';
import { TARGETS, getTarget, countFilled, SECTION_ID_BY_KEY, PHASE_ID_BY_KEY, OVERRIDES_STATE_KEY, type PrepTargetKey, type PrepTargetOverrides } from '@/lib/prepTargets';
import { hasSeenTour } from '@/lib/tutorials/mode-tours';
import { type Mode, MODES, ALL_SUBVIEWS, defaultSubview, isValidSubview, resolveInitialMode } from '@/lib/modes';
import { type WikiContextValue } from '../wiki/WikiContext';
import { buildEntityIndex, findEntity } from '@/lib/wiki/entities';
import { createRelationship, addRelationship as addRelToList, removeRelationship as removeRelFromList, acceptSuggestion as acceptSugInList, rejectSuggestion as rejectSugFromList } from '@/lib/wiki/relationships';
import { scanTextForSuggestions, pruneExpiredSuggestions } from '@/lib/wiki/suggest';
import type { EntityType as WikiEntityType, Relationship as WikiRelationship } from '@/lib/wiki/types';
import type { DowntimeEntry } from './prepTypes';
import { DOWNTIME_TYPES } from './cards';
import { mapPcToLegacyCharacter } from './mapPcToLegacyCharacter';
import { Phase } from './phase';

export type CampaignEditorProps = {
  campaign: Campaign;
  rawCampaign?: Campaign;
  world?: World | null;
  userEmail: string;
  isPro?: boolean;
  worldOnlyMode?: boolean;
  /** When provided, campaign.data writes are routed through the Yjs CRDT
   * layer rather than directly to the Firestore doc. Provided by
   * `useCampaignAndWorld` on the main campaign detail page. */
  crdtApply?: (next: Record<string, any>) => void;
};

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
          const nextData = {
            ...state,
            mode: modeVal,
            modeMigratedAt: Date.now(),
            legacySoloMode: wasSolo,
          };
          await updateCampaign(campaign.id, { data: nextData });
          setState(nextData);
          setPlayMode(modeVal);
          console.log('Client-side campaign play mode migration succeeded');
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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setProgressOpen(false);
    };
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
  // Tracks the most recent JSON snapshot we either sent to the CRDT layer or
  // received from it. Used by the remote-merge effect to detect changes that
  // didn't originate locally.
  const lastCrdtSnapshotRef = useRef<string>('');

  const undoStackRef = useRef<Snapshot[]>([]);
  const previousSnapRef = useRef<Snapshot | null>(null);
  const skipNextSnapshotRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [undoToast, setUndoToast] = useState('');

  // Session 0 wizard — auto-shown on first open of a fresh campaign, also
  // launchable from AccountMenu's Campaign Actions. Tracked via
  // data.__session0Done so it never re-prompts unless the user explicitly
  // re-runs it.
  const [session0Open, setSession0Open] = useState<boolean>(() => {
    if (campaign.data?.__session0Done) return false;
    const d = campaign.data || {};
    const noPitch = !d.pitch;
    const noWorld = !Array.isArray(d.gWorld) || d.gWorld.length === 0;
    const noClocks = !Array.isArray(d.clocks) || d.clocks.length === 0;
    return noPitch && noWorld && noClocks;
  });
  const undoToastTimerRef = useRef<NodeJS.Timeout | null>(null);
  const showUndoToast = useCallback((msg: string, ms = 2000) => {
    if (undoToastTimerRef.current) clearTimeout(undoToastTimerRef.current);
    setUndoToast(msg);
    undoToastTimerRef.current = setTimeout(() => setUndoToast(''), ms);
  }, []);

  // Summon affordance — opens a modal hosting the chosen generator in the
  // context of a prep section. After Save, the new entity is appended to
  // `data` and the section auto-scrolls + highlights it (Phase 2 / Phase 3).
  const [summonState, setSummonState] = useState<{
    section: PrepSection;
    generator: GeneratorMeta;
  } | null>(null);
  const [highlightEntityId, setHighlightEntityId] = useState<string | null>(null);
  const highlightTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [summonToast, setSummonToast] = useState<{
    text: string;
    primaryEntityId: string;
  } | null>(null);
  const summonToastTimerRef = useRef<NodeJS.Timeout | null>(null);

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

  const handlePostSummonSave = useCallback(
    (section: PrepSection, generator: GeneratorMeta, refs: EntityRef[]) => {
      const primary = pickPrimaryRef(refs, generator.kind);
      if (!primary) return;
      scrollToEntity(primary.entityId);
      flashHighlight(primary.entityId);
      // Count by entityKey (not entityType) so we can say "1 Monster, 1
      // Bestiary Entry" instead of "2 Notes". Order is the display order in
      // the toast.
      const counts = refs.reduce<Record<string, number>>((acc, r) => {
        acc[r.entityKey] = (acc[r.entityKey] || 0) + 1;
        return acc;
      }, {});
      const order: Array<[string, string, string]> = [
        ['locations', 'Location', 'Locations'],
        ['npcs', 'NPC', 'NPCs'],
        ['items', 'Item', 'Items'],
        ['monsters', 'Monster', 'Monsters'],
        ['homebrewMonsters', 'Bestiary Entry', 'Bestiary Entries'],
      ];
      const parts: string[] = [];
      for (const [key, sing, plur] of order) {
        const n = counts[key];
        if (n) parts.push(`${n} ${n === 1 ? sing : plur}`);
      }
      const text = parts.length ? `Saved: ${parts.join(', ')}` : 'Saved';
      if (summonToastTimerRef.current) clearTimeout(summonToastTimerRef.current);
      setSummonToast({ text, primaryEntityId: primary.entityId });
      summonToastTimerRef.current = setTimeout(() => setSummonToast(null), 3000);
    },
    [scrollToEntity, flashHighlight],
  );

  const onSummonSave = useCallback(
    (section: PrepSection, generator: GeneratorMeta, action: SummonSaveAction) => {
      let savedRefs: EntityRef[] = [];
      setState((s) => {
        const { next, refs } = applySummonAction(s, action);
        savedRefs = refs;
        return setLastUsed(next, section, generator.kind) as typeof s;
      });
      // Defer post-save UI so the new entity is in the DOM before scrolling.
      requestAnimationFrame(() => handlePostSummonSave(section, generator, savedRefs));
    },
    [handlePostSummonSave],
  );

  const saveToDB = useCallback(async (payload: { name: string; data: Record<string, any>; done: Record<string, boolean> }) => {
    setSyncState('saving');
    try {
      const worldPatch: Record<string, any> = {};
      const campaignPatch: Record<string, any> = {};

      for (const [k, v] of Object.entries(payload.data)) {
        if (WORLD_KEYS.includes(k as any) && campaign.worldId) {
          const existingVal = world?.data?.[k];
          if (JSON.stringify(v) !== JSON.stringify(existingVal)) {
            worldPatch[k] = v;
          }
        } else {
          campaignPatch[k] = v;
        }
      }

      const promises = [];
      if (crdtApply) {
        // Route campaign content through the Y.Doc — it owns local IndexedDB
        // persistence and the Firestore binary update log. Metadata fields
        // (name, done, worldId) still ride on the root Firestore doc since
        // they're orthogonal to multi-device-mergeable content and existing
        // Firestore rules already gate them.
        crdtApply(campaignPatch);
        lastCrdtSnapshotRef.current = JSON.stringify(campaignPatch);
        promises.push(updateCampaign(campaign.id, { name: payload.name, done: payload.done }));
      } else {
        promises.push(updateCampaign(campaign.id, { name: payload.name, data: campaignPatch, done: payload.done }));
      }

      if (campaign.worldId && Object.keys(worldPatch).length > 0) {
        promises.push(updateWorld(campaign.worldId, { data: worldPatch }));
      }

      await Promise.all(promises);

      setSyncState('synced');
      setSyncError('');
    } catch (err: any) {
      console.error("Auto-save failed:", err);
      setSyncState('error');
      setSyncError(err?.message || 'Unknown error');
    }
  }, [campaign.id, campaign.worldId, world, crdtApply]);

  const handleConvertToWorld = async () => {
    if (campaign.worldId) return;
    const ok = await confirmModal({
      title: 'Convert to Shared World?',
      message: 'This moves all static lore (NPCs, locations, items, factions, etc.) into a central World that other campaigns can share. This cannot be undone.',
      confirmText: 'Convert to World',
    });
    if (!ok) return;

    try {
      setSyncState('saving');
      const worldData: Record<string, any> = {};
      const newCampaignData = { ...state };
      for (const key of WORLD_KEYS) {
        if (newCampaignData[key] !== undefined) {
          worldData[key] = newCampaignData[key];
          delete newCampaignData[key];
        }
      }
      const newWorldId = await createWorld(campaign.userId, `${campaign.name} (World)`, worldData);
      await updateCampaign(campaign.id, { worldId: newWorldId, data: newCampaignData });
      setSyncState('synced');
    } catch (err: any) {
      console.error("Convert to shared world failed:", err);
      setSyncError(err.message);
      setSyncState('error');
    }
  };

  useEffect(() => {
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      previousSnapRef.current = { state, done, name, ts: Date.now() };
      return;
    }
    // Push the previous state as the snapshot the user would undo *to* —
    // unless this change is itself an undo (we don't want to re-snapshot
    // what we just restored).
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

  // Remote-merge: when the CRDT layer surfaces a different `campaign.data`
  // than the snapshot we last sent (because a peer device's edits arrived
  // and merged), splice the merged content into local state. We skip remote
  // updates while a local save is pending so we don't clobber in-flight
  // edits — Yjs has already merged both sides when it reaches this point,
  // so on the next save cycle the local state lands cleanly on top.
  useEffect(() => {
    if (!crdtApply) return;
    if (!campaign.data) return;
    if (syncState === 'pending' || syncState === 'saving') return;
    // Project the incoming snapshot through the same filter the save loop
    // uses (drop transient mode keys) before comparing to lastCrdtSnapshotRef.
    const { mode: _m, __soloMode: _s, ...incoming } = campaign.data as Record<string, any>;
    const incomingStr = JSON.stringify(incoming);
    if (incomingStr === lastCrdtSnapshotRef.current) return;
    lastCrdtSnapshotRef.current = incomingStr;
    skipNextSnapshotRef.current = true; // don't push remote merges onto undo stack
    setState((prev) => ({ ...prev, ...incoming }));
  }, [campaign.data, crdtApply, syncState]);

  // B-06: record "last opened" exactly once per mount. This is distinct from
  // "last played" (which only moves on session start/end), so viewing a
  // campaign no longer bumps its "Last played" timestamp. Skip the undo
  // snapshot so this bookkeeping write never lands on the Cmd+Z stack.
  const openedMarkedRef = useRef(false);
  useEffect(() => {
    if (openedMarkedRef.current) return;
    openedMarkedRef.current = true;
    skipNextSnapshotRef.current = true;
    setState(s => markOpened(s));
  }, []);

  const get = useCallback((k: string, fb: any) => state[k] !== undefined ? state[k] : fb, [state]);
  const setVal = (k: string, v: any) => setState(s => ({ ...s, [k]: v }));

  // Session music sync anchor — kept in transient React state, not the CRDT
  // log. The GM publishes a fresh {position, wall-time, index} every ~15s
  // during playback so players can seek to match; persisting that through
  // Yjs would create one append-only log entry every cycle for no benefit
  // (the anchor only matters during the live session, and players already
  // receive it through the playerShares projection).
  const [sessionPlaylistAnchor, setSessionPlaylistAnchor] = useState<
    { positionSec: number; anchorWallTimeMs: number; playlistIndex: number } | null
  >(null);

  // tourUid for checking tutorial tour views. For the campaign owner, this is
  // their own auth uid; falls back to the campaign owner's userId.
  const tourUid = useMemo(
    () => getFirebaseAuth().currentUser?.uid ?? campaign.userId ?? null,
    [campaign.userId],
  );

  useEffect(() => {
    if (playMode === 'solo' || playMode === 'duet') {
      const uid = tourUid || 'default';
      if (!hasSeenTour(uid, playMode)) {
        setActiveTourMode(playMode);
      } else {
        setActiveTourMode(null);
      }
    } else {
      setActiveTourMode(null);
    }
  }, [playMode, tourUid]);

  // --- AUTO-PUBLISH SYSTEM FOR PLAYER SHARING ---
  const playerConfig = useMemo(() => (get('player', {}) as PlayerConfig) || {}, [get]);
  const playerLog = useMemo(() => (get('playerLog', []) as PlayerLogEntry[]) || [], [get]);

  const prevContentSignatureRef = useRef('');
  const prevMusicSignatureRef = useRef('');

  const contentSignature = useMemo(
    () => JSON.stringify({
      p: playerConfig,
      pcs: get('pcs', []),
      n: get('npcs', []),
      l: get('locations', []),
      f: get('factions', []),
      c: get('characters', []),
      k: get('clocks', []),
      h: get('handouts', ''),
      s: playerLog,
      i: get('items', []),
      g: get('pcGoals', []),
      m: get('maps', []),
    }),
    [playerConfig, get, playerLog],
  );

  const musicSignature = useMemo(
    () => JSON.stringify({
      playlist: get('__sessionPlaylist', ''),
      playing: !!get('__sessionPlaylistPlaying', false),
      index: get('__sessionPlaylistIndex', 0),
      anchor: sessionPlaylistAnchor?.anchorWallTimeMs ?? 0,
    }),
    [get, sessionPlaylistAnchor],
  );

  useEffect(() => {
    if (!playerConfig?.shareToken || !campaign.id) return;

    const contentChanged = prevContentSignatureRef.current !== contentSignature;
    const musicChanged = prevMusicSignatureRef.current !== musicSignature;

    prevContentSignatureRef.current = contentSignature;
    prevMusicSignatureRef.current = musicSignature;

    if (!contentChanged && !musicChanged) return;

    const delay = (!contentChanged && musicChanged) ? 100 : 1500;

    const timer = setTimeout(() => {
      void (async () => {
        try {
          const dataToPublish = {
            player: playerConfig,
            pcs: get('pcs', []),
            npcs: get('npcs', []),
            locations: get('locations', []),
            factions: get('factions', []),
            characters: get('characters', []),
            clocks: get('clocks', []),
            handouts: get('handouts', ''),
            playerLog,
            items: get('items', []),
            pcGoals: get('pcGoals', []),
            maps: get('maps', []),
            __sessionPlaylist: get('__sessionPlaylist', '') as string,
            __sessionPlaylistPlaying: !!get('__sessionPlaylistPlaying', false),
            __sessionPlaylistIndex: get('__sessionPlaylistIndex', 0) as number,
            __sessionPlaylistAnchor: sessionPlaylistAnchor ?? undefined,
          };
          await publishProjections(campaign.id, name || 'Campaign', dataToPublish);
        } catch (e) {
          console.error('[CampaignEditor] auto-publish failed', e);
        }
      })();
    }, delay);

    return () => clearTimeout(timer);
  }, [contentSignature, musicSignature, campaign.id, name, playerLog, playerConfig, get, sessionPlaylistAnchor]);
  const usedPrep = useMemo(() => {
    const sessionLogsV2 = (get('sessionLogV2', [])) || [];
    const linkedNpcIds = new Set<string>();
    const linkedNpcNames = new Set<string>();
    const linkedLocIds = new Set<string>();
    const linkedLocNames = new Set<string>();
    const linkedMonsterIds = new Set<string>();
    const linkedMonsterNames = new Set<string>();
    const linkedLootIds = new Set<string>();
    const linkedLootNames = new Set<string>();

    const usedScenes = new Set<string>();
    const usedSecrets = new Set<string>();

    for (const entry of sessionLogsV2) {
      if (entry.scenesUsed) {
        for (const scene of entry.scenesUsed) {
          if (scene) usedScenes.add(scene.trim());
        }
      }
      if (entry.secretsRevealed) {
        for (const secret of entry.secretsRevealed) {
          if (secret) usedSecrets.add(secret.trim());
        }
      }
      if (entry.linkedPrepItems) {
        for (const item of entry.linkedPrepItems) {
          if (!item) continue;
          const id = (item.id || '').trim();
          const name = (item.snapshotName || '').trim();

          if (item.type === 'npc') {
            if (id) linkedNpcIds.add(id);
            if (name) linkedNpcNames.add(name);
          } else if (item.type === 'location') {
            if (id) linkedLocIds.add(id);
            if (name) linkedLocNames.add(name);
          } else if (item.type === 'encounter') {
            if (id) linkedMonsterIds.add(id);
            if (name) linkedMonsterNames.add(name);
          } else if (item.type === 'loot') {
            if (id) linkedLootIds.add(id);
            if (name) linkedLootNames.add(name);
          }
        }
      }
    }

    return {
      linkedNpcIds, linkedNpcNames,
      linkedLocIds, linkedLocNames,
      linkedMonsterIds, linkedMonsterNames,
      linkedLootIds, linkedLootNames,
      usedScenes, usedSecrets
    };
  }, [get]);

  const getFilteredPrepArray = useCallback((key: PrepTargetKey, rawArray: any[]) => {
    if (!Array.isArray(rawArray)) return rawArray;
    if (key === 'scenes') {
      return rawArray.filter((s: string) => !usedPrep.usedScenes.has(s.trim()));
    }
    if (key === 'secrets') {
      return rawArray.filter((s: string) => !usedPrep.usedSecrets.has(s.trim()));
    }
    if (key === 'locations') {
      return rawArray.filter((l: any) => !usedPrep.linkedLocIds.has(l.id) && !usedPrep.linkedLocNames.has(l.name));
    }
    if (key === 'npcs') {
      return rawArray.filter((n: any) => !usedPrep.linkedNpcIds.has(n.id) && !usedPrep.linkedNpcNames.has(n.name));
    }
    if (key === 'monsters') {
      return rawArray.filter((m: string) => !usedPrep.linkedMonsterIds.has(m) && !usedPrep.linkedMonsterNames.has(parseMonsterName(m)));
    }
    if (key === 'items') {
      return rawArray.filter(item => {
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
    }
    return rawArray;
  }, [usedPrep]);
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

  const handleEndSession = useCallback(async () => {
    const sessionId = get('__activeSessionId', `session_${Date.now()}`) as string;
    const startedAt = get('__sessionStartedAt', Date.now()) as number;
    const endedAt = Date.now();
    const scratchpad = get('__sessionScratchpad', '') as string;
    const events = get('__sessionChangeEvents', []) as any[];
    const existingEntries = get('sessionLogV2', []) as any[];
    
    const keptEvents = events.filter((e: any) => !e.dismissed);
    const nextNumber = Math.max(0, ...existingEntries.map(e => e.number || 0)) + 1;
    const strongStartDelivered = !!get('__sessionStrongStartDelivered', false);
    const strongStartText = ((get('strongStart', '') as string) || '').trim();

    const entry: any = {
      id: sessionId,
      number: nextNumber,
      date: new Date().toISOString().split('T')[0],
      startedAt,
      endedAt,
      title: `Session ${nextNumber}`,
      recap: scratchpad || '',
      events: keptEvents,
      secretsRevealed: keptEvents.filter((e: any) => e.kind === 'secret_revealed').map((e: any) => e.summary),
      scenesUsed: keptEvents.filter((e: any) => e.kind === 'scene_used').map((e: any) => e.summary.replace(/^Used scene:\s*/, '')),
      goalUpdates: keptEvents.filter((e: any) => e.kind === 'goal_status').map((e: any) => {
        const [goalText] = e.summary.split(': ');
        const fromTo = e.summary.split(': ')[1] || '';
        const [from, to] = fromTo.split(' → ');
        return { goal: goalText || '', from: from || String(e.before ?? ''), to: to || String(e.after ?? '') };
      }),
    };
    if (strongStartDelivered && strongStartText) {
      entry.strongStart = strongStartText;
    }
    
    const updatedSessionLog = [...existingEntries, entry];
    const { partyXP, partyInventory, updatedCharacters } = recalculatePartyState(updatedSessionLog, characters);
    
    // Auto-assign magic items marked as given to 'party' to remove them from future prep
    const sessionGivenItems = (get('__sessionItemsGiven', []) as string[]) || [];
    const rawItems = (get('items', []) as any[]) || [];
    const updatedItems = rawItems.map((item, idx) => {
      if (typeof item === 'object' && item) {
        if (sessionGivenItems.includes(item.name)) {
          return { ...item, assignedPlayerId: item.assignedPlayerId || 'party' };
        }
      } else if (typeof item === 'string') {
        if (sessionGivenItems.includes(item)) {
          return { id: `item_${idx}_${Date.now().toString(36).slice(-2)}`, name: item, assignedPlayerId: 'party' };
        }
      }
      return item;
    });

    // Filter out given treasure from the prepped treasure array
    const rawTreasure = (get('treasure', []) as string[]) || [];
    const updatedTreasure = rawTreasure.filter(t => !sessionGivenItems.includes(t));

    // Build the next state object
    let nextState: Record<string, any> = {
      ...state,
      sessionLogV2: updatedSessionLog,
      partyXP,
      partyInventory,
      characters: updatedCharacters,
      items: updatedItems,
      treasure: updatedTreasure
    };
    if (strongStartDelivered && strongStartText) {
      nextState.strongStart = '';
    }
    delete nextState.__activeSessionId;
    delete nextState.__sessionStartedAt;
    delete nextState.__sessionEndedAt;
    delete nextState.__sessionChangeEvents;
    delete nextState.__sessionScratchpad;
    delete nextState.__sessionUsedScenes;
    delete nextState.__sessionItemsGiven;
    delete nextState.__sessionStrongStartDelivered;
    nextState.__runSessionOpen = false;
    nextState = markSessionPlayed(nextState);

    // Phase 4 — auto-suggest relationships from this session's notes. Scans the
    // recap for co-mentioned entities and appends `suggested: true` links for
    // the GM to confirm on the Wiki tab.
    try {
      const idx = buildEntityIndex(nextState);
      const existingRels: WikiRelationship[] = Array.isArray(nextState.relationships) ? nextState.relationships : [];
      const newSuggestions = scanTextForSuggestions(entry.recap || '', idx, existingRels);
      if (newSuggestions.length > 0) {
        nextState.relationships = [...existingRels, ...newSuggestions];
      }
    } catch {
      // Suggestion scanning is best-effort; never block ending a session.
    }

    // Cancel the pending auto-save timeout so it doesn't fire after our manual save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Optimistically update local React state
    setState(nextState);

    try {
      // Save to the database immediately and wait for it to complete
      await saveToDB({ name, data: { ...nextState, mode: playMode, __soloMode: soloMode }, done });
    } catch (err) {
      console.error("Failed to save ended session to DB", err);
    }
    
    router.push(`/campaign/${campaign.id}/recap/${sessionId}`);
  }, [state, get, name, playMode, soloMode, done, saveToDB, campaign.id, router, characters]);
  const toggleDone = (id: string) => setDone(d => ({ ...d, [id]: !d[id] }));
  const toggleOpen = (id: string) => setOpen(o => ({ ...o, [id]: !o[id] }));
  const togglePhase = (id: string) => setPhaseOpen(p => ({ ...p, [id]: !p[id] }));

  const generatorLogs = (state.generatorLogs as GeneratorLogs) || {};
  const logEntriesFor = (kind: LogKind): LogEntry[] => generatorLogs[kind] ?? [];
  const setLogEntriesFor = (kind: LogKind) => (next: LogEntry[]) => {
    setVal('generatorLogs', { ...generatorLogs, [kind]: next });
  };

  // Bridge from a generator log (or live result) into the campaign data lists.
  // Returns a callback bound to one LogKind that the picker hands its
  // (destination, items) selection to. The helper folds the rows in via
  // `buildCampaignPatch`, then commits with a single setVal.
  const addToCampaignFor = useCallback(
    (kind: LogKind) => (dest: CampaignDestKey, items: SelectableItem[]) => {
      // session-log is a virtual dest — it appends ChangeEvents to the live
      // session log array, not a top-level data field. Source/target the
      // __sessionChangeEvents key explicitly.
      const stateKey = dest === 'session-log' ? '__sessionChangeEvents' : dest;
      const current = (state as Record<string, unknown>)[stateKey];
      const { patch, added } = buildCampaignPatch(current, kind, dest, items);
      if (added === 0) return;
      setVal(stateKey, patch.value);
      // Skip the meta "Added N from X" trackEvent for session-log writes;
      // the segue ChangeEvents themselves are already in the log.
      if (dest === 'session-log') return;
      const eventKind: ChangeEventKind =
        dest === 'locations' ? 'location_added' :
        dest === 'npcs' ? 'npc_added' :
        dest === 'monsters' ? 'monster_added' :
        dest === 'items' ? 'magic_item_given' :
        'other';
      trackEvent(eventKind, `Added ${added} from ${kind} → ${dest}`);
    },
    [state, trackEvent],
  );

  // Per-kind disabled destinations passed down to AddToCampaignPicker. Plot
  // segues offer the live Session Log; that option is unavailable until a
  // Run Session is open.
  const generatorDisabledDests: Partial<Record<LogKind, readonly CampaignDestKey[]>> = useMemo(
    () => ({ 'plot-segue': state.__activeSessionId ? [] : (['session-log'] as const) }),
    [state.__activeSessionId],
  );

  const parsedLevels = pcs
    .map(p => p.level)
    .filter((lvl): lvl is number => typeof lvl === 'number' && lvl > 0);
  const partyLevel = parsedLevels.length > 0
    ? Math.round(parsedLevels.reduce((a, b) => a + b, 0) / parsedLevels.length)
    : undefined;

  // Snapshot of the campaign's premise/theme fields for AI-enhance grounding.
  // Each field is read out of `state`; the helper inside GeneratorPanel hides
  // the "Use campaign context" checkbox when every field is empty.
  const generatorCampaignContext = {
    genre: typeof state.genre === 'string' ? state.genre : '',
    tone: Array.isArray(state.tone) ? (state.tone as string[]) : [],
    pitch: typeof state.pitch === 'string' ? state.pitch : '',
    worldFacts: Array.isArray(state.gWorld) ? (state.gWorld as string[]) : [],
    settingFacts: Array.isArray(state.facts) ? (state.facts as string[]) : [],
    partyLevel,
  };

  const PREP_GROUPS = [
    { name: 'Premise', keys: ['pitch', 'genre', 'g-lines', 'g-mech'], labels: ['Quick Pitch', 'Genre Statement', 'Content Lines', 'Mechanics & System'] },
    { name: 'World', keys: ['g-world', 'facts', 'g-fnl'], labels: ['World Facts', 'Setting Facts', 'Req. Factions, NPCs & Locations'] },
    { name: 'Characters', keys: ['pc', 'goals'], labels: ['Player Characters', 'PC Goals'] },
    { name: 'Fronts', keys: ['factions', 'conflicts', 'secrets'], labels: ['Factions', 'Active Conflicts', 'Secrets & Clues'] },
    { name: 'Per-Session', keys: ['s1-review', 's2-start', 's3-scenes', 's4-secrets', 's5-loc', 's6-npc', 's7-mon', 's8-rew'], labels: ['1. Review PCs', '2. Strong Start', '3. Outline Scenes', '4. Define Secrets', '5. Develop Locations', '6. Outline NPCs', '7. Choose Monsters', '8. Select Rewards'] },
  ];

  const totalPrepSteps = PREP_GROUPS.reduce((acc, g) => acc + g.keys.length, 0);
  const completedCount = PREP_GROUPS.reduce((acc, g) => acc + g.keys.filter(k => done?.[k]).length, 0);

  // Lowest-progress prep target — drives the "Next Up" pill at the top of the
  // Prep Flow tab. Picks the section with the largest gap to target, with
  // ties broken toward the lower current count.
  const nextUp = useMemo(() => {
    type Candidate = { id: PrepTargetKey; label: string; current: number; target: number; sectionId: string; phaseId: string };
    const candidates: Candidate[] = [];
    for (const [k, t] of Object.entries(TARGETS)) {
      const key = k as PrepTargetKey;
      const target = getTarget(key, soloMode, prepTargetOverrides);
      if (target === 0) continue;
      const current = countFilled(key, getFilteredPrepArray(key, state[key]), state.player);
      if (current < target) {
        candidates.push({
          id: key,
          label: t.label,
          current,
          target,
          sectionId: SECTION_ID_BY_KEY[key] ?? key,
          phaseId: PHASE_ID_BY_KEY[key] ?? 'p0',
        });
      }
    }
    candidates.sort((a, b) => {
      const gapA = a.target - a.current;
      const gapB = b.target - b.current;
      if (gapA !== gapB) return gapB - gapA;
      return a.current - b.current;
    });
    return candidates[0] ?? null;
  }, [state, soloMode, prepTargetOverrides, getFilteredPrepArray]);

  const jumpToNextUp = useCallback(() => {
    if (!nextUp) return;
    
    let targetMode: Mode = 'prep';
    let targetSubview = 'flow';
    if (nextUp.phaseId === 'p0') { targetMode = 'plan'; targetSubview = 'pitch'; }
    else if (nextUp.phaseId === 'p1') { targetMode = 'plan'; targetSubview = 'worldbuild'; }
    else if (nextUp.phaseId === 'p2') { targetMode = 'plan'; targetSubview = 'party'; }
    else if (nextUp.phaseId === 'p4') { targetMode = 'prep'; targetSubview = 'clocks'; }
    else if (nextUp.phaseId === 'p5') { targetMode = 'prep'; targetSubview = 'arc'; }
    else if (nextUp.phaseId === 'p6') { targetMode = 'prep'; targetSubview = 'ending'; }
    
    setMode(targetMode);
    setSubview(targetSubview);
    setPhaseOpen(p => ({ ...p, [nextUp.phaseId]: true }));
    setOpen(o => ({ ...o, [nextUp.sectionId]: true }));
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.getElementById(`section-${nextUp.sectionId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
  }, [nextUp]);

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
    const title = log?.title || 'session log';
    showUndoToast(`Deleted "${title}" — Press ⌘Z to undo`, 5000);
  };

  const addCharacter = () => {
    addPc();
  };
  const updateCharacter = (id: string, patch: Character) => {
    const updatedPc = mapParsedToPc(patch);
    const originalPc = pcs.find(p => p.id === id);
    if (originalPc) {
      updatedPc.ownership = originalPc.ownership;
      updatedPc.goals = originalPc.goals;
      updatedPc.bonds = originalPc.bonds;
      updatedPc.ideals = originalPc.ideals;
      updatedPc.flaws = originalPc.flaws;
    }
    updatePc(updatedPc);
  };
  const removeCharacter = (id: string) => {
    removePc(id);
  };

  const uploadCharacterSheet = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCharUploadError('');
    setUploadingChar(true);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('Not signed in');
      const idToken = await user.getIdToken();
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/parse-character-sheet', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
        body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Parse failed (${res.status})`);
      const parsed = normalizeCharacter(body.character);
      const fresh: Character = { ...parsed, id: makeCharacterId() };
      setVal('characters', [...characters, fresh]);
      setOpenChars(o => ({ ...o, [fresh.id]: true }));
    } catch (err: any) {
      setCharUploadError(err?.message || 'Upload failed');
    } finally {
      setUploadingChar(false);
    }
  };

  // ---- First-class PCs (data.pcs) -------------------------------------
  const pcMacros = (state.pcMacros as PcMacros) || {};

  const writePcs = (next: PlayerCharacter[], nextMacros?: PcMacros) => {
    setState((s) => ({
      ...s,
      pcs: capPcs(next),
      ...(nextMacros ? { pcMacros: nextMacros } : {}),
    }));
  };

  const pcsRef = useRef(pcs);
  useEffect(() => {
    pcsRef.current = pcs;
  }, [pcs]);

  // Real-time Player Write-back Reconciler Subscription Hook.
  // 
  // Registers an active subscription to the player writebacks collection in Duet or Standard modes.
  // When a player modifies their sheet, this hook catches the staged change, reconciles it using the
  // transaction logic in `lib/player/reconciler.ts`, and commits it to the master campaign document.
  useEffect(() => {
    // Reconciler is inactive in world-only modes, stub campaigns, or Solo campaigns (where there are no players)
    if (worldOnlyMode || campaign.id === 'world-stub' || playMode === 'solo') return;

    let unsubscribe: (() => void) | null = null;
    let retryCount = 0;
    let timeoutId: NodeJS.Timeout;

    const start = () => {
      try {
        unsubscribe = startWritebackReconciler(
          campaign.id,
          // Getter references the latest PC array via mutable ref to avoid sub-re-evaluation cycles
          () => pcsRef.current,
          // Callback triggers local state update, initiating instant optimistic UI re-render
          (nextPcs) => {
            writePcs(nextPcs);
          },
          // Error handler with automatic backoff retry to handle network disruptions
          (err) => {
            if (err.message.includes('permission') || err.message.includes('Permission')) {
              // Informative warning targeting developers in local workspace setting up Firebase configurations
              console.warn(
                `[Writeback Reconciler] Warning: Firestore returned 'Missing or insufficient permissions' (attempt ${retryCount + 1}).\n` +
                `If you are running in local development, please make sure:\n` +
                ` 1. Your local 'firestore.rules' have been deployed to your Firebase console (run 'npx firebase deploy --only firestore').\n` +
                ` 2. The logged-in user in your browser (${getFirebaseAuth().currentUser?.email}) matches the campaign owner's ID (${campaign.userId}).`
              );
            } else {
              console.warn(`Failed to reconcile player writebacks (attempt ${retryCount + 1}):`, err.message);
            }
            
            // Retry automatically up to 3 times using exponential backoff (1s, 2s, 3s)
            if (retryCount < 3) {
              retryCount++;
              timeoutId = setTimeout(() => {
                if (unsubscribe) unsubscribe();
                start();
              }, 1000 * retryCount);
            } else {
              if (err.message.includes('permission') || err.message.includes('Permission')) {
                console.warn('[Writeback Reconciler] Reconciler paused due to persistent permission errors. Player writebacks will not sync in this session.');
              } else {
                console.error('Failed to reconcile player writebacks after maximum retries:', err);
              }
            }
          }
        );
      } catch (err) {
        console.error('Failed to start writeback reconciler:', err);
      }
    };

    start();

    // Clean up and detach listener on component unmount
    return () => {
      if (unsubscribe) unsubscribe();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [campaign.id, playMode, worldOnlyMode, campaign.userId]);

  const addPc = () => {
    if (pcs.length >= PC_CAP) return;
    const fresh = emptyPc();
    writePcs([...pcs, fresh]);
    setOpenPcs((o) => ({ ...o, [fresh.id]: true }));
  };

  const updatePc = (pc: PlayerCharacter) => {
    const next = pcs.map((p) => (p.id === pc.id ? pc : p));
    // Keep the PC's attack macros in sync on every save.
    writePcs(next, syncAttackMacros(pc, pcMacros));
  };

  const removePc = (id: string) => {
    const target = pcs.find((p) => p.id === id);
    writePcs(pcs.filter((p) => p.id !== id), dropPcMacros(id, pcMacros));
    setOpenPcs((o) => { const n = { ...o }; delete n[id]; return n; });
    showUndoToast(`Deleted "${target?.name || 'PC'}" — Press ⌘Z to undo`, 5000);
  };

  const uploadPcSheet = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (pcs.length >= PC_CAP) { setPcUploadError(`Party is full (${PC_CAP} max)`); return; }
    setPcUploadError('');
    setUploadingPc(true);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('Not signed in');
      const idToken = await user.getIdToken();
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/parse-character-sheet', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
        body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Parse failed (${res.status})`);
      const parsed = normalizeCharacter(body.character);
      const pc = mapParsedToPc(parsed);
      writePcs([...pcs, pc], syncAttackMacros(pc, pcMacros));
      setOpenPcs((o) => ({ ...o, [pc.id]: true }));
    } catch (err: any) {
      setPcUploadError(err?.message || 'Upload failed');
    } finally {
      setUploadingPc(false);
    }
  };

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
        if (data._format !== 'campaign_prep_v1') {
          showUndoToast('Import failed: unsupported file format', 4000);
          return;
        }
        if (data.campaignName) setName(data.campaignName);
        setState(data.state || {});
        setDone(data.done || {});
        showUndoToast('Campaign imported successfully', 4000);
      } catch {
        showUndoToast('Import failed: invalid JSON file', 4000);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDelete = async () => {
    const ok = await confirmModal({
      title: 'Delete Campaign',
      message: `Delete "${name}"? This cannot be undone.`,
      confirmText: 'Delete',
      isDestructive: true,
    });
    if (!ok) return;
    try {
      if (campaign.worldId) {
        await deleteWorld(campaign.worldId);
      }
      await deleteCampaignDoc(campaign.id);
      router.push('/campaign');
    } catch (err: any) {
      alert(`Delete failed: ${err?.message || err}`);
    }
  };

  const isArchived = Boolean(campaign.archivedAt);

  const handleArchive = async () => {
    try {
      if (isArchived) {
        await unarchiveCampaign(campaign.id);
      } else {
        const ok = await confirmModal({
          title: 'Archive Campaign',
          message: `Archive "${name}"? It will be hidden from your main list — you can restore it from the Archived section.`,
          confirmText: 'Archive',
          isDestructive: true,
        });
        if (!ok) return;
        await archiveCampaign(campaign.id);
        router.push('/campaign');
      }
    } catch (err: any) {
      alert(`${isArchived ? 'Unarchive' : 'Archive'} failed: ${err?.message || err}`);
    }
  };

  const handleCopy = async () => {
    if (!confirm(`Create a copy of "${name}"?`)) return;
    try {
      const newId = await copyCampaign(campaign.id);
      router.push(`/campaign/${newId}`);
    } catch (err: any) {
      alert(`Copy failed: ${err?.message || err}`);
    }
  };

  const SyncIndicator = () => {
    if (syncState === 'saving') return <span className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-ink-soft"><Cloud size={12} className="animate-pulse" /> Saving…</span>;
    if (syncState === 'pending') return <span className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-ink-mute"><Cloud size={12} /> Pending</span>;
    if (syncState === 'error') return <span className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-crimson" title={syncError}><CloudOff size={12} /> Save Failed</span>;
    return <span className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-brass-deep"><Cloud size={12} /> Saved</span>;
  };

  // Manual retry — uses current state, bypasses the debounce timer. Wired to
  // the bottom-pill in error state so the user can recover from a failed save
  // without making another change first.
  const retrySave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    saveToDB({ name, data: { ...state, mode: playMode, __soloMode: soloMode }, done });
  }, [saveToDB, name, state, playMode, soloMode, done]);

  // Bottom-pill overlay for risky sync states. The header SyncIndicator is the
  // calm baseline; this pill is the urgent reminder when something is unsaved
  // or has failed. Hidden once we're back to 'synced'.
  const SyncPill = () => {
    if (syncState === 'synced') return null;
    const isRun = get('__runSessionOpen', false);
    const base = `fixed ${isRun ? 'bottom-[88px]' : 'bottom-4'} left-1/2 -translate-x-1/2 z-40 px-3 py-1.5 rounded-full shadow-page border text-xs font-display uppercase tracking-wider flex items-center gap-2 transition-all`;
    if (syncState === 'pending' || syncState === 'saving') {
      return null;
    }
    return (
      <button
        type="button"
        onClick={retrySave}
        title={syncError || 'Click to retry'}
        className={`${base} cursor-pointer border-crimson/70 bg-crimson/10 text-crimson hover:bg-crimson hover:text-parchment`}
      >
        <CloudOff size={12} />
        Save failed — click to retry
      </button>
    );
  };

  // Confirm tab/route changes while a save error is outstanding. Returns true
  // if the navigation should proceed.
  const confirmUnsavedNav = useCallback((): boolean => {
    if (syncState !== 'error') return true;
    return window.confirm(
      'Your last change failed to save. Switching may lose unsaved data. Switch anyway?',
    );
  }, [syncState]);

  const ToolBtn = ({ onClick, children, danger = false, title }: { onClick: () => void; children: React.ReactNode; danger?: boolean; title?: string }) => (
    <button onClick={onClick} title={title} className={`flex items-center gap-1.5 rounded border px-3 py-1 font-display text-xs uppercase tracking-wider transition-colors ${
      danger
        ? 'border-crimson/50 text-crimson hover:bg-crimson hover:text-parchment'
        : 'border-brass-deep/50 text-brass-deep hover:border-brass hover:bg-brass hover:text-parchment'
    }`}>
      {children}
    </button>
  );

  // Each prep section sits inside one Phase; the palette uses this to
  // re-expand the right phase before scrolling to a section. Phase 4 has no
  // direct sections (only faction clocks), so it's intentionally absent.
  const SECTION_TO_PHASE: Record<string, string> = {
    'g-world': 'p0', 'g-fnl': 'p0', 'g-mech': 'p0', 'g-lines': 'p0', 'pitch': 'p0',
    'genre': 'p1', 'facts': 'p1', 'factions': 'p1', 'conflicts': 'p1',
    'pc': 'p2', 'goals': 'p2',
    's1-review': 'p3', 's2-start': 'p3', 's3-scenes': 'p3', 's4-secrets': 'p3',
    's5-loc': 'p3', 's6-npc': 'p3', 's7-mon': 'p3', 's8-rew': 'p3',
    'audit-goals': 'p5', 'audit-factions': 'p5', 'audit-secrets': 'p5',
    'end-ready': 'p6', 'end-collect': 'p6', 'end-catalyst': 'p6',
  };

  const scrollToAnchor = (anchor: string) => {
    // requestAnimationFrame x2 lets React commit the tab/expand state before
    // we try to find the now-mounted element. One frame is usually enough,
    // but a slow render can push the element render to the next paint.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-cp-anchor="${anchor}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('cp-highlight');
      setTimeout(() => el.classList.remove('cp-highlight'), 1600);
    }));
  };

  // Each prep section also belongs to a Plan/Prep sub-view (Phases 0-2 live under Plan;
  // Phases 3 is Prep/Flow; Phases 4-6 are Prep/Fronts). Used by the palette
  // and Next-Up jump so we route to the right tab before scrolling.
  const PHASE_TO_VIEW: Record<string, { mode: Mode; subview: string }> = {
    p0: { mode: 'plan', subview: 'pitch' },
    p1: { mode: 'plan', subview: 'worldbuild' },
    p2: { mode: 'plan', subview: 'party' },
    p3: { mode: 'prep', subview: 'flow' },
    p4: { mode: 'prep', subview: 'clocks' },
    p5: { mode: 'prep', subview: 'arc' },
    p6: { mode: 'prep', subview: 'ending' },
  };

  const navigateTo = (target: {
    mode: Mode;
    subview?: string;
    sectionId?: string;
    sessionId?: string;
    characterId?: string;
    anchor?: string;
  }) => {
    const nextSubview =
      target.subview && isValidSubview(target.mode, target.subview)
        ? target.subview
        : defaultSubview(target.mode);
    setMode(target.mode);
    setSubview(nextSubview);
    if (target.sectionId) {
      const phase = SECTION_TO_PHASE[target.sectionId];
      if (phase) setPhaseOpen(p => ({ ...p, [phase]: true }));
      setOpen(o => ({ ...o, [target.sectionId!]: true }));
    }
    if (target.sessionId) {
      setOpenLogs(o => ({ ...o, [target.sessionId!]: true }));
    }
    if (target.characterId) {
      setOpenChars(o => ({ ...o, [target.characterId!]: true }));
    }
    if (target.anchor) scrollToAnchor(target.anchor);
  };

  // ── Campaign Wiki (cross-entity relationships) ──────────────────────────
  // The entity index + relationships array, plus mutators, are exposed via
  // WikiContext so the inline RelationshipsSection on each card and the Wiki
  // tab share one source of truth without prop-threading.
  const wikiIndex = useMemo(() => buildEntityIndex(state), [state]);
  const wikiRelationships = useMemo<WikiRelationship[]>(
    () => (Array.isArray(state.relationships) ? state.relationships : []),
    [state.relationships],
  );

  // One-time prune of suggestions older than 30 days (auto-reject).
  useEffect(() => {
    setState((s) => {
      if (!Array.isArray(s.relationships) || s.relationships.length === 0) return s;
      const { relationships, changed } = pruneExpiredSuggestions(s.relationships);
      return changed ? { ...s, relationships } : s;
    });
  }, []);

  const navigateToEntity = useCallback((type: WikiEntityType, id: string) => {
    // Land on the surface that hosts this entity's card and scroll to it.
    if (type === 'pc') {
      navigateTo({ mode: 'plan', subview: 'party', characterId: id });
      setTimeout(() => scrollToAnchor(`pc:${id}`), 80);
      return;
    }
    navigateTo({ mode: 'plan', subview: 'worldbuild' });
    setTimeout(() => {
      const el = document.getElementById(`entity-${id}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 80);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rescanForSuggestions = useCallback((): number => {
    let added = 0;
    setState((s) => {
      const sources: string[] = [];
      for (const e of (Array.isArray(s.sessionLogV2) ? s.sessionLogV2 : [])) {
        if (e && typeof e.recap === 'string') sources.push(e.recap);
      }
      if (typeof s.__sessionScratchpad === 'string') sources.push(s.__sessionScratchpad);
      for (const sc of (Array.isArray(s.sceneSessions) ? s.sceneSessions : [])) {
        if (!sc) continue;
        if (typeof sc.partyState === 'string') sources.push(sc.partyState);
        if (typeof sc.summary === 'string') sources.push(sc.summary);
        for (const t of (Array.isArray(sc.turns) ? sc.turns : [])) {
          if (t && typeof t.pcAction === 'string') sources.push(t.pcAction);
          if (t && typeof t.outcome === 'string') sources.push(t.outcome);
          if (t?.response && typeof t.response.sensory === 'string') sources.push(t.response.sensory);
        }
      }
      const idx = buildEntityIndex(s);
      const existing: WikiRelationship[] = Array.isArray(s.relationships) ? s.relationships : [];
      const found = scanTextForSuggestions(sources.join('\n\n'), idx, existing);
      if (found.length === 0) return s;
      added = found.length;
      return { ...s, relationships: [...existing, ...found] };
    });
    return added;
  }, []);

  const wikiValue = useMemo<WikiContextValue>(() => ({
    index: wikiIndex,
    relationships: wikiRelationships,
    addRelationship: (from, to, kind, notes) =>
      setState((s) => ({
        ...s,
        relationships: addRelToList(
          Array.isArray(s.relationships) ? s.relationships : [],
          createRelationship(from, to, kind, notes),
        ),
      })),
    removeRelationship: (id) =>
      setState((s) => ({
        ...s,
        relationships: removeRelFromList(Array.isArray(s.relationships) ? s.relationships : [], id),
      })),
    acceptSuggestion: (id) =>
      setState((s) => ({
        ...s,
        relationships: acceptSugInList(Array.isArray(s.relationships) ? s.relationships : [], id),
      })),
    rejectSuggestion: (id) =>
      setState((s) => ({
        ...s,
        relationships: rejectSugFromList(Array.isArray(s.relationships) ? s.relationships : [], id),
      })),
    navigateToEntity,
    resolve: (type, id) => findEntity(wikiIndex, type, id),
    rescan: rescanForSuggestions,
  }), [wikiIndex, wikiRelationships, navigateToEntity, rescanForSuggestions]);

  // Resolve a prep section ID to its (mode, subview) — used by command-palette
  // entries that target a specific section.
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

  // Global keyboard shortcuts:
  //  - Cmd/Ctrl-K: open the command palette (works even inside text inputs —
  //    the palette is the entire app's "go anywhere" affordance).
  //  - ?: open the keyboard cheatsheet (suppressed inside text inputs so the
  //    glyph still types into prose fields).
  //  - ←/→: previous / next tab (suppressed inside text inputs and while any
  //    modal — palette, cheatsheet, prep wizard, run session — is open).
  useEffect(() => {
    const isTyping = (el: EventTarget | null) => {
      const node = el as HTMLElement | null;
      if (!node) return false;
      const tag = node.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || node.isContentEditable;
    };

    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(p => !p);
        return;
      }
      // Cmd/Ctrl+Z outside an editable element steps back through the in-memory
      // snapshot stack. Inside inputs/textareas we let the browser's native
      // undo handle the field instead.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (isTyping(e.target)) return;
        const { snap, next } = popSnapshot(undoStackRef.current);
        if (snap) {
          skipNextSnapshotRef.current = true;
          setState(snap.state);
          setDone(snap.done);
          setName(snap.name);
          undoStackRef.current = next;
          setCanUndo(next.length > 0);
          showUndoToast(snap.description || 'Undid last change');
        }
        e.preventDefault();
        return;
      }
      if (isTyping(e.target)) return;
      if (paletteOpen || shortcutsOpen) return;

      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (!confirmUnsavedNav()) return;
        e.preventDefault();
        const idx = ALL_SUBVIEWS.findIndex(p => p.mode === mode && p.subview === subview);
        if (idx < 0) return;
        const step = e.key === 'ArrowRight' ? 1 : -1;
        const next = ALL_SUBVIEWS[(idx + step + ALL_SUBVIEWS.length) % ALL_SUBVIEWS.length];
        setMode(next.mode);
        setSubview(next.subview);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [paletteOpen, shortcutsOpen, syncState, syncError, mode, subview, confirmUnsavedNav, showUndoToast]);

  const VIEW_META: Array<{ mode: Mode; subview: string; label: string; icon: any; keywords?: string[] }> = [
    { mode: 'plan',    subview: 'pitch',     label: 'Premise',     icon: Compass,         keywords: ['hook', 'givens', 'truths'] },
    { mode: 'plan',    subview: 'worldbuild',     label: 'Worldbuild',       icon: BookOpen,        keywords: ['setting', 'factions', 'reference', 'downtime'] },
    { mode: 'plan',    subview: 'party',     label: 'Party',       icon: Users,           keywords: ['pc sheet', 'character sheet', 'hp', 'abilities', 'attacks', 'spell slots', 'goals', 'sidekick'] },
    { mode: 'prep',    subview: 'clocks',    label: 'Faction Clocks', icon: Clock,          keywords: ['clocks', 'factions', 'tracking'] },
    { mode: 'prep',    subview: 'arc',       label: 'Arc Planning',   icon: Layers,         keywords: ['audits', 'goals', 'secrets'] },
    { mode: 'prep',    subview: 'ending',    label: 'Ending',         icon: Trophy,         keywords: ['ending', 'wrap', 'threads'] },
    { mode: 'prep',    subview: 'flow',      label: 'Prep Flow',   icon: ScrollText,      keywords: ['lazy dm', '8 step', 'next session'] },
    { mode: 'prep',    subview: 'wizard',    label: 'Prep Wizard', icon: ClipboardList,   keywords: ['guided', 'walkthrough'] },
    { mode: 'organize', subview: 'players',   label: 'Players',     icon: Users,          keywords: ['invite', 'share', 'collaboration'] },
    { mode: 'organize', subview: 'log',       label: 'Sessions',    icon: Calendar,        keywords: ['session log', 'recap'] },
    { mode: 'run',     subview: 'session',   label: 'Run Session', icon: Swords,          keywords: ['active', 'table'] },
    { mode: 'run',     subview: 'assistant', label: 'Assistant',   icon: Bot,             keywords: ['ai', 'chat', 'prep', 'plan', 'agent'] },
    { mode: 'run',     subview: 'lookup',    label: 'Lookup',      icon: Search,          keywords: ['quick reference'] },
    { mode: 'run',     subview: 'logged',    label: 'Logged',      icon: ScrollText,      keywords: ['saved', 'library', 'generators', 'log'] },
    { mode: 'run',     subview: 'dice',      label: 'Dice',        icon: Dice5 },
    { mode: 'run',     subview: 'spells',    label: 'Spells',      icon: Sparkles },
    { mode: 'run',     subview: 'dmref',     label: 'DM Ref',      icon: BookOpen,        keywords: ['rules', 'madness', 'travel'] },
    { mode: 'run',     subview: 'chase',     label: 'Chase',       icon: Footprints,      keywords: ['chase tracker'] },
    { mode: 'library', subview: 'generators',label: 'Generators',  icon: Wand2,           keywords: ['tavern', 'treasure', 'shop', 'dungeon', 'settlement', 'trinket', 'names', 'locations'] },
    { mode: 'library', subview: 'monsters',  label: 'Monsters',    icon: Skull,           keywords: ['stat block', 'bestiary'] },
    { mode: 'library', subview: 'traps',     label: 'Traps',       icon: Hash },
    { mode: 'library', subview: 'vivify',    label: 'Vivify',      icon: Sparkles,        keywords: ['ai description', 'prose'] },
    { mode: 'library', subview: 'pointbuy',  label: 'Point-Buy',   icon: Wrench,          keywords: ['point buy', 'ability scores', 'calculator', 'stats'] },
    { mode: 'oracle',  subview: 'wells',     label: 'Oracle',      icon: Sparkles,        keywords: ['yes no', 'chaos', 'complication', 'ask', 'wells'] },
  ];

  const PREP_SECTION_META: Array<{ id: string; label: string }> = [
    { id: 'g-world', label: 'World Facts' },
    { id: 'g-fnl', label: 'Required Factions, NPCs & Locations' },
    { id: 'g-mech', label: 'Mechanics & System' },
    { id: 'g-lines', label: 'Content Lines (Hard Nos)' },
    { id: 'pitch', label: 'Quick Pitch' },
    { id: 'genre', label: 'Genre Statement' },
    { id: 'facts', label: 'Setting Facts' },
    { id: 'factions', label: 'Factions' },
    { id: 'conflicts', label: 'Active Conflicts' },
    { id: 'pc', label: 'Player Characters' },
    { id: 'goals', label: 'PC Goals (5 Rules of Proactive Fun)' },
    { id: 's1-review', label: '1 · Review the Characters' },
    { id: 's2-start', label: '2 · Create a Strong Start' },
    { id: 's3-scenes', label: '3 · Outline Potential Scenes' },
    { id: 's4-secrets', label: '4 · Define Secrets & Clues' },
    { id: 's5-loc', label: '5 · Develop Fantastic Locations' },
    { id: 's6-npc', label: '6 · Outline Important NPCs' },
    { id: 's7-mon', label: '7 · Choose Relevant Monsters' },
    { id: 's8-rew', label: '8 · Select Magic Item Rewards' },
    { id: 'audit-goals', label: 'PC Goal Audit' },
    { id: 'audit-factions', label: 'Faction Audit' },
    { id: 'audit-secrets', label: 'Secrets Audit' },
    { id: 'end-ready', label: 'Is the Campaign Ready to End?' },
    { id: 'end-collect', label: 'Collect Every Thread' },
    { id: 'end-catalyst', label: 'Add Catalysts' },
  ];

  const paletteItems: CommandItem[] = useMemo(() => {
    const items: CommandItem[] = [];

    for (const t of VIEW_META) {
      items.push({
        id: `view:${t.mode}:${t.subview}`,
        label: `Go to ${t.label}`,
        sublabel: MODES[t.mode].label,
        group: 'Navigation',
        keywords: t.keywords,
        icon: t.icon,
        run: () => navigateTo({ mode: t.mode, subview: t.subview }),
      });
    }

    items.push(
      { id: 'act:new-session', label: 'New session log', group: 'Actions', icon: Plus, run: () => { addSessionLog(); navigateTo({ mode: 'organize', subview: 'log' }); } },
      { id: 'act:export', label: 'Export campaign JSON', group: 'Actions', icon: Download, run: () => exportJSON() },
      { id: 'act:import', label: 'Import campaign JSON', group: 'Actions', icon: Upload, run: () => fileInputRef.current?.click() },
      { id: 'act:add-character', label: 'Add PC', group: 'Actions', icon: User, run: () => { addPc(); navigateTo({ mode: 'plan', subview: 'party', sectionId: 'pc' }); } },
      { id: 'act:solo-toggle', label: 'Change play mode (Solo / Duet / Standard)…', group: 'Actions', icon: Users, run: () => setModeSwitcherOpen(true) },
      { id: 'act:prep-targets', label: 'Customize prep target counts…', group: 'Actions', icon: SlidersHorizontal, run: () => setPrepTargetsOpen(true) },
    );

    for (const s of PREP_SECTION_META) {
      const v = viewForSection(s.id);
      items.push({
        id: `sec:${s.id}`,
        label: s.label,
        sublabel: MODES[v.mode].label,
        group: 'Prep section',
        icon: ScrollText,
        run: () => navigateTo({ mode: v.mode, subview: v.subview, sectionId: s.id, anchor: `section:${s.id}` }),
      });
    }

    const npcs = (get('npcs', []) as Array<{ name?: string; type?: string; archetype?: string; faction?: string }>);
    npcs.forEach((n, i) => {
      const label = (n.name || '').trim() || (n.archetype || '').trim() || `Unnamed NPC #${i + 1}`;
      const tag = [n.type, n.faction].filter(Boolean).join(' · ');
      items.push({
        id: `npc:${i}`,
        label,
        sublabel: tag || undefined,
        group: 'NPCs',
        keywords: [n.archetype || '', n.faction || ''],
        icon: User,
        run: () => { const v = viewForSection('s6-npc'); navigateTo({ mode: v.mode, subview: v.subview, sectionId: 's6-npc', anchor: `npc:${i}` }); },
      });
    });

    const locs = (get('locations', []) as Array<{ name?: string; type?: string; factions?: string }>);
    locs.forEach((l, i) => {
      const label = (l.name || '').trim() || `Unnamed Location #${i + 1}`;
      items.push({
        id: `loc:${i}`,
        label,
        sublabel: l.type || undefined,
        group: 'Locations',
        keywords: [l.factions || ''],
        icon: Map,
        run: () => { const v = viewForSection('s5-loc'); navigateTo({ mode: v.mode, subview: v.subview, sectionId: 's5-loc', anchor: `location:${i}` }); },
      });
    });

    const facs = (get('factions', []) as Array<{ name?: string; archetype?: string; identity?: string; area?: string }>);
    facs.forEach((f, i) => {
      const label = (f.name || '').trim() || (f.identity || '').trim() || `Unnamed Faction #${i + 1}`;
      items.push({
        id: `fac:${i}`,
        label,
        sublabel: f.archetype || f.area || undefined,
        group: 'Factions',
        icon: Users,
        run: () => { const v = viewForSection('factions'); navigateTo({ mode: v.mode, subview: v.subview, sectionId: 'factions', anchor: `faction:${i}` }); },
      });
    });

    const scenes = (get('scenes', []) as string[]);
    scenes.forEach((s, i) => {
      const text = (s || '').trim();
      if (!text) return;
      items.push({
        id: `sce:${i}`,
        label: text.length > 80 ? `${text.slice(0, 77)}…` : text,
        sublabel: `Scene ${i + 1}`,
        group: 'Scenes',
        icon: Calendar,
        run: () => { const v = viewForSection('s3-scenes'); navigateTo({ mode: v.mode, subview: v.subview, sectionId: 's3-scenes', anchor: 'section:s3-scenes' }); },
      });
    });

    const secrets = (get('secrets', []) as string[]);
    secrets.forEach((s, i) => {
      const text = (s || '').trim();
      if (!text) return;
      items.push({
        id: `sec-clue:${i}`,
        label: text.length > 80 ? `${text.slice(0, 77)}…` : text,
        sublabel: `Secret ${i + 1}`,
        group: 'Secrets',
        icon: ScrollText,
        run: () => { const v = viewForSection('s4-secrets'); navigateTo({ mode: v.mode, subview: v.subview, sectionId: 's4-secrets', anchor: 'section:s4-secrets' }); },
      });
    });

    pcs.forEach((pc) => {
      const label = (pc.name || '').trim() || 'Unnamed PC';
      const classesStr = pc.classes.map(c => `${c.name} ${c.level}`).join(' / ');
      const tag = [classesStr, pc.race].filter(Boolean).join(' · ');
      items.push({
        id: `char:${pc.id}`,
        label,
        sublabel: tag || undefined,
        group: 'Characters',
        keywords: [pc.race || '', pc.background || ''],
        icon: User,
        run: () => { navigateTo({ mode: 'plan', subview: 'party', characterId: pc.id, anchor: `pc:${pc.id}` }); },
      });
    });

    sortedSessionLogs.forEach((log) => {
      const label = (log.title || '').trim() || 'Untitled session';
      items.push({
        id: `ses:${log.id}`,
        label,
        sublabel: log.date || undefined,
        group: 'Sessions',
        icon: Calendar,
        run: () => navigateTo({ mode: 'organize', subview: 'log', sessionId: log.id, anchor: `session:${log.id}` }),
      });
    });

    // PC goals — track progress in the 'fronts' subview under Prep where the goal-progress
    // card lives, but expose the same prep-tab anchor as a sublabel hint.
    const goals = (get('pcGoals', []) as Array<{ text?: string; timeframe?: string; status?: string }>);
    goals.forEach((g, i) => {
      const text = (g.text || '').trim();
      if (!text) return;
      const sub = [g.status, g.timeframe].filter(Boolean).join(' · ');
      items.push({
        id: `goal:${i}`,
        label: text.length > 80 ? `${text.slice(0, 77)}…` : text,
        sublabel: sub || `PC Goal ${i + 1}`,
        group: 'Goals',
        icon: Target,
        run: () => { const v = viewForSection('goals'); navigateTo({ mode: v.mode, subview: v.subview, sectionId: 'goals', anchor: 'section:goals' }); },
      });
    });

    // Magic items live in the Phase 3 / step 8 prep section as a string or object list.
    const magicItems = (get('items', []) as any[]);
    magicItems.forEach((m, i) => {
      const text = (typeof m === 'string' ? m : m?.name || '').trim();
      if (!text) return;
      items.push({
        id: `magic:${i}`,
        label: text.length > 80 ? `${text.slice(0, 77)}…` : text,
        sublabel: `Magic Item ${i + 1}`,
        group: 'Magic items',
        icon: Gift,
        run: () => { const v = viewForSection('s8-rew'); navigateTo({ mode: v.mode, subview: v.subview, sectionId: 's8-rew', anchor: 'section:s8-rew' }); },
      });
    });

    // Faction clocks (Phase 4). No per-card anchor — clock cards aren't
    // individually addressable today; landing on the tab is the goal.
    const clocks = (get('clocks', []) as Array<{ text?: string; faction?: string; filled?: number; max?: number }>);
    clocks.forEach((c, i) => {
      const text = (c.text || '').trim();
      const faction = (c.faction || '').trim();
      const label = text || faction || `Clock ${i + 1}`;
      const sub = [faction && text ? faction : null, typeof c.filled === 'number' && typeof c.max === 'number' ? `${c.filled}/${c.max}` : null].filter(Boolean).join(' · ');
      items.push({
        id: `clock:${i}`,
        label: label.length > 80 ? `${label.slice(0, 77)}…` : label,
        sublabel: sub || undefined,
        group: 'Faction clocks',
        keywords: [faction],
        icon: Target,
        run: () => { setPhaseOpen(p => ({ ...p, p4: true })); navigateTo({ mode: 'prep', subview: 'clocks' }); },
      });
    });

    // Homebrew monsters live in their own tab; no in-tab anchor today.
    const homebrew = (get('homebrewMonsters', []) as Array<{ slug?: string; name?: string; challenge_rating?: string; type?: string }>);
    homebrew.forEach((m, i) => {
      const name = (m.name || '').trim() || `Monster ${i + 1}`;
      const sub = [m.challenge_rating ? `CR ${m.challenge_rating}` : null, m.type].filter(Boolean).join(' · ');
      items.push({
        id: `mon:${m.slug || i}`,
        label: name,
        sublabel: sub || undefined,
        group: 'Monsters',
        keywords: [m.type || ''],
        icon: Skull,
        run: () => navigateTo({ mode: 'library', subview: 'monsters' }),
      });
    });

    const traps = (get('traps', []) as Array<{ id?: string; name?: string; tier?: string; severity?: string }>);
    traps.forEach((t, i) => {
      const name = (t.name || '').trim() || `Trap ${i + 1}`;
      const sub = [t.tier, t.severity].filter(Boolean).join(' · ');
      items.push({
        id: `trap:${t.id || i}`,
        label: name,
        sublabel: sub || undefined,
        group: 'Traps',
        icon: Hash,
        run: () => navigateTo({ mode: 'library', subview: 'traps' }),
      });
    });

    const chases = (get('chases', []) as Array<{ id?: string; name?: string; terrain?: string; resolved?: string }>);
    chases.forEach((c, i) => {
      const name = (c.name || '').trim() || `Chase ${i + 1}`;
      const sub = [c.terrain, c.resolved && c.resolved !== 'ongoing' ? c.resolved : null].filter(Boolean).join(' · ');
      items.push({
        id: `chase:${c.id || i}`,
        label: name,
        sublabel: sub || undefined,
        group: 'Chases',
        keywords: [c.terrain || ''],
        icon: Footprints,
        run: () => navigateTo({ mode: 'run', subview: 'chase' }),
      });
    });

    const downtime = (get('downtime', []) as Array<DowntimeEntry>);
    downtime.forEach((d) => {
      const typeDef = DOWNTIME_TYPES.find(t => t.id === d.type);
      const typeLabel = typeDef?.label || d.type || 'Downtime';
      const firstField = typeDef?.fields?.[0];
      const summary = firstField ? (d.fields?.[firstField.key] || '').trim() : '';
      const label = summary || typeLabel;
      const sub = summary ? typeLabel : (d.archived ? 'Archived' : undefined);
      items.push({
        id: `down:${d.id}`,
        label: label.length > 80 ? `${label.slice(0, 77)}…` : label,
        sublabel: sub,
        group: 'Downtime',
        keywords: [typeLabel],
        icon: Calendar,
        run: () => navigateTo({ mode: 'plan', subview: 'worldbuild' }),
      });
    });

    // Generator log: surface the most recent few per kind. Title is whatever
    // the generator stored — usually a name or one-line summary.
    const LOG_LABEL: Record<string, string> = {
      'treasure-hoard': 'Treasure', 'trinket': 'Trinket', 'mundane-shop': 'Mundane shop',
      'magic-shop': 'Magic shop', 'tavern': 'Tavern', 'tavern-name': 'Tavern name',
      'dungeon': 'Dungeon', 'settlement': 'Settlement', 'names': 'Names',
      'locations': 'Location', 'monster-roll': 'Monster', 'monster-scale': 'Scaled monster',
      'dice': 'Dice',
    };
    const LOG_TO_VIEW: Record<string, { mode: Mode; subview: string }> = {
      'names':         { mode: 'library', subview: 'generators' },
      'locations':     { mode: 'library', subview: 'generators' },
      'monster-roll':  { mode: 'library', subview: 'monsters' },
      'monster-scale': { mode: 'library', subview: 'monsters' },
      'dice':          { mode: 'run',     subview: 'dice' },
    };
    for (const kind of Object.keys(generatorLogs) as Array<keyof typeof generatorLogs>) {
      const entries = (generatorLogs[kind] || []).slice(0, 5);
      const destView = LOG_TO_VIEW[kind] || { mode: 'library' as const, subview: 'generators' };
      entries.forEach((entry) => {
        const title = (entry.title || '').trim();
        if (!title) return;
        items.push({
          id: `log:${entry.id}`,
          label: title.length > 70 ? `${title.slice(0, 67)}…` : title,
          sublabel: LOG_LABEL[kind] || kind,
          group: 'Generator log',
          icon: Wand2,
          run: () => navigateTo({ mode: destView.mode, subview: destView.subview }),
        });
      });
    }

    return items;
    // navigateTo and the action callbacks close over the latest state via the
    // setter callbacks they call; the deps below cover the fields we read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, soloMode, sortedSessionLogs, characters, generatorLogs]);

  const closePrepWizard = () => {
    setState(s => {
      const next = { ...s };
      delete next.__prepWizardOpen;
      delete next.__prepWizardStep;
      delete next.__prepWizardCompleted;
      delete next.__prepWizardStepNotes;
      return next;
    });
  };
  const startSessionFromPrep = () => {
    if (nextUp) {
      if (!window.confirm(`You have unfinished prep targets (e.g. ${nextUp.label}). Are you sure you want to start the session anyway?`)) {
        return;
      }
    }
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setState(s => {
      const next = { ...s };
      delete next.__prepWizardOpen;
      delete next.__prepWizardStep;
      delete next.__prepWizardCompleted;
      delete next.__prepWizardStepNotes;
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
