/**
 * Authored, domain-specific merge for player PC write-backs.
 *
 * ## Why this exists (the gap Yjs does not close)
 *
 * Campaign content is a per-campaign Y.Doc (lib/crdt/). Yjs merges *generic*
 * concurrent edits beautifully — but it has no concept of *who* made an edit or
 * *whether they were allowed to*. Two situations the campaign domain cares about
 * that Yjs cannot resolve correctly on its own:
 *
 *   1. **Authority on a contested field.** During live play a player tracks
 *      their own HP / conditions / death-saves while the GM may also be editing
 *      the same sheet. Yjs would resolve a concurrent write by opaque CRDT
 *      tie-break (client id / sequence), which is arbitrary. The *domain* rule
 *      is: for the player-editable fields (lib/player/allowlist.ts), the
 *      character's player is the source of truth; for every other field the GM
 *      is. We encode that as an explicit field-authority policy below.
 *
 *   2. **Ownership / authorization.** A player client is unauthenticated — it
 *      holds only a share token and writes to pcWritebacks/{slotId}. The
 *      Firestore rule proves the *slot* is real but does NOT prove the targeted
 *      `pcId` belongs to that slot. Without this guard, slot A could stage a
 *      writeback referencing slot B's PC and the reconciler would apply it —
 *      one player editing another's character. This is also a redaction-boundary
 *      concern: writebacks must only ever touch the writer's own owned PC, never
 *      cross into another slot's data. We enforce ownership here, fail-closed.
 *
 * Plus a correctness bug this fixes incidentally: the previous reconciler did a
 * stale-snapshot read-modify-write per Firestore change event, so two writebacks
 * landing close together could lose one (last snapshot wins). This merge takes
 * *all* pending writebacks at once and resolves them deterministically (LWW by
 * timestamp, tie-broken by slotId), so the result is independent of arrival
 * order.
 *
 * This module is pure (no Firestore, no React) so it is unit-testable with
 * crafted concurrent scenarios and reusable by the redaction property suite to
 * prove the merge never moves data across the visibility boundary.
 */

import { appendRollEventRingBuffer } from '@/lib/diceRoller';
import { validatePlayerField, PLAYER_EDITABLE_FIELDS } from '@/lib/player/allowlist';
import { sanitizeOutboundWritebackUpdates } from '@/lib/playerMode/playerTrackerStorage';
import type {
  CoinPurse,
  InventoryItem,
  PartyLootItem,
  PlayerCharacter,
  PlayerWritebackTombstone,
  RollEvent,
} from '@/lib/pc/types';

const PLAYER_AUTHORITATIVE = new Set<string>(PLAYER_EDITABLE_FIELDS);

/** One staged writeback doc (campaigns/{id}/pcWritebacks/{slotId}). */
export type StagedWriteback = {
  /** The roster slot that staged this writeback (the doc id). */
  slotId: string;
  /** The PC the writeback targets. */
  pcId: string;
  /** field-path -> proposed value. */
  updates: Record<string, unknown>;
  /** Client wall-clock at stage time; the LWW key for concurrent resolution. */
  updatedAtMs: number;
};

export type RejectReason =
  | 'pc-not-found'
  | 'not-owner'
  | 'field-not-allowed'
  | 'invalid-value'
  | 'superseded';

export type RejectedField = {
  slotId: string;
  pcId: string;
  field: string;
  reason: RejectReason;
};

export type AppliedField = {
  slotId: string;
  pcId: string;
  field: string;
};

export type WritebackMergeResult = {
  /** The reconciled PC list. Referentially unchanged when nothing applied. */
  pcs: PlayerCharacter[];
  changed: boolean;
  applied: AppliedField[];
  rejected: RejectedField[];
};

/** True when the slot is the player-owner of this PC (fail-closed). */
function ownsPc(pc: PlayerCharacter, slotId: string): boolean {
  const o = pc.ownership;
  return !!o && o.ownerType === 'player' && o.playerSlotId === slotId;
}

/**
 * Immutably set a dot-path field on a PC, shallow-cloning each layer on the way
 * down so React reference-equality checks fire correctly.
 */
