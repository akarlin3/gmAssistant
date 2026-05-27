// Symmetric-aware relationship lookup. Given an entity, return every
// relationship touching it — both the ones it is the source of and the ones it
// is the target of — annotated with the label to render on this side. Symmetric
// kinds (allyOf/enemyOf/related) are stored once but surface on both endpoints
// with the same label; asymmetric kinds show the inverse label on the target
// side ("Member of" ↔ "Has member").

import { RELATIONSHIP_CATALOG } from './catalog';
import type { EntityType, Relationship } from './types';

export type ResolvedRelationship = {
  rel: Relationship;
  direction: 'from' | 'to';
  otherType: EntityType;
  otherId: string;
  label: string;
};

export function relationshipsFor(
  entityType: EntityType,
  entityId: string,
  all: ReadonlyArray<Relationship>,
): ResolvedRelationship[] {
  const out: ResolvedRelationship[] = [];
  for (const rel of all) {
    const rule = RELATIONSHIP_CATALOG.find((r) => r.kind === rel.kind);
    if (!rule) continue;
    if (rel.fromType === entityType && rel.fromId === entityId) {
      out.push({
        rel,
        direction: 'from',
        otherType: rel.toType,
        otherId: rel.toId,
        label: rule.label,
      });
    } else if (rel.toType === entityType && rel.toId === entityId) {
      out.push({
        rel,
        direction: 'to',
        otherType: rel.fromType,
        otherId: rel.fromId,
        label: rule.symmetric ? rule.label : rule.inverseLabel,
      });
    }
  }
  return out;
}
