'use client';

import React, { useState } from 'react';
import { History, Search, BookOpen, X } from 'lucide-react';
import { type LogEntry, type LogKind, removeFromLog } from '@/lib/generators/log';
import type { PlayerLogEntry } from '@/lib/playerMode/sessionLog';
import { CATEGORIES, type CategoryValue } from './logged/categories';
import { useFilteredLogs } from './logged/useFilteredLogs';
import { formatPlainText, formatMarkdownText } from './logged/format';
import { LogEntryRow } from './logged/LogEntryRow';

type LoggedTabProps = {
  logs: Partial<Record<LogKind, LogEntry[]>>;
  onChangeLogs: (next: Partial<Record<LogKind, LogEntry[]>>) => void;
  playerLog: PlayerLogEntry[];
  onShareToPlayerLog: (text: string) => void;
};

export default function LoggedTab({
  logs,
  onChangeLogs,
  playerLog,
  onShareToPlayerLog,
}: LoggedTabProps) {
  const [activeCategory, setActiveCategory] = useState<CategoryValue>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [openEntries, setOpenEntries] = useState<Record<string, boolean>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const now = Date.now();

  const { allEntries, filteredEntries } = useFilteredLogs(logs, activeCategory, searchQuery);

  const toggleEntry = (id: string) => {
    setOpenEntries((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const removeEntry = (id: string, kind: LogKind) => {
    const kindEntries = logs[kind] || [];
    const updated = removeFromLog(kindEntries, id);
    onChangeLogs({
      ...logs,
      [kind]: updated,
    });
    setOpenEntries((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  // Checks if this logged library item is already shared in the Player Log
  const getIsShared = (entry: LogEntry): boolean => {
    const signature = `<!-- logged_item_id: ${entry.id} -->`;
    return playerLog.some((e) => e.text.includes(signature) || e.text.includes(entry.title));
  };

  // Copy helper
  const handleCopy = async (entry: LogEntry) => {
    const text = formatPlainText(entry);
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(entry.id);
      setTimeout(() => setCopiedId((id) => (id === entry.id ? null : id)), 1200);
    } catch {
      // clip failed
    }
  };

  // Share to Player Feed helper
  const handleShare = (entry: LogEntry) => {
    const formattedMarkdown = formatMarkdownText(entry);
    onShareToPlayerLog(formattedMarkdown);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-rule bg-parchment p-4 shadow-card space-y-3">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <History size={16} className="text-crimson animate-pulse" />
            <h2 className="font-display text-lg tracking-wide text-ink sm:text-xl">
              Logged Library Items
            </h2>
            <span className="rounded-full bg-parchment-deep border border-rule px-2.5 py-0.5 text-xs text-ink-soft italic font-serif">
              {allEntries.length} items saved
            </span>
          </div>

          <div className="relative w-full max-w-xs sm:w-64">
            <span className="absolute inset-y-0 left-0 flex items-center pl-2.5 text-ink-mute">
              <Search size={14} />
            </span>
            <input
              type="text"
              placeholder="Search logged items..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded border border-rule bg-parchment-soft pl-8 pr-3 py-1 text-sm font-serif text-ink placeholder:italic placeholder:text-ink-faint focus:border-crimson focus:outline-none"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-ink-mute hover:text-crimson"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </header>

        {/* Category badges */}
        <div className="flex flex-wrap items-center gap-1.5 border-t border-rule/50 pt-2.5">
          {CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const active = cat.value === activeCategory;
            return (
              <button
                key={cat.value}
                onClick={() => setActiveCategory(cat.value)}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 font-display text-[10px] uppercase tracking-wider transition-all shadow-sm ${
                  active
                    ? 'border-crimson bg-crimson text-parchment font-semibold'
                    : 'border-rule bg-parchment-soft text-ink-soft hover:bg-parchment-deep hover:text-ink'
                }`}
              >
                <Icon size={10} className={active ? 'text-parchment' : 'text-brass-deep'} />
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Results Listing */}
      {filteredEntries.length === 0 ? (
        <div className="rounded-lg border border-rule bg-parchment p-8 shadow-card text-center space-y-2">
          <BookOpen size={24} className="mx-auto text-ink-mute opacity-60" />
          <h3 className="font-display text-sm uppercase tracking-wide text-ink">No saved items found</h3>
          <p className="font-serif text-xs italic text-ink-mute max-w-sm mx-auto">
            {searchQuery
              ? "No items match your active search filter. Clear the query or pick another category."
              : "Items you generated in the Library and saved will be collected here to share, copy, or run."}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filteredEntries.map((e) => (
            <LogEntryRow
              key={e.id}
              entry={e}
              now={now}
              isOpen={!!openEntries[e.id]}
              isShared={getIsShared(e)}
              isCopied={copiedId === e.id}
              onToggle={toggleEntry}
              onShare={handleShare}
              onCopy={handleCopy}
              onRemove={removeEntry}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
