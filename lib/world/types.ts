// Living World Tick — data model.
//
// Between sessions, the solo world keeps moving: faction clocks advance, NPCs
// pursue agendas, downtime resolves. `WorldClock` is the campaign-level state
// that drives this. It lives on the campaign `data` blob under `data.worldClock`
// and references the campaign's existing entities (clocks, downtime, factions,
// NPCs) by their stable ids — it does not duplicate them.

export type TickTargetType = 'factionClock' | 'downtime' | 'renown';
export type TickTrigger = 'manual' | 'everyNDays';

export type TickRule = {
  id: string;
  targetType: TickTargetType;
  /** FK to the target entry: clock id, downtime id, or faction id (renown). */
  targetId: string;
  trigger: TickTrigger;
  /** Required when trigger === 'everyNDays'. */
  intervalDays?: number;
  /** Free-text "unless paused" note for the GM. */
  condition?: string;
  /** Segments / units advanced per fire (1–10). */
  advanceBy: number;
  paused: boolean;
};

export type AgendaSchedule = 'daily' | 'weekly' | 'irregular';

export type NpcAgenda = {
  id: string;
  npcId: string;
  /** e.g. "Recruit allies in the Lower Wells". */
  goal: string;
  schedule: AgendaSchedule;
  /** 0–100. Once at 100 the agenda is "resolved". */
  progress: number;
  blockers: string[];
};

export type BriefingChangeType =
  | 'clockAdvanced'
  | 'downtimeResolved'
  | 'agendaProgress'
  | 'renownShift';

export type BriefingChange = {
  type: BriefingChangeType;
  entityId: string;
  entityName: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  reason: string;
};

export type Briefing = {
  id: string;
  generatedAt: number;
  fromDay: number;
  toDay: number;
  changes: BriefingChange[];
  /** Vivify-generated narrative paragraph, Pro only. */
  narrative?: string;
};

export type WorldClock = {
  /** In-world day counter, starts at 1. */
  currentDay: number;
  /** Unix ms — real time of the last tick. */
  lastTickAt: number;
  tickRules: TickRule[];
  agendas: NpcAgenda[];
  /** Capped at the 20 most recent, FIFO. */
  briefingLog: Briefing[];
};

export const BRIEFING_LOG_CAP = 20;

/** Stale-world threshold used to prompt "Advance the world?" on session open. */
export const STALE_WORLD_MS = 24 * 60 * 60 * 1000;

export function makeWorldId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `wc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyWorldClock(now: number = Date.now()): WorldClock {
  return {
    currentDay: 1,
    lastTickAt: now,
    tickRules: [],
    agendas: [],
    briefingLog: [],
  };
}

/**
 * Return a `WorldClock` from a campaign `data` blob, initializing a fresh one
 * when absent or malformed. Pure — never mutates the input.
 */
export function readWorldClock(
  data: Record<string, unknown> | null | undefined,
  now: number = Date.now(),
): WorldClock {
  const wc = (data && typeof data === 'object' ? (data as any).worldClock : null) as
    | Partial<WorldClock>
    | null
    | undefined;
  if (!wc || typeof wc !== 'object') return emptyWorldClock(now);
  return {
    currentDay: typeof wc.currentDay === 'number' && wc.currentDay >= 1 ? wc.currentDay : 1,
    lastTickAt: typeof wc.lastTickAt === 'number' ? wc.lastTickAt : now,
    tickRules: Array.isArray(wc.tickRules) ? wc.tickRules : [],
    agendas: Array.isArray(wc.agendas) ? wc.agendas : [],
    briefingLog: Array.isArray(wc.briefingLog) ? wc.briefingLog : [],
  };
}

// --- Shapes of the existing campaign entities the engine touches. ---------
// These mirror the real (loosely-typed) campaign data; every field is optional
// because historical campaign docs predate the Living World feature.

export type FactionClockEntity = {
  id?: string;
  text?: string;
  faction?: string;
  filled?: number;
  max?: number;
};

export type DowntimeEntity = {
  id: string;
  type?: string;
  fields?: Record<string, string>;
  /** Added by the Living World engine; 0–100. */
  progress?: number;
};

export type FactionEntity = {
  id?: string;
  name?: string;
  renown?: number;
};

export type NpcEntity = {
  id?: string;
  name?: string;
};
