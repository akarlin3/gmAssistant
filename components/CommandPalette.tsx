'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, CornerDownLeft } from 'lucide-react';

export type CommandGroup =
  | 'Navigation'
  | 'Prep section'
  | 'NPCs'
  | 'Locations'
  | 'Factions'
  | 'Faction clocks'
  | 'Scenes'
  | 'Secrets'
  | 'Goals'
  | 'Magic items'
  | 'Monsters'
  | 'Traps'
  | 'Chases'
  | 'Downtime'
  | 'Sidekicks'
  | 'Characters'
  | 'Sessions'
  | 'Generator log'
  | 'Actions';

export type CommandItem = {
  id: string;
  label: string;
  sublabel?: string;
  group: CommandGroup;
  keywords?: string[];
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  run: () => void;
};

const GROUP_ORDER: CommandGroup[] = [
  'Navigation',
  'Actions',
  'Prep section',
  'NPCs',
  'Locations',
  'Factions',
  'Faction clocks',
  'Sidekicks',
  'Characters',
  'Scenes',
  'Secrets',
  'Goals',
  'Magic items',
  'Monsters',
  'Traps',
  'Chases',
  'Downtime',
  'Sessions',
  'Generator log',
];

// Token-includes scoring. All query tokens must appear somewhere in the
// haystack (label + sublabel + keywords). Score rewards earlier matches and
// matches on the label itself, so an exact label hit always wins.
function scoreItem(item: CommandItem, query: string): number {
  if (!query.trim()) return 0;
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  const label = item.label.toLowerCase();
  const sublabel = (item.sublabel || '').toLowerCase();
  const kw = (item.keywords || []).join(' ').toLowerCase();
  const haystack = `${label} ${sublabel} ${kw}`;
  let score = 0;
  for (const t of tokens) {
    if (!haystack.includes(t)) return -1;
    if (label.startsWith(t)) score += 30;
    else if (label.includes(` ${t}`) || label.includes(`-${t}`)) score += 20;
    else if (label.includes(t)) score += 12;
    else if (sublabel.includes(t)) score += 4;
    else score += 1;
  }
  // Tie-breaker: shorter labels rank higher (more specific match).
  score -= Math.min(10, Math.floor(label.length / 20));
  return score;
}

function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query.trim() || !text) return <>{text}</>;
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return <>{text}</>;

  const regex = new RegExp(`(${tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, i) => {
        if (tokens.some(t => t === part.toLowerCase())) {
          return <strong key={i} className="text-crimson font-semibold">{part}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

export default function CommandPalette({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: CommandItem[];
}) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const ranked = useMemo(() => {
    if (!query.trim()) {
      // Default view: a curated landing — navigation + actions on top, then
      // a thin slice of the rest so the palette feels populated, not empty.
      const grouped: Record<string, CommandItem[]> = {};
      for (const it of items) {
        (grouped[it.group] ||= []).push(it);
      }
      const out: CommandItem[] = [];
      for (const g of GROUP_ORDER) {
        const list = grouped[g] || [];
        const cap = g === 'Navigation' || g === 'Actions' ? list.length : 6;
        out.push(...list.slice(0, cap));
      }
      return out;
    }
    const scored = items
      .map(it => ({ it, score: scoreItem(it, query) }))
      .filter(x => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 60);
    return scored.map(s => s.it);
  }, [items, query]);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelected(s => Math.min(ranked.length - 1, s + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelected(s => Math.max(0, s - 1));
      } else if (e.key === 'Enter') {
        const item = ranked[selected];
        if (item) {
          e.preventDefault();
          onClose();
          // Defer so onClose state updates can flush before the navigation
          // mutates tab/expansion state.
          setTimeout(() => item.run(), 0);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, ranked, selected, onClose]);

  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-cp-row="${selected}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!open) return null;

  const rows: Array<{ kind: 'header'; group: CommandGroup } | { kind: 'item'; item: CommandItem; index: number }> = [];
  let lastGroup: CommandGroup | null = null;
  ranked.forEach((item, index) => {
    if (item.group !== lastGroup) {
      rows.push({ kind: 'header', group: item.group });
      lastGroup = item.group;
    }
    rows.push({ kind: 'item', item, index });
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/50 px-4 pt-[10vh] backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-lg border border-rule bg-parchment shadow-page"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-rule px-3 py-2.5">
          <Search size={14} className="flex-shrink-0 text-brass-deep" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a tab, NPC, location, session, action…"
            className="flex-1 bg-transparent font-serif text-ink placeholder:italic placeholder:text-ink-faint focus:outline-none"
          />
          <kbd className="rounded border border-rule px-1.5 py-0.5 font-display text-[10px] uppercase tracking-wider text-ink-mute">
            esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-1">
          {rows.length === 0 && (
            <div className="px-4 py-8 text-center font-serif text-sm italic text-ink-mute">
              No matches for &ldquo;{query}&rdquo;.
            </div>
          )}
          {rows.map((row, i) => {
            if (row.kind === 'header') {
              return (
                <div
                  key={`h-${row.group}-${i}`}
                  className="px-3 pb-1 pt-2 font-display text-[10px] uppercase tracking-wider text-brass-deep"
                >
                  {row.group}
                </div>
              );
            }
            const { item, index } = row;
            const Icon = item.icon;
            const active = index === selected;
            return (
              <button
                key={item.id}
                type="button"
                data-cp-row={index}
                onClick={() => {
                  onClose();
                  setTimeout(() => item.run(), 0);
                }}
                onMouseMove={() => setSelected(index)}
                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm ${
                  active
                    ? 'bg-crimson/10 text-ink'
                    : 'text-ink-soft hover:bg-parchment-soft'
                }`}
              >
                {Icon ? (
                  <Icon size={14} className="flex-shrink-0 text-brass-deep" />
                ) : (
                  <span className="w-3.5 flex-shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate font-serif">
                  <HighlightMatch text={item.label} query={query} />
                </span>
                {item.sublabel && (
                  <span className="max-w-[40%] truncate font-serif text-xs italic text-ink-mute">
                    <HighlightMatch text={item.sublabel} query={query} />
                  </span>
                )}
                {active && (
                  <CornerDownLeft size={12} className="flex-shrink-0 text-brass-deep" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-rule bg-parchment-soft px-3 py-1.5 font-display text-[10px] uppercase tracking-wider text-ink-mute">
          <span>↑↓ navigate</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
