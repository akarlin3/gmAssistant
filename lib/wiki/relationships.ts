// Pure helpers for the relationships array. Kept dependency-free so they can be
// unit-tested and reused by both the scanner (lib/wiki/suggest.ts) and the UI
// layer (components/wiki). All functions are immutable — they return new arrays.

import { ruleFor } from './catalog';
import type { EdgeVisibility, EntityType, Relationship, RelationshipKind } from './types';

export type EntityRef = { type: EntityType; id: string };

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

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

// ── Graph-editing edge helpers (CP5) ─────────────────────────────────────────
// The node graph is a write surface: drag-to-connect creates an edge with an
// explicit weight/visibility; the edge editor adjusts kind/weight/visibility in
// place. Both are pure array transforms here so the UI layer (components/wiki)
// can route them through the same setState/CRDT auto-save path as every other
// relationship mutation — no second writer.

export type EdgeInit = {
  /** Normalized 0..1 strength. Clamped. Omit to fall back to the kind default. */
  weight?: number;
  /** Player-mode redaction. Defaults to 'private' (fail-closed) when omitted. */
  visibility?: EdgeVisibility;
  customVisibleTo?: string[];
  notes?: string;
};

/** Create a graph edge (Relationship) with optional weight/visibility set at
 * creation time. Built on createRelationship so the id/createdAt logic stays in
 * one place; `updatedAt` is seeded to `createdAt`. */
export function createEdge(
  from: EntityRef,
  to: EntityRef,
  kind: RelationshipKind,
  init: EdgeInit = {},
): Relationship {
  const base = createRelationship(from, to, kind, init.notes);
  const rel: Relationship = { ...base, updatedAt: base.createdAt };
  if (typeof init.weight === 'number' && Number.isFinite(init.weight)) {
    rel.weight = clamp01(init.weight);
  }
  if (init.visibility) rel.visibility = init.visibility;
  if (init.visibility === 'custom' && Array.isArray(init.customVisibleTo)) {
    rel.customVisibleTo = init.customVisibleTo;
  }
  return rel;
}

export type EdgePatch = Partial<
  Pick<Relationship, 'kind' | 'weight' | 'visibility' | 'customVisibleTo' | 'notes'>
>;

/** Edit one edge in place, returning a NEW array. Weight is clamped to 0..1;
 * switching visibility away from 'custom' drops the stale roster list; an empty
 * notes string clears the field. Always stamps `updatedAt`. */
export function updateRelationship(
  all: ReadonlyArray<Relationship>,
  id: string,
  patch: EdgePatch,
): Relationship[] {
  return all.map((r) => {
    if (r.id !== id) return r;
    const next: Relationship = { ...r, updatedAt: Date.now() };
    if (patch.kind !== undefined) next.kind = patch.kind;
    if (patch.weight !== undefined && Number.isFinite(patch.weight)) {
      next.weight = clamp01(patch.weight as number);
    }
    if (patch.visibility !== undefined) {
      next.visibility = patch.visibility;
      if (patch.visibility !== 'custom') delete next.customVisibleTo;
    }
    if (patch.customVisibleTo !== undefined) next.customVisibleTo = patch.customVisibleTo;
    if (patch.notes !== undefined) {
      const t = patch.notes.trim();
      if (t) next.notes = t;
      else delete next.notes;
    }
    return next;
  });
}

export function removeRelationship(all: ReadonlyArray<Relationship>, id: string): Relationship[] {
  return all.filter((r) => r.id !== id);
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
