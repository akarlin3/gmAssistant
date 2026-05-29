// Reactive trigger — pure detection half (CP3 / CP4).
//
// The original plan called for a Cloud Function on NPC state changes. That is
// not viable in this deployment (no CF host; campaign `data.*` flows through
// binary Yjs updates, not field-level Firestore deltas; a CF writing `data.*`
// would race the Yjs merge — the forbidden invariant). Per the CP0 sign-off the
// reactive trigger is instead a client-side observer in the GM session
// (lib/world/useReactiveWorldEvents.ts), mirroring the existing
// publishProjections / useAutoPublish precedent.
//
// This module is the pure, testable detection core: given the previous and next
// NPC arrays it returns the entityKeys that just transitioned into a "dead"
// state. It performs NO writes and proposes nothing — the hook turns each
// detected anchor into a bounded propagation proposal.

import { entityKey } from '@/lib/wiki/entities';

type NpcLike = { id?: unknown; dead?: unknown; status?: unknown };

const DEATH_RE = /\b(dead|deceased|killed|slain|fallen|destroyed)\b/i;

/** True when an NPC record is in a "dead" state (boolean flag or status text). */
export function isDeadNpc(npc: NpcLike | null | undefined): boolean {
  if (!npc || typeof npc !== 'object') return false;
  if (npc.dead === true) return true;
  return typeof npc.status === 'string' && DEATH_RE.test(npc.status);
}

/** Map of npc id → dead?, for entities that carry a stable id. */
export function deathStateById(npcs: ReadonlyArray<NpcLike> | null | undefined): Map<string, boolean> {
  const m = new Map<string, boolean>();
  if (!Array.isArray(npcs)) return m;
  for (const n of npcs) {
    if (n && typeof n.id === 'string' && n.id) m.set(n.id, isDeadNpc(n));
  }
  return m;
}

/**
 * entityKeys of NPCs that are dead in `next` but were not dead (or absent) in
 * `prev`. Pure; deterministic. A freshly-added NPC that is already dead counts
 * as a transition (absent ⇒ not-dead).
 */
export function detectDeathTransitions(
  prev: ReadonlyArray<NpcLike> | null | undefined,
  next: ReadonlyArray<NpcLike> | null | undefined,
): string[] {
  const before = deathStateById(prev);
  const keys: string[] = [];
  if (!Array.isArray(next)) return keys;
  for (const n of next) {
    if (!n || typeof n.id !== 'string' || !n.id) continue;
    if (isDeadNpc(n) && !before.get(n.id)) keys.push(entityKey('npc', n.id));
  }
  return keys;
}
