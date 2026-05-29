import React from 'react';
import {
  Eye, Check, Trash2, Copy, ChevronDown, ChevronRight,
} from 'lucide-react';
import { type LogEntry, type LogKind, timeAgo } from '@/lib/generators/log';
import { getKindLabel, getKindBadgeStyle, getKindIcon } from './kindMeta';
import { PayloadView } from './PayloadView';

export type LogEntryRowProps = {
  entry: LogEntry;
  now: number;
  isOpen: boolean;
  isShared: boolean;
  isCopied: boolean;
  onToggle: (id: string) => void;
  onShare: (entry: LogEntry) => void;
  onCopy: (entry: LogEntry) => void;
  onRemove: (id: string, kind: LogKind) => void;
};

/** A single row in the logged-items list, with expandable detail body. */
export function LogEntryRow({
  entry: e,
  now,
  isOpen,
  isShared,
  isCopied,
  onToggle,
  onShare,
  onCopy,
  onRemove,
}: LogEntryRowProps) {
  const kindLabel = getKindLabel(e.kind);
  const badgeColor = getKindBadgeStyle(e.kind);
  const LogIcon = getKindIcon(e.kind);

  return (
    <li
      className={`group rounded-lg border shadow-sm transition-all duration-150 ${
        isOpen
          ? 'border-brass bg-parchment'
          : 'border-rule bg-parchment hover:border-brass/55'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 sm:px-4">
        <button
          onClick={() => onToggle(e.id)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left focus:outline-none"
          title={isOpen ? 'Collapse details' : 'Expand details'}
        >
          <span className="flex-shrink-0 text-ink-mute">
            {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </span>
          <span className="w-10 flex-shrink-0 font-display text-[10px] tabular-nums tracking-wider text-ink-mute">
            {timeAgo(e.createdAtMs, now)}
          </span>
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span className={`inline-flex flex-shrink-0 items-center gap-1 rounded px-2 py-0.5 font-display text-[9px] uppercase tracking-wider ${badgeColor}`}>
              <LogIcon size={9} /> {kindLabel}
            </span>
            <span className="truncate font-serif text-sm font-semibold text-ink transition-colors group-hover:text-brass-deep">
              {e.title}
            </span>
          </div>
        </button>

        {/* Actions Bar */}
        <div className="flex items-center gap-1.5">
          {/* Share with Players */}
          <button
            onClick={() => onShare(e)}
            disabled={isShared}
            className={`flex select-none items-center gap-1 rounded border px-2.5 py-1 font-display text-[10px] uppercase tracking-wider shadow-sm transition-all ${
              isShared
                ? 'cursor-default border-moss/40 bg-moss/5 font-semibold text-moss'
                : 'border-brass-deep/60 bg-parchment-soft text-brass-deep hover:border-brass-deep hover:bg-brass-deep hover:text-parchment'
            }`}
            title={isShared ? 'Shared in player feed' : 'Reveal details on players page'}
          >
            {isShared ? <Check size={11} strokeWidth={3} /> : <Eye size={11} />}
            {isShared ? 'Shared' : 'Share'}
          </button>

          {/* Copy to Clipboard */}
          <button
            onClick={() => onCopy(e)}
            className="rounded border border-rule bg-parchment-soft p-1 text-ink-soft shadow-sm transition-colors hover:bg-parchment-deep hover:text-ink"
            title="Copy item text"
          >
            {isCopied ? (
              <Check size={13} className="font-bold text-moss" />
            ) : (
              <Copy size={13} />
            )}
          </button>

          {/* Remove Log Row */}
          <button
            onClick={() => {
              if (confirm(`Remove this logged item?\n"${e.title}"`)) {
                onRemove(e.id, e.kind);
              }
            }}
            className="rounded border border-rule bg-parchment-soft p-1 text-ink-mute shadow-sm transition-colors hover:border-crimson/30 hover:bg-crimson/15 hover:text-crimson"
            title="Delete log"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Expanded Body Visual Props */}
      {isOpen && (
        <div className="rounded-b-lg border-t border-rule bg-parchment-soft/30 px-3.5 pb-4 pt-3.5 font-serif">
          <div className="mx-auto max-w-3xl rounded border border-rule/60 bg-parchment p-4 shadow-card">
            <PayloadView entry={e} />
          </div>
        </div>
      )}
    </li>
  );
}
