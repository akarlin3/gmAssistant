'use client';

import { formatDuration } from '@/lib/sessionLog';
import type { SessionLogTabProps } from './sessionLog/types';
import { Stat, CompareCol } from './sessionLog/presentational';
import { SessionCard } from './sessionLog/SessionCard';
import { useSessionLogState } from './sessionLog/useSessionLogState';

export type { NPC, LocationRow } from './sessionLog/types';

export default function SessionLogTab({
  entries, onChange, campaignId, campaignSecrets = [], campaignScenes = [],
  npcs = [], locations = [], monsters = [], items = [], treasure = [], characters = [],
  campaignStrongStart = '', onStrongStartChange,
}: SessionLogTabProps) {
  const {
    editingId, openIds, compareIds, sorted, stats, compareEntries,
    setEditingId, updateEntry, deleteEntry, toggleCompare, clearCompare, toggleOpen, beginEdit,
  } = useSessionLogState(entries, onChange);

  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-3 rounded border border-rule bg-parchment p-3 shadow-card sm:grid-cols-4">
        <Stat label="Sessions" value={stats.total.toString()} />
        <Stat label="Play Time" value={formatDuration(stats.totalDuration)} />
        <Stat label="Last Session" value={stats.lastDate || '—'} />
        <Stat label="Total XP" value={stats.totalXp ? stats.totalXp.toLocaleString() : '—'} />
      </div>

      {sorted.length === 0 && (
        <div className="rounded border border-rule bg-parchment p-4 text-center font-serif text-sm italic text-ink-mute">
          No sessions logged yet. End a session via Run Session mode to save your first log here.
        </div>
      )}

      {compareEntries && (
        <div className="space-y-2 rounded border border-brass/60 bg-brass/5 p-3">
          <div className="flex items-center justify-between">
            <span className="font-display text-sm tracking-wide text-ink">Comparing Sessions</span>
            <button onClick={clearCompare} className="font-display text-xs uppercase tracking-wider text-ink-mute hover:text-crimson">
              Clear
            </button>
          </div>
          <div className="grid grid-cols-1 gap-3 font-serif text-xs md:grid-cols-2">
            <CompareCol entry={compareEntries.left} side="Earlier" />
            <CompareCol entry={compareEntries.right} side="Later" />
          </div>
        </div>
      )}

      <ul className="space-y-2">
        {sorted.map(entry => (
          <SessionCard
            key={entry.id}
            entry={entry}
            open={!!openIds[entry.id]}
            editing={editingId === entry.id}
            inCompare={compareIds.includes(entry.id)}
            campaignId={campaignId}
            campaignSecrets={campaignSecrets}
            campaignScenes={campaignScenes}
            npcs={npcs}
            locations={locations}
            monsters={monsters}
            items={items}
            treasure={treasure}
            campaignStrongStart={campaignStrongStart}
            onStrongStartChange={onStrongStartChange}
            characters={characters}
            onToggleOpen={() => toggleOpen(entry.id)}
            onEdit={() => beginEdit(entry.id)}
            onCancelEdit={() => setEditingId(null)}
            onChange={(patch) => updateEntry(entry.id, patch)}
            onSaveEdit={() => setEditingId(null)}
            onDelete={() => deleteEntry(entry.id)}
            onToggleCompare={() => toggleCompare(entry.id)}
          />
        ))}
      </ul>
    </div>
  );
}