function setNestedField(pc: PlayerCharacter, fieldPath: string, value: unknown): PlayerCharacter {
  if (fieldPath === 'rollEvents' && Array.isArray(value)) {
    return {
      ...pc,
      rollEvents: appendRollEventRingBuffer(pc.rollEvents, value as RollEvent[], {
        cap: 50,
        includeSecret: false,
      }),
    };
  }
  const next: any = { ...pc };
  const parts = fieldPath.split('.');
  let cur: any = next;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    cur[part] = Array.isArray(cur[part]) ? [...cur[part]] : { ...(cur[part] ?? {}) };
    cur = cur[part];
  }
  cur[parts[parts.length - 1]] = value;
  if (fieldPath === 'classes' && Array.isArray(value) && value.length > 0) {
    const totalLvl = Math.max(
      1,
      Math.min(
        20,
        value.reduce((sum: number, c: any) => sum + (Number(c?.level) || 0), 0),
      ),
    );
    next.level = totalLvl;
    next.proficiencyBonus =
      totalLvl >= 17 ? 6 : totalLvl >= 13 ? 5 : totalLvl >= 9 ? 4 : totalLvl >= 5 ? 3 : 2;
  }
  return next;
}

/**
 * Apply tombstones to remove any previously-shared quest, annotation, journal
 * entry, theory link, or sticky card that the player subsequently toggled back
 * to private (`sharedWithGm: false`).
 */
function applyTombstonesToPc(
  pc: PlayerCharacter,
  tombstones: PlayerWritebackTombstone[],
): PlayerCharacter {
  if (!Array.isArray(tombstones) || tombstones.length === 0) return pc;
  const questIds = new Set<string>();
  const annotationIds = new Set<string>();
  const journalIds = new Set<string>();
  const theoryLinkIds = new Set<string>();
  const stickyCardIds = new Set<string>();
  const allIds = new Set<string>();

  for (const t of tombstones) {
    if (!t || typeof t.id !== 'string') continue;
    allIds.add(t.id);
    if (t.kind === 'quest') questIds.add(t.id);
    else if (t.kind === 'annotation') annotationIds.add(t.id);
    else if (t.kind === 'journal') journalIds.add(t.id);
    else if (t.kind === 'theoryLink') theoryLinkIds.add(t.id);
    else if (t.kind === 'stickyCard') stickyCardIds.add(t.id);
  }

  const next: PlayerCharacter = { ...pc };
  if (Array.isArray(next.sharedQuests)) {
    next.sharedQuests = next.sharedQuests.filter(
      (q) => !questIds.has(q.id) && !allIds.has(q.id) && q.sharedWithGm === true,
    );
  }
  if (Array.isArray(next.sharedAnnotations)) {
    next.sharedAnnotations = next.sharedAnnotations.filter(
      (a) => !annotationIds.has(a.id) && !allIds.has(a.id) && a.sharedWithGm === true,
    );
  }
  if (Array.isArray(next.sharedJournal)) {
    next.sharedJournal = next.sharedJournal.filter(
      (j) => !journalIds.has(j.id) && !allIds.has(j.id) && j.sharedWithGm === true,
    );
  }
  if (Array.isArray(next.sharedTheoryLinks)) {
    next.sharedTheoryLinks = next.sharedTheoryLinks.filter(
      (l) => !theoryLinkIds.has(l.id) && !allIds.has(l.id) && l.sharedWithGm === true,
    );
  }
  if (Array.isArray(next.sharedStickyCards)) {
    next.sharedStickyCards = next.sharedStickyCards.filter(
      (c) => !stickyCardIds.has(c.id) && !allIds.has(c.id) && c.sharedWithGm === true,
    );
  }
  return next;
}

/**
 * The chosen value for one (pcId, field) after concurrent resolution, plus the
 * losers (for telemetry).
 */
type FieldWinner = { wb: StagedWriteback; value: unknown };

/**
 * Merge all pending player writebacks into the current authoritative PC list,
 * applying the field-authority + ownership policy described in the file header.
 *
 * @param currentPcs The current (GM-merged, Y.Doc-derived) PC array.
 * @param writebacks All pending staged writebacks, in any order.
 */
