// Module 3 — Faction Clock & World-State Engine: Session Delta Log and Clock Status helpers.
//
// Tracks in-world calendar dates, 3-bullet session consequences, and faction
// heat / progress clock shifts across sessions. Stored at `data.sessionDeltaLog`.

import { readWorldClock } from './types';

export type ClockStatus = 'active' | 'paused' | 'triggered' | 'completed' | 'threat';

export const CLOCK_STATUS_OPTIONS: Array<{
  value: ClockStatus;
  label: string;
  badgeClass: string;
}> = [
  {
    value: 'active',
    label: 'Active',
    badgeClass: 'border-crimson/50 bg-crimson/10 text-crimson',
  },
  {
    value: 'threat',
    label: 'Imminent Threat',
    badgeClass: 'border-wine bg-wine/15 text-wine font-bold',
  },
  {
    value: 'triggered',
    label: 'Triggered!',
    badgeClass: 'border-amber-600/60 bg-amber-500/15 text-amber-800',
  },
  {
    value: 'paused',
    label: 'Paused',
    badgeClass: 'border-rule bg-parchment-deep text-ink-mute',
  },
  {
    value: 'completed',
    label: 'Completed',
    badgeClass: 'border-moss/50 bg-moss/10 text-moss',
  },
];

export const CLOCK_STATUS_LABELS: Record<ClockStatus, string> = {
  active: 'Active',
  threat: 'Imminent Threat',
  triggered: 'Triggered!',
  paused: 'Paused',
  completed: 'Completed',
};

export const CLOCK_STATUS_STYLES: Record<ClockStatus, string> = {
  active: 'border-crimson/50 bg-crimson/10 text-crimson',
  threat: 'border-wine bg-wine/15 text-wine font-bold',
  triggered: 'border-amber-600/60 bg-amber-500/15 text-amber-800',
  paused: 'border-rule bg-parchment-deep text-ink-mute',
  completed: 'border-moss/50 bg-moss/10 text-moss',
};

export function deriveClockStatus(c: Record<string, any> | null | undefined): ClockStatus {
  if (!c || typeof c !== 'object') return 'active';
  const valid: ClockStatus[] = ['active', 'paused', 'triggered', 'completed', 'threat'];
  if (typeof c.status === 'string' && valid.includes(c.status as ClockStatus)) {
    return c.status as ClockStatus;
  }
  const max = Number(c.max) || 6;
  const filled = Number(c.filled) || 0;
  if (filled >= max) return 'triggered';
  if (filled >= max - 1 && max >= 4) return 'threat';
  return 'active';
}

export type SessionDeltaClockChange = {
  clockId?: string;
  clockIndex?: number;
  clockName?: string;
  clockText?: string;
  faction?: string;
  before?: number;
  after?: number;
  fromFilled?: number;
  toFilled?: number;
  max: number;
  status?: ClockStatus;
  triggerNote?: string;
};

export type SessionDeltaFactionChange = {
  factionId?: string;
  factionIndex?: number;
  factionName: string;
  heatBefore?: number;
  heatAfter?: number;
  fromHeat?: number;
  toHeat?: number;
  renownBefore?: number;
  renownAfter?: number;
  note?: string;
};

export type SessionDeltaEntry = {
  id: string;
  inWorldDay: number;
  inWorldDate: string;
  realDate: string;
  /** 3-bullet session consequences */
  consequences: [string, string, string];
  clockChanges: SessionDeltaClockChange[];
  factionChanges: SessionDeltaFactionChange[];
  createdAt: number;
};

export type SessionDeltaInput = Partial<SessionDeltaEntry> & {
  inWorldDate: string;
  consequences: [string, string, string];
  clockDeltas?: SessionDeltaClockChange[];
  factionHeatDeltas?: SessionDeltaFactionChange[];
};

