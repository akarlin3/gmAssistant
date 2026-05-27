'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown, ChevronRight, Pin, PinOff, Edit3, Trash2, Save, X, Award, BookOpen, Zap,
} from 'lucide-react';
import type { SessionLogEntry, LinkedPrepItem } from '@/lib/sessionLog';
import { formatDuration, parseMonsterXP, parseMonsterName } from '@/lib/sessionLog';
import type { ChangeEvent, ChangeEventKind } from '@/lib/sessionEvents';
import { CHANGE_EVENT_LABELS } from '@/lib/sessionEvents';
import { NpcDialogueLines } from '@/components/voice/NpcDialogueLines';
import type { Character } from '@/lib/character-schema';
import type { CampaignItem } from '@/lib/playerMode/types';
import { normalizeItem } from '@/lib/playerMode/types';

const getLocalDateString = (ms: number) => {
  const d = new Date(ms);
  const YYYY = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const DD = String(d.getDate()).padStart(2, '0');
  return `${YYYY}-${MM}-${DD}`;
};

const getLocalTimeString = (ms: number) => {
  const d = new Date(ms);
  const HH = String(d.getHours()).padStart(2, '0');
  const MM = String(d.getMinutes()).padStart(2, '0');
  return `${HH}:${MM}`;
};

const parseLocalStart = (dateStr: string, timeStr: string) => {
  const [year, month, day] = dateStr.split('-').map(Number);
  const [hour, minute] = timeStr.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute).getTime();
};

type NPC = {
  id?: string;
  name?: string;
  type?: string;
  faction?: string;
  archetype?: string;
  goal?: string;
  method?: string;
  isPublic?: boolean;
};

type LocationRow = {
  id?: string;
  name: string;
  type: string;
  aspects: [string, string, string];
  factions: string;
};

type Props = {
  entries: SessionLogEntry[];
  onChange: (entries: SessionLogEntry[]) => void;
  campaignId?: string;
  campaignSecrets?: string[];
  campaignScenes?: string[];
  npcs?: NPC[];
  locations?: LocationRow[];
  monsters?: string[];
  items?: any[];
  treasure?: string[];
  characters?: Character[];
  campaignStrongStart?: string;
  onStrongStartChange?: (v: string) => void;
};

export default function SessionLogTab({
  entries, onChange, campaignId, campaignSecrets = [], campaignScenes = [],
  npcs = [], locations = [], monsters = [], items = [], treasure = [], characters = [],
  campaignStrongStart = '', onStrongStartChange,
}: Props) {
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
  campaignSecrets?: string[];
  campaignScenes?: string[];
  npcs: NPC[];
  locations: LocationRow[];
  monsters: string[];
  items: any[];
  treasure: string[];
  characters: Character[];
  campaignStrongStart?: string;
  onStrongStartChange?: (v: string) => void;
  onToggleOpen: () => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onChange: (patch: Partial<SessionLogEntry>) => void;
  onSaveEdit: () => void;
  onDelete: () => void;
  onToggleCompare: () => void;
};

