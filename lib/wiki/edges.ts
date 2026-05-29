// Edge (graph) read helpers over the existing `data.relationships` array.
//
// The node-graph foundation treats each Relationship as a first-class edge.
// Because edges live inside the campaign Y.Doc (merged offline-first by the
// CRDT layer, lib/crdt/) and are read from the in-memory merged JSON view —
// NOT queried out of Firestore — the originally-proposed
// `where('participants','array-contains', id)` Firestore lookup is replaced by
// the pure, in-memory `edgesFor()` below. Same one-pass bidirectional lookup,
// no index, no second Firestore writer.
//
// All helpers are pure and dependency-light so they can back both the read
// path and the migration (lib/wiki/edgeMigration.ts).

import { entityKey } from './entities';
import { ruleFor } from './catalog';
import type { EdgeVisibility, EntityType, Relationship, RelationshipKind } from './types';

/**
 * Composite participant keys for an edge: `["npc:abc", "faction:xyz"]`.
 * Entity ids are only unique *within a type*, so participants are always
 * `type:id` (matching lib/wiki/entities.ts:entityKey), never bare ids.
 */
export function participantKeys(rel: Relationship): [string, string] {
  return [entityKey(rel.fromType, rel.fromId), entityKey(rel.toType, rel.toId)];
}

/** True if the edge touches the given entity on either end. */
export function edgeTouches(rel: Relationship, type: EntityType, id: string): boolean {
  return (
    (rel.fromType === type && rel.fromId === id) ||
    (rel.toType === type && rel.toId === id)
  );
}

/**
 * All edges incident to one entity — the bidirectional lookup. Replaces the
 * Firestore array-contains query; O(n) over the in-memory edge list, which is
 * already resident in the merged Y.Doc JSON.
 */
export function edgesFor(
  all: ReadonlyArray<Relationship>,
  type: EntityType,
  id: string,
): Relationship[] {
  return all.filter((r) => edgeTouches(r, type, id));
}

/** Whether an edge is directed (asymmetric kind) per the relationship catalog. */
export function isDirected(rel: Relationship): boolean {
  const rule = ruleFor(rel.kind);
  // Unknown kinds default to directed (the conservative reading).
  return rule ? !rule.symmetric : true;
}

// Read-time default strength per kind. Categorical structural kinds anchor at
// 1.0 (fully "in effect"); affective/associative kinds carry a softer default
// that the future propagation engine can tune. Returns undefined for kinds we
// intentionally leave weightless unless the GM sets one explicitly.
const DEFAULT_WEIGHT_BY_KIND: Partial<Record<RelationshipKind, number>> = {
  memberOf: 1,
  leaderOf: 1,
  locatedAt: 1,
  owns: 1,
  createdBy: 1,
  hiddenAt: 1,
  parentOf: 1,
  mentorOf: 0.8,
  allyOf: 0.7,
  enemyOf: 0.7,
  protects: 0.7,
  knows: 0.5,
  wants: 0.5,
  fears: 0.5,
  related: 0.3,
};

/**
 * Effective edge weight: the explicit `weight` when present (clamped to 0..1),
 * else the kind default, else 0. Read-only — never mutates the edge.
 */
export function effectiveWeight(rel: Relationship): number {
  if (typeof rel.weight === 'number' && Number.isFinite(rel.weight)) {
    return Math.min(1, Math.max(0, rel.weight));
  }
  return DEFAULT_WEIGHT_BY_KIND[rel.kind] ?? 0;
}

export function defaultWeightForKind(kind: RelationshipKind): number | undefined {
  return DEFAULT_WEIGHT_BY_KIND[kind];
}

/**
 * Player-mode visibility decision for an edge — the single source of truth for
 * "can this slot see this edge?". Mirrors lib/playerMode/resolveVisibility.ts's
 * entity logic and is fail-closed: an edge with no `visibility` is private.
 */
export function edgeVisibleToSlot(
  visibility: EdgeVisibility | undefined,
  customVisibleTo: string[] | undefined,
  slotId: string,
): boolean {
  switch (visibility) {
    case 'party':
      return true;
    case 'custom':
      return Array.isArray(customVisibleTo) && customVisibleTo.includes(slotId);
    case 'private':
    default:
      return false;
  }
}
