// Builds the read-only player graph model from a SlotProjection. This is a
// pure *consumer* of the already-redacted projection — it performs NO
// visibility decisions of its own. The security boundary lives in
// projection.ts (projectEdges / redactEntity): by the time a SlotProjection
// reaches here, private edges and hidden entities have already been stripped,
// so nodes/edges produced below can only reflect what the slot is allowed to
// see. Reconstructing visibility here would risk diverging from that boundary,
// so we deliberately don't.

import { ruleFor } from '@/lib/wiki/catalog';
import { entityKey } from '@/lib/wiki/entities';
import type { GraphEdge, GraphNode } from '@/lib/wiki/graphModel';
import type { EntityType, RelationshipKind } from '@/lib/wiki/types';
import type { SlotProjection } from './types';

// Player projection collection key -> wiki EntityType (mirrors the GM-side map
// PLAYER_TYPE_TO_EDGE_TYPE in projection.ts, but read-only and local).
const COLLECTION_TO_TYPE: Record<string, EntityType> = {
  characters: 'pc',
  pcs: 'pc',
  npcs: 'npc',
  locations: 'location',
  factions: 'faction',
  clocks: 'factionClock',
};

function nameOf(e: Record<string, unknown>): string {
  for (const k of ['name', 'text', 'title']) {
    const v = e[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return 'Unknown';
}

export function buildPlayerGraph(projection: SlotProjection): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  const nodes: GraphNode[] = [];
  const seen = new Set<string>();
  const entities = projection.entities ?? {};
  for (const [collection, type] of Object.entries(COLLECTION_TO_TYPE)) {
    const arr = (entities as Record<string, Array<Record<string, unknown>> | undefined>)[collection];
    if (!Array.isArray(arr)) continue;
    for (const e of arr) {
      const id = typeof e.id === 'string' ? e.id : null;
      if (!id) continue;
      const key = entityKey(type, id);
      if (seen.has(key)) continue;
      seen.add(key);
      nodes.push({ key, type, id, name: nameOf(e) });
    }
  }

  const edges: GraphEdge[] = (projection.edges ?? []).map((e) => {
    const kind = e.kind as RelationshipKind;
    return {
      id: e.id,
      source: entityKey(e.fromType as EntityType, e.fromId),
      target: entityKey(e.toType as EntityType, e.toId),
      kind,
      weight: typeof e.weight === 'number' ? e.weight : 0.4,
      directed: ruleFor(kind)?.symmetric === false,
      // No `visibility` — the projection already stripped it.
    };
  });

  return { nodes, edges };
}