function SessionCard({
  entry, open, editing, inCompare, campaignId, campaignSecrets = [], campaignScenes = [],
  npcs = [], locations = [], monsters = [], items = [], treasure = [], characters = [],
  campaignStrongStart = '', onStrongStartChange,
  onToggleOpen, onEdit, onCancelEdit, onChange, onSaveEdit, onDelete, onToggleCompare,
}: SessionCardProps) {
  const duration = formatDuration(entry.endedAt - entry.startedAt);
  const eventsByKind = useMemo(() => {
    const acc: Record<ChangeEventKind, ChangeEvent[]> = {} as any;
    for (const e of entry.events) (acc[e.kind] ||= []).push(e);
    return acc;
  }, [entry.events]);

  const allSecrets = useMemo(() => {
    const list = [...campaignSecrets];
    for (const s of entry.secretsRevealed || []) {
      if (!list.includes(s)) list.push(s);
    }
    return list;
  }, [campaignSecrets, entry.secretsRevealed]);

  const allScenes = useMemo(() => {
    const list = [...campaignScenes];
    for (const s of entry.scenesUsed || []) {
      if (!list.includes(s)) list.push(s);
    }
    return list;
  }, [campaignScenes, entry.scenesUsed]);

  const [eventsOpen, setEventsOpen] = useState(false);

  const linkedItems = entry.linkedPrepItems || [];

  const handleAddLink = (type: LinkedPrepItem['type'], id: string, name: string, extra?: { xp?: number; loot?: string }) => {
    const isDup = linkedItems.some(item => item.id === id && item.type === type);
    if (isDup) return;
    const newItem: LinkedPrepItem = {
      id,
      type,
      snapshotName: name,
      snapshotXP: extra?.xp,
      snapshotLoot: extra?.loot,
    };
    onChange({ linkedPrepItems: [...linkedItems, newItem] });
  };

  const handleRemoveLink = (type: LinkedPrepItem['type'], id: string) => {
    onChange({ linkedPrepItems: linkedItems.filter(item => !(item.id === id && item.type === type)) });
  };

  const handleUpdateXP = (id: string, xpValue: number) => {
    onChange({
      linkedPrepItems: linkedItems.map(item =>
        (item.id === id && item.type === 'encounter') ? { ...item, snapshotXP: xpValue } : item
      )
    });
  };

  const isGhostItem = (item: LinkedPrepItem) => {
    switch (item.type) {
      case 'npc':
        return !npcs.some(n => n.id === item.id || n.name === item.snapshotName);
      case 'location':
        return !locations.some(l => l.id === item.id || l.name === item.snapshotName);
      case 'encounter':
        return !monsters.some(m => m === item.id || parseMonsterName(m) === item.snapshotName);
      case 'loot': {
        const itemsList = items.map((it, idx) => normalizeItem(it, idx));
        const inItems = itemsList.some(it => it.id === item.id || it.name === item.snapshotName);
        const inTreasure = treasure.some(t => t === item.id || t === item.snapshotName);
        return !inItems && !inTreasure;
      }
      default:
        return true;
    }
  };

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
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[2fr_1.5fr_1fr_1.2fr]">
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
                    onChange={(e) => {
                      const newDate = e.target.value;
                      const durationMs = entry.endedAt - entry.startedAt;
                      const currentLocalTime = getLocalTimeString(entry.startedAt);
                      const newStartedAt = parseLocalStart(newDate, currentLocalTime);
                      onChange({
                        date: newDate,
                        startedAt: newStartedAt,
                        endedAt: newStartedAt + durationMs
                      });
                    }}
                    className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-sm text-ink"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Start Time</span>
                  <input
                    type="time"
                    value={getLocalTimeString(entry.startedAt)}
                    onChange={(e) => {
                      const newTime = e.target.value || "00:00";
                      const durationMs = entry.endedAt - entry.startedAt;
                      const currentLocalDate = getLocalDateString(entry.startedAt);
                      const newStartedAt = parseLocalStart(currentLocalDate, newTime);
                      onChange({
                        startedAt: newStartedAt,
                        endedAt: newStartedAt + durationMs
                      });
                    }}
                    className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-sm text-ink"
                  />
                </label>
                <label className="space-y-1">
                  <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Duration</span>
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <input
                      type="number"
                      min={0}
                      value={Math.floor(Math.max(0, Math.round((entry.endedAt - entry.startedAt) / 60000)) / 60)}
                      onChange={(e) => {
                        const currentDur = Math.max(0, Math.round((entry.endedAt - entry.startedAt) / 60000));
                        const h = parseInt(e.target.value || '0', 10);
                        const m = currentDur % 60;
                        const newDurationMs = (h * 60 + m) * 60000;
                        onChange({ endedAt: entry.startedAt + newDurationMs });
                      }}
                      className="w-12 rounded border border-rule bg-parchment-soft px-1 py-0.5 font-serif text-sm text-ink text-center"
                    />
                    <span className="text-[11px] font-serif text-ink-mute">h</span>
                    <input
                      type="number"
                      min={0}
                      max={59}
                      value={Math.max(0, Math.round((entry.endedAt - entry.startedAt) / 60000)) % 60}
                      onChange={(e) => {
                        const currentDur = Math.max(0, Math.round((entry.endedAt - entry.startedAt) / 60000));
                        const h = Math.floor(currentDur / 60);
                        const m = parseInt(e.target.value || '0', 10);
                        const newDurationMs = (h * 60 + m) * 60000;
                        onChange({ endedAt: entry.startedAt + newDurationMs });
                      }}
                      className="w-12 rounded border border-rule bg-parchment-soft px-1 py-0.5 font-serif text-sm text-ink text-center"
                    />
                    <span className="text-[11px] font-serif text-ink-mute">m</span>
                  </div>
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
                <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">XP Awarded (Basic)</span>
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

              {/* Strong Start checkable */}
              {(entry.strongStart || campaignStrongStart.trim()) && (
                <div className="rounded border border-rule bg-parchment-soft p-3.5 space-y-1.5 shadow-sm mt-3">
                  <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep block mb-1">Strong Start</span>
                  {entry.strongStart ? (
                    <label className="flex items-start gap-2.5 text-xs cursor-pointer font-serif py-1 rounded">
                      <input
                        type="checkbox"
                        checked={true}
                        onChange={(e) => {
                          if (!e.target.checked) {
                            if (onStrongStartChange) onStrongStartChange(entry.strongStart || '');
                            onChange({ strongStart: undefined });
                          }
                        }}
                        className="mt-0.5 accent-crimson"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-ink font-semibold flex items-center gap-1">
                          <Zap size={12} className="text-crimson" /> Strong Start Delivered:
                        </span>
                        <p className="text-ink-soft mt-0.5 whitespace-pre-wrap italic">"{entry.strongStart}"</p>
                      </div>
                    </label>
                  ) : (
                    <label className="flex items-start gap-2.5 text-xs cursor-pointer font-serif py-1 rounded">
                      <input
                        type="checkbox"
                        checked={false}
                        onChange={(e) => {
                          if (e.target.checked) {
                            onChange({ strongStart: campaignStrongStart });
                            if (onStrongStartChange) onStrongStartChange('');
                          }
                        }}
                        className="mt-0.5 accent-crimson"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-ink-mute flex items-center gap-1">
                          <Zap size={12} className="text-ink-mute" /> Deliver prepped Strong Start:
                        </span>
                        <p className="text-ink-mute mt-0.5 whitespace-pre-wrap italic">"{campaignStrongStart}"</p>
                      </div>
                    </label>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                <div className="rounded border border-rule bg-parchment-soft p-3 space-y-1.5 shadow-sm">
                  <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep block mb-1">Secrets Revealed</span>
                  {allSecrets.length === 0 ? (
                    <p className="text-xs text-ink-mute italic font-serif">No secrets prepped in campaign.</p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-1 border border-rule/50 rounded bg-parchment p-2">
                      {allSecrets.map((s, i) => {
                        const isRevealed = entry.secretsRevealed?.includes(s);
                        return (
                          <label key={i} className="flex items-start gap-2 text-xs cursor-pointer font-serif py-0.5 hover:bg-parchment-deep/20 rounded px-1">
                            <input
                              type="checkbox"
                              checked={isRevealed}
                              onChange={(e) => {
                                const nextSecrets = e.target.checked
                                  ? [...(entry.secretsRevealed || []), s]
                                  : (entry.secretsRevealed || []).filter(x => x !== s);
                                onChange({ secretsRevealed: nextSecrets });
                              }}
                              className="mt-0.5 accent-crimson"
                            />
                            <span className={isRevealed ? 'text-ink font-semibold' : 'text-ink-soft'}>{s}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="rounded border border-rule bg-parchment-soft p-3 space-y-1.5 shadow-sm">
                  <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep block mb-1">Scenes Used</span>
                  {allScenes.length === 0 ? (
                    <p className="text-xs text-ink-mute italic font-serif">No scenes prepped in campaign.</p>
                  ) : (
                    <div className="max-h-48 overflow-y-auto space-y-1 border border-rule/50 rounded bg-parchment p-2">
                      {allScenes.map((s, i) => {
                        const isUsed = entry.scenesUsed?.includes(s);
                        return (
                          <label key={i} className="flex items-start gap-2 text-xs cursor-pointer font-serif py-0.5 hover:bg-parchment-deep/20 rounded px-1">
                            <input
                              type="checkbox"
                              checked={isUsed}
                              onChange={(e) => {
                                const nextScenes = e.target.checked
                                  ? [...(entry.scenesUsed || []), s]
                                  : (entry.scenesUsed || []).filter(x => x !== s);
                                onChange({ scenesUsed: nextScenes });
                              }}
                              className="mt-0.5 accent-crimson"
                            />
                            <span className={isUsed ? 'text-ink font-semibold' : 'text-ink-soft'}>{s}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Prep Utilization Ledger Edit Section */}
              <div className="rounded border border-rule bg-parchment-soft p-3.5 space-y-3 shadow-sm mt-3">
                <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep block border-b border-rule/40 pb-1">Prep Utilization & Party State Ledger</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  {/* NPCs utilization */}
                  <div className="space-y-2">
                    <span className="font-display text-[9px] uppercase tracking-wider text-ink-mute block">NPCs Utilized</span>
                    <ul className="space-y-1">
                      {linkedItems.filter(i => i.type === 'npc').map(item => {
                        const ghost = isGhostItem(item);
                        return (
                          <li key={item.id} className="flex items-center justify-between gap-1.5 px-2 py-1 rounded bg-parchment border border-rule/40 text-xs font-serif">
                            <span className={ghost ? "text-ink-mute italic flex items-center gap-1" : "text-ink"}>
                              {ghost && <span className="inline-block px-1 py-0.2 text-[8px] bg-wine/10 text-wine rounded font-display uppercase tracking-wider scale-90">Ghost</span>}
                              {item.snapshotName}
                            </span>
                            <button type="button" onClick={() => handleRemoveLink('npc', item.id)} className="text-ink-mute hover:text-crimson transition-colors">
                              <X size={12} />
                            </button>
                          </li>
                        );
                      })}
                      {linkedItems.filter(i => i.type === 'npc').length === 0 && (
                        <li className="text-[11px] text-ink-mute italic font-serif">No NPCs linked</li>
                      )}
                    </ul>
                    <select
                      value=""
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) return;
                        const npc = npcs.find(n => n.id === val);
                        if (npc) handleAddLink('npc', val, npc.name || 'Unnamed NPC');
                      }}
                      className="w-full bg-parchment border border-rule/50 rounded px-2 py-0.5 text-xs text-ink-soft font-serif cursor-pointer hover:border-brass transition-colors focus:outline-none"
                    >
                      <option value="">+ Link NPC</option>
                      {npcs.filter(n => !linkedItems.some(i => i.type === 'npc' && i.id === n.id)).map(n => (
                        <option key={n.id} value={n.id}>{n.name || 'Unnamed NPC'}</option>
                      ))}
                    </select>
                  </div>

                  {/* Locations utilization */}
                  <div className="space-y-2">
                    <span className="font-display text-[9px] uppercase tracking-wider text-ink-mute block">Locations Utilized</span>
                    <ul className="space-y-1">
                      {linkedItems.filter(i => i.type === 'location').map(item => {
                        const ghost = isGhostItem(item);
                        return (
                          <li key={item.id} className="flex items-center justify-between gap-1.5 px-2 py-1 rounded bg-parchment border border-rule/40 text-xs font-serif">
                            <span className={ghost ? "text-ink-mute italic flex items-center gap-1" : "text-ink"}>
                              {ghost && <span className="inline-block px-1 py-0.2 text-[8px] bg-wine/10 text-wine rounded font-display uppercase tracking-wider scale-90">Ghost</span>}
                              {item.snapshotName}
                            </span>
                            <button type="button" onClick={() => handleRemoveLink('location', item.id)} className="text-ink-mute hover:text-crimson transition-colors">
                              <X size={12} />
                            </button>
                          </li>
                        );
                      })}
                      {linkedItems.filter(i => i.type === 'location').length === 0 && (
                        <li className="text-[11px] text-ink-mute italic font-serif">No locations linked</li>
                      )}
                    </ul>
                    <select
                      value=""
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) return;
                        const loc = locations.find(l => l.id === val || l.name === val);
                        if (loc) handleAddLink('location', val, loc.name);
                      }}
                      className="w-full bg-parchment border border-rule/50 rounded px-2 py-0.5 text-xs text-ink-soft font-serif cursor-pointer hover:border-brass transition-colors focus:outline-none"
                    >
                      <option value="">+ Link Location</option>
                      {locations.filter(l => !linkedItems.some(i => i.type === 'location' && (i.id === l.id || i.snapshotName === l.name))).map((l, idx) => (
                        <option key={l.id || idx} value={l.id || l.name}>{l.name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Encounters utilization */}
                  <div className="space-y-2">
                    <span className="font-display text-[9px] uppercase tracking-wider text-ink-mute block">Encounters Utilized</span>
                    <ul className="space-y-1.5">
                      {linkedItems.filter(i => i.type === 'encounter').map(item => {
                        const ghost = isGhostItem(item);
                        return (
                          <li key={item.id} className="space-y-1 px-2 py-1.5 rounded bg-parchment border border-rule/40 text-xs font-serif">
                            <div className="flex items-center justify-between gap-1.5">
                              <span className={ghost ? "text-ink-mute italic flex items-center gap-1" : "text-ink font-semibold"}>
                                {ghost && <span className="inline-block px-1 py-0.2 text-[8px] bg-wine/10 text-wine rounded font-display uppercase tracking-wider scale-90">Ghost</span>}
                                {item.snapshotName}
                              </span>
                              <button type="button" onClick={() => handleRemoveLink('encounter', item.id)} className="text-ink-mute hover:text-crimson transition-colors">
                                <X size={12} />
                              </button>
                            </div>
                            <div className="flex items-center gap-1 pt-0.5">
                              <span className="text-[10px] font-display uppercase text-brass-deep">XP:</span>
                              <input
                                type="number"
                                min={0}
                                value={item.snapshotXP || 0}
                                onChange={(e) => handleUpdateXP(item.id, parseInt(e.target.value || '0', 10))}
                                className="w-16 bg-parchment-soft border border-rule/60 rounded px-1 text-[11px] text-ink text-center focus:outline-none"
                              />
                            </div>
                          </li>
                        );
                      })}
                      {linkedItems.filter(i => i.type === 'encounter').length === 0 && (
                        <li className="text-[11px] text-ink-mute italic font-serif">No encounters linked</li>
                      )}
                    </ul>
                    <select
                      value=""
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) return;
                        const name = parseMonsterName(val);
                        const xp = parseMonsterXP(val);
                        handleAddLink('encounter', val, name, { xp });
                      }}
                      className="w-full bg-parchment border border-rule/50 rounded px-2 py-0.5 text-xs text-ink-soft font-serif cursor-pointer hover:border-brass transition-colors focus:outline-none"
                    >
                      <option value="">+ Link Encounter</option>
                      {monsters.filter(m => !linkedItems.some(i => i.type === 'encounter' && i.id === m)).map((m, idx) => (
                        <option key={idx} value={m}>{parseMonsterName(m)}</option>
                      ))}
                    </select>
                  </div>

                  {/* Loot utilization */}
                  <div className="space-y-2">
                    <span className="font-display text-[9px] uppercase tracking-wider text-ink-mute block">Loot Awarded</span>
                    <ul className="space-y-1">
                      {linkedItems.filter(i => i.type === 'loot').map(item => {
                        const ghost = isGhostItem(item);
                        return (
                          <li key={item.id} className="flex items-center justify-between gap-1.5 px-2 py-1 rounded bg-parchment border border-rule/40 text-xs font-serif" title={item.snapshotLoot}>
                            <span className={ghost ? "text-ink-mute italic flex items-center gap-1 truncate max-w-[80%]" : "text-ink truncate max-w-[80%]"}>
                              {ghost && <span className="inline-block px-1 py-0.2 text-[8px] bg-wine/10 text-wine rounded font-display uppercase tracking-wider scale-90 flex-shrink-0">Ghost</span>}
                              {item.snapshotName}
                            </span>
                            <button type="button" onClick={() => handleRemoveLink('loot', item.id)} className="text-ink-mute hover:text-crimson transition-colors flex-shrink-0">
                              <X size={12} />
                            </button>
                          </li>
                        );
                      })}
                      {linkedItems.filter(i => i.type === 'loot').length === 0 && (
                        <li className="text-[11px] text-ink-mute italic font-serif">No loot linked</li>
                      )}
                    </ul>
                    <select
                      value=""
                      onChange={(e) => {
                        const val = e.target.value;
                        if (!val) return;
                        const itemObj = items.map((it, idx) => normalizeItem(it, idx)).find(it => it.id === val);
                        if (itemObj) {
                          handleAddLink('loot', val, itemObj.name, { loot: itemObj.description });
                        } else {
                          handleAddLink('loot', val, val, { loot: val });
                        }
                      }}
                      className="w-full bg-parchment border border-rule/50 rounded px-2 py-0.5 text-xs text-ink-soft font-serif cursor-pointer hover:border-brass transition-colors focus:outline-none"
                    >
                      <option value="">+ Link Loot</option>
                      {items.map((it, idx) => normalizeItem(it, idx))
                        .filter(it => !linkedItems.some(i => i.type === 'loot' && i.id === it.id))
                        .map(it => (
                          <option key={it.id} value={it.id}>{it.name || 'Unnamed Item'}</option>
                        ))
                      }
                      {treasure.filter(t => !linkedItems.some(i => i.type === 'loot' && i.id === t)).map((t, idx) => (
                        <option key={`t-${idx}`} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

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

              <NpcDialogueLines text={entry.recap || ''} npcs={npcs} />

              {entry.strongStart && (
                <div className="mt-3 rounded border border-crimson/30 bg-crimson/5 p-3 flex items-start gap-2.5 shadow-sm max-w-2xl">
                  <Zap size={14} className="text-crimson mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="font-display text-[10px] uppercase tracking-wider text-crimson block font-semibold">Strong Start Delivered</span>
                    <p className="mt-0.5 text-sm font-serif text-ink-soft whitespace-pre-wrap italic">
                      "{entry.strongStart}"
                    </p>
                  </div>
                </div>
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

              {/* Prep Utilized in Session Display Section */}
              {linkedItems.length > 0 && (
                <div className="rounded border border-rule bg-parchment-soft/40 p-3 space-y-2 mt-2">
                  <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep border-b border-rule/30 pb-0.5">Prep Utilized in Session</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs font-serif text-ink-soft">
                    {/* NPCs */}
                    <div>
                      <span className="font-display text-[9px] uppercase tracking-wider text-ink-mute block mb-1">NPCs</span>
                      {linkedItems.filter(i => i.type === 'npc').length === 0 ? (
                        <span className="text-[10px] text-ink-mute italic">None</span>
                      ) : (
                        <ul className="space-y-0.5 list-disc pl-3">
                          {linkedItems.filter(i => i.type === 'npc').map(item => {
                            const ghost = isGhostItem(item);
                            return (
                              <li key={item.id}>
                                <span className={ghost ? "text-ink-mute italic" : "text-ink"}>
                                  {item.snapshotName}
                                  {ghost && <span className="inline-block ml-1 text-[8px] bg-wine/10 text-wine px-0.5 rounded uppercase tracking-wider font-display scale-90">Ghost</span>}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    {/* Locations */}
                    <div>
                      <span className="font-display text-[9px] uppercase tracking-wider text-ink-mute block mb-1">Locations</span>
                      {linkedItems.filter(i => i.type === 'location').length === 0 ? (
                        <span className="text-[10px] text-ink-mute italic">None</span>
                      ) : (
                        <ul className="space-y-0.5 list-disc pl-3">
                          {linkedItems.filter(i => i.type === 'location').map(item => {
                            const ghost = isGhostItem(item);
                            return (
                              <li key={item.id}>
                                <span className={ghost ? "text-ink-mute italic" : "text-ink"}>
                                  {item.snapshotName}
                                  {ghost && <span className="inline-block ml-1 text-[8px] bg-wine/10 text-wine px-0.5 rounded uppercase tracking-wider font-display scale-90">Ghost</span>}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    {/* Encounters */}
                    <div>
                      <span className="font-display text-[9px] uppercase tracking-wider text-ink-mute block mb-1">Encounters</span>
                      {linkedItems.filter(i => i.type === 'encounter').length === 0 ? (
                        <span className="text-[10px] text-ink-mute italic">None</span>
                      ) : (
                        <ul className="space-y-0.5 list-disc pl-3">
                          {linkedItems.filter(i => i.type === 'encounter').map(item => {
                            const ghost = isGhostItem(item);
                            return (
                              <li key={item.id}>
                                <span className={ghost ? "text-ink-mute italic" : "text-ink font-semibold"}>
                                  {item.snapshotName}
                                  {item.snapshotXP ? ` (${item.snapshotXP} XP)` : ''}
                                  {ghost && <span className="inline-block ml-1 text-[8px] bg-wine/10 text-wine px-0.5 rounded uppercase tracking-wider font-display scale-90">Ghost</span>}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    {/* Loot */}
                    <div>
                      <span className="font-display text-[9px] uppercase tracking-wider text-ink-mute block mb-1">Loot</span>
                      {linkedItems.filter(i => i.type === 'loot').length === 0 ? (
                        <span className="text-[10px] text-ink-mute italic">None</span>
                      ) : (
                        <ul className="space-y-0.5 list-disc pl-3">
                          {linkedItems.filter(i => i.type === 'loot').map(item => {
                            const ghost = isGhostItem(item);
                            return (
                              <li key={item.id} title={item.snapshotLoot}>
                                <span className={ghost ? "text-ink-mute italic" : "text-ink"}>
                                  {item.snapshotName}
                                  {ghost && <span className="inline-block ml-1 text-[8px] bg-wine/10 text-wine px-0.5 rounded uppercase tracking-wider font-display scale-90 font-sans">Ghost</span>}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  </div>
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
