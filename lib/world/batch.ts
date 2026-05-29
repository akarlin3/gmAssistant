// DM batch trigger — "Advance World" (CP2, propose-only).
//
// Runs entirely client-side (full `data.*` + edges are already in memory — no CF
// timeout/cost). Produces PendingWorldEvent[] from three propose-only passes:
//   1. weight drift over elapsed sessions (relationships relax toward baseline),
//   2. faction-conflict heuristics (wealth + hostility → escalate),
//   3. propagation outward from each conflict aggressor (the rising power ripples).
// It writes nothing; the caller appends the result to `data.pendingWorldEvents`.

import { effectiveWeight } from '@/lib/wiki/edges';
import { entityKey } from '@/lib/wiki/entities';
import type { Relationship, RelationshipKind } from '@/lib/wiki/types';
import {
  proposeWeightDrift,
  proposeFactionConflicts,
  proposeFromAnchorChange,
  type PendingWorldEvent,
  type FactionStanding,
  type DriftParams,
  type FactionConflictParams,
} from './proposals';
import { type PropagationParams } from './propagation';

// Edge kinds that represent a faction's holdings/followers — used as a wealth
// proxy when a faction carries no explicit numeric strength field.
const HOLDING_KINDS = new Set<RelationshipKind>([
  'owns', 'locatedAt', 'memberOf', 'leaderOf', 'protects',
]);

// Explicit numeric strength fields a faction object might carry, best first.
const WEALTH_FIELDS = ['wealth', 'power', 'influence', 'renown'];

function explicitWealth(faction: Record<string, any>): number | null {
  for (const f of WEALTH_FIELDS) {
    const v = faction[f];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
  }
  return null;
}

/**
 * Derive a comparable "wealth" per faction. Uses an explicit numeric field when
 * present, otherwise a graph proxy: the summed weight of the faction's holding/
 * follower edges. Pure.
 */
export function computeFactionStandings(
  data: Record<string, any> | null | undefined,
): FactionStanding[] {
  const factions = Array.isArray(data?.factions) ? data!.factions : [];
  const relationships: Relationship[] = Array.isArray(data?.relationships) ? data!.relationships : [];

  // Pre-sum holding-edge weight per faction key.
  const holdings = new Map<string, number>();
  for (const r of relationships) {
    if (!r || r.suggested || !HOLDING_KINDS.has(r.kind)) continue;
    for (const [type, id] of [[r.fromType, r.fromId], [r.toType, r.toId]] as const) {
      if (type !== 'faction') continue;
      const key = entityKey('faction', id);
      holdings.set(key, (holdings.get(key) ?? 0) + effectiveWeight(r));
    }
  }

  const out: FactionStanding[] = [];
  factions.forEach((f: any, i: number) => {
    if (!f || typeof f !== 'object') return;
    const id = typeof f.id === 'string' && f.id ? f.id : `faction-${i}`;
    const key = entityKey('faction', id);
    const name = typeof f.name === 'string' ? f.name : id;
    const wealth = explicitWealth(f) ?? holdings.get(key) ?? 0;
    out.push({ key, name, wealth });
  });
  return out;
}

export type BatchOptions = {
  sessionsElapsed?: number;
  now?: number;
  propagation?: PropagationParams;
  drift?: DriftParams;
  faction?: FactionConflictParams;
};

/**
 * Run the full DM-batch and return the proposed events (propose-only; nothing
 * is written). `sessionsElapsed` drives weight drift (default 1).
 */
export function runBatchProposals(
  data: Record<string, any> | null | undefined,
  opts: BatchOptions = {},
): PendingWorldEvent[] {
  const now = opts.now ?? Date.now();
  const sessionsElapsed = opts.sessionsElapsed ?? 1;
  const relationships: Relationship[] = Array.isArray(data?.relationships) ? data!.relationships : [];
  const events: PendingWorldEvent[] = [];

  // 1. Time-based weight drift.
  const drift = proposeWeightDrift(relationships, sessionsElapsed, { drift: opts.drift, now });
  if (drift) events.push(drift);

  // 2. Faction-conflict heuristics.
  const standings = computeFactionStandings(data);
  const conflicts = proposeFactionConflicts(standings, relationships, { params: opts.faction, now });
  events.push(...conflicts);

  // 3. Propagate from each conflict aggressor so the escalation ripples out.
  const aggressors = new Set(conflicts.map((e) => e.anchorId));
  for (const anchorKey of aggressors) {
    const ev = proposeFromAnchorChange(relationships, anchorKey, 1, {
      params: opts.propagation,
      now,
      sourceRule: 'faction:propagation',
    });
    if (ev) events.push(ev);
  }

  return events;
}
