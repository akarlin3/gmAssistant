import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ChevronDown, ChevronRight, Pin, PinOff, Edit3, Trash2, Save, X, Award, BookOpen, Zap,
} from 'lucide-react';
import type { SessionLogEntry } from '@/lib/sessionLog';
import { formatDuration } from '@/lib/sessionLog';
import type { ChangeEvent, ChangeEventKind } from '@/lib/sessionEvents';
import { CHANGE_EVENT_LABELS } from '@/lib/sessionEvents';
import { getLocalDateString, getLocalTimeString, parseLocalStart } from '@/lib/date-utils';
import type { NPC, LocationRow } from './types';
import { DetailList } from './presentational';
import { useLinkedPrepItems } from './useLinkedPrepItems';
import { PrepUtilizationDisplay } from './sessionCard/PrepUtilizationDisplay';
import { PrepUtilizationEditor } from './sessionCard/PrepUtilizationEditor';

export type SessionCardProps = {
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
  items: unknown[];
  treasure: string[];
  characters: import('@/lib/character-schema').Character[];
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

export function SessionCard({
  entry, open, editing, inCompare, campaignId, campaignSecrets = [], campaignScenes = [],
  npcs = [], locations = [], monsters = [], items = [], treasure = [],
  campaignStrongStart = '', onStrongStartChange,
  onToggleOpen, onEdit, onCancelEdit, onChange, onSaveEdit, onDelete, onToggleCompare,
}: SessionCardProps) {
  const duration = formatDuration(entry.endedAt - entry.startedAt);
  const eventsByKind = useMemo(() => {
    const acc: Record<ChangeEventKind, ChangeEvent[]> = {} as Record<ChangeEventKind, ChangeEvent[]>;
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

  const { linkedItems, handleAddLink, handleRemoveLink, handleUpdateXP, isGhostItem } =
    useLinkedPrepItems(entry, onChange, { npcs, locations, monsters, items, treasure });

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
                      className="w-12 rounded border border-rule bg-parchment-soft px-1 py-0.5 text-center font-serif text-sm text-ink"
                    />
                    <span className="font-serif text-[11px] text-ink-mute">h</span>
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
                      className="w-12 rounded border border-rule bg-parchment-soft px-1 py-0.5 text-center font-serif text-sm text-ink"
                    />
                    <span className="font-serif text-[11px] text-ink-mute">m</span>
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
                <div className="mt-3 space-y-1.5 rounded border border-rule bg-parchment-soft p-3.5 shadow-sm">
                  <span className="mb-1 block font-display text-[10px] uppercase tracking-wider text-brass-deep">Strong Start</span>
                  {entry.strongStart ? (
                    <label className="flex cursor-pointer items-start gap-2.5 rounded py-1 font-serif text-xs">
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
                      <div className="min-w-0 flex-1">
                        <span className="flex items-center gap-1 font-semibold text-ink">
                          <Zap size={12} className="text-crimson" /> Strong Start Delivered:
                        </span>
                        <p className="mt-0.5 whitespace-pre-wrap italic text-ink-soft">"{entry.strongStart}"</p>
                      </div>
                    </label>
                  ) : (
                    <label className="flex cursor-pointer items-start gap-2.5 rounded py-1 font-serif text-xs">
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
                      <div className="min-w-0 flex-1">
                        <span className="flex items-center gap-1 text-ink-mute">
                          <Zap size={12} className="text-ink-mute" /> Deliver prepped Strong Start:
                        </span>
                        <p className="mt-0.5 whitespace-pre-wrap italic text-ink-mute">"{campaignStrongStart}"</p>
                      </div>
                    </label>
                  )}
                </div>
              )}

              <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="space-y-1.5 rounded border border-rule bg-parchment-soft p-3 shadow-sm">
                  <span className="mb-1 block font-display text-[10px] uppercase tracking-wider text-brass-deep">Secrets Revealed</span>
                  {allSecrets.length === 0 ? (
                    <p className="font-serif text-xs italic text-ink-mute">No secrets prepped in campaign.</p>
                  ) : (
                    <div className="max-h-48 space-y-1 overflow-y-auto rounded border border-rule/50 bg-parchment p-2">
                      {allSecrets.map((s, i) => {
                        const isRevealed = entry.secretsRevealed?.includes(s);
                        return (
                          <label key={i} className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 font-serif text-xs hover:bg-parchment-deep/20">
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
                            <span className={isRevealed ? 'font-semibold text-ink' : 'text-ink-soft'}>{s}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div className="space-y-1.5 rounded border border-rule bg-parchment-soft p-3 shadow-sm">
                  <span className="mb-1 block font-display text-[10px] uppercase tracking-wider text-brass-deep">Scenes Used</span>
                  {allScenes.length === 0 ? (
                    <p className="font-serif text-xs italic text-ink-mute">No scenes prepped in campaign.</p>
                  ) : (
                    <div className="max-h-48 space-y-1 overflow-y-auto rounded border border-rule/50 bg-parchment p-2">
                      {allScenes.map((s, i) => {
                        const isUsed = entry.scenesUsed?.includes(s);
                        return (
                          <label key={i} className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 font-serif text-xs hover:bg-parchment-deep/20">
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
                            <span className={isUsed ? 'font-semibold text-ink' : 'text-ink-soft'}>{s}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              <PrepUtilizationEditor
                linkedItems={linkedItems}
                npcs={npcs}
                locations={locations}
                monsters={monsters}
                items={items}
                treasure={treasure}
                isGhostItem={isGhostItem}
                handleAddLink={handleAddLink}
                handleRemoveLink={handleRemoveLink}
                handleUpdateXP={handleUpdateXP}
              />

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

              {entry.strongStart && (
                <div className="mt-3 flex max-w-2xl items-start gap-2.5 rounded border border-crimson/30 bg-crimson/5 p-3 shadow-sm">
                  <Zap size={14} className="mt-0.5 flex-shrink-0 text-crimson" />
                  <div className="min-w-0 flex-1">
                    <span className="block font-display text-[10px] font-semibold uppercase tracking-wider text-crimson">Strong Start Delivered</span>
                    <p className="mt-0.5 whitespace-pre-wrap font-serif text-sm italic text-ink-soft">
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

              <PrepUtilizationDisplay linkedItems={linkedItems} isGhostItem={isGhostItem} />
            </>
          )}
        </div>
      )}
    </li>
  );
}
