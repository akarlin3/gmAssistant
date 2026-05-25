import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import CampaignListPage from '../page';
import { ConfirmProvider } from '@/components/ConfirmDialog';

const deleteCampaign = vi.fn().mockResolvedValue(undefined);

const sampleCampaign = {
  id: 'c1', userId: 'u1', name: 'Test Campaign', data: {}, done: {},
  playerIds: [], pendingPlayers: [], createdAt: null, updatedAt: null,
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/lib/firebase/auth-context', () => ({
  useAuth: () => ({ user: { uid: 'u1' }, loading: false }),
}));

vi.mock('@/components/AccountMenu', () => ({ AccountMenu: () => null }));

vi.mock('@/lib/firebase/campaigns', () => ({
  subscribeToUserCampaigns: (_uid: string, onUpdate: (c: any[]) => void) => {
    onUpdate([sampleCampaign]);
    return () => {};
  },
  deleteCampaign: (...args: any[]) => deleteCampaign(...args),
  archiveCampaign: vi.fn(),
  unarchiveCampaign: vi.fn(),
  copyCampaign: vi.fn(),
  updateCampaign: vi.fn(),
}));

vi.mock('@/lib/firebase/worlds', () => ({
  subscribeToUserWorlds: (_uid: string, onUpdate: (w: any[]) => void) => {
    onUpdate([]);
    return () => {};
  },
}));

describe('CampaignListPage delete (B-02)', () => {
  beforeEach(() => deleteCampaign.mockClear());

  it('deletes via the non-blocking confirm dialog without a native confirm', async () => {
    // Guard against regressing to window.confirm (which hangs under automation).
    const nativeConfirm = vi.spyOn(window, 'confirm');

    render(
      <ConfirmProvider>
        <CampaignListPage />
      </ConfirmProvider>,
    );

    act(() => { fireEvent.click(screen.getByLabelText('Campaign actions')); });
    act(() => { fireEvent.click(screen.getByText('Delete')); });

    // The in-app confirm dialog appears; confirm it.
    const confirmBtn = await screen.findByRole('button', { name: 'Delete' });
    act(() => { fireEvent.click(confirmBtn); });

    await waitFor(() => expect(deleteCampaign).toHaveBeenCalledWith('c1'));
    expect(nativeConfirm).not.toHaveBeenCalled();
  });
});
