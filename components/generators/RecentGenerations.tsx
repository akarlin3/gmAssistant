'use client';

import { useState } from 'react';
import { History, RefreshCw, Eye } from 'lucide-react';
import type { GenerationHistoryEntry } from '@/lib/generators/types';

const KIND_LABEL: Record<GenerationHistoryEntry['kind'], string> = {
  'treasure-hoard': 'Treasure',
  'trinket': 'Trinkets',
  'mundane-shop': 'Mundane Shop',
  'magic-shop': 'Magic Shop',
  'tavern': 'Tavern',
  'tavern-name': 'Tavern Names',
  'dungeon': 'Dungeon',
  'settlement': 'Settlement',
  'plot-segue': 'Plot Segue',
};

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function RecentGenerations({
  entries,
  onReroll,
  onInspect,
}: {
  entries: GenerationHistoryEntry[];
  onReroll: (entry: GenerationHistoryEntry) => void;
  onInspect: (entry: GenerationHistoryEntry) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  if (!entries.length) return null;
  const shown = expanded ? entries : entries.slice(0, 6);
  return (
    <div className="rounded border border-rule bg-parchment p-3 shadow-card space-y-2">
      <div className="flex items-center gap-2">
        <History size={14} className="text-brass-deep" />
        <h4 className="font-display tracking-wide text-ink">Recent Generations</h4>
        <span className="ml-auto text-[10px] text-ink-mute italic">{entries.length} of last 20</span>
      </div>
      <ul className="space-y-1.5">
        {shown.map((e) => (
          <li key={e.id} className="flex items-center gap-2 text-sm font-serif">
            <span className="text-[10px] uppercase tracking-wider text-brass-deep w-24 flex-shrink-0">{KIND_LABEL[e.kind]}</span>
            <span className="flex-1 truncate text-ink">{e.title}</span>
            <span className="text-[10px] text-ink-mute italic flex-shrink-0">{timeAgo(e.createdAtMs)}</span>
            <button
              onClick={() => onReroll(e)}
              title="Reroll this kind of generator"
              className="text-[10px] px-1.5 py-0.5 rounded border border-ink-mute/40 text-ink-soft hover:bg-parchment-deep flex items-center gap-1 font-display uppercase tracking-wider"
            >
              <RefreshCw size={10} /> Reroll
            </button>
            <button
              onClick={() => onInspect(e)}
              title="Bring this entry back to the top of history"
              className="text-[10px] px-1.5 py-0.5 rounded border border-ink-mute/40 text-ink-soft hover:bg-parchment-deep flex items-center gap-1 font-display uppercase tracking-wider"
            >
              <Eye size={10} /> Inspect
            </button>
          </li>
        ))}
      </ul>
      {entries.length > 6 && (
        <button onClick={() => setExpanded((x) => !x)} className="text-[10px] text-brass-deep hover:text-crimson font-display uppercase tracking-wider">
          {expanded ? 'Show fewer' : `Show ${entries.length - 6} more`}
        </button>
      )}
    </div>
  );
}
