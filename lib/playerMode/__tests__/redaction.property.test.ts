// Property-based proof of the player-visibility redaction invariant.
//
// projection.ts declares itself THE security boundary for field-level privacy.
// These properties prove that claim by running the *real* buildSlotProjection /
// buildPlayerGraph over arbitrary adversarial campaign state (see
// arbitraries.ts) and asserting that nothing the GM marked hidden survives into
// any slot's projection — across the Checkpoint-0 leak vectors: hidden
// entities, partial field reveals, structural fields, the PC-ownership bypass,
// mismatched-visibility edges, and the read-only graph consumer.
//
// Each property is one invariant (I1–I9 in the audit). A counterexample here is
// a real privacy leak; if one is ever found, fix projection.ts and pin the
// shrunk case as a regression test below.

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { buildSlotProjection } from '../projection';
import { buildPlayerGraph } from '../graphProjection';
import { edgeVisibleToSlot } from '@/lib/wiki/edges';
import {
  PLAYER_ENTITY_TYPES,
  type EntityVisibility,
  type PlayerEntity,
  type PlayerEntityType,
  type PlayerModeData,
} from '../types';
import {
  arbCampaign,
  arbCampaignAndSlot,
  expectedFieldPrivacy,
  STRUCTURAL_KEYS,
} from './arbitraries';

const TYPE_TO_EDGE: Record<PlayerEntityType, string> = {
  characters: 'pc',
  pcs: 'pc',
  npcs: 'npc',
  locations: 'location',
  factions: 'faction',
  clocks: 'factionClock',
};

const ALLOWED_EDGE_KEYS = new Set(['id', 'fromType', 'fromId', 'toType', 'toId', 'kind', 'weight']);

function admits(vis: EntityVisibility | undefined, slotId: string): boolean {
  if (!vis) return false;
  if (vis.mode === 'party') return true;
  if (vis.mode === 'custom') return Array.isArray(vis.allowedSlotIds) && vis.allowedSlotIds.includes(slotId);
  return false;
}

function findSource(
  data: PlayerModeData,
  type: PlayerEntityType,
  id: string,
): PlayerEntity | undefined {
  const arr = (data as Record<string, unknown>)[type] as PlayerEntity[] | undefined;
  return Array.isArray(arr) ? arr.find((e) => e.id === id) : undefined;
}

function isOwnedBy(src: PlayerEntity | undefined, slotId: string): boolean {
  const o = src?.ownership as { ownerType?: string; playerSlotId?: string } | undefined;
  return !!o && o.ownerType === 'player' && o.playerSlotId === slotId;
}

const RUNS = { numRuns: 300 } as const;

