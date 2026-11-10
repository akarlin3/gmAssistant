// Property: the authored PC-writeback merge never moves data across the
// redaction boundary. This is the item-1 ∩ item-2 intersection from the plan —
// it reuses the redaction suite's adversarial campaign generators, applies
// arbitrary (including malicious cross-slot) player writebacks, then RE-PROJECTS
// and asserts the visibility invariant still holds. So even after a concurrent
// player edit merges into campaign state, no slot can see anything the GM hid.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { mergePcWritebacks, type StagedWriteback } from '../writeback-merge';
import { buildSlotProjection } from '@/lib/playerMode/projection';
import {
  serializeOutboundTrackerWriteback,
  sanitizeOutboundWritebackUpdates,
  reconcileTrackerSharingTransition,
  toggleQuestShareWithGm,
  toggleAnnotationShareWithGm,
  toggleJournalShareWithGm,
  buildAnonymousTablePauseSignal,
  serializeAnonymousPauseWriteback,
  type PlayerLocalTrackerState,
} from '@/lib/playerMode/playerTrackerStorage';
import {
  PLAYER_ENTITY_TYPES,
  type EntityVisibility,
  type PlayerEntity,
  type PlayerEntityType,
  type PlayerModeData,
} from '@/lib/playerMode/types';
import type {
  PlayerQuest,
  PlayerLoreAnnotation,
  PlayerJournalEntry,
} from '@/lib/pc/types';
import { arbCampaign, expectedFieldPrivacy } from '@/lib/playerMode/__tests__/arbitraries';

function admits(vis: EntityVisibility | undefined, slotId: string): boolean {
  if (!vis) return false;
  if (vis.mode === 'party') return true;
  if (vis.mode === 'custom') return Array.isArray(vis.allowedSlotIds) && vis.allowedSlotIds.includes(slotId);
  return false;
}
function findSource(data: PlayerModeData, type: PlayerEntityType, id: string): PlayerEntity | undefined {
  const arr = (data as Record<string, unknown>)[type] as PlayerEntity[] | undefined;
  return Array.isArray(arr) ? arr.find((e) => e.id === id) : undefined;
}
function isOwnedBy(src: PlayerEntity | undefined, slotId: string): boolean {
  const o = src?.ownership as { ownerType?: string; playerSlotId?: string } | undefined;
  return !!o && o.ownerType === 'player' && o.playerSlotId === slotId;
}

// Assert the redaction invariant (I1/I2) over a campaign for one slot.
function assertNoLeak(data: PlayerModeData, slotId: string) {
  const proj = buildSlotProjection(data, 'Camp', slotId, 1000);
  for (const type of PLAYER_ENTITY_TYPES) {
    for (const e of proj.entities[type] ?? []) {
      const id = e.id as string;
      const src = findSource(data, type, id);
      if (type === 'pcs' && isOwnedBy(src, slotId)) continue; // owner bypass
      const vis = data.player.entityVisibility?.[type]?.[id];
      expect(admits(vis, slotId)).toBe(true);
      for (const k of Object.keys(e)) {
        if (k === 'id') continue;
        expect(expectedFieldPrivacy(type, k, vis?.fieldOverrides)).toBe('public');
      }
    }
  }
}

// Arbitrary player writebacks targeting the campaign's PC ids from arbitrary
// (often non-owning / phantom) slots, using only allowlisted fields + valid
// values. A `notes` sentinel lets us prove cross-slot containment.
function writebacksArb(pcIds: string[], slotIds: string[]): fc.Arbitrary<StagedWriteback[]> {
  const idArb = pcIds.length ? fc.constantFrom(...pcIds) : fc.constant('p0');
  const slotArb = fc.constantFrom(...slotIds, 'phantom-slot');
  const updatesArb = fc.dictionary(
    fc.constantFrom(
      'hp.current', 'hp.temp', 'conditions', 'exhaustion',
      'deathSaves.successes', 'deathSaves.failures', 'notes', 'goals', 'bonds', 'ideals', 'flaws',
    ),
    fc.oneof(
      fc.nat({ max: 6 }),
      fc.array(fc.constantFrom('poisoned', 'prone', 'SECRET-PLAYER-NOTE'), { maxLength: 2 }),
      fc.constant('SECRET-PLAYER-NOTE'),
    ),
    { minKeys: 1, maxKeys: 3 },
  );
  return fc.array(
    fc.record({
      slotId: slotArb,
      pcId: idArb,
      updates: updatesArb,
      updatedAtMs: fc.nat({ max: 1000 }),
    }),
    { maxLength: 5 },
  );
}

