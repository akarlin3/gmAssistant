'use client';

// Real-time player view. Driven by the redacted SlotProjection published by
// the GM (playerShares/{token}/slots/{slotId}), organized into three clean
// sub-tabs:
//   1. Revealed World & Feed (real-time narration feed, revealed entities/maps,
//      inline "My Private Note" with 🔒 Private vs 👁️ Shared with GM toggle)
//   2. My Character & Resources (HP/Temp HP, Hit Dice, Conditions, Spell Slots,
//      Class Resources, Death Saves, and 1-tap Short/Long Rest recovery)
//   3. My Quests, Gear & Journal (quest/rumor checklist, inventory/attunement/
//      coin tracker, and session journal with per-item & batch privacy toggles)

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Globe, UserCircle, Compass, ScrollText, Sparkles } from 'lucide-react';
import PlayerMapView from '@/components/maps/PlayerMapView';
import CharacterCard from './CharacterCard';
import { MusicPlayer } from './RunSessionView';
import EntityCard from './playerCampaign/EntityCard';
import PlayerPcSheetCard from './playerCampaign/PlayerPcSheetCard';
import PlayerQuestsGearJournalTab from './playerCampaign/PlayerQuestsGearJournalTab';
import SessionRecapsTab from './playerCampaign/SessionRecapsTab';
import PlanningTab from './playerCampaign/PlanningTab';
import GoalsTab from './playerCampaign/GoalsTab';
import ConnectionsTab from './playerCampaign/ConnectionsTab';
import { usePlayerCampaign } from './playerCampaign/usePlayerCampaign';
import {
  submitPlayerUpdate,
  submitPlayerBatchUpdate,
  submitAnonymousTablePauseSignal,
} from '@/lib/playerMode/playerClient';
import {
  loadLocalTrackerState,
  loadLocalTrackerStateIdb,
  saveLocalTrackerState,
  reconcileTrackerSharingTransition,
  serializeOutboundTrackerWriteback,
  upsertAnnotation,
  toggleAnnotationShareWithGm,
  type PlayerLocalTrackerState,
} from '@/lib/playerMode/playerTrackerStorage';
import type { Character } from '@/lib/character-schema';
import type { LoreAttitudeTag, PlayerWhisperMessage } from '@/lib/pc/types';
import type { PlayerCampaignViewProps, ProjectionEntityKey } from './playerCampaign/types';
import { TopHeaderBar, type PlayerPrimaryTab } from './TopHeaderBar';
import { TableStageShell } from './tableStage/TableStageShell';
import { EntityPeekProvider } from './ui/EntityPeekDrawer';
import { GuidedEmptyState } from './ui/GuidedEmptyState';
import { MentionText } from './wiki/MentionText';
import WorldClockBar from './WorldClockBar';
import ExternalTablePiP from './ExternalTablePiP';
import WhisperDrawer from './WhisperDrawer';
import HandoutOverlay from './HandoutOverlay';
import TacticalMapStage from './TacticalMapStage';
import GeminiBridgeModal from './GeminiBridgeModal';

export type PlayerPrimarySubTab = 'world' | 'character' | 'tracker';

