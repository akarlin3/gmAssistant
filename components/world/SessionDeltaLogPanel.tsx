'use client';

import React, { useState, useMemo } from 'react';
import {
  CalendarClock,
  Flame,
  Clock,
  Plus,
  Check,
  Trash2,
  ArrowRight,
  ListChecks,
} from 'lucide-react';
import {
  readSessionDeltaLog,
  makeSessionDeltaId,
  applySessionDeltaToState,
  CLOCK_STATUS_OPTIONS,
  type ClockStatus,
  type SessionDeltaClockChange,
  type SessionDeltaFactionChange,
  type SessionDeltaEntry,
} from '@/lib/world/sessionDelta';
import { readWorldClock } from '@/lib/world/types';
import { todayISO } from '@/lib/sessionLog';

export type SessionDeltaLogPanelProps = {
  state: Record<string, any>;
  onStateChange?: (updater: (prev: Record<string, any>) => Record<string, any>) => void;
  setState?: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  compact?: boolean;
};

export function SessionDeltaLogPanel({
  state,
  onStateChange: rawOnStateChange,
  setState,
  compact = false,
}: SessionDeltaLogPanelProps) {
  const onStateChange = (updater: (prev: Record<string, any>) => Record<string, any>) => {
    if (rawOnStateChange) {
      rawOnStateChange(updater);
    } else if (setState) {
      setState(updater);
    }
  };
  const wc = useMemo(() => readWorldClock(state), [state]);
  const deltaLog = useMemo(() => readSessionDeltaLog(state), [state]);
  const clocks = useMemo(() => (Array.isArray(state.clocks) ? state.clocks : []), [state.clocks]);
  const factions = useMemo(
    () => (Array.isArray(state.factions) ? state.factions : []),
    [state.factions],
  );

  const [inWorldDay, setInWorldDay] = useState<number>(wc.currentDay);
  const [inWorldDate, setInWorldDate] = useState<string>(
    (typeof state.inWorldCalendarDate === 'string' && state.inWorldCalendarDate) ||
      `Day ${wc.currentDay}`,
  );
  const [bullet1, setBullet1] = useState('');
  const [bullet2, setBullet2] = useState('');
  const [bullet3, setBullet3] = useState('');

  // Draft clock deltas: clockIndex -> { after, status }
  const [clockDeltas, setClockDeltas] = useState<
    Record<number, { after: number; status?: ClockStatus }>
  >({});

  // Draft faction heat/renown deltas: factionIndex -> { heatAfter, renownAfter }
  const [factionDeltas, setFactionDeltas] = useState<
    Record<number, { heatAfter: number; renownAfter: number }>
  >({});

  const [savedNotice, setSavedNotice] = useState(false);

  const handleDayStep = (delta: number) => {
    const nextDay = Math.max(1, inWorldDay + delta);
    setInWorldDay(nextDay);
    if (!inWorldDate || /^Day \d+$/i.test(inWorldDate.trim())) {
      setInWorldDate(`Day ${nextDay}`);
    }
  };

  const handleRecordDelta = () => {
    const clockChanges: SessionDeltaClockChange[] = [];
    clocks.forEach((c: any, idx: number) => {
      const before = c.filled || 0;
      const max = c.max || 6;
      const draft = clockDeltas[idx];
      if (!draft) return;
      if (draft.after !== before || (draft.status && draft.status !== c.status)) {
        clockChanges.push({
          clockId: c.id || `clock-${idx}`,
          clockName: c.text || `Clock ${idx + 1}`,
          faction: c.faction,
          before,
          after: draft.after,
          max,
          status: draft.status || (draft.after >= max ? 'triggered' : c.status || 'active'),
          triggerNote: c.triggerNote,
        });
      }
    });

    const factionChanges: SessionDeltaFactionChange[] = [];
    factions.forEach((f: any, idx: number) => {
      const heatBefore = typeof f.heat === 'number' ? f.heat : 0;
      const renownBefore = typeof f.renown === 'number' ? f.renown : 0;
      const draft = factionDeltas[idx];
      if (!draft) return;
      if (draft.heatAfter !== heatBefore || draft.renownAfter !== renownBefore) {
        factionChanges.push({
          factionId: f.id || `fac-${idx}`,
          factionName: f.name || `Faction ${idx + 1}`,
          heatBefore,
          heatAfter: draft.heatAfter,
          renownBefore,
          renownAfter: draft.renownAfter,
        });
      }
    });

    const entry: SessionDeltaEntry = {
      id: makeSessionDeltaId(),
      inWorldDay,
      inWorldDate: inWorldDate.trim() || `Day ${inWorldDay}`,
      realDate: todayISO(),
      consequences: [
        bullet1.trim() || 'World state progressed.',
        bullet2.trim(),
        bullet3.trim(),
      ],
      clockChanges,
      factionChanges,
      createdAt: Date.now(),
    };

    onStateChange((prev) => applySessionDeltaToState(prev, entry));
    setBullet1('');
    setBullet2('');
    setBullet3('');
    setClockDeltas({});
    setFactionDeltas({});
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  const handleDeleteEntry = (id: string) => {
    onStateChange((prev) => ({
      ...prev,
      sessionDeltaLog: readSessionDeltaLog(prev).filter((e) => e.id !== id),
    }));
  };

  return (
    <section className="space-y-3 rounded-lg border border-rule bg-parchment p-3.5 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-2">
        <div className="flex items-center gap-2">
          <CalendarClock size={16} className="text-crimson" />
          <div>
            <h3 className="font-display text-sm uppercase tracking-wider text-ink">
              Session Delta Log &amp; In-World Calendar
            </h3>
            <p className="font-serif text-[11px] italic text-ink-mute">
              Record the in-world date, 3-bullet session consequences, and faction heat/clock shifts.
            </p>
          </div>
        </div>
        <span className="rounded border border-brass-deep/40 bg-brass/10 px-2 py-0.5 font-display text-xs uppercase tracking-wider text-brass-deep">
          Current: {state.inWorldCalendarDate || `Day ${wc.currentDay}`}
        </span>
      </div>

      {/* Form to log a new Session Delta */}
      <div className="space-y-3 rounded border border-rule bg-parchment-soft p-3">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label className="mb-1 block font-display text-[10px] uppercase tracking-wider text-brass-deep">
              In-World Day Counter
            </label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleDayStep(-1)}
                className="rounded border border-rule bg-parchment px-2 py-1 font-display text-xs text-ink-soft hover:bg-parchment-deep"
              >
                −1d
              </button>
              <input
                type="number"
                min={1}
                value={inWorldDay}
                onChange={(e) => setInWorldDay(Math.max(1, parseInt(e.target.value || '1', 10) || 1))}
                className="w-20 rounded border border-rule bg-parchment px-2 py-1 text-center font-serif text-xs text-ink"
              />
              <button
                type="button"
                onClick={() => handleDayStep(1)}
                className="rounded border border-rule bg-parchment px-2 py-1 font-display text-xs text-ink-soft hover:bg-parchment-deep"
              >
                +1d
              </button>
              <button
                type="button"
                onClick={() => handleDayStep(7)}
                className="rounded border border-rule bg-parchment px-2 py-1 font-display text-xs text-ink-soft hover:bg-parchment-deep"
              >
                +7d
              </button>
            </div>
          </div>
          <div>
            <label className="mb-1 block font-display text-[10px] uppercase tracking-wider text-brass-deep">
              In-World Calendar Date Label
            </label>
            <input
              type="text"
              value={inWorldDate}
              onChange={(e) => setInWorldDate(e.target.value)}
              placeholder="e.g. Day 14 · 14 Ches (Equinox)"
              className="w-full rounded border border-rule bg-parchment px-2.5 py-1 font-serif text-xs text-ink placeholder:italic placeholder:text-ink-faint focus:border-crimson focus:outline-none"
            />
          </div>
        </div>

        {/* 3-Bullet Session Consequences */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 font-display text-[10px] uppercase tracking-wider text-brass-deep">
            <ListChecks size={12} /> 3-Bullet Session Consequences
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="font-display text-xs text-crimson">1.</span>
              <input
                type="text"
                value={bullet1}
                onChange={(e) => setBullet1(e.target.value)}
                placeholder="Consequence 1 — e.g. The Harbor Quarantine tightened after the warehouse fire"
                className="flex-1 rounded border border-rule bg-parchment px-2.5 py-1 font-serif text-xs text-ink placeholder:italic placeholder:text-ink-faint focus:border-crimson focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-display text-xs text-crimson">2.</span>
              <input
                type="text"
                value={bullet2}
                onChange={(e) => setBullet2(e.target.value)}
                placeholder="Consequence 2 — e.g. Inka's cover was blown; the Iron Hand dispatched bounty hunters"
                className="flex-1 rounded border border-rule bg-parchment px-2.5 py-1 font-serif text-xs text-ink placeholder:italic placeholder:text-ink-faint focus:border-crimson focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-display text-xs text-crimson">3.</span>
              <input
                type="text"
                value={bullet3}
                onChange={(e) => setBullet3(e.target.value)}
                placeholder="Consequence 3 — e.g. The Sunken Cistern seal cracked, flooding Lower Pier at high tide"
                className="flex-1 rounded border border-rule bg-parchment px-2.5 py-1 font-serif text-xs text-ink placeholder:italic placeholder:text-ink-faint focus:border-crimson focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Clock & Faction Heat Shifts */}
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {/* Faction Clocks Delta Selector */}
          <div className="space-y-1.5 rounded border border-rule/80 bg-parchment p-2.5">
            <div className="flex items-center gap-1.5 font-display text-[10px] uppercase tracking-wider text-brass-deep">
              <Clock size={11} /> Faction Clock Shifts ({clocks.length})
            </div>
            {clocks.length === 0 ? (
              <p className="font-serif text-[11px] italic text-ink-mute">
                No faction clocks yet.
              </p>
            ) : (
              <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                {clocks.map((c: any, idx: number) => {
                  const before = c.filled || 0;
                  const max = c.max || 6;
                  const currentAfter = clockDeltas[idx]?.after ?? before;
                  const currentStatus = (clockDeltas[idx]?.status ?? c.status ?? 'active') as ClockStatus;
                  return (
                    <div
                      key={c.id || idx}
                      className="flex flex-wrap items-center justify-between gap-1.5 rounded border border-rule/60 bg-parchment-soft px-2 py-1 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-display text-[11px] text-ink">
                          {c.text || `Clock ${idx + 1}`}
                        </div>
                        {c.faction && (
                          <div className="truncate font-serif text-[10px] italic text-ink-mute">
                            {c.faction}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setClockDeltas((prev) => ({
                              ...prev,
                              [idx]: {
                                after: Math.max(0, currentAfter - 1),
                                status: currentStatus,
                              },
                            }))
                          }
                          className="size-5 rounded border border-rule bg-parchment font-display text-[10px] text-ink-soft hover:bg-parchment-deep"
                        >
                          −
                        </button>
                        <span
                          className={`min-w-10 text-center font-display text-[11px] ${
                            currentAfter !== before ? 'font-bold text-crimson' : 'text-brass-deep'
                          }`}
                        >
                          {before}→{currentAfter}/{max}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setClockDeltas((prev) => ({
                              ...prev,
                              [idx]: {
                                after: Math.min(max, currentAfter + 1),
                                status: currentStatus,
                              },
                            }))
                          }
                          className="size-5 rounded border border-rule bg-parchment font-display text-[10px] text-ink-soft hover:bg-parchment-deep"
                        >
                          +
                        </button>
                        <select
                          value={currentStatus}
                          onChange={(e) =>
                            setClockDeltas((prev) => ({
                              ...prev,
                              [idx]: {
                                after: currentAfter,
                                status: e.target.value as ClockStatus,
                              },
                            }))
                          }
                          className="rounded border border-rule bg-parchment px-1 py-0.5 font-display text-[9px] uppercase text-ink-soft"
                        >
                          {CLOCK_STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Faction Heat & Renown Delta Selector */}
          <div className="space-y-1.5 rounded border border-rule/80 bg-parchment p-2.5">
            <div className="flex items-center gap-1.5 font-display text-[10px] uppercase tracking-wider text-brass-deep">
              <Flame size={11} className="text-crimson" /> Faction Heat &amp; Renown Shifts ({factions.length})
            </div>
            {factions.length === 0 ? (
              <p className="font-serif text-[11px] italic text-ink-mute">
                No factions defined yet.
              </p>
            ) : (
              <div className="max-h-40 space-y-1.5 overflow-y-auto pr-1">
                {factions.map((f: any, idx: number) => {
                  const heatBefore = typeof f.heat === 'number' ? f.heat : 0;
                  const renownBefore = typeof f.renown === 'number' ? f.renown : 0;
                  const heatAfter = factionDeltas[idx]?.heatAfter ?? heatBefore;
                  const renownAfter = factionDeltas[idx]?.renownAfter ?? renownBefore;
                  return (
                    <div
                      key={f.id || idx}
                      className="flex flex-wrap items-center justify-between gap-1.5 rounded border border-rule/60 bg-parchment-soft px-2 py-1 text-xs"
                    >
                      <span className="min-w-0 flex-1 truncate font-display text-[11px] text-ink">
                        {f.name || `Faction ${idx + 1}`}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="font-display text-[9px] uppercase text-crimson">Heat:</span>
                        <button
                          type="button"
                          onClick={() =>
                            setFactionDeltas((prev) => ({
                              ...prev,
                              [idx]: {
                                heatAfter: Math.max(0, heatAfter - 1),
                                renownAfter,
                              },
                            }))
                          }
                          className="size-5 rounded border border-rule bg-parchment font-display text-[10px]"
                        >
                          −
                        </button>
                        <span
                          className={`font-display text-[11px] ${
                            heatAfter !== heatBefore ? 'font-bold text-crimson' : 'text-ink-soft'
                          }`}
                        >
                          {heatBefore}→{heatAfter}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setFactionDeltas((prev) => ({
                              ...prev,
                              [idx]: {
                                heatAfter: Math.min(10, heatAfter + 1),
                                renownAfter,
                              },
                            }))
                          }
                          className="size-5 rounded border border-rule bg-parchment font-display text-[10px]"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between pt-1">
          {savedNotice ? (
            <span className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-moss">
              <Check size={12} /> Session Delta Recorded &amp; World State Updated
            </span>
          ) : (
            <span className="font-serif text-[11px] italic text-ink-mute">
              Committing applies clock &amp; heat changes directly to campaign state.
            </span>
          )}
          <button
            type="button"
            onClick={handleRecordDelta}
            className="flex items-center gap-1.5 rounded border border-crimson bg-crimson px-3 py-1.5 font-display text-xs uppercase tracking-wider text-parchment shadow-sm hover:bg-wine"
          >
            <Plus size={12} /> Record Session Delta
          </button>
        </div>
      </div>

      {/* Recorded Session Delta Log History */}
      {deltaLog.length > 0 && (
        <div className="space-y-2 pt-1">
          <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
            Recorded Session Deltas ({deltaLog.length})
          </div>
          <div className={compact ? 'max-h-56 space-y-2 overflow-y-auto pr-1' : 'space-y-2'}>
            {deltaLog.map((entry) => (
              <div
                key={entry.id}
                className="space-y-1.5 rounded border border-rule bg-parchment-soft p-2.5 text-xs"
              >
                <div className="flex items-center justify-between gap-2 border-b border-rule/60 pb-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-crimson/10 px-1.5 py-0.5 font-display text-[10px] uppercase tracking-wider text-crimson">
                      {entry.inWorldDate} (Day {entry.inWorldDay})
                    </span>
                    <span className="font-serif text-[11px] italic text-ink-mute">
                      {entry.realDate}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteEntry(entry.id)}
                    className="text-ink-mute hover:text-crimson"
                    title="Delete delta log entry"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>

                <ul className="ml-4 list-disc space-y-0.5 font-serif text-xs text-ink">
                  {entry.consequences
                    .filter((b) => b && b.trim())
                    .map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                </ul>

                {(entry.clockChanges.length > 0 || entry.factionChanges.length > 0) && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {entry.clockChanges.map((cc, i) => (
                      <span
                        key={`cc-${i}`}
                        className="inline-flex items-center gap-1 rounded border border-brass-deep/40 bg-parchment px-1.5 py-0.5 font-display text-[10px] uppercase tracking-wider text-brass-deep"
                      >
                        <Clock size={10} /> {cc.clockName}: {cc.before} <ArrowRight size={9} />{' '}
                        {cc.after}/{cc.max}
                        {cc.status ? ` (${cc.status})` : ''}
                      </span>
                    ))}
                    {entry.factionChanges.map((fc, i) => (
                      <span
                        key={`fc-${i}`}
                        className="inline-flex items-center gap-1 rounded border border-crimson/40 bg-crimson/5 px-1.5 py-0.5 font-display text-[10px] uppercase tracking-wider text-crimson"
                      >
                        <Flame size={10} /> {fc.factionName} Heat: {fc.heatBefore}{' '}
                        <ArrowRight size={9} /> {fc.heatAfter}/10
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

export default SessionDeltaLogPanel;
