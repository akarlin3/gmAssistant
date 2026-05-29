// Shared, render-agnostic graph model for the node graph (CP2). Both the GM
// graph (built from the in-memory WikiEntity index + Relationship[]) and the
// player graph (built from the redacted SlotProjection) normalize into these
// types, so the React Flow renderer and the d3-force layout have a single
// input shape. Pure + dependency-light; no Firestore, no React.

import { entityKey } from './entities';
import { ruleFor } from './catalog';
import { effectiveWeight, isDirected } from './edges';
import type { EntityType, EdgeVisibility, Relationship, RelationshipKind } from './types';

export type GraphNode = {
  /** entityKey — `type:id`. Used directly as the React Flow node id. */
  key: string;
  type: EntityType;
  id: string;
  name: string;
};

export type GraphEdge = {
  id: string;
  source: string; // entityKey
  target: string; // entityKey
  kind: RelationshipKind;
  /** 0..1 effective strength (drives line thickness + layout spring). */
  weight: number;
  /** true when the kind is asymmetric (renders an arrowhead). */
  directed: boolean;
  /** GM-only; absent on player-projected edges (already redacted away). */
  visibility?: EdgeVisibility;
};

/**
 * Derive a faction cluster id per node, for force-clustering. A faction node
 * anchors its own cluster; any node with an edge to a faction joins that
 * faction's cluster (first match wins, deterministic by edge order). Nodes with
 * no faction tie return null (laid out near the center).
 */
export function buildClusters(
  nodes: ReadonlyArray<GraphNode>,
  edges: ReadonlyArray<GraphEdge>,
): Map<string, string | null> {
  const nodeKeys = new Set(nodes.map((n) => n.key));
  const factionKeys = new Set(nodes.filter((n) => n.type === 'faction').map((n) => n.key));
  const cluster = new Map<string, string | null>();

  // Factions anchor themselves.
  for (const fk of factionKeys) cluster.set(fk, fk);

  for (const e of edges) {
    if (!nodeKeys.has(e.source) || !nodeKeys.has(e.target)) continue;
    const srcFaction = factionKeys.has(e.source);
    const tgtFaction = factionKeys.has(e.target);
    if (srcFaction && !tgtFaction && !cluster.has(e.target)) {
      cluster.set(e.target, e.source);
    } else if (tgtFaction && !srcFaction && !cluster.has(e.source)) {
      cluster.set(e.source, e.target);
    }
  }

  for (const n of nodes) if (!cluster.has(n.key)) cluster.set(n.key, null);
  return cluster;
}

/** Build graph edges from in-memory campaign relationships (GM side). */
export function edgesFromRelationships(
  relationships: ReadonlyArray<Relationship>,
): GraphEdge[] {
  return relationships
    .filter((r) => r && r.id && !r.suggested)
    .map((r) => ({
      id: r.id,
      source: entityKey(r.fromType, r.fromId),
      target: entityKey(r.toType, r.toId),
      kind: r.kind,
      weight: effectiveWeight(r),
      directed: isDirected(r),
      visibility: r.visibility,
    }));
}

/** Human label for a relationship kind (falls back to the raw kind). */
export function kindLabel(kind: RelationshipKind | string): string {
  return ruleFor(kind as RelationshipKind)?.label ?? String(kind);
}
