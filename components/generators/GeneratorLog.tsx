'use client';

// Shared per-generator log component. Each generator renders one of these
// directly under its own panel, passing in the slice of entries for its
// LogKind plus an onChange callback that commits back to data.generatorLogs.

import { useState } from 'react';
import { History, ChevronDown, ChevronRight, X, Trash2, Copy, Check } from 'lucide-react';
import type { LogEntry, LogKind } from '@/lib/generators/log';
import { removeFromLog, clearLog, timeAgo } from '@/lib/generators/log';

export type GeneratorLogProps = {
  kind: LogKind;
  entries: LogEntry[];
  onChange: (next: LogEntry[]) => void;
  renderPayload: (entry: LogEntry) => React.ReactNode;
  emptyHint?: string;
  copyText?: (entry: LogEntry) => string;
};

export default function GeneratorLog({
  entries,
  onChange,
  renderPayload,
  emptyHint = "Click 'Save to log' on a result to keep it here.",
  copyText,
}: GeneratorLogProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<string | null>(null);
  const now = Date.now();

  const toggle = (id: string) => setOpen((s) => ({ ...s, [id]: !s[id] }));

  const remove = (id: string) => {
    onChange(removeFromLog(entries, id));
    setOpen((s) => {
      if (!(id in s)) return s;
      const next = { ...s };
      delete next[id];
      return next;
    });
  };

  const clearAll = () => {
    if (entries.length === 0) return;
    if (!confirm(`Clear all ${entries.length} log entries?`)) return;
    onChange(clearLog());
    setOpen({});
  };

  const copy = async (entry: LogEntry) => {
    if (!copyText) return;
    try {
      await navigator.clipboard.writeText(copyText(entry));
      setCopied(entry.id);
      setTimeout(() => setCopied((c) => (c === entry.id ? null : c)), 1200);
    } catch {
      // clipboard unavailable — silently skip
    }
  };

  return (
    <div className="rounded border border-rule bg-parchment p-3 shadow-card space-y-2">
      <div className="flex items-center gap-2">
        <History size={14} className="text-brass-deep" />
        <h4 className="font-display tracking-wide text-ink">Log</h4>
        <span className="text-[10px] text-ink-mute italic ml-1">
          {entries.length === 0 ? 'empty' : `${entries.length} saved`}
        </span>
        {entries.length > 0 && (
          <button
            onClick={clearAll}
            className="ml-auto text-[10px] text-ink-mute hover:text-crimson flex items-center gap-1 font-display uppercase tracking-wider"
            title="Clear all log entries"
          >
            <Trash2 size={11} /> Clear
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="text-xs text-ink-mute italic font-serif">{emptyHint}</p>
      ) : (
        <ul className="space-y-1">
          {entries.map((e) => {
            const isOpen = !!open[e.id];
            return (
              <li key={e.id} className="rounded border border-rule bg-parchment-soft">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <button
                    onClick={() => toggle(e.id)}
                    className="flex-1 flex items-center gap-2 text-left min-w-0"
                    title={isOpen ? 'Collapse' : 'Expand'}
                  >
                    {isOpen ? (
                      <ChevronDown size={12} className="text-ink-mute flex-shrink-0" />
                    ) : (
                      <ChevronRight size={12} className="text-ink-mute flex-shrink-0" />
                    )}
                    <span className="text-[10px] text-ink-mute font-display tracking-wider w-9 flex-shrink-0">
                      {timeAgo(e.createdAtMs, now)}
                    </span>
                    <span className="font-serif text-ink text-sm truncate">{e.title}</span>
                  </button>
                  {copyText && (
                    <button
                      onClick={() => copy(e)}
                      className="text-ink-mute hover:text-brass-deep flex-shrink-0"
                      title="Copy as text"
                    >
                      {copied === e.id ? (
                        <Check size={13} className="text-brass-deep" />
                      ) : (
                        <Copy size={13} />
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => remove(e.id)}
                    className="text-ink-mute hover:text-crimson flex-shrink-0"
                    title="Remove from log"
                  >
                    <X size={14} />
                  </button>
                </div>
                {isOpen && (
                  <div className="border-t border-rule px-2.5 py-2 bg-parchment">
                    {renderPayload(e)}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
