// Living World Tick — deterministic tick evaluator.
//
// Given the campaign `data` blob and a target in-world day, `applyTicks` fires
// every `everyNDays` tick rule the appropriate number of times, rolls each NPC
// agenda forward per its schedule, and records a `Briefing` of everything that
// changed. The PRNG (mulberry32) is seeded so a preview and the subsequent
// apply produce identical results when handed the same seed.
//
// This operates on the real campaign entities (clocks, downtime, factions,
// NPCs) rather than a parallel copy:
//   - factionClock  -> data.clocks[].filled   (capped at .max)
//   - downtime      -> data.downtime[].progress (0–100, added by this engine)
//   - renown        -> data.factions[].renown
//   - agendas       -> data.worldClock.agendas[].progress / .blockers

import {
  BRIEFING_LOG_CAP,
  makeWorldId,
  readWorldClock,
  type AgendaSchedule,
  type Briefing,
  type BriefingChange,
  type DowntimeEntity,
  type FactionClockEntity,
  type FactionEntity,
  type NpcAgenda,
  type NpcEntity,
  type TickRule,
} from './types';

type AnyData = Record<string, any>;

export const BLOCKER_TABLE = [
  'a rival appears',
  'resources run short',
  'a key contact disappears',
  'unexpected scrutiny',
  'a previous failure resurfaces',
  'illness or injury',
  'weather or season shifts',
  'a debt is called in',
  'trust is broken',
  'a faction objects',
] as const;

export type ApplyTicksResult = { data: AnyData; briefing: Briefing };

export function applyTicks(args: {
  data: AnyData;
  toDay: number;
  rngSeed?: number;
  now?: number;
}): ApplyTicksResult {
  const { toDay } = args;
  const now = args.now ?? Date.now();
  const baseClock = readWorldClock(args.data, now);

  if (toDay <= baseClock.currentDay) {
    throw new Error('toDay must be after currentDay');
  }

  const next: AnyData = structuredClone(args.data);
  next.worldClock = structuredClone(baseClock);

  const fromDay = next.worldClock.currentDay as number;
  const changes: BriefingChange[] = [];
  const rng = mulberry32(args.rngSeed ?? now);

  // 1. Fire tick rules.
  for (const rule of next.worldClock.tickRules as TickRule[]) {
    if (
      rule.paused ||
      rule.trigger !== 'everyNDays' ||
      !rule.intervalDays ||
      rule.intervalDays <= 0
    ) {
      continue;
    }
    const span = toDay - fromDay;
    const fireCount = Math.floor(span / rule.intervalDays);
    for (let i = 0; i < fireCount; i++) {
      const change = fireRule(next, rule);
      if (change) changes.push(change);
    }
  }

  // 2. Roll NPC agendas.
  const daysElapsed = toDay - fromDay;
  for (const agenda of next.worldClock.agendas as NpcAgenda[]) {
    const tickCount = ticksForSchedule(agenda.schedule, daysElapsed, rng);
    for (let i = 0; i < tickCount; i++) {
      const before = { progress: agenda.progress, blockers: [...agenda.blockers] };
      const progressDelta = 5 + Math.floor(rng() * 16); // 5..20
      agenda.progress = Math.min(100, agenda.progress + progressDelta);
      if (rng() < 0.15) {
        agenda.blockers.push(BLOCKER_TABLE[Math.floor(rng() * BLOCKER_TABLE.length)]);
      }
      changes.push({
        type: 'agendaProgress',
        entityId: agenda.id,
        entityName: lookupNpcName(next, agenda.npcId),
        before,
        after: { progress: agenda.progress, blockers: [...agenda.blockers] },
        reason: `Agenda schedule tick (${agenda.schedule})`,
      });
    }
  }

  next.worldClock.currentDay = toDay;
  next.worldClock.lastTickAt = now;

  const briefing: Briefing = {
    id: makeWorldId(),
    generatedAt: now,
    fromDay,
    toDay,
    changes,
  };

  next.worldClock.briefingLog.push(briefing);
  if (next.worldClock.briefingLog.length > BRIEFING_LOG_CAP) {
    next.worldClock.briefingLog = next.worldClock.briefingLog.slice(-BRIEFING_LOG_CAP);
  }

  return { data: next, briefing };
}

