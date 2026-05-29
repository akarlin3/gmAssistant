'use client';

// Reactive trigger — client-side observer half (CP2/CP4, propose-only).
//
// Mounted once in the GM session (CampaignEditor). It watches the merged Y.Doc
// JSON for NPCs transitioning into a "dead" state and, for each, enqueues a
// bounded propagation proposal into `data.pendingWorldEvents`. It is strictly
// propose-only: the ONLY field it ever writes is the pending-events queue —
// never a canonical npc/edge field — so it cannot race the Yjs merge or rewrite
// the world behind player projections.
//
// Loop-safety: writing the queue changes `pendingWorldEvents`, not npc death
// state, so the effect's dependency (a signature of npc death states) does not
// change and the observer does not re-fire on its own write.

import { useEffect, useMemo, useRef } from 'react';
import { entityKey } from '@/lib/wiki/entities';
import { deathStateById } from './reactive';
import {
  appendEvents,
  getPendingEvents,
  proposeFromAnchorChange,
  PENDING_EVENTS_KEY,
  type PendingWorldEvent,
} from './proposals';
import { DEFAULT_PROPAGATION_PARAMS, type PropagationParams } from './propagation';

export function useReactiveWorldEvents(
  get: (k: string, fb: any) => any,
  setVal: (k: string, v: any) => void,
  opts: { enabled?: boolean; magnitude?: number; params?: PropagationParams } = {},
): void {
  const enabled = opts.enabled !== false;
  const magnitude = opts.magnitude ?? -1; // a death removes the anchor
  const params = opts.params ?? DEFAULT_PROPAGATION_PARAMS;

  const seededRef = useRef(false);
  const prevDeadRef = useRef<Map<string, boolean>>(new Map());

  const npcs = get('npcs', []) as any[];

  // Cheap signature so the effect only runs when some NPC's death state flips,
  // not on every unrelated campaign edit.
  const deathSig = useMemo(() => {
    const m = deathStateById(npcs);
    return [...m.entries()].map(([id, d]) => `${id}:${d ? 1 : 0}`).sort().join(',');
  }, [npcs]);

  useEffect(() => {
    if (!enabled) return;
    const nextDead = deathStateById(npcs);

    if (!seededRef.current) {
      // First observation seeds the baseline; pre-existing deaths are not
      // re-proposed when an existing campaign loads.
      prevDeadRef.current = nextDead;
      seededRef.current = true;
      return;
    }

    const transitions: string[] = [];
    for (const [id, dead] of nextDead) {
      if (dead && !prevDeadRef.current.get(id)) transitions.push(entityKey('npc', id));
    }
    prevDeadRef.current = nextDead;
    if (transitions.length === 0) return;

    const relationships = (get('relationships', []) as any[]) ?? [];
    const newEvents: PendingWorldEvent[] = [];
    for (const anchorKey of transitions) {
      const ev = proposeFromAnchorChange(relationships, anchorKey, magnitude, {
        params,
        sourceRule: 'reactive:death',
      });
      if (ev) newEvents.push(ev);
    }
    if (newEvents.length === 0) return;

    const existing = getPendingEvents({ [PENDING_EVENTS_KEY]: get(PENDING_EVENTS_KEY, []) });
    setVal(PENDING_EVENTS_KEY, appendEvents(existing, newEvents));
    // Intentionally keyed only off deathSig + enabled; reading get()/setVal at
    // fire time keeps relationships/queue fresh without re-subscribing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deathSig, enabled]);
}
