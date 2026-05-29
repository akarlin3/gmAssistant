// Living World Tick → propose-only routing (CP1).
//
// The tick used to direct-write canonical `data.*` (clocks, downtime, factions,
// agendas) with no review. This module routes it onto the SAME propose-only
// pipeline the procedural engine uses, with one rule:
//
//   Auto-apply continuous / magnitude deltas; review discrete / threshold /
//   narrative transitions.
//
//   - clock / downtime INCREMENTS (below cap)  → auto-apply (routine, deterministic)
//   - clock / downtime COMPLETION (hits cap)   → review     (discrete consequence)
//   - faction renown shift                     → review     (faction power change)
//   - NPC agenda progress                      → review     (plot motion + RNG)
//   - in-world day advance / lastTickAt        → auto-apply (deterministic bookkeeping)
//
// `computeTickDeltas` is pure: it reuses the (already heavily-tested) `applyTicks`
// purely as a computation, then diffs its briefing into categorized deltas. It
// writes NOTHING. `commitTickToData` is the single place the auto half lands
// canonically and the review half is enqueued into `pendingWorldEvents` — both
// through the existing CRDT/auto-save path via the caller. No tick path
// direct-writes a reviewable change to `data.*`.

import { applyTicks } from './tick';
import {
  BRIEFING_LOG_CAP,
  makeWorldId,
  readWorldClock,
  type Briefing,
  type BriefingChange,
  type BriefingChangeType,
} from './types';
import { entityKey } from '@/lib/wiki/entities';
import {
  appendEvents,
  deltaCollection,
  deltaTargetId,
  getPendingEvents,
  applyApprovedDeltas,
  PENDING_EVENTS_KEY,
  type DeltaCollection,
  type DeltaCollections,
  type PendingWorldEvent,
  type WorldDelta,
} from './proposals';

export type TickCategory = 'auto' | 'review';

/** A categorized tick change: the committable `delta` plus the collapsed
 * narrative `change` (used for the recap briefing / review display). */
export type TickDelta = {
  category: TickCategory;
  delta: WorldDelta;
  change: BriefingChange;
};

export type ComputeTickResult = {
  deltas: TickDelta[];
  fromDay: number;
  toDay: number;
  lastTickAt: number;
};

// BriefingChange type → target collection / committable field / review rule.
const TICK_COLLECTION: Record<BriefingChangeType, DeltaCollection> = {
  clockAdvanced: 'clocks',
  downtimeResolved: 'downtime',
  renownShift: 'factions',
  agendaProgress: 'agendas',
};
const TICK_FIELD: Record<BriefingChangeType, string> = {
  clockAdvanced: 'filled',
  downtimeResolved: 'progress',
  renownShift: 'renown',
  agendaProgress: 'progress',
};
export const TICK_SOURCE_RULE: Record<BriefingChangeType, string> = {
  clockAdvanced: 'tick:clockComplete',
  downtimeResolved: 'tick:downtimeComplete',
  renownShift: 'tick:renown',
  agendaProgress: 'tick:agenda',
};

const DEFAULT_CLOCK_MAX = 6;

/**
 * The routing principle, as a pure decision. `completed` means a magnitude
 * change crossed its threshold (clock hit max / downtime hit 100). Renown and
 * agenda changes are always reviewable regardless of `completed`.
 */
export function classifyTickChange(type: BriefingChangeType, completed: boolean): TickCategory {
  switch (type) {
    case 'clockAdvanced':
    case 'downtimeResolved':
      return completed ? 'review' : 'auto';
    case 'renownShift':
    case 'agendaProgress':
      return 'review';
  }
}

/**
 * Diff a tick (from `data` to `toDay`) into categorized deltas. Pure and
 * deterministic given `rngSeed`. Multiple fires of the same (type, entity) in
 * one tick are collapsed into a single delta (initial `from` → final `to`).
 */
