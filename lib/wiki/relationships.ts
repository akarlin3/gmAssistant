// Pure helpers for the relationships array. Kept dependency-free so they can be
// unit-tested and reused by both the scanner (lib/wiki/suggest.ts) and the UI
// layer (components/wiki). All functions are immutable — they return new arrays.

import { ruleFor } from './catalog';
import type { EntityType, Relationship, RelationshipKind } from './types';

export type EntityRef = { type: EntityType; id: string };

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `rel-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

// Two relationships are "the same" when they share a kind and connect the same
// pair of entities. For symmetric kinds direction doesn't matter; for
// asymmetric kinds we still treat a flipped duplicate as the same link so the
// scanner never proposes both A→B and B→A.
export function relationshipExists(
  all: ReadonlyArray<Relationship>,
  a: EntityRef,
  b: EntityRef,
  kind: RelationshipKind,
): boolean {
  return all.some((r) => {
    if (r.kind !== kind) return false;
    const forward =
      r.fromType === a.type && r.fromId === a.id && r.toType === b.type && r.toId === b.id;
    const backward =
      r.fromType === b.type && r.fromId === b.id && r.toType === a.type && r.toId === a.id;
    return forward || backward;
  });
}

export function createRelationship(
  from: EntityRef,
  to: EntityRef,
  kind: RelationshipKind,
  notes?: string,
): Relationship {
  return {
    id: makeId(),
    fromType: from.type,
    fromId: from.id,
    toType: to.type,
    toId: to.id,
    kind,
    ...(notes && notes.trim() ? { notes: notes.trim() } : {}),
    createdAt: Date.now(),
  };
}

export function addRelationship(
  all: ReadonlyArray<Relationship>,
  rel: Relationship,
): Relationship[] {
  return [...all, rel];
}

export function removeRelationship(all: ReadonlyArray<Relationship>, id: string): Relationship[] {
  return all.filter((r) => r.id !== id);
}

// Confirm a suggested relationship — clears the `suggested` flag in place.
export function acceptSuggestion(all: ReadonlyArray<Relationship>, id: string): Relationship[] {
  return all.map((r) => (r.id === id ? { ...r, suggested: false } : r));
}

export function rejectSuggestion(all: ReadonlyArray<Relationship>, id: string): Relationship[] {
  return removeRelationship(all, id);
}

// Human-readable "Label Other" string for one side of a relationship.
export function describeKind(kind: RelationshipKind, side: 'from' | 'to'): string {
  const rule = ruleFor(kind);
  if (!rule) return kind;
  if (side === 'from' || rule.symmetric) return rule.label;
  return rule.inverseLabel;
}
