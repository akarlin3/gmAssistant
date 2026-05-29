'use client';

import { useState } from 'react';
import { X } from 'lucide-react';
import type { Playlist } from './types';

interface ScenarioPlaylistsProps {
  activePlaylists: Playlist[];
  playlistUrl: string;
  onChangePlaylist?: (v: string) => void;
  onChangePlaylists?: (v: Playlist[]) => void;
}

export function ScenarioPlaylists({
  activePlaylists,
  playlistUrl,
  onChangePlaylist,
  onChangePlaylists,
}: ScenarioPlaylistsProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState('');
  const [newScenarioUrl, setNewScenarioUrl] = useState('');

  const handleSavePlaylist = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newScenarioName.trim() || !newScenarioUrl.trim()) return;
    const nextPlaylists = [
      ...activePlaylists,
      {
        id: `pl_${Date.now()}`,
        name: newScenarioName.trim(),
        url: newScenarioUrl.trim(),
      },
    ];
    if (onChangePlaylists) onChangePlaylists(nextPlaylists);
    setNewScenarioName('');
    setNewScenarioUrl('');
    setShowAddForm(false);
  };

  const handleDeletePlaylist = (id: string) => {
    const nextPlaylists = activePlaylists.filter((pl) => pl.id !== id);
    if (onChangePlaylists) onChangePlaylists(nextPlaylists);
  };

  return (
    <div className="space-y-2 rounded-lg border border-rule/60 bg-parchment/40 p-3 shadow-inner">
      <div className="flex items-center justify-between">
        <span className="font-display text-[10px] font-semibold uppercase tracking-wider text-brass-deep">
          Scenario Playlists
        </span>
        <button
          type="button"
          onClick={() => setShowAddForm(true)}
          className="rounded border border-brass-deep/45 bg-brass/10 px-2 py-0.5 font-display text-[9px] uppercase tracking-wider text-brass-deep transition-all hover:bg-brass hover:text-parchment"
        >
          + Add Scenario
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={handleSavePlaylist} className="mt-2 space-y-2 rounded border border-rule/50 bg-parchment p-2.5 shadow-sm">
          <div className="font-display text-[10px] font-semibold uppercase tracking-wider text-brass-deep">
            Add Custom Scenario
          </div>
          <div className="space-y-1">
            <input
              type="text"
              required
              placeholder="Scenario Name (e.g. Boss Battle)"
              value={newScenarioName}
              onChange={(e) => setNewScenarioName(e.target.value)}
              className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-[11px] text-ink focus:border-crimson focus:outline-none"
            />
            <input
              type="text"
              required
              placeholder="YouTube Playlist or Video URL"
              value={newScenarioUrl}
              onChange={(e) => setNewScenarioUrl(e.target.value)}
              className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-[11px] text-ink focus:border-crimson focus:outline-none"
            />
          </div>
          <div className="flex justify-end gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded border border-rule px-2 py-0.5 font-display text-[9px] uppercase tracking-wider text-ink-soft transition-all hover:bg-parchment-deep"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded border border-crimson/50 bg-crimson/10 px-2 py-0.5 font-display text-[9px] uppercase tracking-wider text-crimson transition-all hover:bg-crimson hover:text-parchment"
            >
              Save
            </button>
          </div>
        </form>
      )}

      <div className="grid grid-cols-2 gap-2">
        {activePlaylists.map((pl) => {
          const isActive = playlistUrl === pl.url;
          return (
            <div
              key={pl.id}
              className={`group relative flex items-center justify-between rounded border p-2 font-serif text-xs transition-all ${
                isActive
                  ? 'border-crimson/50 bg-crimson/5 font-medium text-crimson shadow-sm'
                  : 'border-rule bg-parchment/65 text-ink-soft hover:bg-parchment'
              }`}
            >
              <button
                type="button"
                onClick={() => { if (onChangePlaylist) onChangePlaylist(pl.url); }}
                className="flex-1 truncate pr-5 text-left font-serif"
                title={pl.name}
              >
                {pl.name}
              </button>
              {!['tavern', 'combat', 'dungeon', 'creepy'].includes(pl.id) && (
                <button
                  type="button"
                  onClick={() => handleDeletePlaylist(pl.id)}
                  className="absolute right-1 text-ink-mute opacity-0 transition-opacity hover:text-crimson group-hover:opacity-100"
                  title="Delete scenario"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