export function mergePcWritebacks(
  currentPcs: PlayerCharacter[],
  writebacks: StagedWriteback[],
): WritebackMergeResult {
  const applied: AppliedField[] = [];
  const rejected: RejectedField[] = [];

  const pcById = new Map<string, number>();
  currentPcs.forEach((pc, i) => pcById.set(pc.id, i));

  // Resolve concurrent writes per (pcId, field): keep the value with the
  // highest updatedAtMs, tie-broken by slotId (lexicographic) for total
  // determinism regardless of arrival order. Earlier candidates that lose are
  // recorded as 'superseded'.
  const winners = new Map<string, FieldWinner>(); // key = `${pcId} ${field}`

  for (const wb of writebacks) {
    const idx = pcById.get(wb.pcId);
    if (idx === undefined) {
      for (const field of Object.keys(wb.updates)) {
        rejected.push({ slotId: wb.slotId, pcId: wb.pcId, field, reason: 'pc-not-found' });
      }
      continue;
    }
    const pc = currentPcs[idx];

    // Ownership guard — the security fix. A writeback may only touch the PC its
    // staging slot owns.
    if (!ownsPc(pc, wb.slotId)) {
      for (const field of Object.keys(wb.updates)) {
        rejected.push({ slotId: wb.slotId, pcId: wb.pcId, field, reason: 'not-owner' });
      }
      continue;
    }

    for (const [field, rawValue] of Object.entries(wb.updates)) {
      if (!PLAYER_AUTHORITATIVE.has(field)) {
        rejected.push({ slotId: wb.slotId, pcId: wb.pcId, field, reason: 'field-not-allowed' });
        continue;
      }
      if (!validatePlayerField(field, rawValue)) {
        rejected.push({ slotId: wb.slotId, pcId: wb.pcId, field, reason: 'invalid-value' });
        continue;
      }
      // Enforce Player -> GM privacy boundary at merge time as well: strip any
      // quest, annotation, journal entry, theory link, sticky card, or inventory
      // item where sharedWithGm !== true, and any rollEvent where secretRoll === true.
      const sanitizedMap = sanitizeOutboundWritebackUpdates({ [field]: rawValue });
      if (!Object.prototype.hasOwnProperty.call(sanitizedMap, field)) {
        rejected.push({ slotId: wb.slotId, pcId: wb.pcId, field, reason: 'field-not-allowed' });
        continue;
      }
      const value = sanitizedMap[field];

      const key = `${wb.pcId} ${field}`;
      const prior = winners.get(key);
      if (!prior || isNewer(wb, prior.wb)) {
        if (prior) {
          rejected.push({ slotId: prior.wb.slotId, pcId: wb.pcId, field, reason: 'superseded' });
        }
        winners.set(key, { wb, value });
      } else {
        rejected.push({ slotId: wb.slotId, pcId: wb.pcId, field, reason: 'superseded' });
      }
    }
  }

  if (winners.size === 0) {
    return { pcs: currentPcs, changed: false, applied, rejected };
  }

  // Apply non-tombstone winners first, then apply tombstones so any item toggled
  // back to private is guaranteed to be removed from the GM's PC state.
  const nextByIdx = new Map<number, PlayerCharacter>();
  const pendingTombstones = new Map<number, { wb: StagedWriteback; tombstones: PlayerWritebackTombstone[] }>();

  for (const [key, { wb, value }] of winners) {
    const field = key.slice(key.indexOf(' ') + 1);
    const idx = pcById.get(wb.pcId)!;
    if (field === 'sharedTombstones') {
      pendingTombstones.set(idx, { wb, tombstones: value as PlayerWritebackTombstone[] });
      continue;
    }
    const base = nextByIdx.get(idx) ?? currentPcs[idx];
    nextByIdx.set(idx, setNestedField(base, field, value));
    applied.push({ slotId: wb.slotId, pcId: wb.pcId, field });
  }

  for (const [idx, { wb, tombstones }] of pendingTombstones) {
    const base = nextByIdx.get(idx) ?? currentPcs[idx];
    nextByIdx.set(idx, applyTombstonesToPc(base, tombstones));
    applied.push({ slotId: wb.slotId, pcId: wb.pcId, field: 'sharedTombstones' });
  }

  let pcs = currentPcs.map((pc, i) => nextByIdx.get(i) ?? pc);

  // Enforce cross-PC idempotency for claimed party loot items (`loot-claim-<lootId>`):
  // if two PCs concurrently claimed the same `lootId` into their inventory, only the
  // earliest/deterministic claimant keeps the item so unique items are never duplicated.
  const seenLootClaimIds = new Map<string, string>(); // item.id -> winning pcId
  // Seed with claims already present on currentPcs before this batch
  for (const origPc of currentPcs) {
    for (const item of origPc.inventory ?? []) {
      if (item.id && item.id.startsWith('loot-claim-') && !seenLootClaimIds.has(item.id)) {
        seenLootClaimIds.set(item.id, origPc.id);
      }
    }
  }
  // Sort modified PCs by their winning inventory writeback timestamp (earliest claim wins)
  const orderedPcs = [...pcs].sort((a, b) => {
    const wbA = winners.get(`${a.id} inventory`)?.wb.updatedAtMs ?? 0;
    const wbB = winners.get(`${b.id} inventory`)?.wb.updatedAtMs ?? 0;
    if (wbA !== wbB) return wbA - wbB;
    return a.id.localeCompare(b.id);
  });
  for (const p of orderedPcs) {
    for (const item of p.inventory ?? []) {
      if (item.id && item.id.startsWith('loot-claim-') && !seenLootClaimIds.has(item.id)) {
        seenLootClaimIds.set(item.id, p.id);
      }
    }
  }
  pcs = pcs.map((p) => {
    if (!Array.isArray(p.inventory)) return p;
    const filtered = p.inventory.filter((item) => {
      if (!item.id || !item.id.startsWith('loot-claim-')) return true;
      return seenLootClaimIds.get(item.id) === p.id;
    });
    return filtered.length === p.inventory.length ? p : { ...p, inventory: filtered };
  });

  return { pcs, changed: true, applied, rejected };
}

