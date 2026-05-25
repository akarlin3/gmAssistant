import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import NewCampaignPage from '../page';

const replace = vi.fn();
const createCampaignFromWizard = vi.fn().mockResolvedValue('new-campaign-id');

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
}));

vi.mock('@/lib/firebase/auth-context', () => ({
  useAuth: () => ({ user: { uid: 'u1' }, loading: false }),
}));

vi.mock('@/lib/firebase/campaigns', () => ({
  createCampaignFromWizard: (...args: any[]) => createCampaignFromWizard(...args),
}));

function typeTitle(value: string) {
  const title = screen.getByPlaceholderText('e.g. The Last Wells');
  fireEvent.change(title, { target: { value } });
}

describe('New Campaign wizard (B-03 / B-04)', () => {
  beforeEach(() => {
    replace.mockClear();
    createCampaignFromWizard.mockClear();
  });

  it('does NOT create a Firestore doc when closed via X (B-03)', () => {
    render(<NewCampaignPage />);
    typeTitle('QA TEST Campaign');
    act(() => {
      fireEvent.click(screen.getByLabelText('Close setup'));
    });
    expect(createCampaignFromWizard).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledWith('/campaign');
  });

  it('creates the doc only on finish, carrying the typed title (B-04)', async () => {
    render(<NewCampaignPage />);
    typeTitle('QA TEST Campaign');
    // Advance through the 5 steps to the finish screen.
    for (let i = 0; i < 5; i++) {
      act(() => {
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      });
    }
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: /Open Campaign Editor/i }));
    });

    await waitFor(() => expect(createCampaignFromWizard).toHaveBeenCalledTimes(1));
    const [uid, opts] = createCampaignFromWizard.mock.calls[0];
    expect(uid).toBe('u1');
    expect(opts.name).toBe('QA TEST Campaign');
    expect(opts.data.__session0Done).toBe(true);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/campaign/new-campaign-id'));
  });
});
