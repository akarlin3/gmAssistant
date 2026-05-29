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

// Patch the editable fields of one relationship (kind/weight/visibility/notes…)
// and stamp `updatedAt`. Immutable; unknown ids are a no-op.
export function updateRelationship(
  all: ReadonlyArray<Relationship>,
  id: string,
  patch: Partial<Omit<Relationship, 'id' | 'createdAt'>>,
): Relationship[] {
  return all.map((r) => (r.id === id ? { ...r, ...patch, updatedAt: Date.now() } : r));
}

// Confirm a suggested OR proposed relationship — clears both review flags so it
// joins the confirmed set. Drops the now-irrelevant proposal reason.
export function acceptSuggestion(all: ReadonlyArray<Relationship>, id: string): Relationship[] {
  return all.map((r) => {
    if (r.id !== id) return r;
    const { proposedReason, ...rest } = r;
    void proposedReason;
    return { ...rest, suggested: false, proposed: false };
  });
}

// Merge derivation proposals into the array, skipping any that duplicate an
// existing link (same kind + same entity pair, direction-insensitive) — whether
// that existing link is confirmed, suggested, or already proposed. Returns the
// (possibly unchanged) array plus how many were actually added.
export function mergeProposals(
  all: ReadonlyArray<Relationship>,
  proposals: ReadonlyArray<Relationship>,
): { relationships: Relationship[]; added: number } {
  const out = [...all];
  let added = 0;
  for (const p of proposals) {
    const exists = out.some((r) => {
      if (r.kind !== p.kind) return false;
      const fwd = r.fromType === p.fromType && r.fromId === p.fromId && r.toType === p.toType && r.toId === p.toId;
      const bwd = r.fromType === p.toType && r.fromId === p.toId && r.toType === p.fromType && r.toId === p.fromId;
      return fwd || bwd;
    });
    if (exists) continue;
    out.push(p);
    added++;
  }
  return { relationships: out, added };
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