/**
 * Dry-run: compute the changes a tick to `toDay` would produce without
 * persisting anything. Reuse the returned seed (pass it back into `applyTicks`)
 * so the applied result matches the preview exactly.
 */
export function previewTicks(args: {
  data: AnyData;
  toDay: number;
  rngSeed?: number;
  now?: number;
}): { changes: BriefingChange[]; rngSeed: number } {
  const rngSeed = args.rngSeed ?? Math.floor(Math.random() * 0xffffffff);
  const { briefing } = applyTicks({
    data: args.data,
    toDay: args.toDay,
    rngSeed,
    now: args.now,
  });
  return { changes: briefing.changes, rngSeed };
}

function fireRule(data: AnyData, rule: TickRule): BriefingChange | null {
  switch (rule.targetType) {
    case 'factionClock': {
      const clocks = (Array.isArray(data.clocks) ? data.clocks : []) as FactionClockEntity[];
      const fc = clocks.find((c) => c.id === rule.targetId);
      if (!fc) return null;
      const max = typeof fc.max === 'number' ? fc.max : 6;
      const before = { filled: fc.filled ?? 0 };
      fc.filled = Math.min(max, (fc.filled ?? 0) + rule.advanceBy);
      return {
        type: 'clockAdvanced',
        entityId: rule.targetId,
        entityName: clockName(fc),
        before,
        after: { filled: fc.filled },
        reason: `Tick rule fired (+${rule.advanceBy})`,
      };
    }
    case 'downtime': {
      const downtime = (Array.isArray(data.downtime) ? data.downtime : []) as DowntimeEntity[];
      const dt = downtime.find((d) => d.id === rule.targetId);
      if (!dt) return null;
      const before = { progress: dt.progress ?? 0 };
      dt.progress = Math.min(100, (dt.progress ?? 0) + rule.advanceBy * 10);
      return {
        type: 'downtimeResolved',
        entityId: rule.targetId,
        entityName: downtimeName(dt),
        before,
        after: { progress: dt.progress },
        reason: `Downtime tick (+${rule.advanceBy * 10}%)`,
      };
    }
    case 'renown': {
      const factions = (Array.isArray(data.factions) ? data.factions : []) as FactionEntity[];
      const f = factions.find((x) => x.id === rule.targetId);
      if (!f) return null;
      const before = { renown: f.renown ?? 0 };
      f.renown = (f.renown ?? 0) + rule.advanceBy;
      return {
        type: 'renownShift',
        entityId: rule.targetId,
        entityName: f.name || 'Faction',
        before,
        after: { renown: f.renown },
        reason: `Renown tick (${rule.advanceBy > 0 ? '+' : ''}${rule.advanceBy})`,
      };
    }
  }
}

function ticksForSchedule(s: AgendaSchedule, days: number, rng: () => number): number {
  if (s === 'daily') return days;
  if (s === 'weekly') return Math.floor(days / 7);
  if (s === 'irregular') {
    // Roughly one tick per 14 days on average.
    return rng() < days / 14 ? 1 : 0;
  }
  return 0;
}

function lookupNpcName(data: AnyData, npcId: string): string {
  const npcs = (Array.isArray(data.npcs) ? data.npcs : []) as NpcEntity[];
  return npcs.find((n) => n.id === npcId)?.name || 'Unknown NPC';
}

export function clockName(fc: FactionClockEntity): string {
  return (fc.text && fc.text.trim()) || (fc.faction && fc.faction.trim()) || 'Faction Clock';
}

export function downtimeName(dt: DowntimeEntity): string {
  const f = dt.fields ?? {};
  const candidate =
    f.factionName || f.itemName || f.propertyType || f.businessType || f.skillOrFeat || f.item;
  if (candidate && candidate.trim()) return candidate.trim();
  return dt.type ? `Downtime: ${dt.type}` : 'Downtime';
}

// Deterministic PRNG for testability.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