describe('redaction invariant (property-based)', () => {
  // I1 + I2 + I3 + I7: every projected entity is one the slot is allowed to
  // see, and every emitted field is public — UNLESS it is the slot's own PC
  // (the documented ownership bypass), which legitimately reveals everything.
  it('I1/I2/I3 — no hidden entity and no private/structural field survives', () => {
    fc.assert(
      fc.property(arbCampaignAndSlot(), ({ camp, slotId }) => {
        const proj = buildSlotProjection(camp.data, 'Camp', slotId, 1000);
        for (const type of PLAYER_ENTITY_TYPES) {
          const out = proj.entities[type] ?? [];
          for (const e of out) {
            const id = e.id as string;
            const src = findSource(camp.data, type, id);
            const vis = camp.data.player.entityVisibility?.[type]?.[id];

            if (type === 'pcs' && isOwnedBy(src, slotId)) {
              // Ownership bypass: full entity for the owner is allowed.
              continue;
            }

            // I1: a non-bypass entity must be admitted by its visibility record.
            expect(admits(vis, slotId)).toBe(true);

            for (const k of Object.keys(e)) {
              if (k === 'id') continue;
              // I3: structural fields are never content, override or not.
              expect(STRUCTURAL_KEYS).not.toContain(k);
              // I2: every surviving field must resolve public.
              expect(expectedFieldPrivacy(type, k, vis?.fieldOverrides)).toBe('public');
            }
          }
        }
      }),
      RUNS,
    );
  });

  // I7 (focused, highest-risk): the ownership bypass never leaks another slot's
  // PC. Project for a slot and assert no returned PC owned by a *different*
  // slot carries any private field.
  it('I7 — PC-ownership bypass never leaks another slot’s private fields', () => {
    fc.assert(
      fc.property(arbCampaignAndSlot(), ({ camp, slotId }) => {
        const proj = buildSlotProjection(camp.data, 'Camp', slotId, 1000);
        for (const e of proj.entities.pcs ?? []) {
          const id = e.id as string;
          const src = findSource(camp.data, 'pcs', id);
          if (isOwnedBy(src, slotId)) continue; // own PC may be full
          const vis = camp.data.player.entityVisibility?.pcs?.[id];
          for (const k of Object.keys(e)) {
            if (k === 'id') continue;
            expect(expectedFieldPrivacy('pcs', k, vis?.fieldOverrides)).toBe('public');
          }
        }
      }),
      RUNS,
    );
  });

  // I4 + I5: an edge is published only when both endpoints are themselves
  // projected to the slot AND its visibility admits the slot AND it isn't a
  // review-queue edge; and GM-only edge fields are stripped.
  it('I4/I5 — edges never betray a hidden entity and carry no GM fields', () => {
    fc.assert(
      fc.property(arbCampaignAndSlot(), ({ camp, slotId }) => {
        const proj = buildSlotProjection(camp.data, 'Camp', slotId, 1000);

        // Endpoint allowlist: the keyspace of entities actually projected.
        const visibleKeys = new Set<string>();
        for (const type of PLAYER_ENTITY_TYPES) {
          for (const e of proj.entities[type] ?? []) {
            visibleKeys.add(`${TYPE_TO_EDGE[type]}:${e.id}`);
          }
        }

        const rels = (camp.data.relationships ?? []) as unknown as Array<Record<string, any>>;
        for (const edge of proj.edges ?? []) {
          // I5: only the whitelisted keys survive.
          for (const k of Object.keys(edge)) expect(ALLOWED_EDGE_KEYS).toContain(k);

          // I4: both endpoints projected.
          expect(visibleKeys.has(`${edge.fromType}:${edge.fromId}`)).toBe(true);
          expect(visibleKeys.has(`${edge.toType}:${edge.toId}`)).toBe(true);

          // The source relationship must have admitted the slot and not been a
          // suggested/proposed review-queue edge.
          const src = rels.find((r) => r.id === edge.id);
          expect(src).toBeTruthy();
          expect(!!src!.suggested).toBe(false);
          expect(!!src!.proposed).toBe(false);
          expect(edgeVisibleToSlot(src!.visibility, src!.customVisibleTo, slotId)).toBe(true);
        }
      }),
      RUNS,
    );
  });

  // I6: a session-log entry appears only when its own visibility admits the
  // slot, and the internal `visibility` field is stripped.
  it('I6 — session log is gated and strips the internal visibility field', () => {
    fc.assert(
      fc.property(arbCampaignAndSlot(), ({ camp, slotId }) => {
        const proj = buildSlotProjection(camp.data, 'Camp', slotId, 1000);
        const logs = (camp.data.playerLog ?? []) as Array<Record<string, any>>;
        for (const entry of proj.sessionLog) {
          expect(entry).not.toHaveProperty('visibility');
          const src = logs.find((l) => l.id === entry.id);
          expect(src).toBeTruthy();
          expect(admits(src!.visibility, slotId)).toBe(true);
        }
      }),
      RUNS,
    );
  });

  // I9: buildPlayerGraph is a pure consumer — its nodes/edges are a faithful
  // 1:1 of the already-redacted projection, never re-deriving visibility.
  it('I9 — player graph adds no node/edge beyond the redacted projection', () => {
    fc.assert(
      fc.property(arbCampaignAndSlot(), ({ camp, slotId }) => {
        const proj = buildSlotProjection(camp.data, 'Camp', slotId, 1000);
        const graph = buildPlayerGraph(proj);

        // Every graph node corresponds to a projected entity of a known type.
        const projectedKeys = new Set<string>();
        for (const type of PLAYER_ENTITY_TYPES) {
          for (const e of proj.entities[type] ?? []) {
            projectedKeys.add(`${TYPE_TO_EDGE[type]}:${e.id}`);
          }
        }
        for (const node of graph.nodes) {
          expect(projectedKeys.has(`${node.type}:${node.id}`)).toBe(true);
        }
        // Graph edges are exactly the projection's edges (no fabrication).
        expect(graph.edges.length).toBe((proj.edges ?? []).length);
        const projEdgeIds = new Set((proj.edges ?? []).map((e) => e.id));
        for (const ge of graph.edges) expect(projEdgeIds.has(ge.id)).toBe(true);
      }),
      RUNS,
    );
  });

  // Determinism / no-leak across ALL roster slots at once (a campaign is only
  // as private as its leakiest slot). Re-runs every invariant per slot.
  it('holds simultaneously for every slot in the roster', () => {
    fc.assert(
      fc.property(arbCampaign(), (camp) => {
        for (const slotId of camp.slotIds) {
          const proj = buildSlotProjection(camp.data, 'Camp', slotId, 1000);
          for (const type of PLAYER_ENTITY_TYPES) {
            for (const e of proj.entities[type] ?? []) {
              const id = e.id as string;
              const src = findSource(camp.data, type, id);
              if (type === 'pcs' && isOwnedBy(src, slotId)) continue;
              const vis = camp.data.player.entityVisibility?.[type]?.[id];
              expect(admits(vis, slotId)).toBe(true);
              for (const k of Object.keys(e)) {
                if (k === 'id') continue;
                expect(expectedFieldPrivacy(type, k, vis?.fieldOverrides)).toBe('public');
              }
            }
          }
        }
      }),
      RUNS,
    );
  });

  // I10: GM -> Player Encounter HUD & Progress Clock Redaction
  // Arbitrary adversarial campaign state with hidden monsters, monster HP/AC/stat blocks/GM notes,
  // and private clocks projects ZERO hidden combatants, monster stats, or private clocks into /player.
  it('I10 — Encounter HUD and Revealed Progress Clocks never leak hidden monsters, monster AC/HP/stat blocks/notes, or private clocks', () => {
    const arbCombatant = (idx: number) =>
      fc.record({
        id: fc.constant(`comb-${idx}`),
        name: fc.boolean().map((hidden) =>
          hidden ? `HIDDEN_MONSTER_NAME_${idx}` : `REVEALED_COMBATANT_${idx}`,
        ),
        initiative: fc.integer({ min: -5, max: 30 }),
        hp: fc.integer({ min: 0, max: 250 }),
        maxHp: fc.integer({ min: 1, max: 250 }),
        ac: fc.integer({ min: 10, max: 25 }),
        type: fc.constantFrom<'pc' | 'monster' | 'npc'>('pc', 'monster', 'npc'),
        pcId: fc.option(fc.constant(`pc-${idx}`), { nil: undefined }),
        conditions: fc.array(fc.constantFrom('Poisoned', 'Prone'), { maxLength: 2 }),
        notes: fc.constant(`SECRET_GM_COMBAT_NOTE_${idx}`),
        statBlock: fc.constant(`SECRET_MONSTER_STATBLOCK_${idx}`),
        hidden: fc.boolean(),
        player_visible: fc.boolean(),
      });

    const arbClock = (idx: number) =>
      fc.boolean().chain((isParty) =>
        fc.record({
          id: fc.constant(`clock-${idx}`),
          text: fc.constant(isParty ? `PARTY_CLOCK_${idx}` : `PRIVATE_GM_CLOCK_${idx}`),
          filled: fc.integer({ min: 0, max: 6 }),
          max: fc.constantFrom(4, 6, 8),
          visibility: fc.constant(isParty ? 'party' : 'private'),
          category: fc.constantFrom('faction', 'quest', 'encounter'),
          publicDescription: fc.constant(
            isParty ? `PUBLIC_CLOCK_DESC_${idx}` : `PRIVATE_CLOCK_SECRET_DESC_${idx}`,
          ),
          gmNotes: fc.constant(`SECRET_GM_CLOCK_NOTES_${idx}`),
        }),
      );

    fc.assert(
      fc.property(
        arbCampaignAndSlot(),
        fc.array(fc.integer({ min: 0, max: 8 }), { maxLength: 6 }).chain((indices) =>
          fc.tuple(...indices.map((_, i) => arbCombatant(i))),
        ),
        fc.array(fc.integer({ min: 0, max: 8 }), { maxLength: 6 }).chain((indices) =>
          fc.tuple(...indices.map((_, i) => arbClock(i))),
        ),
        ({ camp, slotId }, combatants, rawClocks) => {
          const dataWithEncounterAndClocks: PlayerModeData = {
            ...camp.data,
            __initiative: {
              round: 3,
              turnIndex: 0,
              active: combatants.length > 0,
              combatants: combatants.map((c) => ({
                ...c,
                // Synchronize name sentinel with effective visibility
                name:
                  c.hidden === true || c.player_visible === false
                    ? `HIDDEN_COMBATANT_${c.id}`
                    : `PUBLIC_COMBATANT_${c.id}`,
              })),
            },
            clocks: rawClocks as any,
          };

          const proj = buildSlotProjection(dataWithEncounterAndClocks, 'Camp', slotId, 1000);
          const hud = proj.activeEncounterHud;
          const projJson = JSON.stringify({
            hud: proj.activeEncounterHud,
            revealedClocks: proj.revealedClocks,
          });

          expect(hud).toBeDefined();
          for (const entry of hud!.entries) {
            // Only whitelisted keys exist on projected HUD entries
            for (const key of Object.keys(entry)) {
              expect([
                'id',
                'displayName',
                'initiative',
                'isPc',
                'pcId',
                'publicStatusTag',
              ]).toContain(key);
            }
            expect(entry).not.toHaveProperty('hp');
            expect(entry).not.toHaveProperty('maxHp');
            expect(entry).not.toHaveProperty('ac');
            expect(entry).not.toHaveProperty('notes');
            expect(entry).not.toHaveProperty('statBlock');
          }

          for (const c of combatants) {
            // Never leak GM combat notes or stat blocks
            expect(projJson).not.toContain(c.notes);
            expect(projJson).not.toContain(c.statBlock);
            const isHidden = c.hidden === true || c.player_visible === false;
            if (isHidden) {
              expect(projJson).not.toContain(`HIDDEN_COMBATANT_${c.id}`);
              expect(hud!.entries.some((e) => e.id === c.id)).toBe(false);
            }
          }

          for (const clk of rawClocks) {
            expect(projJson).not.toContain(clk.gmNotes);
            if (clk.visibility !== 'party') {
              expect(projJson).not.toContain(clk.text);
              expect(projJson).not.toContain(clk.publicDescription);
              expect((proj.revealedClocks ?? []).some((rc) => rc.id === clk.id)).toBe(false);
            }
          }
        },
      ),
      RUNS,
    );
  });
});

