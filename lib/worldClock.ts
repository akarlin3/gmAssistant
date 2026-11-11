// In-World Calendar, Time Tracker & Automated 'dawn' / Timer Triggers.
//
// Integrates with `data.worldClock` (from `lib/world/types.ts`) while adding
// sub-day precision (6-second combat rounds, 10-minute dungeon turns, hours),
// fantasy calendar formatting, active exploration timers (Torch, Light, Mage
// Armor, custom), and automatic `'dawn'` resource pool recharging across the
// party's PCs.

import type { PlayerCharacter, PcResourcePool } from '@/lib/pc/types';
import { readWorldClock, type WorldClock } from '@/lib/world/types';

export type TimeOfDayBadge = 'Dawn' | 'Morning' | 'Afternoon' | 'Dusk' | 'Night';

export const ROUND_SECONDS = 6;
export const DUNGEON_TURN_SECONDS = 10 * 60; // 600s (10 minutes)
export const HOUR_SECONDS = 60 * 60; // 3600s (1 hour)
export const DAY_SECONDS = 24 * 60 * 60; // 86400s (24 hours)
export const DAWN_HOUR = 6;
export const DAWN_SECONDS = DAWN_HOUR * HOUR_SECONDS; // 06:00 (21600s)

export const SECONDS_PER_ROUND = ROUND_SECONDS;
export const SECONDS_PER_TURN_10M = DUNGEON_TURN_SECONDS;
export const SECONDS_PER_HOUR = HOUR_SECONDS;

export type ActiveWorldTimer = {
  id: string;
  label: string;
  remainingSeconds: number;
  totalSeconds: number;
  sourcePcId?: string;
  createdAt?: number;
};

export type CalendarConfig = {
  preset?: 'standard' | 'harptos' | 'greyhawk' | 'custom';
  calendarName?: string;
  customDayLabel?: string;
  monthNames: string[];
  daysPerMonth: number;
  weekdayNames?: string[];
  yearOffset?: number;
  eraLabel?: string;
};

export type ExtendedWorldClock = WorldClock & {
  /** Seconds since midnight [0, 86399]. Defaults to 21600 (06:00 Dawn). */
  timeOfDaySeconds: number;
  /** Total elapsed campaign seconds since Day 1 00:00. */
  elapsedSeconds: number;
  /** Alias for `currentDay` (1-indexed). */
  day: number;
  /** Current hour of day [0, 23]. */
  hour: number;
  /** Current Time-of-Day badge ('Dawn' | 'Morning' | 'Afternoon' | 'Dusk' | 'Night'). */
  timeOfDay: TimeOfDayBadge;
  /** Active countdown timers for torches, spells, and effects. */
  activeTimers: ActiveWorldTimer[];
  /** Alias for `activeTimers`. */
  timers: ActiveWorldTimer[];
  /** Optional custom calendar configuration. */
  calendar: CalendarConfig;
  /** Whether the In-World Clock & Calendar is projected to `/player` views. */
  visibleToParty: boolean;
  /** Visibility mode ('party' | 'private') synced with `visibleToParty`. */
  visibility: 'party' | 'private';
};

export type ProjectedWorldClock = {
  currentDay: number;
  timeOfDaySeconds: number;
  timeOfDayBadge: TimeOfDayBadge;
  formattedDate: string;
  formattedTime: string;
  activeTimers: Array<{
    id: string;
    label: string;
    remainingSeconds: number;
    totalSeconds: number;
  }>;
};

export type RechargedPoolEntry = {
  pcId: string;
  pcName: string;
  poolId: string;
  poolName: string;
  before: number;
  after: number;
  previous: number;
  next: number;
};

export type AdvanceTimeResult = {
  clock: ExtendedWorldClock;
  nextClock: ExtendedWorldClock;
  pcs: PlayerCharacter[];
  updatedPcs: PlayerCharacter[];
  previousClock: ExtendedWorldClock;
  previousPcs: PlayerCharacter[];
  expiredTimers: ActiveWorldTimer[];
  rechargedPools: RechargedPoolEntry[];
  dawnsCrossed: number;
  dawnCrossed: boolean;
  daysIncremented: number;
  promptFactionAndDowntime: boolean;
  promptFactionClocksAndDowntime: boolean;
  toastSummary: string | null;
};

