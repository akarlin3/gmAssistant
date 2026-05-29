'use client';

// World-events review + commit UI (CP4).
//
// Surfaces the propose-only queue (`data.pendingWorldEvents`) and is the ONLY
// place an approved proposal becomes a canonical write. "Advance World" runs the
// DM batch (propagation + faction heuristics + drift) and enqueues proposals;
// each proposal can be approved (its deltas commit through the normal
// setVal → CRDT/auto-save path, which regenerates player projections) or
// rejected. A per-rule autoApply toggle (default off) lets low-stakes rules
// (e.g. drift) commit without a click.

import React, { useCallback, useEffect, useMemo } from 'react';
import { Play, Check, X, Zap } from 'lucide-react';
import { buildEntityIndex, entityKey } from '@/lib/wiki/entities';
import { kindLabel } from '@/lib/wiki/graphModel';
import type { Relationship } from '@/lib/wiki/types';
import { runBatchProposals } from '@/lib/world/batch';
import {
  applyApprovedDeltas,
  appendEvents,
  getPendingEvents,
  pendingOnly,
  removeEvent,
  PENDING_EVENTS_KEY,
  type PendingWorldEvent,
  type WorldDelta,
} from '@/lib/world/proposals';

type GetFn = (k: string, fb: any) => any;
type SetFn = (k: string, v: any) => void;

const SETTINGS_KEY = 'worldEventSettings';

// Entity-bearing campaign keys buildEntityIndex understands. Assembled from the
// flat get() accessor so we can resolve entityKeys → display names.
const ENTITY_KEYS = [
  'npcs', 'factions', 'locations', 'characters', 'clocks', 'items',
  'secrets', 'monsters', 'scenes', 'potentialScenes', 'fantasticLocations',
] as const;

const RULE_LABELS: Record<string, string> = {
  'drift': 'Relationship drift',
  'faction:conflict': 'Faction conflict',
  'faction:propagation': 'Faction ripple',
  'propagation': 'State propagation',
  'reactive:death': 'NPC death ripple',
};

function ruleLabel(rule: string): string {
  return RULE_LABELS[rule] ?? rule;
}

function fmtWeight(v: number | string): string {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : String(v);
}

