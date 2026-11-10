'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search, CornerDownLeft, Dices, RotateCcw } from 'lucide-react';
import { parseFormula, evalExpr, type Roll } from '@/components/diceRoller/parser';

export type CommandGroup =
  | 'Navigation'
  | 'Actions'
  | 'Visibility'
  | 'Prep section'
  | 'NPCs'
  | 'Locations'
  | 'Factions'
  | 'Faction clocks'
  | 'Characters'
  | 'Goals'
  | 'Spells'
  | 'Scenes'
  | 'Secrets'
  | 'Magic items'
  | 'Monsters'
  | 'Traps'
  | 'Chases'
  | 'Downtime'
  | 'Sidekicks'
  | 'Sessions'
  | 'Generator log';

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
  'Visibility',
  'Prep section',
  'NPCs',
  'Locations',
  'Factions',
  'Faction clocks',
  'Characters',
  'Goals',
  'Spells',
  'Sidekicks',
  'Scenes',
  'Secrets',
  'Magic items',
  'Monsters',
  'Traps',
  'Chases',
  'Downtime',
  'Sessions',
  'Generator log',
];

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
          return <strong key={i} className="font-semibold text-crimson">{part}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function extractInlineDiceFormula(rawQuery: string): string | null {
  const trimmed = rawQuery.trim();
  if (!trimmed) return null;
  if (/^\/r(?:oll)?\s+(.+)$/i.test(trimmed)) {
    return trimmed.replace(/^\/r(?:oll)?\s+/i, '').trim();
  }
  if (/^\d*d\d+/i.test(trimmed)) {
    return trimmed;
  }
  return null;
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
  const [inlineRoll, setInlineRoll] = useState<Roll | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelected(0);
      setInlineRoll(null);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const diceFormulaCandidate = useMemo(() => extractInlineDiceFormula(query), [query]);

  const triggerInlineRoll = (formulaStr: string) => {
    const parsed = parseFormula(formulaStr);
    if (!parsed.ok) {
      setInlineRoll(null);
      return false;
    }
    const evaluated = evalExpr(parsed.expr, null);
    setInlineRoll({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ts: Date.now(),
      label: 'Spotlight Roll',
      formula: formulaStr,
      parts: evaluated.parts,
      total: evaluated.total,
    });
    return true;
  };

  useEffect(() => {
    if (!diceFormulaCandidate) {
      setInlineRoll(null);
      return;
    }
    triggerInlineRoll(diceFormulaCandidate);
  }, [diceFormulaCandidate]);

  const ranked = useMemo(() => {
    if (!query.trim()) {
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
        if (diceFormulaCandidate && ranked.length === 0) {
          e.preventDefault();
          triggerInlineRoll(diceFormulaCandidate);
          return;
        }
        const item = ranked[selected];
        if (item) {
          e.preventDefault();
          onClose();
          setTimeout(() => item.run(), 0);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, ranked, selected, onClose, diceFormulaCandidate]);

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
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 px-4 pt-[10vh] backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-2.5">
          <Search size={14} className="flex-shrink-0 text-[var(--accent-primary)]" />
          <input
            ref={inputRef}
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to a tab, NPC, location, spell, or type /roll 2d20kh1+7…"
            className="flex-1 bg-transparent font-sans text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
          />
          <kbd className="rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            esc
          </kbd>
        </div>

        {/* Inline /roll Dice Formula Result Card */}
        {inlineRoll && (
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/80 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]">
                <Dices size={16} />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-sans text-xs font-semibold text-[var(--text-primary)]">
                    Inline Dice Roller
                  </span>
                  <code className="rounded border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
                    {inlineRoll.formula}
                  </code>
                </div>
                <div className="mt-0.5 font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
                  {inlineRoll.parts
                    .map((p) => {
                      const diceStr = p.dice
                        .map((d) => `d${d.sides}[${d.rolls.join(', ')}]`)
                        .join(' ');
                      return [diceStr, p.modifier ? `${p.modifier > 0 ? '+' : ''}${p.modifier}` : '']
                        .filter(Boolean)
                        .join(' ');
                    })
                    .join(' · ')}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="gm-roll-total font-mono text-2xl font-bold tabular-nums text-[var(--accent-primary)]">
                {inlineRoll.total}
              </span>
              <button
                type="button"
                onClick={() => diceFormulaCandidate && triggerInlineRoll(diceFormulaCandidate)}
                className="inline-flex items-center gap-1 rounded-md border border-[var(--border-subtle)] bg-[var(--bg-canvas)] px-2.5 py-1 font-sans text-xs font-medium text-[var(--text-primary)] hover:border-[var(--accent-primary)]"
                title="Reroll formula"
              >
                <RotateCcw size={12} />
                <span>Reroll</span>
              </button>
            </div>
          </div>
        )}

        <div ref={listRef} className="max-h-[60vh] overflow-y-auto py-1">
          {rows.length === 0 && !inlineRoll && (
            <div className="px-4 py-8 text-center font-sans text-xs text-[var(--text-muted)]">
              No matches for &ldquo;{query}&rdquo;. Tip: type <code className="font-mono">/roll 2d20kh1+7</code> to roll dice inline.
            </div>
          )}
          {rows.map((row, i) => {
            if (row.kind === 'header') {
              return (
                <div
                  key={`h-${row.group}-${i}`}
                  className="px-3.5 pb-1 pt-2 font-sans text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]"
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
                className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs transition-colors ${
                  active
                    ? 'bg-[var(--accent-primary)]/15 text-[var(--text-primary)]'
                    : 'text-[var(--text-muted)] hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]'
                }`}
              >
                {Icon ? (
                  <Icon size={14} className="flex-shrink-0 text-[var(--accent-primary)]" />
                ) : (
                  <span className="w-3.5 flex-shrink-0" />
                )}
                <span className="min-w-0 flex-1 truncate font-sans font-medium text-[var(--text-primary)]">
                  <HighlightMatch text={item.label} query={query} />
                </span>
                {item.sublabel && (
                  <span className="max-w-[42%] truncate font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
                    <HighlightMatch text={item.sublabel} query={query} />
                  </span>
                )}
                {active && (
                  <CornerDownLeft size={12} className="flex-shrink-0 text-[var(--accent-primary)]" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--border-subtle)] bg-[var(--bg-surface)] px-3.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
          <span>↑↓ navigate</span>
          <span>/roll 2d20kh1+7</span>
          <span>↵ select</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}

