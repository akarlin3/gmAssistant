// Procedural world-state propagation — the pure math core (CP3).
//
// When an anchor entity's state changes by Δ, the change ripples outward across
// the wiki edge graph (lib/wiki, `data.relationships`). For a neighbor M reached
// across edge e at hop k the impact is:
//
//     ΔM = Δ · weight(e) · sign(kind) · decay^k        // ally +, hostile −, dependent proportional
//
// The single-edge formula in the spec is generalized here to the multiplicative
// cascade that actually makes the recursion converge: each hop multiplies the
// running magnitude by that edge's weight·sign·decay, so the magnitude at hop k
// is Δ · Π(weightᵢ·signᵢ) · decay^k. Because every weight ∈ [0,1], |sign| = 1 and
// decay ∈ (0,1), the magnitude strictly shrinks along every path and is pruned
// once |ΔM| < ε; combined with the visited-set (each node expanded at most once)
// and the depthCap, termination is guaranteed by construction — there is no
// configuration of edges, including cycles, that can loop forever.
//
// Pure + dependency-light (no Firestore, no React) so it is trivially unit
// tested. Nothing here mutates anything — it only computes proposed impacts.

import type { RelationshipKind } from '@/lib/wiki/types';

/** A graph edge reduced to the fields propagation needs. `a`/`b` are entityKeys. */
export type PropEdge = {
  id: string;
  a: string;
  b: string;
  kind: RelationshipKind;
  /** Effective 0..1 strength (see lib/wiki/edges.ts:effectiveWeight). */
  weight: number;
};

/** A computed impact on one neighbor, reached across `viaEdgeId` at `hop`. */
export type PropImpact = {
  targetKey: string;
  viaEdgeId: string;
  viaKind: RelationshipKind;
  /** Signed change to apply (already decayed for this hop). */
  delta: number;
  hop: number;
};

export type PropagationParams = {
  /** Per-hop geometric decay ∈ (0,1). */
  decay: number;
  /** Convergence floor — stop once |ΔM| drops below this. */
  epsilon: number;
  /** Hard cap on hop count (defense-in-depth on top of ε). */
  depthCap: number;
};

export const DEFAULT_PROPAGATION_PARAMS: PropagationParams = {
  decay: 0.5,
  epsilon: 0.05,
  depthCap: 4,
};

// Relationship-kind → propagation sign. Hostile kinds invert the change
// (a boon to your enemy is a blow to you); everything else is "dependent
// proportional" and carries the change in the same direction. Unknown kinds
// default to +1 (the conservative, non-inverting reading).
const SIGN_BY_KIND: Partial<Record<RelationshipKind, number>> = {
  allyOf: 1,
  enemyOf: -1,
  fears: -1,
  protects: 1,
  memberOf: 1,
  leaderOf: 1,
  parentOf: 1,
  mentorOf: 1,
  owns: 1,
  createdBy: 1,
  locatedAt: 1,
  hiddenAt: 1,
  knows: 1,
  wants: 1,
  related: 1,
};

export function signForKind(kind: RelationshipKind): number {
  return SIGN_BY_KIND[kind] ?? 1;
}

type Adjacency = Map<string, { edge: PropEdge; other: string }[]>;

function buildAdjacency(edges: ReadonlyArray<PropEdge>): Adjacency {
  const adj: Adjacency = new Map();
  const push = (from: string, edge: PropEdge, other: string) => {
    const list = adj.get(from);
    if (list) list.push({ edge, other });
    else adj.set(from, [{ edge, other }]);
  };
  for (const e of edges) {
    if (!e || !e.id || e.a === e.b) continue;
    push(e.a, e, e.b);
    push(e.b, e, e.a);
  }
  return adj;
}

/**
 * Propagate an anchor change of `magnitude` outward across `edges`. Returns one
 * impact per qualifying edge traversed (the edge whose weight should change),
 * bounded by ε and depthCap. Pure: no side effects, deterministic given inputs.
 *
 * Convergence/recursion-safety is structural — see the file header. The
 * `visited` set guarantees each node is expanded at most once even through
 * cycles; `processedEdges` guarantees each edge yields at most one impact even
 * when reachable from both ends.
 */
export function propagate(params: {
  anchorKey: string;
  magnitude: number;
  edges: ReadonlyArray<PropEdge>;
  decay: number;
  epsilon: number;
  depthCap: number;
}): PropImpact[] {
  const { anchorKey, magnitude, edges, decay, epsilon, depthCap } = params;
  const adj = buildAdjacency(edges);
  const impacts: PropImpact[] = [];
  if (!Number.isFinite(magnitude) || magnitude === 0) return impacts;
  if (!adj.has(anchorKey)) return impacts;

  const visited = new Set<string>([anchorKey]);
  const processedEdges = new Set<string>();
  // BFS frontier; each node enters the queue at most once (guarded by visited).
  const queue: { key: string; magnitude: number; hop: number }[] = [
    { key: anchorKey, magnitude, hop: 0 },
  ];

  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node.hop >= depthCap) continue; // never create impacts beyond the cap
    const neighbors = adj.get(node.key);
    if (!neighbors) continue;
    for (const { edge, other } of neighbors) {
      const childMag = node.magnitude * edge.weight * signForKind(edge.kind) * decay;
      if (Math.abs(childMag) < epsilon) continue; // converged on this branch
      if (!processedEdges.has(edge.id)) {
        processedEdges.add(edge.id);
        impacts.push({
          targetKey: other,
          viaEdgeId: edge.id,
          viaKind: edge.kind,
          delta: childMag,
          hop: node.hop + 1,
        });
      }
      if (!visited.has(other)) {
        visited.add(other);
        queue.push({ key: other, magnitude: childMag, hop: node.hop + 1 });
      }
    }
  }
  return impacts;
}

/** Clamp a value into the 0..1 normalized weight range. */
export function clampWeight(w: number): number {
  if (!Number.isFinite(w)) return 0;
  return Math.min(1, Math.max(0, w));
}

/**
 * Weight drift toward a baseline over elapsed sessions:
 *
 *     weight_new = baseline + (weight_old − baseline) · decayRate^sessionsElapsed
 *
 * As sessionsElapsed → ∞ the weight relaxes to `baseline`. Pure; result clamped
 * to 0..1.
 */
export function driftWeight(
  baseline: number,
  weightOld: number,
  decayRate: number,
  sessionsElapsed: number,
): number {
  const factor = Math.pow(decayRate, Math.max(0, sessionsElapsed));
  return clampWeight(baseline + (weightOld - baseline) * factor);
}
