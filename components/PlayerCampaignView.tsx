'use client';

// Real-time player view. Driven entirely by the redacted SlotProjection
// published by the GM (playerShares/{token}/slots/{slotId}). Players can edit
// the small allowlisted set of PC-sheet fields (HP, conditions, notes, etc.);
// edits stage in campaigns/{campaignId}/pcWritebacks via the Web SDK and the
// GM's writeback reconciler merges them into the CRDT. Mobile-first.
//
// This file is the orchestration entry point. Data fetching and projection-
// derived state live in usePlayerCampaign; the presentational pieces
// (EntityCard, PlayerPcSheetCard, per-tab views, field rendering) live under
// components/playerCampaign/.

import React, { useState } from 'react';
import { Calendar, Map, UserCircle } from 'lucide-react';
import PlayerMapView from '@/components/maps/PlayerMapView';
import CharacterCard from './CharacterCard';
import { MusicPlayer } from './RunSessionView';
import EntityCard from './playerCampaign/EntityCard';
import PlayerPcSheetCard from './playerCampaign/PlayerPcSheetCard';
import SessionRecapsTab from './playerCampaign/SessionRecapsTab';
import PlanningTab from './playerCampaign/PlanningTab';
import GoalsTab from './playerCampaign/GoalsTab';
import ConnectionsTab from './playerCampaign/ConnectionsTab';
import { usePlayerCampaign } from './playerCampaign/usePlayerCampaign';
import type { Character } from '@/lib/character-schema';
import type { PlayerCampaignViewProps, ProjectionEntityKey } from './playerCampaign/types';

export default function PlayerCampaignView({
  token, slotId, campaignId, displayName, campaignName, onSwitch,
  playlistUrl, sessionRecaps, unredactedCharacters,
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
    isEmpty,
  } = usePlayerCampaign({ token, slotId, unredactedCharacters });

  const [openCharIds, setOpenCharIds] = useState<Record<string, boolean>>({});
  const toggleChar = (id: string) => setOpenCharIds((s) => ({ ...s, [id]: !s[id] }));
  const [openSessionIds, setOpenSessionIds] = useState<Record<string, boolean>>({});
  const toggleSession = (id: string) => setOpenSessionIds((s) => ({ ...s, [id]: !s[id] }));

  const activePlaylistUrl = playlistUrl || projection?.playlistUrl;
  const activePlaylistPlaying = projection?.playlistPlaying ?? false;
  const activePlaylistIndex = projection?.playlistIndex ?? 0;
  const activeSyncAnchor = projection?.playlistAnchor ?? null;

  return (
    <main className="min-h-screen bg-parchment p-3 sm:p-5">
      <div className="mx-auto max-w-3xl space-y-4">
        <header className="flex items-center justify-between gap-3 rounded-lg border border-rule bg-parchment-soft p-4 shadow-page">
          <div className="min-w-0">
            <div className="font-display text-[10px] uppercase tracking-[0.3em] text-brass-deep">Player View</div>
            <h1 className="truncate font-display text-xl tracking-wide text-ink sm:text-2xl">{campaignName}</h1>
          </div>
          <div className="flex flex-shrink-0 flex-col items-end">
            <span className="font-serif text-sm text-ink-soft">{displayName}</span>
            <button onClick={onSwitch} className="font-display text-[10px] uppercase tracking-wider text-crimson hover:text-wine">Switch player</button>
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
          <div className="relative flex items-center justify-between rounded border border-red-200 bg-red-50 px-4 py-3 font-serif text-sm text-red-800 shadow-card" role="alert">
            <span>{alertMessage}</span>
            <button onClick={() => setAlertMessage(null)} className="px-2 py-1 text-base font-bold text-red-500 hover:text-red-700">&times;</button>
          </div>
        )}

        {projection === undefined && (
          <p className="py-10 text-center font-serif text-sm italic text-ink-mute">Loading…</p>
        )}

        {isEmpty && (
          <div className="rounded-lg border border-rule bg-parchment-soft p-8 text-center shadow-card">
            <p className="font-serif italic text-ink-soft">Your GM hasn’t shared anything yet — check back during the session.</p>
          </div>
        )}

        {projection && tabs.length > 0 && (
          <>
            <nav className="flex flex-wrap gap-2 border-b border-rule pb-2">
              {tabs.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActive(t.id)}
                  className={`flex items-center gap-1.5 rounded-t px-3 py-1.5 font-display text-sm tracking-wide ${active === t.id ? 'border-b-2 border-crimson bg-parchment-deep text-crimson' : 'text-ink-soft hover:text-ink'}`}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </nav>

            <div className="space-y-3">
              {active === 'maps' ? (
                <PlayerMapView maps={projection.maps ?? []} />
              ) : active === 'connections' ? (
                <ConnectionsTab projection={projection} />
              ) : active === 'my_pcs' ? (
                <div className="space-y-4">
                  {myPcs.map((pc) => (
                    <PlayerPcSheetCard
                      key={pc.id}
                      pc={pc}
                      token={token}
                      slotId={slotId}
                      campaignId={campaignId}
                    />
                  ))}
                </div>
              ) : active === 'pcs' ? (
                <div className="space-y-4">
                  {partyPcs.map((pc) => (
                    <PlayerPcSheetCard
                      key={pc.id}
                      pc={pc}
                      token={token}
                      slotId={slotId}
                      campaignId={campaignId}
                    />
                  ))}
                </div>
              ) : active === 'handouts' ? (
                <div className="whitespace-pre-wrap rounded border border-rule bg-parchment p-4 font-serif text-sm leading-relaxed text-ink-soft shadow-card">
                  {projection.handouts}
                </div>
              ) : active === 'planning' ? (
                <PlanningTab planning={projection.planning} />
              ) : active === 'items' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {[...(projection.items ?? [])]
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((it) => (
                      <div key={it.id} className="space-y-1.5 rounded border border-rule bg-parchment p-3 font-serif text-sm shadow-card">
                        <div className="text-base text-ink">{it.name}</div>
                        {it.description && (
                          <p className="whitespace-pre-wrap leading-relaxed text-ink-soft">
                            {it.description}
                          </p>
                        )}
                      </div>
                    ))}
                </div>
              ) : active === 'goals' ? (
                <GoalsTab pcGoals={projection.pcGoals} />
              ) : active === 'characters' ? (
                <div className="space-y-4">
                  {unredactedCharacters && unredactedCharacters.length > 0 ? (
                    unredactedCharacters.map((c, i) => {
                      // Match the original `c.id || i` key semantics (falsy id
                      // — including '' or 0 — falls back to the index).
                      const charKey = String((c.id as string | number) || i);
                      return (
                        <CharacterCard
                          key={charKey}
                          data={c as unknown as Character}
                          open={!!openCharIds[charKey]}
                          soloMode={false}
                          onToggleOpen={() => toggleChar(charKey)}
                          onChange={() => {}} // Read-only
                          onRemove={() => {}}
                        />
                      );
                    })
                  ) : (
                    (projection.entities.characters ?? []).map((e) => (
                      <EntityCard key={e.id as string} entity={e} entityType="characters" />
                    ))
                  )}
                </div>
              ) : active === 'recaps' ? (
                <SessionRecapsTab
                  sessionRecaps={sessionRecaps}
                  openSessionIds={openSessionIds}
                  onToggleSession={toggleSession}
                />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {(projection.entities[active as ProjectionEntityKey] ?? []).map((e) => (
                    <EntityCard key={e.id as string} entity={e} entityType={active} />
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