export const DEFAULT_MONTH_NAMES: readonly string[] = [
  'Hammer (Deepwinter)',
  'Alturiak (The Claw of Winter)',
  'Ches (The Claw of the Sunsets)',
  'Tarsakh (The Claw of the Storms)',
  'Mirtul (The Melting)',
  'Kythorn (The Time of Flowers)',
  'Flamerule (Summertide)',
  'Eleasis (Highsun)',
  'Eleint (The Fading)',
  'Marpenoth (Leaffall)',
  'Uktar (The Rotting)',
  'Nightal (The Drawing Down)',
];

export const DEFAULT_WEEKDAY_NAMES: readonly string[] = [
  'Firstday',
  'Seconday',
  'Thirdday',
  'Fourthday',
  'Fifthday',
  'Sixthday',
  'Seventhday',
  'Eighthday',
  'Ninthday',
  'Tenthday',
];

export const PRESET_TIMERS: ReadonlyArray<{
  key: string;
  label: string;
  durationSeconds: number;
}> = [
  { key: 'torch', label: 'Torch — 60m', durationSeconds: 60 * 60 },
  { key: 'light', label: 'Light — 60m', durationSeconds: 60 * 60 },
  { key: 'mage_armor', label: 'Mage Armor — 8h', durationSeconds: 8 * 60 * 60 },
  { key: 'pass_without_trace', label: 'Pass without Trace — 60m', durationSeconds: 60 * 60 },
  { key: 'lantern', label: 'Lantern (Hooded) — 6h', durationSeconds: 6 * 60 * 60 },
];

