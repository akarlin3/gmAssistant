import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => ({
  snapshotCb: null as null | (() => void),
  resolveWrites: null as null | (() => void),
}));

vi.mock('firebase/firestore', () => ({
  disableNetwork: vi.fn(() => Promise.resolve()),
  enableNetwork: vi.fn(() => Promise.resolve()),
  onSnapshotsInSync: (_db: unknown, cb: () => void) => {
    h.snapshotCb = cb;
    return () => {};
  },
  waitForPendingWrites: () => new Promise<void>((res) => { h.resolveWrites = res; }),
}));

vi.mock('@/lib/firebase/client', () => ({ getDb: () => ({}) }));

import { useSyncStatus } from '../sync-status';

describe('useSyncStatus (B-07)', () => {
  it('shows pending while a write is in flight, then returns to synced once acknowledged', async () => {
    const { result } = renderHook(() => useSyncStatus());
    expect(result.current).toBe('synced');

    // A local edit triggers a snapshots-in-sync event with a pending write.
    act(() => { h.snapshotCb?.(); });
    expect(result.current).toBe('pending');

    // Server acknowledges the write — the pill must not stay stuck on pending.
    await act(async () => { h.resolveWrites?.(); });
    await waitFor(() => expect(result.current).toBe('synced'));
  });
});