export function computeTickDeltas(args: {
  data: Record<string, any>;
  toDay: number;
  rngSeed?: number;
  now?: number;
}): ComputeTickResult {
  const now = args.now ?? Date.now();
  const { briefing } = applyTicks(args);

  // Collapse per (type, entityId), preserving first-seen order.
  const order: string[] = [];
  const groups = new Map<string, BriefingChange[]>();
  for (const c of briefing.changes) {
    const k = `${c.type}:${c.entityId}`;
    let g = groups.get(k);
    if (!g) {
      g = [];
      groups.set(k, g);
      order.push(k);
    }
    g.push(c);
  }

  const clocks = Array.isArray(args.data?.clocks) ? args.data.clocks : [];
  const clockMax = (id: string): number => {
    const fc = clocks.find((c: any) => c?.id === id);
    return typeof fc?.max === 'number' ? fc.max : DEFAULT_CLOCK_MAX;
  };

  const deltas: TickDelta[] = [];
  for (const k of order) {
    const arr = groups.get(k)!;
    const first = arr[0];
    const last = arr[arr.length - 1];
    const type = last.type;
    const field = TICK_FIELD[type];
    const collection = TICK_COLLECTION[type];
    const from = first.before[field] as number;
    const to = last.after[field] as number;

    const completed =
      type === 'clockAdvanced'
        ? to >= clockMax(last.entityId)
        : type === 'downtimeResolved'
          ? to >= 100
          : false;
    const category = classifyTickChange(type, completed);

    const delta: WorldDelta = {
      targetId: last.entityId,
      field,
      from,
      to,
      target: { collection, id: last.entityId },
    };
    if (type === 'agendaProgress') {
      const beforeBlk = Array.isArray(first.before.blockers) ? (first.before.blockers as string[]) : [];
      const afterBlk = Array.isArray(last.after.blockers) ? (last.after.blockers as string[]) : [];
      if (afterBlk.length > beforeBlk.length) delta.blockers = afterBlk.slice(beforeBlk.length);
    }

    const change: BriefingChange = {
      type,
      entityId: last.entityId,
      entityName: last.entityName,
      before: first.before,
      after: last.after,
      reason: last.reason,
    };
    deltas.push({ category, delta, change });
  }

  return { deltas, fromDay: briefing.fromDay, toDay: briefing.toDay, lastTickAt: now };
}

/** Deterministic id for a tick review event — the idempotency key. Recomputing
 * the same logical tick (same day span + target + field) yields the same id, so
 * `appendEvents` dedupes it across reopen and converging devices. */
export function tickEventId(fromDay: number, toDay: number, d: WorldDelta): string {
  return `tick:${fromDay}-${toDay}:${deltaCollection(d)}:${deltaTargetId(d)}:${d.field}`;
}

function anchorKeyFor(change: BriefingChange): string {
  switch (change.type) {
    case 'clockAdvanced':
      return entityKey('factionClock', change.entityId);
    case 'renownShift':
      return entityKey('faction', change.entityId);
    default:
      // Downtime / agenda have no first-class wiki entity type; the raw id
      // anchors the proposal and the review UI falls back to it for display.
      return change.entityId;
  }
}

/** Build the propose-only events for the reviewable half of a tick. */
export function buildTickReviewEvents(result: ComputeTickResult, now: number): PendingWorldEvent[] {
  return result.deltas
    .filter((t) => t.category === 'review')
    .map((t) => ({
      id: tickEventId(result.fromDay, result.toDay, t.delta),
      anchorId: anchorKeyFor(t.change),
      deltas: [t.delta],
      sourceRule: TICK_SOURCE_RULE[t.change.type],
      createdAt: now,
      status: 'pending' as const,
    }));
}

export type TickCommitResult = {
  /** New campaign data with ONLY the auto half applied + day advanced + review
   * events enqueued. Inputs are never mutated. */
  data: Record<string, any>;
  /** Recap of what was auto-applied (drives the read-only "While You Were Away"
   * recap and `undoLastBriefing`). Contains the auto changes only. */
  briefing: Briefing;
  autoCount: number;
  reviewCount: number;
};

