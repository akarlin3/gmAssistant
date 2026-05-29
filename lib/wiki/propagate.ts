// Relationship propagation (CP3 "Living-World" derivation). A pure, deterministic
// pass over the *confirmed* affective edges (allyOf / enemyOf) that infers
// second-order relationships a GM might want, and returns them as `proposed`
// edges for the review queue — it never mutates campaign state directly.
//
// Rules (one 2-hop pass, classic social inference):
//   ally(A,B)  & ally(B,C)  ⇒ ally(A,C)    "friend of a friend"
//   ally(A,B)  & enemy(B,C) ⇒ enemy(A,C)   "a friend's enemy"
//   enemy(A,B) & enemy(B,C) ⇒ ally(A,C)    "enemy of an enemy" (weak)
//
// Inferred weight decays from the weaker of the two source edges so derived
// links are softer than first-hand ones. Pairs already linked by ally/enemy
// (either direction) are skipped, and ally/enemy conflicts on the same pair
// resolve to the stronger signal (enemy wins ties — the cautious reading).

import { effectiveWeight } from './edges';
import type { EntityType, Relationship, RelationshipKind } from './types';

type Part = { type: EntityType; id: string };
const keyOf = (p: Part) => `${p.type}:${p.id}`;
const pairKey = (a: string, b: string) => (a < b ? `${a}__${b}` : `${b}__${a}`);

const ALLY_DECAY = 0.6;
const ENEMY_OF_ENEMY_DECAY = 0.4;

export type PropagationResult = {
  proposals: Relationship[];
};

function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return `prop-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Derive proposed second-order edges. `nameOf` (optional) makes the human
 * `proposedReason` reference the intermediary entity by name.
 */
export function propagateRelationships(
  relationships: ReadonlyArray<Relationship>,
  nameOf?: (p: Part) => string | undefined,
  now: number = Date.now(),
): PropagationResult {
  // Confirmed affective edges only.
  const affective = relationships.filter(
    (r) => r && !r.suggested && !r.proposed && (r.kind === 'allyOf' || r.kind === 'enemyOf'),
  );

  const parts = new Map<string, Part>();
  const ally = new Map<string, Set<string>>();
  const enemy = new Map<string, Set<string>>();
  const weightByPairKind = new Map<string, number>();
  // Pairs that already share any ally/enemy edge (skip — don't re-propose).
  const directlyRelated = new Set<string>();

  const note = (p: Part) => {
    const k = keyOf(p);
    if (!parts.has(k)) parts.set(k, p);
    return k;
  };
  const link = (m: Map<string, Set<string>>, a: string, b: string) => {
    (m.get(a) ?? m.set(a, new Set()).get(a)!).add(b);
    (m.get(b) ?? m.set(b, new Set()).get(b)!).add(a);
  };

  for (const r of affective) {
    const a = note({ type: r.fromType, id: r.fromId });
    const b = note({ type: r.toType, id: r.toId });
    if (a === b) continue;
    directlyRelated.add(pairKey(a, b));
    weightByPairKind.set(`${r.kind}:${pairKey(a, b)}`, effectiveWeight(r));
    link(r.kind === 'allyOf' ? ally : enemy, a, b);
  }

  const wOf = (kind: RelationshipKind, a: string, b: string) =>
    weightByPairKind.get(`${kind}:${pairKey(a, b)}`) ?? 0.5;

  // Best proposal per unordered pair, deterministic over sorted keys.
  type Cand = { kind: 'allyOf' | 'enemyOf'; a: Part; c: Part; weight: number; via: string };
  const best = new Map<string, Cand>();
  const consider = (kind: 'allyOf' | 'enemyOf', aKey: string, cKey: string, weight: number, viaKey: string) => {
    if (aKey === cKey) return;
    const pk = pairKey(aKey, cKey);
    if (directlyRelated.has(pk)) return;
    const w = Math.min(1, Math.max(0, weight));
    const prev = best.get(pk);
    // Enemy wins ties; otherwise higher weight wins.
    const better =
      !prev ||
      w > prev.weight + 1e-9 ||
      (Math.abs(w - prev.weight) <= 1e-9 && kind === 'enemyOf' && prev.kind === 'allyOf');
    if (!better) return;
    best.set(pk, { kind, a: parts.get(aKey)!, c: parts.get(cKey)!, weight: w, via: viaKey });
  };

  const sortedMid = [...parts.keys()].sort();
  for (const b of sortedMid) {
    const allies = [...(ally.get(b) ?? [])].sort();
    const enemies = [...(enemy.get(b) ?? [])].sort();

    // friend of a friend ⇒ ally
    for (let i = 0; i < allies.length; i++)
      for (let j = i + 1; j < allies.length; j++) {
        const [a, c] = [allies[i], allies[j]];
        consider('allyOf', a, c, Math.min(wOf('allyOf', a, b), wOf('allyOf', c, b)) * ALLY_DECAY, b);
      }
    // a friend's enemy ⇒ enemy
    for (const a of allies)
      for (const c of enemies)
        consider('enemyOf', a, c, Math.min(wOf('allyOf', a, b), wOf('enemyOf', c, b)) * ALLY_DECAY, b);
    // enemy of an enemy ⇒ ally (weak)
    for (let i = 0; i < enemies.length; i++)
      for (let j = i + 1; j < enemies.length; j++) {
        const [a, c] = [enemies[i], enemies[j]];
        consider('allyOf', a, c, Math.min(wOf('enemyOf', a, b), wOf('enemyOf', c, b)) * ENEMY_OF_ENEMY_DECAY, b);
      }
  }

  const proposals: Relationship[] = [...best.entries()]
    .sort((x, y) => (x[0] < y[0] ? -1 : 1))
    .map(([, c]) => {
      const viaName = nameOf?.(parts.get(c.via)!);
      const verb = c.kind === 'allyOf' ? 'allies' : 'opposed';
      return {
        id: makeId(),
        fromType: c.a.type,
        fromId: c.a.id,
        toType: c.c.type,
        toId: c.c.id,
        kind: c.kind,
        weight: Number(c.weight.toFixed(3)),
        proposed: true,
        proposedReason: viaName ? `Inferred ${verb} via ${viaName}` : `Inferred ${verb} (2-hop)`,
        createdAt: now,
        updatedAt: now,
      };
    });

  return { proposals };
}
