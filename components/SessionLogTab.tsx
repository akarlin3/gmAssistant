'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown, ChevronRight, Pin, PinOff, Edit3, Trash2, Save, X, Award, BookOpen,
} from 'lucide-react';
import type { SessionLogEntry } from '@/lib/sessionLog';
import { formatDuration } from '@/lib/sessionLog';
import type { ChangeEvent, ChangeEventKind } from '@/lib/sessionEvents';
import { CHANGE_EVENT_LABELS } from '@/lib/sessionEvents';

type Props = {
  entries: SessionLogEntry[];
  onChange: (entries: SessionLogEntry[]) => void;
  campaignId?: string;
};

export default function SessionLogTab({ entries, onChange, campaignId }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const [compareIds, setCompareIds] = useState<string[]>([]);

  const sorted = useMemo(() => {
    return [...entries].sort((a, b) => {
      if (!!b.pinned !== !!a.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      return b.endedAt - a.endedAt;
    });
  }, [entries]);

  const stats = useMemo(() => {
    const totalDuration = entries.reduce((sum, e) => sum + Math.max(0, e.endedAt - e.startedAt), 0);
    const lastSession = entries.reduce<SessionLogEntry | null>(
      (best, e) => (!best || e.endedAt > best.endedAt) ? e : best, null,
    );
    return {
      total: entries.length,
      totalDuration,
      lastDate: lastSession?.date || '',
      totalXp: entries.reduce((sum, e) => sum + (e.xpAwarded || 0), 0),
    };
  }, [entries]);

  const updateEntry = (id: string, patch: Partial<SessionLogEntry>) => {
    onChange(entries.map(e => e.id === id ? { ...e, ...patch } : e));
  };

  const deleteEntry = (id: string) => {
    const entry = entries.find(e => e.id === id);
    if (!confirm(`Delete "${entry?.title || `Session ${entry?.number || ''}`}"? This cannot be undone.`)) return;
    onChange(entries.filter(e => e.id !== id));
    setCompareIds(ids => ids.filter(x => x !== id));
  };

  const toggleCompare = (id: string) => {
    setCompareIds(ids => {
      if (ids.includes(id)) return ids.filter(x => x !== id);
      if (ids.length >= 2) return [ids[1], id];
      return [...ids, id];
    });
  };

  const compareEntries = useMemo(() => {
    if (compareIds.length !== 2) return null;
    const a = entries.find(e => e.id === compareIds[0]);
    const b = entries.find(e => e.id === compareIds[1]);
    if (!a || !b) return null;
    return a.endedAt < b.endedAt ? { left: a, right: b } : { left: b, right: a };
  }, [compareIds, entries]);

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
            <button onClick={() => setCompareIds([])} className="font-display text-xs uppercase tracking-wider text-ink-mute hover:text-crimson">
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
            onToggleOpen={() => setOpenIds(o => ({ ...o, [entry.id]: !o[entry.id] }))}
            onEdit={() => {
              setEditingId(entry.id);
              setOpenIds(o => ({ ...o, [entry.id]: true }));
            }}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">{label}</div>
      <div className="font-display text-base text-ink">{value}</div>
    </div>
  );
}

function CompareCol({ entry, side }: { entry: SessionLogEntry; side: string }) {
  return (
    <div className="space-y-1 rounded border border-rule bg-parchment p-2">
      <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">{side} · Session {entry.number}</div>
      <div className="font-display text-ink">{entry.title || `Session ${entry.number}`}</div>
      <div className="text-[11px] text-ink-mute">{entry.date} · {entry.events.length} events</div>
      <ul className="max-h-40 space-y-0.5 overflow-y-auto text-[11px] text-ink-soft">
        {entry.events.slice(0, 12).map(e => <li key={e.id}>· {e.summary}</li>)}
      </ul>
    </div>
  );
}

type SessionCardProps = {
  entry: SessionLogEntry;
  open: boolean;
  editing: boolean;
  inCompare: boolean;
  campaignId?: string;
  onToggleOpen: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onChange: (patch: Partial<SessionLogEntry>) => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onToggleCompare: () => void;
};

