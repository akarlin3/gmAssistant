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
import { Globe, UserCircle, Compass, ScrollText } from 'lucide-react';
import { AveryCorpEmblem } from './AveryCorpEmblem';
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
import { submitPlayerBatchUpdate } from '@/lib/playerMode/playerClient';
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
import type { LoreAttitudeTag } from '@/lib/pc/types';
import type { PlayerCampaignViewProps, ProjectionEntityKey } from './playerCampaign/types';

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
  const [selectedPcIdx, setSelectedPcIdx] = useState(0);
  const activePc = myPcs[selectedPcIdx] ?? myPcs[0];
  const trackerPcKey = activePc?.id ?? slotId ?? 'default';

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

  return (
    <main className="min-h-screen bg-parchment p-3 sm:p-5">
      <div className="mx-auto max-w-4xl space-y-4">
        <header className="flex items-center justify-between gap-3 rounded-lg border border-rule bg-parchment-soft p-4 shadow-page">
          <div className="flex min-w-0 items-center gap-3">
            <AveryCorpEmblem
              size={32}
              variant="image"
              cropMode="full-seal"
              showPreviewPopover
              ariaLabel="AveryCorp Institute Player View Seal"
            />
            <div className="min-w-0">
              <div className="font-display text-[10px] uppercase tracking-[0.3em] text-brass-deep">
                Player View &amp; Companion
              </div>
              <h1 className="truncate font-display text-xl tracking-wide text-ink sm:text-2xl">
                {campaignName}
              </h1>
            </div>
          </div>
          <div className="flex flex-shrink-0 flex-col items-end">
            <span className="font-serif text-sm text-ink-soft">{displayName}</span>
            <button
              onClick={onSwitch}
              className="font-display text-[10px] uppercase tracking-wider text-crimson hover:text-wine"
            >
              Switch player
            </button>
          </div>
        </header>

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
            {/* Primary 3 Sub-Tabs Navigation */}
            <div
              role="tablist"
              aria-label="Player Mode Sub-Tabs"
              className="grid grid-cols-1 gap-2 rounded-lg border border-rule bg-parchment-soft p-1.5 shadow-sm sm:grid-cols-3"
            >
              <button
                type="button"
                role="tab"
                aria-selected={primaryTab === 'world'}
                onClick={() => setPrimaryTab('world')}
                className={`flex items-center justify-center gap-2 rounded-md px-3 py-2.5 font-display text-xs uppercase tracking-wider transition-all ${
                  primaryTab === 'world'
                    ? 'border border-wax/40 bg-wax text-ivory shadow-sm'
                    : 'text-ink-soft hover:bg-parchment hover:text-ink'
                }`}
              >
                <Globe size={15} />
                <span>Revealed World &amp; Feed</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={primaryTab === 'character'}
                onClick={() => setPrimaryTab('character')}
                className={`flex items-center justify-center gap-2 rounded-md px-3 py-2.5 font-display text-xs uppercase tracking-wider transition-all ${
                  primaryTab === 'character'
                    ? 'border border-wax/40 bg-wax text-ivory shadow-sm'
                    : 'text-ink-soft hover:bg-parchment hover:text-ink'
                }`}
              >
                <UserCircle size={15} />
                <span>My Character &amp; Resources</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={primaryTab === 'tracker'}
                onClick={() => setPrimaryTab('tracker')}
                className={`flex items-center justify-center gap-2 rounded-md px-3 py-2.5 font-display text-xs uppercase tracking-wider transition-all ${
                  primaryTab === 'tracker'
                    ? 'border border-wax/40 bg-wax text-ivory shadow-sm'
                    : 'text-ink-soft hover:bg-parchment hover:text-ink'
                }`}
              >
                <Compass size={15} />
                <span>My Quests, Gear &amp; Journal</span>
              </button>
            </div>

            {/* PC Selector when the slot owns multiple PCs */}
            {myPcs.length > 1 && (primaryTab === 'character' || primaryTab === 'tracker') && (
              <div className="flex flex-wrap items-center gap-2 rounded border border-rule bg-parchment-soft px-3 py-2">
                <span className="font-mono text-[10px] uppercase tracking-wider text-ink-soft">
                  Active Character:
                </span>
                {myPcs.map((p, idx) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPcIdx(idx)}
                    className={`rounded border px-2.5 py-1 font-display text-xs ${
                      selectedPcIdx === idx
                        ? 'border-wax bg-wax/15 text-wax font-semibold'
                        : 'border-rule bg-parchment text-ink-soft'
                    }`}
                  >
                    {p.name || p.id}
                  </button>
                ))}
              </div>
            )}

            {/* SUB-TAB 1: Revealed World & Feed */}
            {primaryTab === 'world' && (
              <div className="space-y-4">
                {/* Real-Time Session Log Narration Feed */}
                {projection.sessionLog && projection.sessionLog.length > 0 && (
                  <section className="space-y-2 rounded-lg border border-rule bg-parchment p-4 shadow-card">
                    <div className="flex items-center gap-2 border-b border-rule pb-2">
                      <ScrollText size={16} className="text-wax" />
                      <h2 className="font-display text-sm uppercase tracking-wider text-ink">
                        Live Session Narration Feed
                      </h2>
                    </div>
                    <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                      {projection.sessionLog.map((entry, idx) => (
                        <div
                          key={String(entry.id ?? idx)}
                          className="rounded border border-rule/60 bg-parchment-soft px-3 py-2 font-serif text-xs text-ink"
                        >
                          <div className="flex items-center justify-between text-[10px] text-ink-faint">
                            <span className="font-mono uppercase">Session Feed</span>
                            {entry.at ? (
                              <span className="font-mono">
                                {new Date(String(entry.at)).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })}
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-0.5 whitespace-pre-wrap leading-relaxed">{String(entry.text ?? '')}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {worldFilterTabs.length === 0 ? (
                  <div className="rounded-lg border border-rule bg-parchment-soft p-8 text-center shadow-card">
                    <p className="font-serif italic text-ink-soft">
                      Your GM hasn’t revealed any entities or maps yet — check back during the session.
                    </p>
                  </div>
                ) : (
                  <>
                    <nav className="flex flex-wrap gap-2 border-b border-rule pb-2">
                      {worldFilterTabs.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setActive(t.id)}
                          className={`flex items-center gap-1.5 rounded-t px-3 py-1.5 font-display text-sm tracking-wide ${
                            effectiveWorldTab === t.id
                              ? 'border-b-2 border-crimson bg-parchment-deep text-crimson'
                              : 'text-ink-soft hover:text-ink'
                          }`}
                        >
                          {t.icon} {t.label}
                        </button>
                      ))}
                    </nav>

                    <div className="space-y-3">
                      {effectiveWorldTab === 'maps' ? (
                        <PlayerMapView maps={projection.maps ?? []} />
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
                        <div className="whitespace-pre-wrap rounded border border-rule bg-parchment p-4 font-serif text-sm leading-relaxed text-ink-soft shadow-card">
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
                                className="space-y-1.5 rounded border border-rule bg-parchment p-3 font-serif text-sm shadow-card"
                              >
                                <div className="text-base text-ink">{it.name}</div>
                                {it.description && (
                                  <p className="whitespace-pre-wrap leading-relaxed text-ink-soft">
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
            )}

            {/* SUB-TAB 2: My Character & Resources */}
            {primaryTab === 'character' && (
              <div className="space-y-4">
                {myPcs.length === 0 ? (
                  <div className="rounded-lg border border-rule bg-parchment-soft p-8 text-center shadow-card">
                    <p className="font-serif italic text-ink-soft">
                      Your GM hasn’t assigned a character sheet to your player slot ({displayName}) yet.
                    </p>
                  </div>
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
          </>
        )}
      </div>
    </main>
  );
}