export default function WorldEventsReview({
  get,
  setVal,
}: {
  get: GetFn;
  setVal: SetFn;
  campaignName?: string;
}) {
  const events: PendingWorldEvent[] = getPendingEvents({ [PENDING_EVENTS_KEY]: get(PENDING_EVENTS_KEY, []) });
  const pending = pendingOnly(events);
  const autoApply: Record<string, boolean> = get(SETTINGS_KEY, {})?.autoApply ?? {};

  // Resolve entityKey → display name and edge id → label.
  const { nameFor, edgeLabel } = useMemo(() => {
    const data: Record<string, any> = {};
    for (const k of ENTITY_KEYS) data[k] = get(k, []);
    const index = buildEntityIndex(data);
    const rels: Relationship[] = Array.isArray(data.relationships) ? data.relationships : get('relationships', []);
    const byId = new Map<string, Relationship>(rels.map((r) => [r.id, r]));
    const nameFor = (key: string) => index.byKey.get(key)?.name ?? key;
    const edgeLabel = (edgeId: string): string => {
      const r = byId.get(edgeId);
      if (!r) return edgeId;
      const from = nameFor(entityKey(r.fromType, r.fromId));
      const to = nameFor(entityKey(r.toType, r.toId));
      return `${from} —${kindLabel(r.kind)}→ ${to}`;
    };
    return { nameFor, edgeLabel };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [get('relationships', []), get('npcs', []), get('factions', [])]);

  const commit = useCallback(
    (ids: string[]) => {
      const current = getPendingEvents({ [PENDING_EVENTS_KEY]: get(PENDING_EVENTS_KEY, []) });
      const toCommit = current.filter((e) => ids.includes(e.id) && e.status === 'pending');
      if (toCommit.length === 0) return;
      const deltas: WorldDelta[] = toCommit.flatMap((e) => e.deltas);
      const rels: Relationship[] = get('relationships', []) ?? [];
      setVal('relationships', applyApprovedDeltas(rels, deltas));
      setVal(PENDING_EVENTS_KEY, current.filter((e) => !ids.includes(e.id)));
    },
    [get, setVal],
  );

  const reject = useCallback(
    (id: string) => {
      const current = getPendingEvents({ [PENDING_EVENTS_KEY]: get(PENDING_EVENTS_KEY, []) });
      setVal(PENDING_EVENTS_KEY, removeEvent(current, id));
    },
    [get, setVal],
  );

  const advanceWorld = useCallback(() => {
    const data: Record<string, any> = {};
    for (const k of ENTITY_KEYS) data[k] = get(k, []);
    data.relationships = get('relationships', []);
    const proposed = runBatchProposals(data, { sessionsElapsed: 1 });
    if (proposed.length === 0) return;
    const current = getPendingEvents({ [PENDING_EVENTS_KEY]: get(PENDING_EVENTS_KEY, []) });
    setVal(PENDING_EVENTS_KEY, appendEvents(current, proposed));
  }, [get, setVal]);

  const toggleAutoApply = useCallback(
    (rule: string) => {
      const settings = get(SETTINGS_KEY, {}) ?? {};
      const next = { ...(settings.autoApply ?? {}) };
      next[rule] = !next[rule];
      setVal(SETTINGS_KEY, { ...settings, autoApply: next });
    },
    [get, setVal],
  );

  // Per-rule autoApply: silently commit any pending event whose rule is enabled.
  useEffect(() => {
    const auto = pending.filter((e) => autoApply[e.sourceRule]);
    if (auto.length > 0) commit(auto.map((e) => e.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pending.map((e) => e.id).join(','), JSON.stringify(autoApply)]);

  const rulesPresent = Array.from(new Set(pending.map((e) => e.sourceRule)));

  return (
    <section className="rounded-md border border-rule bg-parchment/40 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-sm uppercase tracking-wider text-ink">World Events</h3>
          <p className="text-xs text-ink-mute">
            Propose-only. Approved changes commit to the campaign and player views; nothing changes until you say so.
          </p>
        </div>
        <button
          type="button"
          onClick={advanceWorld}
          className="flex items-center gap-1.5 rounded-sm border border-brass-deep bg-brass-deep/10 px-3 py-1.5 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-brass-deep hover:text-parchment"
        >
          <Play size={12} /> Advance World
        </button>
      </div>

      {rulesPresent.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {rulesPresent.map((rule) => (
            <button
              key={rule}
              type="button"
              onClick={() => toggleAutoApply(rule)}
              title="Auto-apply proposals from this rule"
              className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${
                autoApply[rule]
                  ? 'border-brass-deep bg-brass-deep text-parchment'
                  : 'border-rule text-ink-mute'
              }`}
            >
              <Zap size={10} /> Auto: {ruleLabel(rule)}
            </button>
          ))}
        </div>
      )}

      {pending.length === 0 ? (
        <p className="py-6 text-center text-xs text-ink-mute">
          No pending proposals. Press “Advance World”, or a watched change (e.g. an NPC marked dead) will enqueue ripples here.
        </p>
      ) : (
        <ul className="space-y-2">
          {pending.map((ev) => (
            <li key={ev.id} className="rounded-sm border border-rule bg-parchment p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="font-display text-[11px] uppercase tracking-wider text-ink-soft">
                  {ruleLabel(ev.sourceRule)}
                  <span className="ml-2 normal-case text-ink-mute">· anchor {nameFor(ev.anchorId)}</span>
                </span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => commit([ev.id])}
                    className="flex items-center gap-1 rounded-sm border border-emerald-700/60 bg-emerald-700/10 px-2 py-1 text-[10px] uppercase tracking-wider text-emerald-800 hover:bg-emerald-700 hover:text-parchment"
                  >
                    <Check size={11} /> Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => reject(ev.id)}
                    className="flex items-center gap-1 rounded-sm border border-crimson/60 bg-crimson/10 px-2 py-1 text-[10px] uppercase tracking-wider text-crimson hover:bg-crimson hover:text-parchment"
                  >
                    <X size={11} /> Reject
                  </button>
                </div>
              </div>
              <ul className="space-y-1">
                {ev.deltas.map((d, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-ink">{d.field === 'weight' ? edgeLabel(d.targetId) : `${d.targetId}.${d.field}`}</span>
                    <span className="shrink-0 font-mono text-ink-soft">
                      {fmtWeight(d.from)} → <span className="text-ink">{fmtWeight(d.to)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