export function makeSessionDeltaId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `sdelta-${crypto.randomUUID()}`;
  }
  return `sdelta-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function readSessionDeltaLog(
  data: Record<string, any> | null | undefined,
): SessionDeltaEntry[] {
  const raw = data?.sessionDeltaLog;
  if (!Array.isArray(raw)) return [];
  return raw.filter((e): e is SessionDeltaEntry => !!e && typeof e === 'object' && typeof e.id === 'string');
}

export function formatDefaultInWorldDate(day: number, customCalendarLabel?: string): string {
  if (customCalendarLabel && customCalendarLabel.trim()) {
    return customCalendarLabel.trim();
  }
  return `Day ${day}`;
}

export function applySessionDeltaToState(
  state: Record<string, any>,
  rawEntry: SessionDeltaInput,
): Record<string, any> {
  const wc = readWorldClock(state);
  const inWorldDay = Math.max(1, rawEntry.inWorldDay ?? wc.currentDay);
  const nextWc = {
    ...wc,
    currentDay: inWorldDay,
    lastTickAt: Date.now(),
  };

  const clockChanges: SessionDeltaClockChange[] = (
    rawEntry.clockChanges ??
    rawEntry.clockDeltas ??
    []
  ).map((ch) => ({
    ...ch,
    clockId: ch.clockId ?? (typeof ch.clockIndex === 'number' ? `clock-${ch.clockIndex}` : ''),
    clockName: ch.clockName ?? ch.clockText ?? '',
    before: ch.before ?? ch.fromFilled ?? 0,
    after: ch.after ?? ch.toFilled ?? 0,
  }));

  const factionChanges: SessionDeltaFactionChange[] = (
    rawEntry.factionChanges ??
    rawEntry.factionHeatDeltas ??
    []
  ).map((fh) => ({
    ...fh,
    factionId:
      fh.factionId ?? (typeof fh.factionIndex === 'number' ? `fac-${fh.factionIndex}` : ''),
    heatBefore: fh.heatBefore ?? fh.fromHeat ?? 0,
    heatAfter: fh.heatAfter ?? fh.toHeat ?? 0,
  }));

  const entry: SessionDeltaEntry = {
    id: rawEntry.id || makeSessionDeltaId(),
    inWorldDay,
    inWorldDate: rawEntry.inWorldDate,
    realDate: rawEntry.realDate || new Date().toISOString().slice(0, 10),
    consequences: rawEntry.consequences,
    clockChanges,
    factionChanges,
    createdAt: rawEntry.createdAt || Date.now(),
  };

  // Apply clock changes if any
  const clocks = Array.isArray(state.clocks) ? [...state.clocks] : [];
  for (const ch of clockChanges) {
    const idx =
      typeof ch.clockIndex === 'number' && clocks[ch.clockIndex]
        ? ch.clockIndex
        : clocks.findIndex(
            (c: any, i: number) =>
              (c?.id && c.id === ch.clockId) ||
              `clock-${i}` === ch.clockId ||
              (c?.text && c.text === ch.clockName),
          );
    if (idx >= 0 && clocks[idx]) {
      const max = clocks[idx].max || ch.max || 6;
      const targetAfter = ch.after ?? ch.toFilled ?? clocks[idx].filled ?? 0;
      const filled = Math.max(0, Math.min(max, targetAfter));
      const autoStatus: ClockStatus =
        ch.status || (filled >= max ? 'triggered' : clocks[idx].status || 'active');
      clocks[idx] = {
        ...clocks[idx],
        filled,
        status: autoStatus,
      };
    }
  }

  // Apply faction heat / renown changes if any
  const factions = Array.isArray(state.factions) ? [...state.factions] : [];
  for (const fh of factionChanges) {
    const idx =
      typeof fh.factionIndex === 'number' && factions[fh.factionIndex]
        ? fh.factionIndex
        : factions.findIndex(
            (f: any, i: number) =>
              (f?.id && f.id === fh.factionId) ||
              `fac-${i}` === fh.factionId ||
              (f?.name && f.name === fh.factionName),
          );
    if (idx >= 0 && factions[idx]) {
      const targetHeat = fh.heatAfter ?? fh.toHeat ?? factions[idx].heat ?? 0;
      factions[idx] = {
        ...factions[idx],
        heat: Math.max(0, Math.min(10, targetHeat)),
        ...(typeof fh.renownAfter === 'number' ? { renown: fh.renownAfter } : {}),
      };
    }
  }

  const existingLog = readSessionDeltaLog(state);
  return {
    ...state,
    worldClock: nextWc,
    inWorldCalendarDate: entry.inWorldDate,
    clocks,
    factions,
    sessionDeltaLog: [entry, ...existingLog],
  };
}