function SessionCard({
  entry, open, editing, inCompare, campaignId,
  onToggleOpen, onEdit, onCancelEdit, onChange, onSaveEdit, onDelete, onToggleCompare,
}: SessionCardProps) {
  const duration = formatDuration(entry.endedAt - entry.startedAt);
  const eventsByKind = useMemo(() => {
    const acc: Record<ChangeEventKind, ChangeEvent[]> = {} as any;
    for (const e of entry.events) (acc[e.kind] ||= []).push(e);
    return acc;
  }, [entry.events]);
  const [eventsOpen, setEventsOpen] = useState(false);

  return (
    <li className={`rounded border ${entry.pinned ? 'border-brass/60 bg-brass/5' : 'border-rule bg-parchment'} shadow-card`}>
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={onToggleOpen} className="flex-shrink-0 text-ink-mute hover:text-ink">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <label className="flex flex-shrink-0 cursor-pointer select-none items-center gap-1 font-display text-[10px] uppercase tracking-wider text-ink-mute">
          <input type="checkbox" checked={inCompare} onChange={onToggleCompare} className="accent-crimson" />
          Cmp
        </label>
        <button onClick={onToggleOpen} className="min-w-0 flex-1 text-left">
          <div className="truncate font-display tracking-wide text-ink">
            Session {entry.number} · {entry.title || 'Untitled'}
          </div>
          <div className="font-serif text-[11px] text-ink-mute">
            {entry.date} · {duration} · {entry.events.length} events
            {entry.xpAwarded ? ` · ${entry.xpAwarded} XP` : ''}
          </div>
        </button>
        <button onClick={() => onChange({ pinned: !entry.pinned })} className="flex-shrink-0 text-ink-mute hover:text-brass" title={entry.pinned ? 'Unpin' : 'Pin'}>
          {entry.pinned ? <PinOff size={14} /> : <Pin size={14} />}
        </button>
        {campaignId && (
          <Link
            href={`/campaign/${campaignId}/recap/${entry.id}`}
            className="flex-shrink-0 text-ink-mute hover:text-brass-deep"
            title="View Recap"
          >
            <BookOpen size={14} />
          </Link>
        )}
        {!editing && (
          <button onClick={onEdit} className="flex-shrink-0 text-ink-mute hover:text-ink" title="Edit">
            <Edit3 size={14} />
          </button>
        )}
        <button onClick={onDelete} className="flex-shrink-0 text-ink-mute hover:text-crimson" title="Delete">
          <Trash2 size={14} />
        </button>
      </div>

      {open && (
        <div className="space-y-2 border-t border-rule px-3 pb-3 pt-1">
          {editing ? (
            <div className="space-y-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_180px]">
                <label className="space-y-1">
                  <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Title</span>
                  <input
                    value={entry.title || ''}
                    onChange={(e) => onChange({ title: e.target.value })}
                    className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-sm text-ink"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Date</span>
                  <input
                    type="date"
                    value={entry.date}
                    onChange={(e) => onChange({ date: e.target.value })}
                    className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-sm text-ink"
                  />
                </label>
              </div>
              <label className="block space-y-1">
                <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Recap</span>
                <textarea
                  value={entry.recap}
                  onChange={(e) => onChange({ recap: e.target.value })}
                  rows={6}
                  className="w-full resize-y rounded border border-rule bg-parchment-soft px-2 py-1.5 font-serif text-sm text-ink"
                />
              </label>
              <label className="block space-y-1">
                <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">XP Awarded</span>
                <input
                  type="number"
                  min={0}
                  value={entry.xpAwarded || ''}
                  onChange={(e) => {
                    const v = parseInt(e.target.value || '0', 10);
                    onChange({ xpAwarded: isNaN(v) || v === 0 ? undefined : v });
                  }}
                  className="w-32 rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-sm text-ink"
                />
              </label>
              <div className="flex items-center gap-2 pt-1">
                <button onClick={onSaveEdit} className="flex items-center gap-1 rounded border border-crimson/60 bg-crimson/10 px-3 py-1 font-display text-xs uppercase tracking-wider text-crimson hover:bg-crimson hover:text-parchment">
                  <Save size={12} /> Done
                </button>
                <button onClick={onCancelEdit} className="font-display text-xs uppercase tracking-wider text-ink-mute hover:text-ink">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {entry.recap.trim() ? (
                <p className="whitespace-pre-wrap font-serif text-sm text-ink-soft">{entry.recap}</p>
              ) : (
                <p className="font-serif text-xs italic text-ink-mute">No recap written.</p>
              )}

              {entry.xpAwarded && (
                <div className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-brass-deep">
                  <Award size={12} /> {entry.xpAwarded.toLocaleString()} XP awarded
                </div>
              )}

              {entry.events.length > 0 && (
                <div>
                  <button
                    onClick={() => setEventsOpen(o => !o)}
                    className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:text-crimson"
                  >
                    {eventsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    Events ({entry.events.length})
                  </button>
                  {eventsOpen && (
                    <div className="mt-1 space-y-1.5">
                      {(Object.entries(eventsByKind) as [ChangeEventKind, ChangeEvent[]][]).map(([kind, list]) => (
                        <div key={kind} className="rounded border border-rule/60 bg-parchment-soft p-2">
                          <div className="mb-0.5 font-display text-[10px] uppercase tracking-wider text-brass-deep">
                            {CHANGE_EVENT_LABELS[kind] || kind}
                          </div>
                          <ul className="space-y-0.5">
                            {list.map(e => (
                              <li key={e.id} className="flex items-start gap-1.5 font-serif text-[11px] text-ink-soft">
                                {e.starred && <span className="flex-shrink-0 text-brass">★</span>}
                                <span>{e.summary}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {entry.secretsRevealed.length > 0 && (
                <DetailList title="Secrets Revealed" items={entry.secretsRevealed} />
              )}

              {entry.scenesUsed.length > 0 && (
                <DetailList title="Scenes Used" items={entry.scenesUsed} />
              )}

              {entry.goalUpdates.length > 0 && (
                <div>
                  <div className="mb-0.5 font-display text-[10px] uppercase tracking-wider text-brass-deep">Goal Updates</div>
                  <ul className="space-y-0.5">
                    {entry.goalUpdates.map((g, i) => (
                      <li key={i} className="font-serif text-[11px] text-ink-soft">
                        {g.goal}: <span className="text-ink-mute">{g.from} → {g.to}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <div className="mb-0.5 font-display text-[10px] uppercase tracking-wider text-brass-deep">{title}</div>
      <ul className="space-y-0.5">
        {items.map((s, i) => (
          <li key={i} className="font-serif text-[11px] text-ink-soft">· {s}</li>
        ))}
      </ul>
    </div>
  );
}
