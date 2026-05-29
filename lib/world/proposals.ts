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

/** A single proposed change. `targetId` is a relationship (edge) id; `field` is
 * the field to change. Only `weight` is committed today; unknown fields are
 * preserved on the proposal but skipped at commit (forward-compatible). */
export type WorldDelta = {
  targetId: string;
  field: string;
  from: number | string;
  to: number | string;
};

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

/** Append newly-proposed events, dropping any with no deltas. */
export function appendEvents(
  existing: ReadonlyArray<PendingWorldEvent>,
  incoming: ReadonlyArray<PendingWorldEvent>,
): PendingWorldEvent[] {
  return [...existing, ...incoming.filter((e) => e.deltas.length > 0)];
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

/**
 * Apply approved deltas to the relationships array, returning a NEW array. Only
 * `field === 'weight'` is committed; the matched edge's weight is set to the
 * clamped `to`. Unknown fields / unmatched targets are ignored. The caller is
 * responsible for writing the result through the CRDT/auto-save path.
 */
export function applyApprovedDeltas(
  relationships: ReadonlyArray<Relationship>,
  deltas: ReadonlyArray<WorldDelta>,
): Relationship[] {
  if (deltas.length === 0) return relationships.slice();
  const weightByEdge = new Map<string, number>();
  for (const d of deltas) {
    if (d.field !== 'weight') continue;
    const to = typeof d.to === 'number' ? d.to : Number(d.to);
    if (!Number.isFinite(to)) continue;
    weightByEdge.set(d.targetId, clampWeight(to));
  }
  if (weightByEdge.size === 0) return relationships.slice();
  const now = Date.now();
  return relationships.map((r) =>
    weightByEdge.has(r.id)
      ? { ...r, weight: weightByEdge.get(r.id)!, updatedAt: now }
      : r,
  );
}
