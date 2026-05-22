'use client';

// Shared per-generator log component. Each generator renders one of these
// directly under its own panel, passing in the slice of entries for its
// LogKind plus an onChange callback that commits back to data.generatorLogs.

import { useState } from 'react';
import { History, ChevronDown, ChevronRight, X, Trash2, Copy, Check } from 'lucide-react';
import type { LogEntry, LogKind } from '@/lib/generators/log';
import { removeFromLog, clearLog, timeAgo } from '@/lib/generators/log';
import AddToCampaignPicker from './AddToCampaignPicker';
import type { CampaignDestKey, SelectableItem } from '@/lib/generators/addToCampaign';

export type GeneratorLogProps = {
  kind: LogKind;
  entries: LogEntry[];
  onChange: (next: LogEntry[]) => void;
  renderPayload: (entry: LogEntry) => React.ReactNode;
  emptyHint?: string;
  copyText?: (entry: LogEntry) => string;
  // When provided, each expanded row shows a picker that hands the user's
  // selection to this callback. The caller folds the result into campaign data.
  onAddToCampaign?: (dest: CampaignDestKey, items: SelectableItem[]) => void;
  // Destinations that the picker should render but not allow as a target.
  disabledDests?: readonly CampaignDestKey[];
};

export default function GeneratorLog({
  kind,
  entries,
  onChange,
  renderPayload,
  emptyHint = "Click 'Save to log' on a result to keep it here.",
  copyText,
  onAddToCampaign,
  disabledDests,
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
    <div className="space-y-2 rounded border border-rule bg-parchment p-3 shadow-card">
      <div className="flex items-center gap-2">
        <History size={14} className="text-brass-deep" />
        <h4 className="font-display tracking-wide text-ink">Log</h4>
        <span className="ml-1 text-[10px] italic text-ink-mute">
          {entries.length === 0 ? 'empty' : `${entries.length} saved`}
        </span>
        {entries.length > 0 && (
          <button
            onClick={clearAll}
            className="ml-auto flex items-center gap-1 font-display text-[10px] uppercase tracking-wider text-ink-mute hover:text-crimson"
            title="Clear all log entries"
          >
            <Trash2 size={11} /> Clear
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="font-serif text-xs italic text-ink-mute">{emptyHint}</p>
      ) : (
        <ul className="space-y-1">
          {entries.map((e) => {
            const isOpen = !!open[e.id];
            return (
              <li key={e.id} className="rounded border border-rule bg-parchment-soft">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <button
                    onClick={() => toggle(e.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    title={isOpen ? 'Collapse' : 'Expand'}
                  >
                    {isOpen ? (
                      <ChevronDown size={12} className="flex-shrink-0 text-ink-mute" />
                    ) : (
                      <ChevronRight size={12} className="flex-shrink-0 text-ink-mute" />
                    )}
                    <span className="w-9 flex-shrink-0 font-display text-[10px] tracking-wider text-ink-mute">
                      {timeAgo(e.createdAtMs, now)}
                    </span>
                    <span className="truncate font-serif text-sm text-ink">{e.title}</span>
                  </button>
                  {copyText && (
                    <button
                      onClick={() => copy(e)}
                      className="flex-shrink-0 text-ink-mute hover:text-brass-deep"
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
                    className="flex-shrink-0 text-ink-mute hover:text-crimson"
                    title="Remove from log"
                  >
                    <X size={14} />
                  </button>
                </div>
                {isOpen && (
                  <div className="space-y-2 border-t border-rule bg-parchment px-2.5 py-2">
                    {renderPayload(e)}
                    {onAddToCampaign && (
                      <AddToCampaignPicker
                        kind={kind}
                        payload={e.payload}
                        onAdd={onAddToCampaign}
                        disabledDests={disabledDests}
                      />
                    )}
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
