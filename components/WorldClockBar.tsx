'use client';

import React, { useMemo, useState } from 'react';
import {
  addExplorationTimer,
  advanceToNextDawn,
  advanceWorldClock,
  formatClockTime,
  formatInWorldDate,
  getTimeOfDayBadge,
  normalizeWorldClock,
  PRESET_TIMERS,
  rechargeDawnPoolsForParty,
  removeExplorationTimer,
  SECONDS_PER_HOUR,
  SECONDS_PER_ROUND,
  SECONDS_PER_TURN_10M,
  type ActiveWorldTimer,
  type ExtendedWorldClock,
  type ProjectedWorldClock,
} from '@/lib/worldClock';
import type { PlayerCharacter } from '@/lib/pc/types';

export interface WorldClockBarProps {
  role: 'gm' | 'player';
  /** Raw worldClock object for GM or ProjectedWorldClock for `/player`. */
  worldClock?: Partial<ExtendedWorldClock> | ProjectedWorldClock | null;
  /** Party PCs so advancing past Dawn automatically recharges `rechargeOn: 'dawn'` resource pools. */
  pcs?: PlayerCharacter[];
  /** Active Faction Clocks count to prompt the GM on dawn transition. */
  factionClocksCount?: number;
  onChangeWorldClock?: (nextClock: ExtendedWorldClock) => void;
  onUpdatePcs?: (nextPcs: PlayerCharacter[]) => void;
  onAwardPartyDowntimeDay?: () => void;
}

const BADGE_STYLE: Record<string, string> = {
  Dawn: 'bg-amber-500/20 text-amber-200 border-amber-500/40',
  Morning: 'bg-sky-500/20 text-sky-200 border-sky-500/40',
  Dusk: 'bg-orange-500/20 text-orange-200 border-orange-500/40',
  Midnight: 'bg-indigo-500/20 text-indigo-200 border-indigo-500/40',
};

const BADGE_ICON: Record<string, string> = {
  Dawn: '🌅',
  Morning: '☀️',
  Dusk: '🌇',
  Midnight: '🌙',
};

