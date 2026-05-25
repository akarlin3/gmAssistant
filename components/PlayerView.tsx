'use client';

import React, { useState } from 'react';
import { type Campaign } from '@/lib/firebase/campaigns';
import { Users, ScrollText, Map, User, BookOpen, Music, ChevronDown, ChevronRight } from 'lucide-react';
import CharacterCard from './CharacterCard';
import { AccountMenu } from './AccountMenu';
import { MusicPlayer } from './RunSessionView';

export default function PlayerView({ campaign, userEmail }: { campaign: Campaign, userEmail: string }) {
  const [activeTab, setActiveTab] = useState<'characters' | 'recaps' | 'lore'>('characters');
  const [musicOpen, setMusicOpen] = useState(true);

  const playlistUrl = campaign.data.__sessionPlaylist || '';
  const characters = Array.isArray(campaign.data.characters) ? campaign.data.characters : [];
  const sessionLogs = Array.isArray(campaign.data.sessionLogs) ? campaign.data.sessionLogs : [];
  const npcs = Array.isArray(campaign.data.npcs) ? campaign.data.npcs.filter(n => n.isPublic) : [];
  const locations = Array.isArray(campaign.data.locations) ? campaign.data.locations.filter(l => l.isPublic) : [];
  const handouts = campaign.data.handouts || '';

  // Simple read-only toggle state for character cards
  const [openCharIds, setOpenCharIds] = useState<Record<string, boolean>>({});
  const toggleChar = (id: string) => setOpenCharIds(s => ({ ...s, [id]: !s[id] }));

  return (
    <main className="min-h-screen p-3 sm:p-5 md:p-8 bg-parchment">
      <div className="max-w-4xl mx-auto space-y-4">
        
        {/* Header */}
        <header className="bg-parchment-soft border border-rule rounded-lg shadow-page p-4 flex items-center justify-between">
          <div>
            <div className="font-display text-xs uppercase tracking-[0.3em] text-brass-deep mb-1">
              Player Mode
            </div>
            <h1 className="font-display text-2xl tracking-wide text-ink">{campaign.name}</h1>
          </div>
          <AccountMenu />
        </header>

        {/* Live Session Music (Pulsing Widget) */}
        {playlistUrl && (
          <div className="bg-parchment-soft border border-rule rounded-lg shadow-page p-4 space-y-3">
            <button
              onClick={() => setMusicOpen(!musicOpen)}
              className="flex w-full items-center justify-between text-left focus:outline-none"
            >
              <div className="flex items-center gap-2">
                <div className="relative flex items-center justify-center">
                  <Music className="text-crimson" size={18} />
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-crimson opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-crimson"></span>
                  </span>
                </div>
                <div>
                  <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
                    Session Ambiance
                  </div>
                  <h2 className="font-display text-sm tracking-wide text-ink">Live Music from GM</h2>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[11px] font-serif text-ink-mute italic">
                  {musicOpen ? 'Hide player' : 'Show player'}
                </span>
                {musicOpen ? <ChevronDown size={16} className="text-ink-mute" /> : <ChevronRight size={16} className="text-ink-mute" />}
              </div>
            </button>
            {musicOpen && (
              <div className="border-t border-rule/60 pt-3">
                <MusicPlayer playlistUrl={playlistUrl} readOnly={true} />
              </div>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex gap-2 border-b border-rule pb-2">
          <button
            onClick={() => setActiveTab('characters')}
            className={`px-4 py-2 font-display text-sm tracking-wide rounded-t ${
              activeTab === 'characters' 
                ? 'bg-parchment-deep text-crimson border-b-2 border-crimson' 
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            <div className="flex items-center gap-2"><Users size={16} /> Characters</div>
          </button>
          <button
            onClick={() => setActiveTab('recaps')}
            className={`px-4 py-2 font-display text-sm tracking-wide rounded-t ${
              activeTab === 'recaps' 
                ? 'bg-parchment-deep text-crimson border-b-2 border-crimson' 
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            <div className="flex items-center gap-2"><ScrollText size={16} /> Session Recaps</div>
          </button>
          <button
            onClick={() => setActiveTab('lore')}
            className={`px-4 py-2 font-display text-sm tracking-wide rounded-t ${
              activeTab === 'lore' 
                ? 'bg-parchment-deep text-crimson border-b-2 border-crimson' 
                : 'text-ink-soft hover:text-ink'
            }`}
          >
            <div className="flex items-center gap-2"><BookOpen size={16} /> Lore & Handouts</div>
          </button>
        </div>

        {/* Content */}
        <div className="py-4">
          
          {activeTab === 'characters' && (
            <div className="space-y-4">
              {characters.length === 0 ? (
                <div className="text-center italic text-ink-mute font-serif py-10">No characters have been added to this campaign yet.</div>
              ) : (
                characters.map((c: any, i: number) => (
                  <CharacterCard
                    key={c.id || i}
                    data={c}
                    open={!!openCharIds[c.id || i]}
                    soloMode={false}
                    onToggleOpen={() => toggleChar(c.id || i)}
                    onChange={() => {}} // Read-only
                    onRemove={() => {}}
                  />
                ))
              )}
            </div>
          )}

          {activeTab === 'recaps' && (
            <div className="space-y-6">
              {sessionLogs.length === 0 ? (
                <div className="text-center italic text-ink-mute font-serif py-10">No session recaps available yet.</div>
              ) : (
                sessionLogs.sort((a: any, b: any) => (b.date || '').localeCompare(a.date || '')).map((log: any, i: number) => (
                  <div key={log.id || i} className="bg-parchment-soft border border-rule rounded p-4 shadow-card">
                    <div className="flex justify-between items-baseline mb-3 border-b border-rule pb-2">
                      <h3 className="font-display text-lg tracking-wide text-ink">{log.title || 'Untitled Session'}</h3>
                      <span className="font-serif text-sm text-ink-mute italic">{log.date}</span>
                    </div>
                    <div className="font-serif text-sm text-ink-soft whitespace-pre-wrap leading-relaxed">
                      {log.body || 'No notes.'}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === 'lore' && (
            <div className="space-y-8">
              {/* Handouts */}
              <section>
                <h2 className="font-display text-xl tracking-wide text-brass-deep mb-3 border-b border-rule/60 pb-1 flex items-center gap-2">
                  <ScrollText size={18} /> Public Handouts
                </h2>
                {handouts.trim() ? (
                  <div className="bg-parchment-soft border border-rule rounded p-4 shadow-card font-serif text-sm text-ink-soft whitespace-pre-wrap leading-relaxed">
                    {handouts}
                  </div>
                ) : (
                  <div className="italic text-ink-mute font-serif">No handouts available.</div>
                )}
              </section>

              {/* NPCs */}
              {npcs.length > 0 && (
                <section>
                  <h2 className="font-display text-xl tracking-wide text-brass-deep mb-3 border-b border-rule/60 pb-1 flex items-center gap-2">
                    <User size={18} /> Known NPCs
                  </h2>
                  <div className="grid md:grid-cols-2 gap-4">
                    {npcs.map((n: any, i: number) => (
                      <div key={i} className="bg-parchment border border-rule rounded p-3 shadow-card space-y-2">
                        <div className="font-display text-lg tracking-wide text-ink">{n.name || 'Unnamed NPC'}</div>
                        <div className="text-xs uppercase font-display tracking-wider text-brass-deep">
                          {[n.archetype, n.type].filter(Boolean).join(' · ')}
                        </div>
                        {n.appearance && (
                          <div className="font-serif text-sm text-ink-soft"><span className="font-semibold text-ink">Appearance:</span> {n.appearance}</div>
                        )}
                        {n.mannerism && (
                          <div className="font-serif text-sm text-ink-soft"><span className="font-semibold text-ink">Mannerism:</span> {n.mannerism}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Locations */}
              {locations.length > 0 && (
                <section>
                  <h2 className="font-display text-xl tracking-wide text-brass-deep mb-3 border-b border-rule/60 pb-1 flex items-center gap-2">
                    <Map size={18} /> Known Locations
                  </h2>
                  <div className="grid md:grid-cols-2 gap-4">
                    {locations.map((l: any, i: number) => (
                      <div key={i} className="bg-parchment border border-rule rounded p-3 shadow-card space-y-2">
                        <div className="font-display text-lg tracking-wide text-ink">{l.name || 'Unnamed Location'}</div>
                        <div className="text-xs uppercase font-display tracking-wider text-brass-deep">{l.type}</div>
                        <ul className="list-disc pl-4 font-serif text-sm text-ink-soft space-y-1">
                          {(l.aspects || []).filter(Boolean).map((asp: string, j: number) => (
                            <li key={j}>{asp}</li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

        </div>
      </div>
    </main>
  );
}