// Arbitrary mixed-privacy player tracker state with distinct sentinel strings
// embedded in private items so we can assert zero substring leakage.
const arbPlayerQuest = (idx: number): fc.Arbitrary<PlayerQuest> =>
  fc.boolean().chain((sharedWithGm) =>
    fc.record({
      id: fc.constant(`quest-${idx}`),
      title: fc.constant(sharedWithGm ? `PUBLIC_QUEST_TITLE_${idx}` : `PRIVATE_QUEST_TITLE_${idx}`),
      status: fc.constantFrom<'active' | 'completed' | 'failed'>('active', 'completed', 'failed'),
      notes: fc.constant(sharedWithGm ? `PUBLIC_QUEST_NOTE_${idx}` : `PRIVATE_QUEST_SECRET_${idx}`),
      linkedEntityIds: fc.array(fc.constantFrom('npc-1', 'loc-1', 'fac-1'), { maxLength: 2 }),
      sharedWithGm: fc.constant(sharedWithGm),
    }),
  );

const arbPlayerAnnotation = (idx: number): fc.Arbitrary<PlayerLoreAnnotation> =>
  fc.boolean().chain((sharedWithGm) =>
    fc.record({
      id: fc.constant(`ann-${idx}`),
      entityId: fc.constant(`entity-${idx}`),
      attitudeTag: fc.constantFrom<'friendly' | 'neutral' | 'suspicious' | 'hostile'>(
        'friendly',
        'neutral',
        'suspicious',
        'hostile',
      ),
      privateNotes: fc.constant(sharedWithGm ? `SHARED_ANN_BODY_${idx}` : `PRIVATE_ANN_SECRET_${idx}`),
      sharedNotes: fc.constant(sharedWithGm ? `SHARED_ANN_SUMMARY_${idx}` : `PRIVATE_ANN_SUMMARY_${idx}`),
      sharedWithGm: fc.constant(sharedWithGm),
    }),
  );

const arbPlayerJournalEntry = (idx: number): fc.Arbitrary<PlayerJournalEntry> =>
  fc.boolean().chain((sharedWithGm) =>
    fc.record({
      id: fc.constant(`journal-${idx}`),
      sessionNumber: fc.integer({ min: 1, max: 50 }),
      date: fc.constant('2026-03-15'),
      title: fc.constant(sharedWithGm ? `PUBLIC_JOURNAL_TITLE_${idx}` : `PRIVATE_JOURNAL_TITLE_${idx}`),
      content: fc.constant(sharedWithGm ? `PUBLIC_JOURNAL_BODY_${idx}` : `PRIVATE_JOURNAL_SECRET_${idx}`),
      sharedWithGm: fc.constant(sharedWithGm),
    }),
  );

const arbTrackerState: fc.Arbitrary<PlayerLocalTrackerState> = fc
  .tuple(
    fc.integer({ min: 0, max: 6 }),
    fc.integer({ min: 0, max: 6 }),
    fc.integer({ min: 0, max: 6 }),
  )
  .chain(([qLen, aLen, jLen]) =>
    fc.record({
      quests:
        qLen === 0
          ? fc.constant([])
          : fc.tuple(...Array.from({ length: qLen }, (_, i) => arbPlayerQuest(i))),
      annotations:
        aLen === 0
          ? fc.constant([])
          : fc.tuple(...Array.from({ length: aLen }, (_, i) => arbPlayerAnnotation(i))),
      journal:
        jLen === 0
          ? fc.constant([])
          : fc.tuple(...Array.from({ length: jLen }, (_, i) => arbPlayerJournalEntry(i))),
      pendingTombstones: fc.constant([]),
      updatedAt: fc.nat({ max: 100000 }),
    }),
  );

const RUNS = { numRuns: 300 } as const;