/** a strictly newer than b: later timestamp, or equal timestamp + higher slotId. */
function isNewer(a: StagedWriteback, b: StagedWriteback): boolean {
  if (a.updatedAtMs !== b.updatedAtMs) return a.updatedAtMs > b.updatedAtMs;
  return a.slotId > b.slotId;
}

// ---- Idempotent Party Loot Claiming & Gold Splitting -----------------------

export interface PartyLootClaimRequest {
  lootId: string;
  pcId: string;
  claimNonce?: string;
  timestampMs?: number;
}

export interface PartyLootClaimResult {
  changed: boolean;
  alreadyClaimed: boolean;
  claimedByPcId?: string;
  lootItems: PartyLootItem[];
  pcs: PlayerCharacter[];
}

function emptyPurse(): CoinPurse {
  return { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
}

function addCoinPurses(a: CoinPurse | undefined, b: CoinPurse | undefined): CoinPurse {
  const base = a ?? emptyPurse();
  const add = b ?? emptyPurse();
  return {
    cp: Math.max(0, (base.cp ?? 0) + (add.cp ?? 0)),
    sp: Math.max(0, (base.sp ?? 0) + (add.sp ?? 0)),
    ep: Math.max(0, (base.ep ?? 0) + (add.ep ?? 0)),
    gp: Math.max(0, (base.gp ?? 0) + (add.gp ?? 0)),
    pp: Math.max(0, (base.pp ?? 0) + (add.pp ?? 0)),
  };
}

/**
 * Idempotently claims a structured party loot item for a specific PC.
 * If the loot item is already claimed (even by the same PC or a concurrent click),
 * returns `changed: false, alreadyClaimed: true` and does NOT duplicate the item.
 */
export function claimPartyLootItem(
  lootItems: readonly PartyLootItem[],
  pcs: readonly PlayerCharacter[],
  request: PartyLootClaimRequest,
): PartyLootClaimResult {
  const targetIdx = lootItems.findIndex((it) => it.id === request.lootId);
  if (targetIdx < 0) {
    return {
      changed: false,
      alreadyClaimed: false,
      lootItems: [...lootItems],
      pcs: [...pcs],
    };
  }

  const item = lootItems[targetIdx];
  if (item.claimedByPcId) {
    return {
      changed: false,
      alreadyClaimed: true,
      claimedByPcId: item.claimedByPcId,
      lootItems: [...lootItems],
      pcs: [...pcs],
    };
  }

  const pcIdx = pcs.findIndex((p) => p.id === request.pcId);
  if (pcIdx < 0) {
    return {
      changed: false,
      alreadyClaimed: false,
      lootItems: [...lootItems],
      pcs: [...pcs],
    };
  }

  const targetPc = pcs[pcIdx];
  const claimNonce = request.claimNonce || `claim-${item.id}-${targetPc.id}`;
  const deterministicItemId = `loot-claim-${item.id}`;

  const updatedLootItem: PartyLootItem = {
    ...item,
    claimedByPcId: targetPc.id,
    claimedByName: targetPc.name || 'Party Member',
    claimNonce,
    updatedAt: request.timestampMs ?? Date.now(),
  };

  const nextLootItems = lootItems.map((it, i) => (i === targetIdx ? updatedLootItem : it));

  const alreadyInInventory = (targetPc.inventory ?? []).some(
    (inv) => inv.id === deterministicItemId,
  );
  const nextInventory: InventoryItem[] = alreadyInInventory
    ? [...(targetPc.inventory ?? [])]
    : [
        ...(targetPc.inventory ?? []),
        {
          id: deterministicItemId,
          name: item.name,
          qty: Math.max(1, item.qty ?? 1),
          ...(item.weight !== undefined ? { weight: item.weight } : {}),
          ...(item.notes ? { notes: item.notes } : {}),
          equipped: false,
          sharedWithGm: true,
        },
      ];

  const nextCurrency = item.currency
    ? addCoinPurses(targetPc.currency, item.currency)
    : targetPc.currency;

  const updatedPc: PlayerCharacter = {
    ...targetPc,
    inventory: nextInventory,
    ...(nextCurrency ? { currency: nextCurrency } : {}),
  };

  const nextPcs = pcs.map((p, i) => (i === pcIdx ? updatedPc : p));

  return {
    changed: true,
    alreadyClaimed: false,
    claimedByPcId: targetPc.id,
    lootItems: nextLootItems,
    pcs: nextPcs,
  };
}

/**
 * Resolves an array of concurrent claim requests deterministically (sorted by
 * `timestampMs` ascending, tie-broken by `pcId` and `claimNonce`) so that
 * concurrent clicks on the same unique loot item NEVER duplicate the item.
 */
export function resolveConcurrentPartyLootClaims(
  initialLootItems: readonly PartyLootItem[],
  initialPcs: readonly PlayerCharacter[],
  claims: readonly PartyLootClaimRequest[],
): {
  lootItems: PartyLootItem[];
  pcs: PlayerCharacter[];
  accepted: PartyLootClaimRequest[];
  rejected: PartyLootClaimRequest[];
} {
  const sorted = [...claims].sort((a, b) => {
    const ta = a.timestampMs ?? 0;
    const tb = b.timestampMs ?? 0;
    if (ta !== tb) return ta - tb;
    return a.pcId.localeCompare(b.pcId);
  });

  let lootItems = [...initialLootItems];
  let pcs = [...initialPcs];
  const accepted: PartyLootClaimRequest[] = [];
  const rejected: PartyLootClaimRequest[] = [];

  for (const req of sorted) {
    const res = claimPartyLootItem(lootItems, pcs, req);
    if (res.changed) {
      lootItems = res.lootItems;
      pcs = res.pcs;
      accepted.push(req);
    } else {
      rejected.push(req);
    }
  }

  return { lootItems, pcs, accepted, rejected };
}

export interface SplitPartyGoldResult {
  pcs: PlayerCharacter[];
  sharePerPc: CoinPurse;
  perMemberShare: CoinPurse;
  remainder: CoinPurse;
  recipientCount: number;
}

/**
 * Splits a CoinPurse evenly across active party PCs (`targetPcIds` if specified,
 * or all `pcs`, or a numeric `pcsOrCount`), adding `sharePerPc` to each
 * recipient PC's `currency` and returning the indivisible `remainder`.
 */
export function splitPartyLootGold(
  currencyToSplit: CoinPurse,
  pcsOrCount: readonly PlayerCharacter[] | number,
  targetPcIds?: readonly string[],
): SplitPartyGoldResult {
  const pcs: readonly PlayerCharacter[] = typeof pcsOrCount === 'number' ? [] : pcsOrCount;
  const recipientSet =
    typeof pcsOrCount === 'number'
      ? new Set<string>()
      : targetPcIds && targetPcIds.length > 0
        ? new Set(targetPcIds)
        : new Set(pcs.map((p) => p.id));

  const recipients = pcs.filter((p) => recipientSet.has(p.id));
  const count =
    typeof pcsOrCount === 'number' ? Math.max(0, Math.trunc(pcsOrCount)) : recipients.length;

  if (count === 0) {
    const empty = emptyPurse();
    return {
      pcs: [...pcs],
      sharePerPc: empty,
      perMemberShare: empty,
      remainder: { ...currencyToSplit },
      recipientCount: 0,
    };
  }

  const coins: (keyof CoinPurse)[] = ['pp', 'gp', 'ep', 'sp', 'cp'];
  const sharePerPc = emptyPurse();
  const remainder = emptyPurse();

  for (const denom of coins) {
    const total = Math.max(0, Math.trunc(currencyToSplit[denom] ?? 0));
    sharePerPc[denom] = Math.floor(total / count);
    remainder[denom] = total % count;
  }

  const nextPcs = pcs.map((pc) => {
    if (!recipientSet.has(pc.id)) return pc;
    return {
      ...pc,
      currency: addCoinPurses(pc.currency, sharePerPc),
    };
  });

  return {
    pcs: nextPcs,
    sharePerPc,
    perMemberShare: sharePerPc,
    remainder,
    recipientCount: count,
  };
}

/**
 * Splits the currency on a specific `PartyLootItem` across active party PCs
 * idempotently. Remainder coins stay in the loot item's `currency` pool.
 */
export function splitPartyLootDropGold(
  lootItems: readonly PartyLootItem[],
  pcs: readonly PlayerCharacter[],
  opts: { lootId: string; activePcIds?: readonly string[]; claimNonce?: string },
): {
  changed: boolean;
  lootItems: PartyLootItem[];
  pcs: PlayerCharacter[];
  sharePerPc: CoinPurse;
  remainder: CoinPurse;
} {
  const idx = lootItems.findIndex((it) => it.id === opts.lootId);
  if (idx < 0) {
    return {
      changed: false,
      lootItems: [...lootItems],
      pcs: [...pcs],
      sharePerPc: emptyPurse(),
      remainder: emptyPurse(),
    };
  }
  const item = lootItems[idx];
  if (!item.currency || item.splitCompleted || (opts.claimNonce && item.claimNonce === opts.claimNonce)) {
    return {
      changed: false,
      lootItems: [...lootItems],
      pcs: [...pcs],
      sharePerPc: emptyPurse(),
      remainder: item.currency ?? emptyPurse(),
    };
  }

  const splitRes = splitPartyLootGold(item.currency, pcs, opts.activePcIds);
  if (splitRes.recipientCount === 0) {
    return {
      changed: false,
      lootItems: [...lootItems],
      pcs: [...pcs],
      sharePerPc: emptyPurse(),
      remainder: item.currency,
    };
  }

  const hasAnyShare = Object.values(splitRes.sharePerPc).some((v) => v > 0);
  if (!hasAnyShare) {
    return {
      changed: false,
      lootItems: [...lootItems],
      pcs: [...pcs],
      sharePerPc: splitRes.sharePerPc,
      remainder: splitRes.remainder,
    };
  }

  const nextItem: PartyLootItem = {
    ...item,
    currency: splitRes.remainder,
    splitCompleted: true,
    claimNonce: opts.claimNonce || `split-${item.id}-${Date.now()}`,
  };

  return {
    changed: true,
    lootItems: lootItems.map((it, i) => (i === idx ? nextItem : it)),
    pcs: splitRes.pcs,
    sharePerPc: splitRes.sharePerPc,
    remainder: splitRes.remainder,
  };
}