/**
 * Run a tick and split it: the auto half lands canonically (clock/downtime
 * increments + day advance + recap briefing), the review half is enqueued into
 * `data.pendingWorldEvents`. Pure on `data` (clones it). This is the single
 * tick write-shape; both the get/setVal callers and `maps/travel` route through
 * it so there is one path and one audit trail.
 */
export function commitTickToData(
  data: Record<string, any>,
  opts: { toDay: number; rngSeed?: number; now?: number },
): TickCommitResult {
  const now = opts.now ?? Date.now();
  const result = computeTickDeltas({ data, toDay: opts.toDay, rngSeed: opts.rngSeed, now });
  const autoDeltas = result.deltas.filter((t) => t.category === 'auto');
  const reviewEvents = buildTickReviewEvents(result, now);

  const next: Record<string, any> = structuredClone(data);

  // Apply ONLY the auto deltas to their canonical collections (agendas are
  // never auto, so this only ever touches clocks/downtime).
  const byCollection = new Map<DeltaCollection, WorldDelta[]>();
  for (const t of autoDeltas) {
    const c = deltaCollection(t.delta);
    const list = byCollection.get(c);
    if (list) list.push(t.delta);
    else byCollection.set(c, [t.delta]);
  }
  for (const [collection, ds] of byCollection) {
    if (collection === 'agendas') continue; // defensive — agendas are review-only
    const slice = { [collection]: Array.isArray(next[collection]) ? next[collection] : [] } as DeltaCollections;
    const committed = applyApprovedDeltas(slice, ds);
    const updated = (committed as any)[collection];
    if (updated) next[collection] = updated;
  }

  // Advance the world clock; the recap briefing records ONLY auto changes.
  const wc0 = readWorldClock(data, now);
  const autoBriefing: Briefing = {
    id: makeWorldId(),
    generatedAt: now,
    fromDay: result.fromDay,
    toDay: result.toDay,
    changes: autoDeltas.map((t) => t.change),
  };
  const briefingLog = [...wc0.briefingLog, autoBriefing].slice(-BRIEFING_LOG_CAP);
  next.worldClock = { ...wc0, currentDay: result.toDay, lastTickAt: now, briefingLog };

  // Enqueue the review half (idempotent by deterministic id).
  const existing = getPendingEvents({ [PENDING_EVENTS_KEY]: next[PENDING_EVENTS_KEY] });
  next[PENDING_EVENTS_KEY] = appendEvents(existing, reviewEvents);

  return {
    data: next,
    briefing: autoBriefing,
    autoCount: autoDeltas.length,
    reviewCount: reviewEvents.length,
  };
}

type GetFn = (k: string, fb: any) => any;
type SetFn = (k: string, v: any) => void;

/**
 * get/setVal adapter over `commitTickToData` for the React call sites
 * (`useLivingWorldData`, `WhileYouWereAway`). Writes only the keys that the tick
 * can change; each `setVal` flows through the debounced CRDT/auto-save path.
 */
export function commitTick(
  get: GetFn,
  setVal: SetFn,
  opts: { toDay: number; rngSeed?: number; now?: number },
): TickCommitResult {
  const data = {
    worldClock: get('worldClock', null),
    clocks: get('clocks', []),
    downtime: get('downtime', []),
    factions: get('factions', []),
    npcs: get('npcs', []),
    [PENDING_EVENTS_KEY]: get(PENDING_EVENTS_KEY, []),
  };
  const result = commitTickToData(data, opts);
  const next = result.data;
  setVal('clocks', next.clocks);
  setVal('downtime', next.downtime);
  setVal('worldClock', next.worldClock);
  setVal(PENDING_EVENTS_KEY, next[PENDING_EVENTS_KEY]);
  return result;
}
