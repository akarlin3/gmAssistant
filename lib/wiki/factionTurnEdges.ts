// Bridge from the Living-World faction engine (lib/factionEngine.ts) to the
// campaign graph. After a faction turn, strong faction stances (sworn allies /
// blood enemies) are surfaced as `proposed` graph edges between the matching
// *wiki* faction entities, so the GM can pull engine outcomes into the
// relationship graph via the review queue.
//
// The faction engine runs in its own id space (FactionWorld.factions[].id),
// separate from the wiki entity index (data.factions[].id). We bridge by
// normalized name match — the only stable link between the two — via the
// `resolveFactionId` callback the caller supplies. Unmatched factions are
// skipped (documented, intentional): no guessing.

import { getRelationship, type FactionWorld } from '@/lib/factionEngine';
import type { Relationship } from './types';

const ALLY_STANCE = 5; // >= ⇒ propose allyOf
const ENEMY_STANCE = -5; // <= ⇒ propose enemyOf

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `fturn-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Proposed allyOf/enemyOf edges between wiki faction entities, derived from the
 * faction world's relationship stances. `resolveFactionId` maps an engine
 * faction *name* to a wiki faction entity id (or undefined if no match).
 */
export function factionStanceProposals(
  world: FactionWorld,
  resolveFactionId: (name: string) => string | undefined,
  now: number = Date.now(),
): Relationship[] {
  const factions = world.factions ?? [];
  const out: Relationship[] = [];
  // Stable iteration over unordered faction pairs.
  for (let i = 0; i < factions.length; i++) {
    for (let j = i + 1; j < factions.length; j++) {
      const a = factions[i];
      const b = factions[j];
      const { stance } = getRelationship(world.relationships ?? {}, a.id, b.id);
      if (stance < ALLY_STANCE && stance > ENEMY_STANCE) continue; // neutral band

      const aId = resolveFactionId(a.name);
      const bId = resolveFactionId(b.name);
      if (!aId || !bId || aId === bId) continue; // no wiki match — skip

      const kind = stance >= ALLY_STANCE ? 'allyOf' : 'enemyOf';
      out.push({
        id: makeId(),
        fromType: 'faction',
        fromId: aId,
        toType: 'faction',
        toId: bId,
        kind,
        weight: Number((Math.min(10, Math.abs(stance)) / 10).toFixed(3)),
        proposed: true,
        proposedReason: `Faction turn (tick ${world.tick}): stance ${stance > 0 ? `+${stance}` : stance}`,
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  return out;
}
