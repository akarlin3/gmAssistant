// Propose-only world-event queue + commit translation (CP3 + CP4).
//
// THE NON-NEGOTIABLE INVARIANT: nothing in this module mutates canonical
// `data.*` directly. Both trigger paths (DM batch + the client-side reactive
// observer) call the `propose*` builders here and write the resulting
// PendingWorldEvent[] into `data.pendingWorldEvents` — an ordinary CRDT-backed
// array. Canonical entity/edge fields only change later, in `applyApprovedDeltas`,
// and only for proposals the GM has approved; that commit is then written
// through the existing CRDT/auto-save path (the single consistent writer that
// regenerates player projections). See docs/world-events.md.
//
// The queue lives in the campaign Y.Doc (offline-first, merges across devices)
// rather than a Firestore subcollection, so there is no second writer and no new
// security rule — consistent with how every other piece of campaign content is
// stored (CLAUDE.md, "Offline-first CRDT sync").

import { effectiveWeight, defaultWeightForKind } from '@/lib/wiki/edges';
import type { Relationship, RelationshipKind } from '@/lib/wiki/types';
import { entityKey } from '@/lib/wiki/entities';
import {
  propagate,
  driftWeight,
  clampWeight,
  type PropEdge,
  type PropagationParams,
  DEFAULT_PROPAGATION_PARAMS,
} from './propagation';

export const PENDING_EVENTS_KEY = 'pendingWorldEvents';

export type WorldEventStatus = 'pending' | 'approved' | 'rejected';

/**
 * The campaign collection a delta targets. Defaults to `relationships` when a
 * delta omits `target`, so every pre-existing engine delta (edge-weight changes)
 * keeps working untouched. The Living World tick adds the other collections.
 *   - relationships → edge `weight`
 *   - clocks        → faction-clock `filled`
 *   - downtime      → downtime `progress`
 *   - factions      → faction `renown`
 *   - agendas       → `worldClock.agendas[].progress` (+ appended `blockers`)
 */
export type DeltaCollection =
  | 'relationships'
  | 'clocks'
  | 'downtime'
  | 'factions'
  | 'agendas';

/** A single proposed change. `targetId` is the target entity id (an edge id for
 * relationships); `field` is the field to change. `target` carries the
 * collection discriminator — when absent the collection is `relationships` and
 * the id is `targetId`, preserving the original edge-only shape. `blockers`
 * bundles newly-appended agenda blockers alongside a progress change. Unknown
 * fields are preserved on the proposal but skipped at commit (forward-compatible). */
export type WorldDelta = {
  targetId: string;
  field: string;
  from: number | string;
  to: number | string;
  /** Collection discriminator. Absent ⇒ `{ collection: 'relationships', id: targetId }`. */
  target?: { collection: DeltaCollection; id: string };
  /** Agenda-only: blocker strings appended by this change (bundled with progress). */
  blockers?: string[];
};

/** Resolve a delta's collection + id, defaulting to the legacy relationship shape. */
export function deltaCollection(d: WorldDelta): DeltaCollection {
  return d.target?.collection ?? 'relationships';
}
export function deltaTargetId(d: WorldDelta): string {
  return d.target?.id ?? d.targetId;
}

export type PendingWorldEvent = {
  id: string;
  /** entityKey or edge id that triggered the proposal. */
  anchorId: string;
  deltas: WorldDelta[];
  /** e.g. "propagation", "drift", "faction:conflict" — drives per-rule autoApply. */
  sourceRule: string;
  createdAt: number;
  status: WorldEventStatus;
};

export type DriftParams = {
  /** Per-session relaxation factor ∈ (0,1) — see propagation.driftWeight. */
  decayRate: number;
  /** Minimum |Δweight| worth proposing (avoids churn from tiny drifts). */
  minDelta: number;
};

export const DEFAULT_DRIFT_PARAMS: DriftParams = { decayRate: 0.85, minDelta: 0.05 };

export type FactionStanding = {
  /** entityKey of the faction node (e.g. "faction:abc"). */
  key: string;
  name: string;
  /** Higher = wealthier/stronger. Scale is arbitrary; only the ordering matters. */
  wealth: number;
};