export function WorldClockBar({
  role,
  worldClock: rawClock,
  pcs = [],
  factionClocksCount = 0,
  onChangeWorldClock,
  onUpdatePcs,
  onAwardPartyDowntimeDay,
}: WorldClockBarProps) {
  const clock = useMemo(() => normalizeWorldClock(rawClock as Partial<ExtendedWorldClock>), [rawClock]);

  const [expiredAlert, setExpiredAlert] = useState<ActiveWorldTimer[]>([]);
  const [dawnToast, setDawnToast] = useState<{
    dawnsCrossed: number;
    rechargedPools: Array<{ pcId: string; pcName: string; poolName: string; previous: number; next: number }>;
    previousClock: ExtendedWorldClock;
    previousPcs: PlayerCharacter[];
  } | null>(null);
  const [customTimerLabel, setCustomTimerLabel] = useState('');
  const [customTimerMinutes, setCustomTimerMinutes] = useState(60);
  const [showTimerDrawer, setShowTimerDrawer] = useState(false);

  const badge = getTimeOfDayBadge(clock.hour);
  const formattedDate = formatInWorldDate(clock);
  const formattedTime = formatClockTime(clock);

  const applyTimeStep = (res: ReturnType<typeof advanceWorldClock>) => {
    const prevClock = clock;
    const prevPcs = pcs;

    onChangeWorldClock?.(res.clock);

    if (res.expiredTimers.length > 0) {
      setExpiredAlert(res.expiredTimers);
    }

    if (res.dawnsCrossed > 0) {
      const recharge = rechargeDawnPoolsForParty(pcs);
      if (recharge.changed && onUpdatePcs) {
        onUpdatePcs(recharge.pcs);
      }
      setDawnToast({
        dawnsCrossed: res.dawnsCrossed,
        rechargedPools: recharge.recharged,
        previousClock: prevClock,
        previousPcs: prevPcs,
      });
    }
  };

  const handleAdvanceSeconds = (sec: number) => {
    if (role !== 'gm') return;
    applyTimeStep(advanceWorldClock(clock, sec));
  };

  const handleNextDawn = () => {
    if (role !== 'gm') return;
    applyTimeStep(advanceToNextDawn(clock));
  };

  const handleUndoDawn = () => {
    if (!dawnToast) return;
    onChangeWorldClock?.(dawnToast.previousClock);
    if (onUpdatePcs) {
      onUpdatePcs(dawnToast.previousPcs);
    }
    setDawnToast(null);
  };

  const handleAddPresetTimer = (label: string, durationSeconds: number) => {
    if (role !== 'gm' || !onChangeWorldClock) return;
    onChangeWorldClock(addExplorationTimer(clock, { label, durationSeconds }));
  };

  const handleAddCustomTimer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTimerLabel.trim() || !onChangeWorldClock) return;
    onChangeWorldClock(
      addExplorationTimer(clock, {
        label: customTimerLabel.trim(),
        durationSeconds: Math.max(6, Math.round(customTimerMinutes * 60)),
      }),
    );
    setCustomTimerLabel('');
  };

  const formatRemaining = (sec: number): string => {
    if (sec < 60) return `${sec}s`;
    if (sec < 3600) return `${Math.ceil(sec / 60)}m`;
    const h = Math.floor(sec / 3600);
    const m = Math.round((sec % 3600) / 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  };

  if (role === 'player') {
    if (!rawClock) return null;
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-3 py-2 text-xs text-slate-200">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-semibold ${
              BADGE_STYLE[badge] || BADGE_STYLE.Morning
            }`}
          >
            {BADGE_ICON[badge]} {badge}
          </span>
          <span className="font-semibold text-slate-100">{formattedDate}</span>
          <span className="font-mono text-slate-400">{formattedTime}</span>
          <span className="text-[11px] text-slate-400">• Day {clock.day}</span>
        </div>
        {(clock.activeTimers ?? []).length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {(clock.activeTimers ?? []).map((t) => (
              <span
                key={t.id}
                className="rounded bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[11px] text-amber-200"
              >
                ⏳ {t.label}: {formatRemaining(t.remainingSeconds)}
              </span>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/90 p-2.5 text-xs text-slate-100 shadow-md space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Calendar & Time-of-Day Badge */}
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-bold ${
              BADGE_STYLE[badge] || BADGE_STYLE.Morning
            }`}
          >
            {BADGE_ICON[badge]} {badge}
          </span>
          <span className="font-bold text-slate-100">{formattedDate}</span>
          <span className="rounded bg-slate-900 px-2 py-0.5 font-mono text-amber-300 border border-slate-800">
            {formattedTime}
          </span>
          <span className="text-[11px] text-slate-400">
            Campaign Day {clock.day}
          </span>
        </div>

        {/* 1-Tap Advance Buttons */}
        <div className="flex flex-wrap items-center gap-1">
          <button
            type="button"
            onClick={() => handleAdvanceSeconds(SECONDS_PER_ROUND)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-medium text-slate-200 hover:border-amber-500/50"
          >
            +1 Round (6s)
          </button>
          <button
            type="button"
            onClick={() => handleAdvanceSeconds(SECONDS_PER_TURN_10M)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-medium text-slate-200 hover:border-amber-500/50"
          >
            +10m (Dungeon Turn)
          </button>
          <button
            type="button"
            onClick={() => handleAdvanceSeconds(SECONDS_PER_HOUR)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] font-medium text-slate-200 hover:border-amber-500/50"
          >
            +1 Hour
          </button>
          <button
            type="button"
            onClick={handleNextDawn}
            className="rounded border border-amber-500/50 bg-amber-500/20 px-2.5 py-1 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/30"
          >
            🌅 +1 Day (Next Dawn)
          </button>

          <button
            type="button"
            onClick={() => setShowTimerDrawer((v) => !v)}
            className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-300 hover:border-sky-500/50"
          >
            ⏳ Timers ({(clock.activeTimers ?? []).length})
          </button>

          <button
            type="button"
            onClick={() =>
              onChangeWorldClock?.({
                ...clock,
                visibility: clock.visibility === 'party' ? 'private' : 'party',
              })
            }
            title="Toggle whether the World Clock is projected to /player screens"
            className={`rounded border px-2 py-1 text-[11px] font-medium ${
              clock.visibility === 'party'
                ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200'
                : 'border-slate-800 bg-slate-900 text-slate-400'
            }`}
          >
            {clock.visibility === 'party' ? '📢 Party Visible' : '🔒 GM Only'}
          </button>
        </div>
      </div>

      {/* Active Exploration Timers Pills */}
      {(clock.activeTimers ?? []).length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {(clock.activeTimers ?? []).map((t) => (
            <span
              key={t.id}
              className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-200"
            >
              <span>
                🕯️ {t.label} — <strong>{formatRemaining(t.remainingSeconds)}</strong>
              </span>
              <button
                type="button"
                onClick={() => onChangeWorldClock?.(removeExplorationTimer(clock, t.id))}
                className="text-amber-300 hover:text-white"
                title="Dismiss timer"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Exploration Timer Preset & Custom Drawer */}
      {showTimerDrawer && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-800 bg-slate-900/70 p-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-slate-400">Quick Timers:</span>
            {PRESET_TIMERS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => handleAddPresetTimer(preset.label, preset.durationSeconds)}
                className="rounded border border-slate-700 bg-slate-950 px-2 py-0.5 text-[11px] text-amber-200 hover:border-amber-500/50"
              >
                + {preset.label}
              </button>
            ))}
          </div>
          <form onSubmit={handleAddCustomTimer} className="flex items-center gap-1.5">
            <input
              type="text"
              value={customTimerLabel}
              onChange={(e) => setCustomTimerLabel(e.target.value)}
              placeholder="Custom effect (e.g. Bless)"
              className="rounded border border-slate-700 bg-slate-950 px-2 py-0.5 text-[11px] text-slate-100 w-36"
            />
            <input
              type="number"
              min={1}
              max={1440}
              value={customTimerMinutes}
              onChange={(e) => setCustomTimerMinutes(Number(e.target.value) || 10)}
              className="rounded border border-slate-700 bg-slate-950 px-1.5 py-0.5 text-[11px] text-slate-100 w-16"
            />
            <span className="text-[11px] text-slate-400">min</span>
            <button
              type="submit"
              className="rounded bg-sky-500/20 border border-sky-500/40 px-2 py-0.5 text-[11px] text-sky-200"
            >
              + Track
            </button>
          </form>
        </div>
      )}

      {/* Expired Exploration Timers Alert */}
      {expiredAlert.length > 0 && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-lg border border-rose-500/50 bg-rose-950/60 px-3 py-1.5 text-xs text-rose-200"
        >
          <span>
            ⏰ <strong>Timer Expired:</strong>{' '}
            {expiredAlert.map((t) => t.label).join(', ')} has burned out / ended!
          </span>
          <button
            type="button"
            onClick={() => setExpiredAlert([])}
            className="rounded bg-rose-500/20 px-2 py-0.5 text-[11px] text-rose-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Dawn Recharge Toast Summary + Undo + Faction Clock / Downtime Prompt */}
      {dawnToast && (
        <div
          role="status"
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/50 bg-amber-950/60 px-3 py-2 text-xs text-amber-100"
        >
          <div className="space-y-0.5">
            <div className="font-semibold text-amber-200">
              🌅 A New Dawn Breaks (+{dawnToast.dawnsCrossed} Day
              {dawnToast.dawnsCrossed > 1 ? 's' : ''} — Campaign Day {clock.day})
            </div>
            <div className="text-[11px] text-amber-100/85">
              {dawnToast.rechargedPools.length > 0
                ? `Recharged ${dawnToast.rechargedPools.length} 'dawn' pool(s): ${dawnToast.rechargedPools
                    .map((p) => `${p.pcName}'s ${p.poolName} (${p.previous}→${p.next})`)
                    .join(', ')}.`
                : "All party 'dawn' resource pools are at full charges."}{' '}
              {factionClocksCount > 0
                ? `Consider ticking eligible Faction Clocks (${factionClocksCount} active) or awarding Downtime days.`
                : 'Consider ticking world clocks or awarding Downtime days.'}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {onAwardPartyDowntimeDay && (
              <button
                type="button"
                onClick={() => {
                  onAwardPartyDowntimeDay();
                  setDawnToast(null);
                }}
                className="rounded border border-emerald-500/50 bg-emerald-500/20 px-2.5 py-1 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-500/30"
              >
                +1 Downtime Day to Party
              </button>
            )}
            <button
              type="button"
              onClick={handleUndoDawn}
              className="rounded border border-amber-400/50 bg-amber-500/20 px-2.5 py-1 text-[11px] font-semibold text-amber-100 hover:bg-amber-500/30"
            >
              ↩ Undo Dawn
            </button>
            <button
              type="button"
              onClick={() => setDawnToast(null)}
              className="text-amber-300 hover:text-white px-1"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default WorldClockBar;