export default function PlayerCampaignView({
  token,
  slotId,
  campaignId,
  displayName,
  campaignName,
  onSwitch,
  playlistUrl,
  sessionRecaps,
  unredactedCharacters,
}: PlayerCampaignViewProps) {
  const {
    projection,
    myPcs,
    partyPcs,
    tabs,
    active,
    setActive,
    alertMessage,
    setAlertMessage,
  } = usePlayerCampaign({ token, slotId, unredactedCharacters });

  const [primaryTab, setPrimaryTab] = useState<PlayerPrimarySubTab>('world');
  const [headerTab, setHeaderTab] = useState<PlayerPrimaryTab>('play');
  const [selectedPcIdx, setSelectedPcIdx] = useState(0);
  const activePc = myPcs[selectedPcIdx] ?? myPcs[0];
  const trackerPcKey = activePc?.id ?? slotId ?? 'default';

  const handleHeaderTabChange = (nextTab: PlayerPrimaryTab) => {
    setHeaderTab(nextTab);
    if (nextTab === 'sheet') setPrimaryTab('character');
    else if (nextTab === 'quests' || nextTab === 'gear') setPrimaryTab('tracker');
    else setPrimaryTab('world');
  };

  const handlePrimarySubTabChange = (nextSub: PlayerPrimarySubTab) => {
    setPrimaryTab(nextSub);
    if (nextSub === 'character') setHeaderTab('sheet');
    else if (nextSub === 'tracker') setHeaderTab('quests');
    else setHeaderTab('play');
  };

  const [trackerState, setTrackerState] = useState<PlayerLocalTrackerState>(() =>
    loadLocalTrackerState(token, trackerPcKey),
  );

  // Hydrate from localStorage + IndexedDB when token or active PC changes
  useEffect(() => {
    const syncState = loadLocalTrackerState(token, trackerPcKey);
    setTrackerState(syncState);
    let cancelled = false;
    loadLocalTrackerStateIdb(token, trackerPcKey).then((idbState) => {
      if (!cancelled && (idbState.updatedAtMs ?? 0) >= (syncState.updatedAtMs ?? 0)) {
        setTrackerState(idbState);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [token, trackerPcKey]);

  const handleUpdateTrackerState = useCallback(
    async (nextRaw: PlayerLocalTrackerState) => {
      const reconciled = reconcileTrackerSharingTransition(trackerState, nextRaw);
      setTrackerState(reconciled);
      saveLocalTrackerState(token, trackerPcKey, reconciled);

      if (activePc && campaignId && token && slotId) {
        const outbound = serializeOutboundTrackerWriteback(reconciled);
        const updates: Record<string, unknown> = {
          sharedQuests: outbound.sharedQuests,
          sharedAnnotations: outbound.sharedAnnotations,
          sharedJournal: outbound.sharedJournal,
        };
        if (outbound.sharedTombstones && outbound.sharedTombstones.length > 0) {
          updates.sharedTombstones = outbound.sharedTombstones;
        }
        try {
          await submitPlayerBatchUpdate({
            campaignId,
            shareToken: token,
            slotId,
            pcId: activePc.id,
            updates,
          });
          // Clear pending tombstones once staged
          if ((reconciled.tombstones ?? []).length > 0) {
            const cleaned: PlayerLocalTrackerState = {
              ...reconciled,
              tombstones: [],
              pendingTombstones: [],
            };
            setTrackerState(cleaned);
            saveLocalTrackerState(token, trackerPcKey, cleaned);
          }
        } catch (err) {
          console.error('Failed to stage shared tracker writeback:', err);
        }
      }
    },
    [trackerState, token, trackerPcKey, activePc, campaignId, slotId],
  );

  const handleSaveEntityAnnotation = useCallback(
    (data: {
      entityId: string;
      entityName: string;
      entityCategory: string;
      attitudeTag?: LoreAttitudeTag;
      privateNotes: string;
      sharedWithGm: boolean;
    }) => {
      const next = upsertAnnotation(trackerState, {
        entityId: data.entityId,
        entityName: data.entityName,
        entityCategory: data.entityCategory,
        attitudeTag: data.attitudeTag,
        privateNotes: data.privateNotes,
        sharedWithGm: data.sharedWithGm,
      });
      handleUpdateTrackerState(next);
    },
    [trackerState, handleUpdateTrackerState],
  );

  const handleToggleEntityAnnotationShare = useCallback(
    (entityId: string, sharedWithGm: boolean) => {
      const next = toggleAnnotationShareWithGm(trackerState, entityId, sharedWithGm);
      handleUpdateTrackerState(next);
    },
    [trackerState, handleUpdateTrackerState],
  );

  const revealedEntitiesList = useMemo(() => {
    if (!projection?.entities) return [];
    const list: Array<{ id: string; name: string; category: string }> = [];
    for (const [cat, items] of Object.entries(projection.entities)) {
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        const id = (item.id as string) || '';
        const name = (item.name as string) || (item.text as string) || id;
        if (id) list.push({ id, name, category: cat });
      }
    }
    return list;
  }, [projection?.entities]);

  const annotationByEntityId = useMemo(() => {
    const map = new Map<string, (typeof trackerState.annotations)[number]>();
    for (const ann of trackerState.annotations) {
      map.set(ann.entityId, ann);
    }
    return map;
  }, [trackerState.annotations]);

  const [openCharIds, setOpenCharIds] = useState<Record<string, boolean>>({});
  const toggleChar = (id: string) => setOpenCharIds((s) => ({ ...s, [id]: !s[id] }));
  const [openSessionIds, setOpenSessionIds] = useState<Record<string, boolean>>({});
  const toggleSession = (id: string) => setOpenSessionIds((s) => ({ ...s, [id]: !s[id] }));

  const activePlaylistUrl = playlistUrl || projection?.playlistUrl;
  const activePlaylistPlaying = projection?.playlistPlaying ?? false;
  const activePlaylistIndex = projection?.playlistIndex ?? 0;
  const activeSyncAnchor = projection?.playlistAnchor ?? null;

  // Filter world sub-navigation tabs (exclude 'my_pcs' since it has its own primary tab)
  const worldFilterTabs = useMemo(
    () => tabs.filter((t) => t.id !== 'my_pcs'),
    [tabs],
  );

  const effectiveWorldTab = useMemo(() => {
    if (active && active !== 'my_pcs' && worldFilterTabs.some((t) => t.id === active)) {
      return active;
    }
    return worldFilterTabs[0]?.id ?? 'recaps';
  }, [active, worldFilterTabs]);

  const peekCampaignData = useMemo(
    () =>
      projection?.entities
        ? {
            npcs: projection.entities.npcs,
            locations: projection.entities.locations,
            factions: projection.entities.factions,
            clocks: projection.entities.clocks,
            characters: projection.entities.characters,
          }
        : null,
    [projection?.entities],
  );

  const [geminiModalOpen, setGeminiModalOpen] = useState(false);
  const [localPlayerSentWhispers, setLocalPlayerSentWhispers] = useState<PlayerWhisperMessage[]>([]);

  return (
    <EntityPeekProvider playerSafe campaignData={peekCampaignData}>
      <main className="min-h-screen w-full max-w-none bg-[var(--bg-canvas)] text-[var(--text-primary)]">
        <TopHeaderBar
          isLivePlayerShareView
          role="player"
          campaignName={campaignName}
          playerDisplayName={displayName}
          onSwitchPlayerSlot={onSwitch}
          playerActiveTab={headerTab}
          onPlayerTabChange={handleHeaderTabChange}
          onSyncCapsule={() => handleUpdateTrackerState(trackerState)}
        />

        <div className="w-full max-w-none space-y-3 px-3 py-2 sm:px-5">
          {/* Live Session Music (Small Single Line Widget) */}
          {activePlaylistUrl && (
            <MusicPlayer
              playlistUrl={activePlaylistUrl}
              readOnly={true}
              isPlayingProp={activePlaylistPlaying}
              playlistIndexProp={activePlaylistIndex}
              syncAnchor={activeSyncAnchor}
            />
          )}

          {alertMessage && (
            <div
              className="relative flex items-center justify-between rounded border border-red-200 bg-red-50 px-4 py-3 font-serif text-sm text-red-800 shadow-card"
              role="alert"
            >
              <span>{alertMessage}</span>
              <button
                onClick={() => setAlertMessage(null)}
                className="px-2 py-1 text-base font-bold text-red-500 hover:text-red-700"
              >
                &times;
              </button>
            </div>
          )}

          {projection === undefined && (
            <p className="py-10 text-center font-serif text-sm italic text-ink-mute">Loading…</p>
          )}

          {projection && (
            <>
              {/* Projected In-World Calendar & Clock (when Party-visible) */}
              {projection.worldClock && (
                <WorldClockBar role="player" worldClock={projection.worldClock} />
              )}

              {/* Tabletop Ergonomics, Two-Way Whispers, Handouts & Safety Shield Toolbar */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2 shadow-sm">
                <ExternalTablePiP
                  role="shared-player"
                  campaignName={campaignName}
                  activePc={(activePc as any) ?? null}
                  latestFeedLine={
                    projection.sessionLog && projection.sessionLog.length > 0
                      ? String(projection.sessionLog[projection.sessionLog.length - 1]?.text ?? '')
                      : undefined
                  }
                  onAdjustPcHp={(delta) => {
                    if (!activePc || !campaignId || !token || !slotId) return;
                    const maxHpVal = Number(activePc.maxHp ?? activePc.hp?.max ?? 10) || 10;
                    const curHpVal = Number(activePc.currentHp ?? activePc.hp?.current ?? maxHpVal);
                    const nextHp = Math.max(0, Math.min(maxHpVal, curHpVal + delta));
                    void submitPlayerUpdate({
                      campaignId,
                      shareToken: token,
                      slotId,
                      pcId: activePc.id,
                      field: 'currentHp',
                      value: nextHp,
                    });
                  }}
                  onAdjustPcAc={(delta) => {
                    if (!activePc || !campaignId || !token || !slotId) return;
                    const curAcVal = Number(activePc.ac ?? 10) || 10;
                    const nextAc = Math.max(1, curAcVal + delta);
                    void submitPlayerUpdate({
                      campaignId,
                      shareToken: token,
                      slotId,
                      pcId: activePc.id,
                      field: 'ac',
                      value: nextAc,
                    });
                  }}
                />

                <div className="flex flex-wrap items-center gap-2">
                  <WhisperDrawer
                    role="player"
                    activeSlotId={slotId}
                    playerWhispers={projection.whispers ?? []}
                    playerSentWhispers={[
                      ...((activePc?.playerWhispers as PlayerWhisperMessage[] | undefined) ?? []),
                      ...localPlayerSentWhispers,
                    ]}
                    tableSafetyEnabled={projection.tableSafetyEnabled !== false}
                    onPlayerSendWhisperToGm={(msg) => {
                      const nextList = [
                        ...((activePc?.playerWhispers as PlayerWhisperMessage[] | undefined) ?? []),
                        ...localPlayerSentWhispers,
                        msg,
                      ].slice(-50);
                      setLocalPlayerSentWhispers((prev) => [...prev, msg]);
                      if (activePc && campaignId && token && slotId) {
                        void submitPlayerUpdate({
                          campaignId,
                          shareToken: token,
                          slotId,
                          pcId: activePc.id,
                          field: 'playerWhispers',
                          value: nextList,
                        });
                      }
                    }}
                    onRequestAnonymousTablePause={() => {
                      if (campaignId && token) {
                        void submitAnonymousTablePauseSignal({
                          campaignId,
                          shareToken: token,
                        });
                      }
                    }}
                  />

                  <HandoutOverlay
                    role="player"
                    handouts={projection.handoutGallery ?? []}
                    activeFlash={projection.activeHandoutFlash ?? null}
                  />

                  <button
                    type="button"
                    onClick={() => setGeminiModalOpen(true)}
                    className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 py-1 text-xs font-semibold text-amber-500 hover:bg-amber-500/25"
                    title="Open Zero-Key Gemini Journal & Recap Bridge"
                  >
                    <Sparkles size={13} /> Gemini Journal Bridge
                  </button>
                </div>
              </div>

              {/* Primary 3 Sub-Tabs Navigation */}
              <div
                role="tablist"
                aria-label="Player Mode Sub-Tabs"
                className="grid grid-cols-1 gap-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-1.5 shadow-sm sm:grid-cols-3"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={primaryTab === 'world'}
                  onClick={() => handlePrimarySubTabChange('world')}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 font-sans text-xs font-medium transition-all ${
                    primaryTab === 'world'
                      ? 'bg-[var(--accent-primary)] text-white shadow-sm'
                      : 'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Globe size={15} />
                  <span>Revealed World &amp; Table Stage</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={primaryTab === 'character'}
                  onClick={() => handlePrimarySubTabChange('character')}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 font-sans text-xs font-medium transition-all ${
                    primaryTab === 'character'
                      ? 'bg-[var(--accent-primary)] text-white shadow-sm'
                      : 'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <UserCircle size={15} />
                  <span>My Character &amp; Resources</span>
                </button>

                <button
                  type="button"
                  role="tab"
                  aria-selected={primaryTab === 'tracker'}
                  onClick={() => handlePrimarySubTabChange('tracker')}
                  className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2 font-sans text-xs font-medium transition-all ${
                    primaryTab === 'tracker'
                      ? 'bg-[var(--accent-primary)] text-white shadow-sm'
                      : 'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
                  }`}
                >
                  <Compass size={15} />
                  <span>My Quests, Gear &amp; Journal</span>
                </button>
              </div>

              {/* PC Selector when the slot owns multiple PCs */}
              {myPcs.length > 1 && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3 py-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    Active Character:
                  </span>
                  {myPcs.map((p, idx) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPcIdx(idx)}
                      className={`rounded-md border px-2.5 py-1 font-display text-xs font-semibold ${
                        selectedPcIdx === idx
                          ? 'border-[var(--accent-primary)] bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]'
                          : 'border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-muted)]'
                      }`}
                    >
                      {p.name || p.id}
                    </button>
                  ))}
                </div>
              )}

              {/* SUB-TAB 1: 3-Pane Table Stage (Revealed World & Live Narration Feed + Character HUD) */}
              {primaryTab === 'world' && (
                <div className="-mx-3 sm:-mx-5">
                  <TableStageShell
                    rightHudTitle="My Character HUD"
                    campaignData={peekCampaignData ?? undefined}
                    centerStage={
                      <div className="space-y-4">
                        {/* Real-Time Session Log Narration Feed with @-Mention Peek */}
                        {projection.sessionLog && projection.sessionLog.length > 0 && (
                          <section className="space-y-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 shadow-sm">
                            <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] pb-2">
                              <ScrollText size={16} className="text-[var(--accent-primary)]" />
                              <h2 className="font-display text-base font-semibold tracking-wide text-[var(--text-primary)]">
                                Live Session Narration Feed
                              </h2>
                            </div>
                            <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                              {projection.sessionLog.map((entry, idx) => (
                                <div
                                  key={String(entry.id ?? idx)}
                                  className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-3 py-2 font-sans text-xs text-[var(--text-primary)]"
                                >
                                  <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                                    <span className="font-mono uppercase">Session Feed</span>
                                    {entry.at ? (
                                      <span className="font-mono tabular-nums">
                                        {new Date(String(entry.at)).toLocaleTimeString([], {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })}
                                      </span>
                                    ) : null}
                                  </div>
                                  <p className="mt-0.5 whitespace-pre-wrap leading-relaxed">
                                    <MentionText
                                      text={String(entry.text ?? '')}
                                      campaignData={peekCampaignData}
                                    />
                                  </p>
                                </div>
                              ))}
                            </div>
                          </section>
                        )}

                        {worldFilterTabs.length === 0 ? (
                          <GuidedEmptyState
                            title="No World Entities Revealed Yet"
                            description="Your GM hasn't revealed any NPCs, locations, or maps to your slot yet — check back during the session."
                          />
                        ) : (
                          <>
                            <nav className="flex flex-wrap gap-1.5 border-b border-[var(--border-subtle)] pb-2">
                              {worldFilterTabs.map((t) => (
                                <button
                                  key={t.id}
                                  type="button"
                                  onClick={() => setActive(t.id)}
                                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-sans text-xs font-medium transition-colors ${
                                    effectiveWorldTab === t.id
                                      ? 'bg-[var(--accent-primary)] text-white shadow-sm'
                                      : 'bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)]'
                                  }`}
                                >
                                  {t.icon} {t.label}
                                </button>
                              ))}
                            </nav>

                            <div className="space-y-3">
                              {effectiveWorldTab === 'maps' ? (
                                <div className="space-y-3">
                                  <TacticalMapStage
                                    role="shared-player"
                                    maps={projection.maps ?? []}
                                    pcs={partyPcs as any}
                                    activePcId={activePc?.id}
                                    activePcColor="#38bdf8"
                                    onPlayerMoveOwnToken={(pos) => {
                                      if (!activePc || !campaignId || !token || !slotId) return;
                                      void submitPlayerUpdate({
                                        campaignId,
                                        shareToken: token,
                                        slotId,
                                        pcId: activePc.id,
                                        field: 'tokenPosition',
                                        value: pos,
                                      });
                                    }}
                                    onPlayerEmitPing={(ping) => {
                                      if (!activePc || !campaignId || !token || !slotId) return;
                                      void submitPlayerUpdate({
                                        campaignId,
                                        shareToken: token,
                                        slotId,
                                        pcId: activePc.id,
                                        field: 'mapPing',
                                        value: ping,
                                      });
                                    }}
                                  />
                                  <PlayerMapView maps={projection.maps ?? []} />
                                </div>
                              ) : effectiveWorldTab === 'connections' ? (
                                <ConnectionsTab projection={projection} />
                              ) : effectiveWorldTab === 'pcs' ? (
                                <div className="space-y-4">
                                  {partyPcs.map((pc) => (
                                    <EntityCard
                                      key={pc.id}
                                      entity={pc as unknown as Record<string, unknown>}
                                      entityType="pcs"
                                      annotation={annotationByEntityId.get(pc.id)}
                                      onSaveAnnotation={handleSaveEntityAnnotation}
                                      onToggleAnnotationShare={handleToggleEntityAnnotationShare}
                                    />
                                  ))}
                                </div>
                              ) : effectiveWorldTab === 'handouts' ? (
                                <div className="whitespace-pre-wrap rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 font-sans text-sm leading-relaxed text-[var(--text-primary)] shadow-sm">
                                  {projection.handouts}
                                </div>
                              ) : effectiveWorldTab === 'planning' ? (
                                <PlanningTab planning={projection.planning} />
                              ) : effectiveWorldTab === 'items' ? (
                                <div className="grid gap-3 sm:grid-cols-2">
                                  {[...(projection.items ?? [])]
                                    .sort((a, b) => a.name.localeCompare(b.name))
                                    .map((it) => (
                                      <div
                                        key={it.id}
                                        className="space-y-1.5 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3.5 font-sans text-sm shadow-sm"
                                      >
                                        <div className="font-display text-base font-semibold text-[var(--text-primary)]">{it.name}</div>
                                        {it.description && (
                                          <p className="whitespace-pre-wrap leading-relaxed text-[var(--text-muted)]">
                                            {it.description}
                                          </p>
                                        )}
                                      </div>
                                    ))}
                                </div>
                              ) : effectiveWorldTab === 'goals' ? (
                                <GoalsTab pcGoals={projection.pcGoals} />
                              ) : effectiveWorldTab === 'characters' ? (
                                <div className="space-y-4">
                                  {unredactedCharacters && unredactedCharacters.length > 0 ? (
                                    unredactedCharacters.map((c, i) => {
                                      const charKey = String((c.id as string | number) || i);
                                      return (
                                        <CharacterCard
                                          key={charKey}
                                          data={c as unknown as Character}
                                          open={!!openCharIds[charKey]}
                                          soloMode={false}
                                          onToggleOpen={() => toggleChar(charKey)}
                                          onChange={() => {}}
                                          onRemove={() => {}}
                                        />
                                      );
                                    })
                                  ) : (
                                    (projection.entities.characters ?? []).map((e) => {
                                      const eid = (e.id as string) || '';
                                      return (
                                        <div key={eid} id={`entity-${eid}`}>
                                          <EntityCard
                                            entity={e}
                                            entityType="characters"
                                            annotation={annotationByEntityId.get(eid)}
                                            onSaveAnnotation={handleSaveEntityAnnotation}
                                            onToggleAnnotationShare={handleToggleEntityAnnotationShare}
                                          />
                                        </div>
                                      );
                                    })
                                  )}
                                </div>
                              ) : effectiveWorldTab === 'recaps' ? (
                                <SessionRecapsTab
                                  sessionRecaps={sessionRecaps}
                                  openSessionIds={openSessionIds}
                                  onToggleSession={toggleSession}
                                />
                              ) : (
                                <div className="grid gap-3 sm:grid-cols-2">
                                  {(projection.entities[effectiveWorldTab as ProjectionEntityKey] ?? []).map((e) => {
                                    const eid = (e.id as string) || '';
                                    return (
                                      <div key={eid} id={`entity-${eid}`}>
                                        <EntityCard
                                          entity={e}
                                          entityType={effectiveWorldTab}
                                          annotation={annotationByEntityId.get(eid)}
                                          onSaveAnnotation={handleSaveEntityAnnotation}
                                          onToggleAnnotationShare={handleToggleEntityAnnotationShare}
                                        />
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    }
                    rightHudRail={
                      myPcs.length === 0 ? (
                        <GuidedEmptyState
                          title="Claim Your Character Slot"
                          description={`Your GM hasn't assigned a character sheet to your slot (${displayName}) yet.`}
                          actions={
                            onSwitch
                              ? [{ label: 'Switch Player Slot', onClick: onSwitch, primary: true }]
                              : []
                          }
                        />
                      ) : (
                        <PlayerPcSheetCard
                          key={activePc.id}
                          pc={activePc}
                          token={token}
                          slotId={slotId}
                          campaignId={campaignId}
                        />
                      )
                    }
                  />
                </div>
              )}

              {/* SUB-TAB 2: My Character & Resources */}
              {primaryTab === 'character' && (
                <div className="space-y-4">
                  {myPcs.length === 0 ? (
                    <GuidedEmptyState
                      title="Claim Your Character Slot"
                      description={`Your GM hasn't assigned a character sheet to your player slot (${displayName}) yet.`}
                      actions={
                        onSwitch
                          ? [{ label: 'Switch Player Slot', onClick: onSwitch, primary: true }]
                          : []
                      }
                    />
                  ) : (
                    <PlayerPcSheetCard
                      key={activePc.id}
                      pc={activePc}
                      token={token}
                      slotId={slotId}
                      campaignId={campaignId}
                    />
                  )}
                </div>
              )}

              {/* SUB-TAB 3: My Quests, Gear & Journal */}
              {primaryTab === 'tracker' && (
                <PlayerQuestsGearJournalTab
                  pc={activePc}
                  token={token}
                  slotId={slotId}
                  campaignId={campaignId}
                  trackerState={trackerState}
                  onUpdateTrackerState={handleUpdateTrackerState}
                  revealedEntities={revealedEntitiesList}
                />
              )}

              <GeminiBridgeModal
                open={geminiModalOpen}
                onClose={() => setGeminiModalOpen(false)}
                campaignId={campaignId || 'shared_player'}
                campaignName={campaignName}
                campaignData={{
                  __playerCompanionQuests: trackerState.quests,
                  __playerCompanionJournal: trackerState.journal,
                }}
                role="player"
                playerState={{
                  pcName: activePc?.name ?? displayName,
                  quests: trackerState.quests,
                  journal: trackerState.journal,
                  revealedEntities: revealedEntitiesList,
                }}
                onApplyCampaignData={(nextData) => {
                  const nextJournal = Array.isArray(nextData.__playerCompanionJournal)
                    ? nextData.__playerCompanionJournal
                    : trackerState.journal;
                  const nextQuests = Array.isArray(nextData.__playerCompanionQuests)
                    ? nextData.__playerCompanionQuests
                    : trackerState.quests;
                  void handleUpdateTrackerState({
                    ...trackerState,
                    journal: nextJournal,
                    quests: nextQuests,
                  });
                }}
              />
            </>
          )}
        </div>
      </main>
    </EntityPeekProvider>
  );
}