export type FactionConflictParams = {
  /** Hostility (enemyOf edge weight) above which conflict is proposed. */
  hostilityThreshold: number;
  /** How far toward 1.0 to escalate the hostility edge. */
  escalateTo: number;
};

export const DEFAULT_FACTION_CONFLICT_PARAMS: FactionConflictParams = {
  hostilityThreshold: 0.8,
  escalateTo: 1,
};

// ── ID + clock injection (pure-testable) ────────────────────────────────────
let idCounter = 0;
function makeEventId(now: number): string {
  idCounter = (idCounter + 1) % 1_000_000;
  return `wev_${now.toString(36)}_${idCounter.toString(36)}`;
}

// ── Queue helpers (pure; operate on the data record / event arrays) ──────────

export function getPendingEvents(data: Record<string, any> | null | undefined): PendingWorldEvent[] {
  const arr = data?.[PENDING_EVENTS_KEY];
  return Array.isArray(arr) ? (arr as PendingWorldEvent[]) : [];
}

export function pendingOnly(events: ReadonlyArray<PendingWorldEvent>): PendingWorldEvent[] {
  return events.filter((e) => e.status === 'pending');
}

/** Append newly-proposed events, dropping any with no deltas and any whose `id`
 * already exists in the queue. The id-dedupe is the idempotency guard for the
 * Living World tick: a tick's review events carry deterministic ids
 * (`tick:<from>-<to>:<collection>:<id>:<field>`), so recomputing the same
 * logical tick — across reopen or two converging devices — never enqueues it
 * twice. Engine events use unique ids, so they are never falsely deduped. */
export function appendEvents(
  existing: ReadonlyArray<PendingWorldEvent>,
  incoming: ReadonlyArray<PendingWorldEvent>,
): PendingWorldEvent[] {
  const have = new Set(existing.map((e) => e.id));
  const add: PendingWorldEvent[] = [];
  for (const e of incoming) {
    if (e.deltas.length === 0 || have.has(e.id)) continue;
    have.add(e.id);
    add.push(e);
  }
  return [...existing, ...add];
}

export function setEventStatus(
  events: ReadonlyArray<PendingWorldEvent>,
  id: string,
  status: WorldEventStatus,
): PendingWorldEvent[] {
  return events.map((e) => (e.id === id ? { ...e, status } : e));
}

export function removeEvent(
  events: ReadonlyArray<PendingWorldEvent>,
  id: string,
): PendingWorldEvent[] {
  return events.filter((e) => e.id !== id);
}

// ── Edge plumbing ────────────────────────────────────────────────────────────

/** Build propagation edges from campaign relationships (skips unconfirmed
 * suggestions; resolves the effective 0..1 weight per edge). */
export function buildPropEdges(
  relationships: ReadonlyArray<Relationship>,
): PropEdge[] {
  return relationships
    .filter((r) => r && r.id && !r.suggested)
    .map((r) => ({
      id: r.id,
      a: entityKey(r.fromType, r.fromId),
      b: entityKey(r.toType, r.toId),
      kind: r.kind,
      weight: effectiveWeight(r),
    }));
}

function baselineForKind(kind: RelationshipKind): number {
  return defaultWeightForKind(kind) ?? 0.5;
}

// ── Proposal builders (propose-only; never touch canonical data) ─────────────

/**
 * Bounded propagation from a single anchor change → one PendingWorldEvent whose
 * deltas adjust the weight of each edge the ripple traverses. Returns null when
 * nothing crosses the ε threshold (e.g. an isolated anchor).
 */
export function proposeFromAnchorChange(
  relationships: ReadonlyArray<Relationship>,
  anchorKey: string,
  magnitude: number,
  opts: { params?: PropagationParams; now?: number; sourceRule?: string } = {},
): PendingWorldEvent | null {
  const params = opts.params ?? DEFAULT_PROPAGATION_PARAMS;
  const now = opts.now ?? Date.now();
  const edges = buildPropEdges(relationships);
  const byId = new Map(edges.map((e) => [e.id, e]));
  const impacts = propagate({ anchorKey, magnitude, edges, ...params });

  const deltas: WorldDelta[] = [];
  for (const im of impacts) {
    const edge = byId.get(im.viaEdgeId);
    if (!edge) continue;
    const from = clampWeight(edge.weight);
    const to = clampWeight(edge.weight + im.delta);
    if (to === from) continue;
    deltas.push({ targetId: im.viaEdgeId, field: 'weight', from, to });
  }
  if (deltas.length === 0) return null;
  return {
    id: makeEventId(now),
    anchorId: anchorKey,
    deltas,
    sourceRule: opts.sourceRule ?? 'propagation',
    createdAt: now,
    status: 'pending',
  };
}