export function makeTimerId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `tmr_${crypto.randomUUID()}`;
  }
  return `tmr_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultCalendarConfig(): CalendarConfig {
  return {
    preset: 'harptos',
    monthNames: [...DEFAULT_MONTH_NAMES],
    daysPerMonth: 30,
    weekdayNames: [...DEFAULT_WEEKDAY_NAMES],
    yearOffset: 1492,
    eraLabel: 'DR',
  };
}

/**
 * Determine the Time-of-Day badge from `timeOfDaySeconds` (0..86399) or an hour (0..23).
 * - Dawn:      05:00 – 07:59
 * - Morning:   08:00 – 11:59
 * - Afternoon: 12:00 – 16:59
 * - Dusk:      17:00 – 20:59
 * - Night:     21:00 – 04:59
 */
export function getTimeOfDayBadge(value: number): TimeOfDayBadge {
  const isHourOnly = value >= 0 && value < 24 && Number.isInteger(value);
  const seconds = isHourOnly ? value * HOUR_SECONDS : value;
  const normalized = ((Math.floor(seconds) % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;
  const hour = Math.floor(normalized / HOUR_SECONDS);
  if (hour >= 5 && hour < 8) return 'Dawn';
  if (hour >= 8 && hour < 12) return 'Morning';
  if (hour >= 12 && hour < 17) return 'Afternoon';
  if (hour >= 17 && hour < 21) return 'Dusk';
  return 'Night';
}

export const computeTimeOfDayBadge = getTimeOfDayBadge;

export function normalizeExtendedWorldClock(
  raw: Record<string, unknown> | null | undefined,
  now: number = Date.now(),
): ExtendedWorldClock {
  const base = readWorldClock(raw ? { worldClock: raw } : null, now);
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;

  let currentDay =
    typeof r.currentDay === 'number' && r.currentDay >= 1
      ? Math.floor(r.currentDay)
      : typeof r.day === 'number' && r.day >= 1
        ? Math.floor(r.day)
        : base.currentDay;

  let timeOfDaySeconds: number;
  if (typeof r.timeOfDaySeconds === 'number' && !Number.isNaN(r.timeOfDaySeconds)) {
    timeOfDaySeconds = ((Math.floor(r.timeOfDaySeconds) % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;
  } else if (typeof r.elapsedSeconds === 'number' && !Number.isNaN(r.elapsedSeconds)) {
    const el = Math.max(0, Math.floor(r.elapsedSeconds));
    if (typeof r.currentDay !== 'number' && typeof r.day !== 'number') {
      currentDay = 1 + Math.floor(el / DAY_SECONDS);
    }
    timeOfDaySeconds = ((el % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;
  } else {
    timeOfDaySeconds = DAWN_SECONDS;
  }

  const rawTimers = Array.isArray(r.activeTimers)
    ? r.activeTimers
    : Array.isArray(r.timers)
      ? r.timers
      : [];
  const activeTimers: ActiveWorldTimer[] = rawTimers
    .filter((t: any) => t && typeof t === 'object' && typeof t.label === 'string')
    .map((t: any, idx: number) => ({
      id: typeof t.id === 'string' && t.id ? t.id : `tmr_${idx}`,
      label: String(t.label),
      remainingSeconds:
        typeof t.remainingSeconds === 'number' ? Math.max(0, Math.floor(t.remainingSeconds)) : 0,
      totalSeconds:
        typeof t.totalSeconds === 'number' && t.totalSeconds > 0
          ? Math.floor(t.totalSeconds)
          : typeof t.remainingSeconds === 'number' && t.remainingSeconds > 0
            ? Math.floor(t.remainingSeconds)
            : 3600,
      ...(typeof t.sourcePcId === 'string' ? { sourcePcId: t.sourcePcId } : {}),
      ...(typeof t.createdAt === 'number' ? { createdAt: t.createdAt } : {}),
    }));

  const calRaw = r.calendar && typeof r.calendar === 'object' ? r.calendar : null;
  const defCal = defaultCalendarConfig();
  const calendar: CalendarConfig = {
    preset:
      calRaw?.preset === 'standard' ||
      calRaw?.preset === 'harptos' ||
      calRaw?.preset === 'greyhawk' ||
      calRaw?.preset === 'custom'
        ? calRaw.preset
        : defCal.preset,
    ...(typeof calRaw?.calendarName === 'string' && calRaw.calendarName.trim()
      ? { calendarName: calRaw.calendarName.trim() }
      : {}),
    ...(typeof calRaw?.customDayLabel === 'string' && calRaw.customDayLabel.trim()
      ? { customDayLabel: calRaw.customDayLabel.trim() }
      : {}),
    monthNames:
      Array.isArray(calRaw?.monthNames) && calRaw.monthNames.length > 0
        ? calRaw.monthNames.map((m: any) => String(m))
        : defCal.monthNames,
    daysPerMonth:
      typeof calRaw?.daysPerMonth === 'number' && calRaw.daysPerMonth >= 1
        ? Math.floor(calRaw.daysPerMonth)
        : defCal.daysPerMonth,
    weekdayNames:
      Array.isArray(calRaw?.weekdayNames) && calRaw.weekdayNames.length > 0
        ? calRaw.weekdayNames.map((w: any) => String(w))
        : defCal.weekdayNames,
    yearOffset: typeof calRaw?.yearOffset === 'number' ? calRaw.yearOffset : defCal.yearOffset,
    eraLabel: typeof calRaw?.eraLabel === 'string' ? calRaw.eraLabel : defCal.eraLabel,
  };

  let visibleToParty = false;
  if (typeof r.visibleToParty === 'boolean') {
    visibleToParty = r.visibleToParty;
    if (r.visibility === 'private' && r.visibleToParty === true && !('visibleToParty' in (raw ?? {}))) {
      visibleToParty = false;
    }
  } else if (r.visibility === 'party') {
    visibleToParty = true;
  }
  if (r.visibility === 'private' && r.visibleToParty !== true) {
    visibleToParty = false;
  }

  const visibility: 'party' | 'private' = visibleToParty ? 'party' : 'private';
  const hour = Math.floor(timeOfDaySeconds / HOUR_SECONDS);
  const timeOfDay = getTimeOfDayBadge(timeOfDaySeconds);
  const elapsedSeconds = Math.max(0, (currentDay - 1) * DAY_SECONDS + timeOfDaySeconds);

  return {
    ...base,
    currentDay,
    day: currentDay,
    hour,
    timeOfDay,
    timeOfDaySeconds,
    elapsedSeconds,
    activeTimers,
    timers: activeTimers,
    calendar,
    visibleToParty,
    visibility,
  };
}

export const normalizeWorldClock = normalizeExtendedWorldClock;
export const normalizeWorldClockState = normalizeExtendedWorldClock;

export function readExtendedWorldClock(
  data: Record<string, unknown> | null | undefined,
  now: number = Date.now(),
): ExtendedWorldClock {
  const wcRaw =
    data && typeof data === 'object' && (data as any).worldClock
      ? ((data as any).worldClock as Record<string, unknown>)
      : null;
  return normalizeExtendedWorldClock(wcRaw, now);
}

export function formatClockTime(
  clockOrSeconds: number | Partial<ExtendedWorldClock> | ProjectedWorldClock,
): string {
  const sec =
    typeof clockOrSeconds === 'number'
      ? clockOrSeconds
      : typeof clockOrSeconds?.timeOfDaySeconds === 'number'
        ? clockOrSeconds.timeOfDaySeconds
        : DAWN_SECONDS;
  const normalized = ((Math.floor(sec) % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;
  const hours = Math.floor(normalized / HOUR_SECONDS);
  const minutes = Math.floor((normalized % HOUR_SECONDS) / 60);
  const seconds = normalized % 60;
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  if (seconds > 0) {
    const ss = String(seconds).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  }
  return `${hh}:${mm}`;
}

export function formatRemainingDuration(remainingSeconds: number): string {
  const s = Math.max(0, Math.floor(remainingSeconds));
  if (s === 0) return 'Expired';
  const hours = Math.floor(s / HOUR_SECONDS);
  const minutes = Math.floor((s % HOUR_SECONDS) / 60);
  const secs = s % 60;
  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0 && hours === 0) parts.push(`${secs}s`);
  return parts.join(' ') || '0s';
}

export function formatInWorldDate(clock: Partial<ExtendedWorldClock> | ProjectedWorldClock): string {
  if ('formattedDate' in clock && typeof clock.formattedDate === 'string' && clock.formattedDate) {
    return clock.formattedDate;
  }
  const c = normalizeExtendedWorldClock(clock as Record<string, unknown>);
  const dayIndex = Math.max(0, Math.floor(c.currentDay) - 1);
  const cal = c.calendar ?? defaultCalendarConfig();
  const daysPerMonth = Math.max(1, cal.daysPerMonth || 30);
  const monthsCount = Math.max(1, cal.monthNames.length || 12);
  const daysPerYear = daysPerMonth * monthsCount;

  const yearDelta = Math.floor(dayIndex / daysPerYear);
  const dayOfYear = dayIndex % daysPerYear;
  const monthIdx = Math.floor(dayOfYear / daysPerMonth);
  const dayOfMonth = (dayOfYear % daysPerMonth) + 1;
  const monthName = cal.monthNames[monthIdx] || `Month ${monthIdx + 1}`;
  const year = (cal.yearOffset ?? 1492) + yearDelta;
  const era = cal.eraLabel ? ` ${cal.eraLabel}` : '';
  const dayLabel = cal.customDayLabel?.trim() || 'Day';
  const calPrefix = cal.calendarName?.trim() ? `[${cal.calendarName.trim()}] ` : '';

  const weekday =
    cal.weekdayNames && cal.weekdayNames.length > 0
      ? `${cal.weekdayNames[dayIndex % cal.weekdayNames.length]}, `
      : '';

  return `${calPrefix}${dayLabel} ${c.currentDay} · ${weekday}${dayOfMonth} ${monthName}, ${year}${era}`;
}

export function addExplorationTimer(
  clock: ExtendedWorldClock,
  input: {
    label: string;
    durationSeconds: number;
    sourcePcId?: string;
    id?: string;
    now?: number;
  },
): ExtendedWorldClock {
  const dur = Math.max(1, Math.floor(input.durationSeconds));
  const timer: ActiveWorldTimer = {
    id: input.id || makeTimerId(),
    label: input.label.trim() || 'Custom Timer',
    remainingSeconds: dur,
    totalSeconds: dur,
    ...(input.sourcePcId ? { sourcePcId: input.sourcePcId } : {}),
    createdAt: input.now ?? Date.now(),
  };
  const nextTimers = [...(clock.activeTimers ?? []), timer];
  return {
    ...clock,
    activeTimers: nextTimers,
    timers: nextTimers,
  };
}

export function addPresetTimer(
  clock: ExtendedWorldClock,
  presetKey: string,
  sourcePcId?: string,
): ExtendedWorldClock {
  const found =
    PRESET_TIMERS.find((p) => p.key === presetKey || p.label === presetKey) ?? PRESET_TIMERS[0];
  return addExplorationTimer(clock, {
    label: found.label,
    durationSeconds: found.durationSeconds,
    sourcePcId,
  });
}

export function addCustomTimer(
  clock: ExtendedWorldClock,
  label: string,
  durationMinutes: number,
  sourcePcId?: string,
): ExtendedWorldClock {
  return addExplorationTimer(clock, {
    label,
    durationSeconds: Math.max(6, Math.round(durationMinutes * 60)),
    sourcePcId,
  });
}

export function removeExplorationTimer(
  clock: ExtendedWorldClock,
  timerId: string,
): ExtendedWorldClock {
  const nextTimers = (clock.activeTimers ?? []).filter((t) => t.id !== timerId);
  return {
    ...clock,
    activeTimers: nextTimers,
    timers: nextTimers,
  };
}

/**
 * Recharge all resource pools marked `rechargeOn: 'dawn'` across a list of PCs.
 * Returns the updated PC array and a structured list of recharged pools.
 */
export function rechargeDawnPoolsForParty(pcs: ReadonlyArray<PlayerCharacter>): {
  pcs: PlayerCharacter[];
  rechargedPools: RechargedPoolEntry[];
  recharged: RechargedPoolEntry[];
  changed: boolean;
} {
  const rechargedPools: RechargedPoolEntry[] = [];
  let anyChanged = false;
  const nextPcs = pcs.map((pc) => {
    if (!Array.isArray(pc.resourcePools) || pc.resourcePools.length === 0) {
      return pc;
    }
    let pcChanged = false;
    const nextPools: PcResourcePool[] = pc.resourcePools.map((pool) => {
      if (pool.rechargeOn !== 'dawn') return pool;
      const before = typeof pool.current === 'number' ? pool.current : 0;
      const max = typeof pool.max === 'number' ? pool.max : before;
      if (before >= max) return pool;
      pcChanged = true;
      anyChanged = true;
      rechargedPools.push({
        pcId: pc.id,
        pcName: pc.name || 'PC',
        poolId: pool.id,
        poolName: pool.name,
        before,
        after: max,
        previous: before,
        next: max,
      });
      return { ...pool, current: max };
    });
    return pcChanged ? { ...pc, resourcePools: nextPools } : pc;
  });

  return {
    pcs: nextPcs,
    rechargedPools,
    recharged: rechargedPools,
    changed: anyChanged,
  };
}

/**
 * Compute how many Dawn (06:00) boundaries are crossed when advancing from
 * `startTimeOfDaySeconds` by `deltaSeconds`.
 */
export function countDawnsCrossed(
  startTimeOfDaySeconds: number,
  deltaSeconds: number,
): number {
  if (deltaSeconds <= 0) return 0;
  const shiftedStart =
    (((startTimeOfDaySeconds - DAWN_SECONDS) % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;
  const shiftedEnd = shiftedStart + deltaSeconds;
  return Math.floor(shiftedEnd / DAY_SECONDS);
}

/**
 * Advance the In-World Clock by `deltaSeconds` (supports both object args and
 * positional `(clock, deltaSeconds, pcs?)` args).
 */
export function advanceWorldClock(
  clockOrArgs:
    | ExtendedWorldClock
    | {
        clock: ExtendedWorldClock;
        deltaSeconds: number;
        pcs?: ReadonlyArray<PlayerCharacter>;
        forceDawnTrigger?: boolean;
        now?: number;
      },
  positionalDeltaSeconds?: number,
  positionalPcs?: ReadonlyArray<PlayerCharacter>,
): AdvanceTimeResult {
  const isObjArg =
    clockOrArgs &&
    typeof clockOrArgs === 'object' &&
    'clock' in clockOrArgs &&
    typeof (clockOrArgs as any).deltaSeconds === 'number';

  const rawClock = isObjArg
    ? (clockOrArgs as { clock: ExtendedWorldClock }).clock
    : (clockOrArgs as ExtendedWorldClock);
  const deltaSeconds = isObjArg
    ? (clockOrArgs as { deltaSeconds: number }).deltaSeconds
    : (positionalDeltaSeconds ?? 0);
  const pcsArg = isObjArg
    ? (clockOrArgs as { pcs?: ReadonlyArray<PlayerCharacter> }).pcs
    : positionalPcs;
  const forceDawnTrigger = isObjArg
    ? (clockOrArgs as { forceDawnTrigger?: boolean }).forceDawnTrigger
    : false;
  const now = isObjArg
    ? ((clockOrArgs as { now?: number }).now ?? Date.now())
    : Date.now();

  const delta = Math.max(0, Math.floor(deltaSeconds));
  const previousClock: ExtendedWorldClock = normalizeExtendedWorldClock(
    structuredClone(rawClock) as unknown as Record<string, unknown>,
    now,
  );
  const previousPcs: PlayerCharacter[] = structuredClone((pcsArg ?? []) as PlayerCharacter[]);

  const startSec = previousClock.timeOfDaySeconds;
  const totalSec = startSec + delta;
  const midnightsCrossed = Math.floor(totalSec / DAY_SECONDS);
  const nextTimeOfDaySeconds = ((totalSec % DAY_SECONDS) + DAY_SECONDS) % DAY_SECONDS;

  const dawnsCrossedRaw = countDawnsCrossed(startSec, delta);
  const dawnsCrossed = forceDawnTrigger ? Math.max(1, dawnsCrossedRaw) : dawnsCrossedRaw;
  const daysIncremented = forceDawnTrigger
    ? Math.max(1, midnightsCrossed)
    : midnightsCrossed;

  const expiredTimers: ActiveWorldTimer[] = [];
  const remainingTimers: ActiveWorldTimer[] = [];

  for (const timer of previousClock.activeTimers) {
    const nextRem = Math.max(0, timer.remainingSeconds - delta);
    if (nextRem <= 0) {
      expiredTimers.push({ ...timer, remainingSeconds: 0 });
    } else {
      remainingTimers.push({ ...timer, remainingSeconds: nextRem });
    }
  }

  let nextPcs = previousPcs;
  let rechargedPools: RechargedPoolEntry[] = [];
  if (dawnsCrossed > 0 && previousPcs.length > 0) {
    const dawnResult = rechargeDawnPoolsForParty(previousPcs);
    nextPcs = dawnResult.pcs;
    rechargedPools = dawnResult.rechargedPools;
  }

  const nextDay = previousClock.currentDay + daysIncremented;
  const nextHour = Math.floor(nextTimeOfDaySeconds / HOUR_SECONDS);
  const nextBadge = getTimeOfDayBadge(nextTimeOfDaySeconds);
  const nextElapsedSeconds = Math.max(0, (nextDay - 1) * DAY_SECONDS + nextTimeOfDaySeconds);

  const nextClock: ExtendedWorldClock = {
    ...previousClock,
    currentDay: nextDay,
    day: nextDay,
    hour: nextHour,
    timeOfDay: nextBadge,
    timeOfDaySeconds: nextTimeOfDaySeconds,
    elapsedSeconds: nextElapsedSeconds,
    lastTickAt: now,
    activeTimers: remainingTimers,
    timers: remainingTimers,
  };

  const summaryParts: string[] = [];
  if (daysIncremented > 0) {
    summaryParts.push(`Advanced to Day ${nextClock.currentDay} (${nextBadge})`);
  }
  if (rechargedPools.length > 0) {
    summaryParts.push(
      `Recharged ${rechargedPools.length} dawn resource pool${rechargedPools.length === 1 ? '' : 's'}`,
    );
  }
  if (expiredTimers.length > 0) {
    summaryParts.push(`Expired: ${expiredTimers.map((t) => t.label).join(', ')}`);
  }

  const promptFlag = dawnsCrossed > 0 || daysIncremented > 0;

  return {
    clock: nextClock,
    nextClock,
    pcs: nextPcs,
    updatedPcs: nextPcs,
    previousClock,
    previousPcs,
    expiredTimers,
    rechargedPools,
    dawnsCrossed,
    dawnCrossed: dawnsCrossed > 0,
    daysIncremented,
    promptFactionAndDowntime: promptFlag,
    promptFactionClocksAndDowntime: promptFlag,
    toastSummary: summaryParts.length > 0 ? summaryParts.join(' · ') : null,
  };
}

/**
 * Advance the clock directly to the next Dawn (06:00), guaranteeing +1 Campaign
 * Day and firing all `'dawn'` resource pool recharges and timer expirations.
 */
export function advanceToNextDawn(
  clockOrArgs:
    | ExtendedWorldClock
    | {
        clock: ExtendedWorldClock;
        pcs?: ReadonlyArray<PlayerCharacter>;
        now?: number;
      },
  positionalPcs?: ReadonlyArray<PlayerCharacter>,
): AdvanceTimeResult {
  const isObjArg =
    clockOrArgs &&
    typeof clockOrArgs === 'object' &&
    'clock' in clockOrArgs;
  const clock = isObjArg
    ? (clockOrArgs as { clock: ExtendedWorldClock }).clock
    : (clockOrArgs as ExtendedWorldClock);
  const pcs = isObjArg
    ? (clockOrArgs as { pcs?: ReadonlyArray<PlayerCharacter> }).pcs
    : positionalPcs;
  const now = isObjArg
    ? (clockOrArgs as { now?: number }).now
    : undefined;

  const cur = clock.timeOfDaySeconds ?? DAWN_SECONDS;
  const deltaToNextDawn =
    cur < DAWN_SECONDS
      ? DAWN_SECONDS - cur
      : DAY_SECONDS - cur + DAWN_SECONDS;
  return advanceWorldClock({
    clock,
    deltaSeconds: deltaToNextDawn,
    pcs,
    forceDawnTrigger: true,
    now,
  });
}

/**
 * Project the In-World Clock for `/player` slot projections. Returns `undefined`
 * unless the GM explicitly enabled `visibleToParty: true` / `visibility: 'party'`.
 */
export function projectWorldClockForPlayers(
  data: Record<string, unknown> | null | undefined,
): ProjectedWorldClock | undefined {
  if (!data || typeof data !== 'object' || !(data as any).worldClock) return undefined;
  const clock = readExtendedWorldClock(data);
  if (!clock.visibleToParty) return undefined;
  return {
    currentDay: clock.currentDay,
    timeOfDaySeconds: clock.timeOfDaySeconds,
    timeOfDayBadge: getTimeOfDayBadge(clock.timeOfDaySeconds),
    formattedDate: formatInWorldDate(clock),
    formattedTime: formatClockTime(clock.timeOfDaySeconds),
    activeTimers: clock.activeTimers.map((t) => ({
      id: t.id,
      label: t.label,
      remainingSeconds: t.remainingSeconds,
      totalSeconds: t.totalSeconds,
    })),
  };
}
