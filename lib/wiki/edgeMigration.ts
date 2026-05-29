// Initial-edge migration (CP1e). Derives explicit graph edges from the
// *structural* implied relationships that today live as name-based references
// inside campaign data:
//
//   • npcs[].faction   (faction NAME)  → memberOf  (npc → faction)
//   • clocks[].faction (faction NAME)  → related   (factionClock → faction)
//
// @entity prose mentions are intentionally NOT handled here — they already flow
// through the existing suggestion scanner (lib/wiki/suggest.ts), which appends
// `suggested:true` relationships. This pass only mints high-confidence edges
// from explicit structural fields.
//
// The function is PURE and IDEMPOTENT: it returns a new relationships array (or
// the same reference when nothing changed) plus counts. It never writes to
// Firestore or the Y.Doc — the caller applies the result through the normal
// CRDT-aware save path (applyCampaignData), so migrated edges converge offline
// exactly like any other edit. Re-running it produces no duplicates: every
// candidate is checked against relationshipExists (which is direction- and
// kind-aware) before being added.

import { relationshipExists } from './relationships';
import type { EntityType, Relationship, RelationshipKind } from './types';

export type EdgeMigrationStats = {
  /** NPCs + clocks examined for a faction reference. */
  entitiesScanned: number;
  /** New edges minted this pass. */
  edgesCreated: number;
  /**
   * Candidates that referenced a faction we couldn't unambiguously resolve
   * (unknown name, blank id, or a name shared by multiple factions) — left for
   * manual review rather than guessed.
   */
  ambiguousSkipped: number;
};

export type EdgeMigrationResult = {
  relationships: Relationship[];
  stats: EdgeMigrationStats;
  /** True iff at least one edge was added (caller can skip the save otherwise). */
  changed: boolean;
};

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `edge-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function str(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

// Build a faction-name → id lookup. Names that collide (two factions, same
// name) map to null so any reference to them is treated as ambiguous.
function buildFactionNameIndex(factions: unknown): Map<string, string | null> {
  const byName = new Map<string, string | null>();
  if (!Array.isArray(factions)) return byName;
  for (const f of factions) {
    if (!f || typeof f !== 'object') continue;
    const id = str((f as any).id);
    const name = str((f as any).name).toLowerCase();
    if (!id || !name) continue;
    byName.set(name, byName.has(name) ? null : id);
  }
  return byName;
}

function makeEdge(
  fromType: EntityType,
  fromId: string,
  toType: EntityType,
  toId: string,
  kind: RelationshipKind,
  now: number,
): Relationship {
  return {
    id: newId(),
    fromType,
    fromId,
    toType,
    toId,
    kind,
    createdAt: now,
    updatedAt: now,
    // Fail-closed in player mode until the GM chooses to share the edge.
    visibility: 'private',
  };
}

export function migrateImpliedEdges(
  data: Record<string, any> | null | undefined,
  now: number = Date.now(),
): EdgeMigrationResult {
  const d = data ?? {};
  const existing: Relationship[] = Array.isArray(d.relationships) ? d.relationships : [];
  const factionByName = buildFactionNameIndex(d.factions);

  // Work on a growing copy so duplicate candidates within this same pass also
  // dedup against edges we just added (relationshipExists sees them).
  const out: Relationship[] = [...existing];
  let entitiesScanned = 0;
  let edgesCreated = 0;
  let ambiguousSkipped = 0;

  const linkToFaction = (
    fromType: EntityType,
    fromId: string,
    factionName: string,
    kind: RelationshipKind,
  ): void => {
    const key = factionName.toLowerCase();
    const factionId = factionByName.get(key);
    // Unknown name, or a name shared by multiple factions (mapped to null).
    if (!factionId) {
      ambiguousSkipped += 1;
      return;
    }
    if (
      relationshipExists(
        out,
        { type: fromType, id: fromId },
        { type: 'faction', id: factionId },
        kind,
      )
    ) {
      return; // idempotent: already an edge
    }
    out.push(makeEdge(fromType, fromId, 'faction', factionId, kind, now));
    edgesCreated += 1;
  };

  // npcs[].faction → memberOf
  if (Array.isArray(d.npcs)) {
    for (const npc of d.npcs) {
      if (!npc || typeof npc !== 'object') continue;
      const factionName = str((npc as any).faction);
      if (!factionName) continue;
      entitiesScanned += 1;
      const npcId = str((npc as any).id);
      if (!npcId) {
        ambiguousSkipped += 1; // no stable anchor to attach the edge to
        continue;
      }
      linkToFaction('npc', npcId, factionName, 'memberOf');
    }
  }

  // clocks[].faction → related (no dedicated clock↔faction kind in the catalog)
  if (Array.isArray(d.clocks)) {
    for (const clock of d.clocks) {
      if (!clock || typeof clock !== 'object') continue;
      const factionName = str((clock as any).faction);
      if (!factionName) continue;
      entitiesScanned += 1;
      const clockId = str((clock as any).id);
      if (!clockId) {
        ambiguousSkipped += 1;
        continue;
      }
      linkToFaction('factionClock', clockId, factionName, 'related');
    }
  }

  const changed = edgesCreated > 0;
  return {
    relationships: changed ? out : existing,
    stats: { entitiesScanned, edgesCreated, ambiguousSkipped },
    changed,
  };
}