/**
 * Weight drift over elapsed sessions → one PendingWorldEvent relaxing every edge
 * toward its kind baseline. Low-stakes housekeeping; a good `autoApply`
 * candidate. Returns null when no edge drifts past `minDelta`.
 */
export function proposeWeightDrift(
  relationships: ReadonlyArray<Relationship>,
  sessionsElapsed: number,
  opts: { drift?: DriftParams; now?: number } = {},
): PendingWorldEvent | null {
  const drift = opts.drift ?? DEFAULT_DRIFT_PARAMS;
  const now = opts.now ?? Date.now();
  if (sessionsElapsed <= 0) return null;

  const deltas: WorldDelta[] = [];
  for (const r of relationships) {
    if (!r || !r.id || r.suggested) continue;
    const old = effectiveWeight(r);
    const baseline = baselineForKind(r.kind);
    const next = driftWeight(baseline, old, drift.decayRate, sessionsElapsed);
    if (Math.abs(next - old) < drift.minDelta) continue;
    deltas.push({ targetId: r.id, field: 'weight', from: old, to: next });
  }
  if (deltas.length === 0) return null;
  return {
    id: makeEventId(now),
    anchorId: `drift:${sessionsElapsed}`,
    deltas,
    sourceRule: 'drift',
    createdAt: now,
    status: 'pending',
  };
}

function hostilityEdge(
  edges: ReadonlyArray<PropEdge>,
  a: string,
  b: string,
): PropEdge | null {
  let best: PropEdge | null = null;
  for (const e of edges) {
    if (e.kind !== 'enemyOf') continue;
    const match = (e.a === a && e.b === b) || (e.a === b && e.b === a);
    if (match && (!best || e.weight > best.weight)) best = e;
  }
  return best;
}

/**
 * Faction heuristic: for each hostile faction pair where the wealthier side is
 * also hostile (enemyOf edge weight > threshold), propose escalating that
 * hostility edge — `wealth(A) > wealth(B) AND hostility > 0.8 → propose conflict`.
 * One PendingWorldEvent per qualifying pair. Propose-only.
 */
export function proposeFactionConflicts(
  factions: ReadonlyArray<FactionStanding>,
  relationships: ReadonlyArray<Relationship>,
  opts: { params?: FactionConflictParams; now?: number } = {},
): PendingWorldEvent[] {
  const params = opts.params ?? DEFAULT_FACTION_CONFLICT_PARAMS;
  const now = opts.now ?? Date.now();
  const edges = buildPropEdges(relationships);
  const out: PendingWorldEvent[] = [];

  for (let i = 0; i < factions.length; i++) {
    for (let j = 0; j < factions.length; j++) {
      if (i === j) continue;
      const a = factions[i];
      const b = factions[j];
      if (a.wealth <= b.wealth) continue; // only the wealthier aggressor
      const edge = hostilityEdge(edges, a.key, b.key);
      if (!edge || edge.weight <= params.hostilityThreshold) continue;
      const from = clampWeight(edge.weight);
      const to = clampWeight(Math.max(edge.weight, params.escalateTo));
      if (to === from) continue;
      out.push({
        id: makeEventId(now),
        anchorId: a.key,
        deltas: [{ targetId: edge.id, field: 'weight', from, to }],
        sourceRule: 'faction:conflict',
        createdAt: now,
        status: 'pending',
      });
    }
  }
  return out;
}

// ── Commit translation (the only place canonical edges change) ───────────────

/** The campaign collections a commit can touch. Agendas are passed flattened
 * (the caller re-nests them under `worldClock.agendas`). Any collection may be
 * omitted; only those actually changed are returned. */
