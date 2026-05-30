// Deterministic unit tests for the authored PC-writeback merge.
// Crafted concurrent-edit scenarios -> expected resolved state. No Firestore.

import { describe, it, expect } from 'vitest';
import { mergePcWritebacks, type StagedWriteback } from '../writeback-merge';
import type { PlayerCharacter } from '@/lib/pc/types';

function pc(id: string, owner?: { ownerType: 'dm' | 'player'; playerSlotId?: string }, extra: Record<string, unknown> = {}): PlayerCharacter {
  return {
    id,
    name: id,
    hp: { current: 10, max: 10, temp: 0 },
    conditions: [],
    exhaustion: 0,
    deathSaves: { successes: 0, failures: 0 },
    notes: '',
    goals: [],
    ownership: owner,
    ...extra,
  } as unknown as PlayerCharacter;
}

function wb(slotId: string, pcId: string, updates: Record<string, unknown>, updatedAtMs = 1): StagedWriteback {
  return { slotId, pcId, updates, updatedAtMs };
}

describe('mergePcWritebacks — ownership guard', () => {
  it('applies an owner edit to their own PC', () => {
    const pcs = [pc('p1', { ownerType: 'player', playerSlotId: 'slot-a' })];
    const res = mergePcWritebacks(pcs, [wb('slot-a', 'p1', { 'hp.current': 3 })]);
    expect(res.changed).toBe(true);
    expect((res.pcs[0] as any).hp.current).toBe(3);
    expect(res.applied).toHaveLength(1);
  });

  it('rejects a writeback from a slot that does not own the PC', () => {
    const pcs = [pc('p1', { ownerType: 'player', playerSlotId: 'slot-a' })];
    const res = mergePcWritebacks(pcs, [wb('slot-b', 'p1', { 'hp.current': 0 })]);
    expect(res.changed).toBe(false);
    expect(res.pcs).toBe(pcs); // referentially unchanged
    expect(res.rejected[0]).toMatchObject({ reason: 'not-owner', slotId: 'slot-b' });
  });

  it('rejects writebacks to a GM-owned PC', () => {
    const pcs = [pc('p1', { ownerType: 'dm' })];
    const res = mergePcWritebacks(pcs, [wb('slot-a', 'p1', { 'hp.current': 0 })]);
    expect(res.changed).toBe(false);
    expect(res.rejected[0].reason).toBe('not-owner');
  });

  it('rejects a writeback referencing an unknown PC', () => {
    const pcs = [pc('p1', { ownerType: 'player', playerSlotId: 'slot-a' })];
    const res = mergePcWritebacks(pcs, [wb('slot-a', 'ghost', { notes: 'x' })]);
    expect(res.rejected[0].reason).toBe('pc-not-found');
  });
});

describe('mergePcWritebacks — field-authority policy', () => {
  it('drops fields outside the player-editable allowlist (GM-authoritative)', () => {
    const pcs = [pc('p1', { ownerType: 'player', playerSlotId: 'slot-a' }, { ac: 12 })];
    const res = mergePcWritebacks(pcs, [wb('slot-a', 'p1', { ac: 99, name: 'Hacked' } as any)]);
    expect(res.changed).toBe(false);
    expect(res.rejected.map((r) => r.reason).sort()).toEqual(['field-not-allowed', 'field-not-allowed']);
  });

  it('rejects out-of-range values (defense in depth)', () => {
    const pcs = [pc('p1', { ownerType: 'player', playerSlotId: 'slot-a' })];
    const res = mergePcWritebacks(pcs, [wb('slot-a', 'p1', { exhaustion: 99 })]);
    expect(res.changed).toBe(false);
    expect(res.rejected[0].reason).toBe('invalid-value');
  });

  it('applies a player-authoritative field over the current GM value', () => {
    const pcs = [pc('p1', { ownerType: 'player', playerSlotId: 'slot-a' })];
    pcs[0] = { ...(pcs[0] as any), hp: { current: 10, max: 10, temp: 0 } } as PlayerCharacter;
    const res = mergePcWritebacks(pcs, [wb('slot-a', 'p1', { 'hp.current': 4 })]);
    expect((res.pcs[0] as any).hp.current).toBe(4);
  });
});

describe('mergePcWritebacks — deterministic concurrent resolution', () => {
  it('last-writer-wins by timestamp, independent of array order', () => {
    const pcs = [pc('p1', { ownerType: 'player', playerSlotId: 'slot-a' })];
    const a = wb('slot-a', 'p1', { 'hp.current': 5 }, 100);
    const b = wb('slot-a', 'p1', { 'hp.current': 1 }, 200); // newer

    const r1 = mergePcWritebacks(pcs, [a, b]);
    const r2 = mergePcWritebacks(pcs, [b, a]);
    expect((r1.pcs[0] as any).hp.current).toBe(1);
    expect((r2.pcs[0] as any).hp.current).toBe(1);
    // exactly one applied, one superseded
    expect(r1.applied).toHaveLength(1);
    expect(r1.rejected.filter((x) => x.reason === 'superseded')).toHaveLength(1);
  });

  it('merges independent fields and independent PCs in one pass', () => {
    const pcs = [
      pc('p1', { ownerType: 'player', playerSlotId: 'slot-a' }),
      pc('p2', { ownerType: 'player', playerSlotId: 'slot-b' }),
    ];
    const res = mergePcWritebacks(pcs, [
      wb('slot-a', 'p1', { 'hp.current': 7, conditions: ['poisoned'] }),
      wb('slot-b', 'p2', { notes: 'hello' }),
    ]);
    expect((res.pcs[0] as any).hp.current).toBe(7);
    expect((res.pcs[0] as any).conditions).toEqual(['poisoned']);
    expect((res.pcs[1] as any).notes).toBe('hello');
    // p1 cloned, p2 cloned, both distinct from input
    expect(res.pcs[0]).not.toBe(pcs[0]);
    expect(res.pcs[1]).not.toBe(pcs[1]);
  });

  it('returns the same array reference when nothing applies', () => {
    const pcs = [pc('p1', { ownerType: 'dm' })];
    const res = mergePcWritebacks(pcs, [wb('slot-a', 'p1', { notes: 'x' })]);
    expect(res.pcs).toBe(pcs);
    expect(res.changed).toBe(false);
  });
});
