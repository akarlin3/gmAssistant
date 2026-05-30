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
  PLAYER_ENTITY_TYPES,
  type EntityVisibility,
  type PlayerEntity,
  type PlayerEntityType,
  type PlayerModeData,
} from '@/lib/playerMode/types';
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

const RUNS = { numRuns: 300 } as const;

describe('writeback merge preserves the redaction invariant', () => {
  it('re-projection after arbitrary writebacks never leaks hidden data', () => {
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
});