export type DeltaCollections = {
  relationships?: ReadonlyArray<Relationship>;
  clocks?: ReadonlyArray<Record<string, any>>;
  downtime?: ReadonlyArray<Record<string, any>>;
  factions?: ReadonlyArray<Record<string, any>>;
  agendas?: ReadonlyArray<Record<string, any>>;
};

// Per-collection committable field. A delta whose collection/field is not
// listed here is ignored at commit (forward-compatible, fail-safe).
const COMMITTABLE_FIELD: Record<DeltaCollection, string> = {
  relationships: 'weight',
  clocks: 'filled',
  downtime: 'progress',
  factions: 'renown',
  agendas: 'progress',
};

function numericTo(d: WorldDelta): number | null {
  const to = typeof d.to === 'number' ? d.to : Number(d.to);
  return Number.isFinite(to) ? to : null;
}

/** Apply one delta onto a matched entity, returning a NEW entity (or the same
 * reference when nothing changed). Pure. */
function applyDeltaToEntity(
  collection: DeltaCollection,
  entity: Record<string, any>,
  d: WorldDelta,
): Record<string, any> {
  if (d.field !== COMMITTABLE_FIELD[collection]) return entity;
  const to = numericTo(d);
  if (to === null) return entity;
  if (collection === 'relationships') {
    return { ...entity, weight: clampWeight(to), updatedAt: Date.now() };
  }
  const next = { ...entity, [d.field]: to };
  if (collection === 'agendas' && Array.isArray(d.blockers) && d.blockers.length) {
    next.blockers = [...(Array.isArray(entity.blockers) ? entity.blockers : []), ...d.blockers];
  }
  return next;
}

function applyToCollection(
  collection: DeltaCollection,
  arr: ReadonlyArray<Record<string, any>>,
  deltas: ReadonlyArray<WorldDelta>,
): Record<string, any>[] | null {
  const relevant = deltas.filter(
    (d) => deltaCollection(d) === collection && d.field === COMMITTABLE_FIELD[collection],
  );
  if (relevant.length === 0) return null;
  let changed = false;
  const next = arr.map((e) => {
    if (!e || typeof e.id !== 'string') return e;
    let cur = e as Record<string, any>;
    for (const d of relevant) {
      if (deltaTargetId(d) !== cur.id) continue;
      const updated = applyDeltaToEntity(collection, cur, d);
      if (updated !== cur) {
        cur = updated;
        changed = true;
      }
    }
    return cur;
  });
  return changed ? next : null;
}

/**
 * THE single canonical-commit translator. Apply approved deltas across every
 * supported collection, returning a NEW object containing only the collections
 * that actually changed (each a new array; inputs are never mutated). The caller
 * writes each returned collection through the CRDT/auto-save path. Unknown
 * fields / collections / unmatched targets are ignored.
 *
 * Overloaded for back-compat: called with a `Relationship[]` it returns a
 * `Relationship[]` (the original edge-only contract); called with a
 * `DeltaCollections` it returns a `DeltaCollections`.
 */
export function applyApprovedDeltas(
  relationships: ReadonlyArray<Relationship>,
  deltas: ReadonlyArray<WorldDelta>,
): Relationship[];
export function applyApprovedDeltas(
  collections: DeltaCollections,
  deltas: ReadonlyArray<WorldDelta>,
): DeltaCollections;
export function applyApprovedDeltas(
  input: ReadonlyArray<Relationship> | DeltaCollections,
  deltas: ReadonlyArray<WorldDelta>,
): Relationship[] | DeltaCollections {
  if (Array.isArray(input)) {
    const next = applyToCollection('relationships', input, deltas);
    return (next as Relationship[] | null) ?? input.slice();
  }
  // Array.isArray doesn't narrow a ReadonlyArray out of the union, so cast.
  const collections = input as DeltaCollections;
  const out: DeltaCollections = {};
  for (const collection of Object.keys(COMMITTABLE_FIELD) as DeltaCollection[]) {
    const arr = collections[collection];
    if (!Array.isArray(arr)) continue;
    const next = applyToCollection(collection, arr, deltas);
    if (next) (out as any)[collection] = next;
  }
  return out;
}