describe('writeback merge preserves the bidirectional privacy invariant', () => {
  it('1. GM -> Player Redaction: re-projection after arbitrary writebacks never leaks hidden data', () => {
    fc.assert(
      fc.property(
        arbCampaign().chain((camp) => {
          const pcIds = ((camp.data as any).pcs ?? []).map((p: any) => p.id);
          return fc.record({
            camp: fc.constant(camp),
            writebacks: writebacksArb(pcIds, camp.slotIds),
          });
        }),
        ({ camp, writebacks }) => {
          const pcs = ((camp.data as any).pcs ?? []) as PlayerEntity[];
          const playerBefore = JSON.stringify(camp.data.player);

          const result = mergePcWritebacks(pcs as any, writebacks);
          const merged: PlayerModeData = { ...camp.data, pcs: result.pcs as any };

          // 1. The merge must never let any slot (incl. an outsider) see hidden data.
          for (const slotId of [...camp.slotIds, camp.outsiderSlotId]) {
            assertNoLeak(merged, slotId);
          }

          // 2. The merge never mutates GM visibility config — a player write can
          //    never reconfigure who-sees-what.
          expect(JSON.stringify(merged.player)).toBe(playerBefore);

          // 3. Ownership guard: every applied change landed on a PC owned by the
          //    applying slot — no cross-slot writes.
          for (const a of result.applied) {
            const src = pcs.find((p) => p.id === a.pcId);
            expect(isOwnedBy(src, a.slotId)).toBe(true);
          }
        },
      ),
      RUNS,
    );
  });

  it('2. Player -> GM Privacy: outbound pcWritebacks and CRDT merge contain ZERO entries or strings from sharedWithGm === false items, and only mutate owned PCs', () => {
    fc.assert(
      fc.property(
        arbTrackerState,
        fc.constantFrom('slot-owner', 'slot-intruder'),
        (trackerState, writerSlotId) => {
          const privateQuests = trackerState.quests.filter((q) => !q.sharedWithGm);
          const privateAnnotations = trackerState.annotations.filter((a) => !a.sharedWithGm);
          const privateJournals = trackerState.journal.filter((j) => !j.sharedWithGm);

          // Step A: Outbound serializer check
          const outbound = serializeOutboundTrackerWriteback(trackerState);
          const outboundJson = JSON.stringify(outbound);

          for (const q of outbound.sharedQuests) {
            expect(q.sharedWithGm).toBe(true);
          }
          for (const a of outbound.sharedAnnotations) {
            expect(a.sharedWithGm).toBe(true);
          }
          for (const j of outbound.sharedJournal) {
            expect(j.sharedWithGm).toBe(true);
          }

          for (const pq of privateQuests) {
            expect(outboundJson).not.toContain(pq.id);
            expect(outboundJson).not.toContain(pq.title);
            expect(outboundJson).not.toContain(pq.notes);
          }
          for (const pa of privateAnnotations) {
            expect(outboundJson).not.toContain(pa.id);
            expect(outboundJson).not.toContain(pa.privateNotes);
            if (pa.sharedNotes) expect(outboundJson).not.toContain(pa.sharedNotes);
          }
          for (const pj of privateJournals) {
            expect(outboundJson).not.toContain(pj.id);
            expect(outboundJson).not.toContain(pj.title);
            expect(outboundJson).not.toContain(pj.content);
          }

          // Step B: Even if a tampered client sends raw mixed arrays directly into
          // StagedWriteback, sanitizeOutboundWritebackUpdates + mergePcWritebacks
          // must strip every sharedWithGm === false entry and enforce PC ownership.
          const initialPcs: any[] = [
            {
              id: 'pc-1',
              name: 'Aria',
              hp: { current: 20, max: 20, temp: 0 },
              conditions: [],
              exhaustion: 0,
              deathSaves: { successes: 0, failures: 0 },
              notes: '',
              goals: [],
              ownership: { ownerType: 'player', playerSlotId: 'slot-owner' },
            },
            {
              id: 'pc-2',
              name: 'Bram',
              hp: { current: 25, max: 25, temp: 0 },
              conditions: [],
              exhaustion: 0,
              deathSaves: { successes: 0, failures: 0 },
              notes: '',
              goals: [],
              ownership: { ownerType: 'player', playerSlotId: 'slot-other' },
            },
          ];

          const rawWriteback: StagedWriteback = {
            slotId: writerSlotId,
            pcId: 'pc-1',
            updates: {
              sharedQuests: trackerState.quests,
              sharedAnnotations: trackerState.annotations,
              sharedJournal: trackerState.journal,
            },
            updatedAtMs: 1000,
          };

          const mergeRes = mergePcWritebacks(initialPcs, [rawWriteback]);

          if (writerSlotId !== 'slot-owner') {
            // Non-owner slot cannot mutate pc-1
            expect(mergeRes.changed).toBe(false);
            expect(mergeRes.pcs).toBe(initialPcs);
            return;
          }

          // Owner slot mutated only pc-1; pc-2 is untouched
          expect(mergeRes.pcs[1]).toBe(initialPcs[1]);

          const mergedPc = mergeRes.pcs[0];
          const mergedJson = JSON.stringify(mergedPc);

          for (const pq of privateQuests) {
            expect(mergedJson).not.toContain(pq.id);
            expect(mergedJson).not.toContain(pq.title);
            expect(mergedJson).not.toContain(pq.notes);
          }
          for (const pa of privateAnnotations) {
            expect(mergedJson).not.toContain(pa.id);
            expect(mergedJson).not.toContain(pa.privateNotes);
            if (pa.sharedNotes) expect(mergedJson).not.toContain(pa.sharedNotes);
          }
          for (const pj of privateJournals) {
            expect(mergedJson).not.toContain(pj.id);
            expect(mergedJson).not.toContain(pj.title);
            expect(mergedJson).not.toContain(pj.content);
          }
        },
      ),
      RUNS,
    );
  });

  it('3. Player -> GM Tombstone Invariant: toggling sharedWithGm OFF removes previously shared items from GM view while preserving local store', () => {
    fc.assert(
      fc.property(arbTrackerState, (initialState) => {
        // First sync initial state to GM's PC
        const initialOutbound = serializeOutboundTrackerWriteback(initialState);
        const basePcs: any[] = [
          {
            id: 'pc-1',
            name: 'Aria',
            hp: { current: 20, max: 20, temp: 0 },
            conditions: [],
            exhaustion: 0,
            deathSaves: { successes: 0, failures: 0 },
            notes: '',
            goals: [],
            ownership: { ownerType: 'player', playerSlotId: 'slot-owner' },
          },
        ];

        const firstMerge = mergePcWritebacks(basePcs, [
          {
            slotId: 'slot-owner',
            pcId: 'pc-1',
            updates: sanitizeOutboundWritebackUpdates(initialOutbound as unknown as Record<string, unknown>),
            updatedAtMs: 1000,
          },
        ]);

        // Now toggle every shared quest, annotation, and journal entry OFF locally
        let nextLocal = initialState;
        for (const q of initialState.quests) {
          if (q.sharedWithGm) nextLocal = toggleQuestShareWithGm(nextLocal, q.id, false);
        }
        for (const a of initialState.annotations) {
          if (a.sharedWithGm) nextLocal = toggleAnnotationShareWithGm(nextLocal, a.entityId, false);
        }
        for (const j of initialState.journal) {
          if (j.sharedWithGm) nextLocal = toggleJournalShareWithGm(nextLocal, j.id, false);
        }

        // Local store still preserves 100% of items
        expect(nextLocal.quests).toHaveLength(initialState.quests.length);
        expect(nextLocal.annotations).toHaveLength(initialState.annotations.length);
        expect(nextLocal.journal).toHaveLength(initialState.journal.length);

        const reconciledLocal = reconcileTrackerSharingTransition(initialState, nextLocal);
        const secondOutbound = serializeOutboundTrackerWriteback(reconciledLocal);

        const secondMerge = mergePcWritebacks(firstMerge.pcs, [
          {
            slotId: 'slot-owner',
            pcId: 'pc-1',
            updates: sanitizeOutboundWritebackUpdates(secondOutbound as unknown as Record<string, unknown>),
            updatedAtMs: 2000,
          },
        ]);

        const finalPc = secondMerge.pcs[0];
        expect(finalPc.sharedQuests ?? []).toHaveLength(0);
        expect(finalPc.sharedAnnotations ?? []).toHaveLength(0);
        expect(finalPc.sharedJournal ?? []).toHaveLength(0);
      }),
      RUNS,
    );
  });

  it('4. Player -> GM Secret Roll & Conspiracy Graph Privacy: secretRoll === true rolls and sharedWithGm === false theoryLinks / stickyCards NEVER enter pcWritebacks or CRDT merge, and only mutate owned PCs', () => {
    const arbRoll = (idx: number) =>
      fc.boolean().chain((secretRoll) =>
        fc.record({
          id: fc.constant(`roll-${idx}`),
          pcId: fc.constant('pc-1'),
          actorName: fc.constant('Aria'),
          label: fc.constant(secretRoll ? `SECRET_ROLL_LABEL_${idx}` : `PUBLIC_ROLL_LABEL_${idx}`),
          formula: fc.constant('1d20+5'),
          d20Rolls: fc.constant([15] as number[]),
          total: fc.constant(20),
          breakdown: fc.constant(
            secretRoll ? `SECRET_ROLL_BREAKDOWN_${idx}` : `PUBLIC_ROLL_BREAKDOWN_${idx}`,
          ),
          crit: fc.constant(null as 'nat20' | 'nat1' | null),
          timestamp: fc.integer({ min: 1000, max: 9000 }),
          secretRoll: fc.constant(secretRoll),
        }),
      );

    const arbTheoryLink = (idx: number) =>
      fc.boolean().chain((sharedWithGm) =>
        fc.record({
          id: fc.constant(`tlink-${idx}`),
          sourceId: fc.constant('npc-1'),
          targetId: fc.constant('loc-1'),
          label: fc.constant(
            sharedWithGm ? `PUBLIC_THEORY_EDGE_${idx}` : `PRIVATE_THEORY_SECRET_${idx}`,
          ),
          color: fc.constantFrom<'crimson' | 'gold' | 'violet' | 'emerald'>(
            'crimson',
            'gold',
            'violet',
            'emerald',
          ),
          sharedWithGm: fc.constant(sharedWithGm),
        }),
      );

    const arbStickyCard = (idx: number) =>
      fc.boolean().chain((sharedWithGm) =>
        fc.record({
          id: fc.constant(`sticky-${idx}`),
          title: fc.constant(
            sharedWithGm ? `PUBLIC_STICKY_TITLE_${idx}` : `PRIVATE_STICKY_TITLE_${idx}`,
          ),
          content: fc.constant(
            sharedWithGm ? `PUBLIC_STICKY_BODY_${idx}` : `PRIVATE_STICKY_SECRET_${idx}`,
          ),
          color: fc.constantFrom<'gold' | 'crimson' | 'violet' | 'emerald'>(
            'gold',
            'crimson',
            'violet',
            'emerald',
          ),
          x: fc.integer({ min: 0, max: 500 }),
          y: fc.integer({ min: 0, max: 500 }),
          sharedWithGm: fc.constant(sharedWithGm),
        }),
      );

    fc.assert(
      fc.property(
        arbTrackerState,
        fc.array(fc.integer({ min: 0, max: 6 }), { maxLength: 6 }).chain((xs) =>
          fc.tuple(...xs.map((_, i) => arbRoll(i))),
        ),
        fc.array(fc.integer({ min: 0, max: 6 }), { maxLength: 5 }).chain((xs) =>
          fc.tuple(...xs.map((_, i) => arbTheoryLink(i))),
        ),
        fc.array(fc.integer({ min: 0, max: 6 }), { maxLength: 5 }).chain((xs) =>
          fc.tuple(...xs.map((_, i) => arbStickyCard(i))),
        ),
        fc.constantFrom('slot-owner', 'slot-intruder'),
        (baseTracker, rolls, theoryLinks, stickyCards, writerSlotId) => {
          const fullTracker: PlayerLocalTrackerState = {
            ...baseTracker,
            theoryLinks,
            stickyCards,
            secretRolls: rolls.filter((r) => r.secretRoll),
          };

          const secretRolls = rolls.filter((r) => r.secretRoll);
          const privateLinks = theoryLinks.filter((l) => !l.sharedWithGm);
          const privateStickies = stickyCards.filter((s) => !s.sharedWithGm);

          // Step A: Outbound serializer check
          const outbound = serializeOutboundTrackerWriteback(fullTracker);
          const outboundJson = JSON.stringify(outbound);

          for (const pl of privateLinks) {
            expect(outboundJson).not.toContain(pl.id);
            expect(outboundJson).not.toContain(pl.label);
          }
          for (const ps of privateStickies) {
            expect(outboundJson).not.toContain(ps.id);
            expect(outboundJson).not.toContain(ps.title);
            expect(outboundJson).not.toContain(ps.content);
          }
          for (const sr of secretRolls) {
            expect(outboundJson).not.toContain(sr.id);
            expect(outboundJson).not.toContain(sr.label);
            expect(outboundJson).not.toContain(sr.breakdown);
          }

          // Step B: Sanitizer + CRDT merge check against raw/tampered payloads
          const initialPcs: any[] = [
            {
              id: 'pc-1',
              name: 'Aria',
              hp: { current: 20, max: 20, temp: 0 },
              conditions: [],
              exhaustion: 0,
              deathSaves: { successes: 0, failures: 0 },
              notes: '',
              goals: [],
              ownership: { ownerType: 'player', playerSlotId: 'slot-owner' },
            },
            {
              id: 'pc-2',
              name: 'Bram',
              hp: { current: 25, max: 25, temp: 0 },
              conditions: [],
              exhaustion: 0,
              deathSaves: { successes: 0, failures: 0 },
              notes: '',
              goals: [],
              ownership: { ownerType: 'player', playerSlotId: 'slot-other' },
            },
          ];

          const sanitizedUpdates = sanitizeOutboundWritebackUpdates({
            sharedQuests: fullTracker.quests,
            sharedAnnotations: fullTracker.annotations,
            sharedJournal: fullTracker.journal,
            sharedTheoryLinks: theoryLinks,
            sharedStickyCards: stickyCards,
            rollEvents: rolls,
          });
          const sanitizedJson = JSON.stringify(sanitizedUpdates);

          for (const sr of secretRolls) {
            expect(sanitizedJson).not.toContain(sr.id);
            expect(sanitizedJson).not.toContain(sr.label);
            expect(sanitizedJson).not.toContain(sr.breakdown);
          }
          for (const pl of privateLinks) {
            expect(sanitizedJson).not.toContain(pl.id);
            expect(sanitizedJson).not.toContain(pl.label);
          }
          for (const ps of privateStickies) {
            expect(sanitizedJson).not.toContain(ps.id);
            expect(sanitizedJson).not.toContain(ps.title);
            expect(sanitizedJson).not.toContain(ps.content);
          }

          // Also test passing raw unsanitized updates directly to mergePcWritebacks
          const mergeRes = mergePcWritebacks(initialPcs, [
            {
              slotId: writerSlotId,
              pcId: 'pc-1',
              updates: {
                sharedQuests: fullTracker.quests,
                sharedAnnotations: fullTracker.annotations,
                sharedJournal: fullTracker.journal,
                sharedTheoryLinks: theoryLinks,
                sharedStickyCards: stickyCards,
                rollEvents: rolls,
              },
              updatedAtMs: 1500,
            },
          ]);

          if (writerSlotId !== 'slot-owner') {
            expect(mergeRes.changed).toBe(false);
            expect(mergeRes.pcs).toBe(initialPcs);
            return;
          }

          // Non-owned PC is never modified
          expect(mergeRes.pcs[1]).toBe(initialPcs[1]);

          const mergedJson = JSON.stringify(mergeRes.pcs[0]);
          for (const sr of secretRolls) {
            expect(mergedJson).not.toContain(sr.id);
            expect(mergedJson).not.toContain(sr.label);
            expect(mergedJson).not.toContain(sr.breakdown);
          }
          for (const pl of privateLinks) {
            expect(mergedJson).not.toContain(pl.id);
            expect(mergedJson).not.toContain(pl.label);
          }
          for (const ps of privateStickies) {
            expect(mergedJson).not.toContain(ps.id);
            expect(mergedJson).not.toContain(ps.title);
            expect(mergedJson).not.toContain(ps.content);
          }
        },
      ),
      RUNS,
    );
  });
});

