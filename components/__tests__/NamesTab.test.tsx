import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import NamesTab from '../NamesTab';
import React from 'react';

// Mock Firebase client
const mockGetIdToken = vi.fn().mockResolvedValue('fake-token');
vi.mock('@/lib/firebase/client', () => ({
  getFirebaseAuth: () => ({
    currentUser: {
      getIdToken: mockGetIdToken,
    },
  }),
}));

global.fetch = vi.fn();
Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
});

describe('NamesTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders correctly', () => {
    render(
      <NamesTab logEntries={[]} onLogEntriesChange={vi.fn()} />
    );
    expect(screen.getByText('Name Generator')).toBeInTheDocument();
  });

  it('generates names when clicking generate', async () => {
    const mockResponse = {
      names: [
        { first: 'Gimli', last: 'Oakenshield', firstCulture: 'Dwarven', lastCulture: 'Dwarven' }
      ]
    };

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    render(
      <NamesTab logEntries={[]} onLogEntriesChange={vi.fn()} />
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Generate'));
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/generate-names', expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer fake-token',
        }),
        body: expect.any(String),
      }));
    });

    expect(screen.getByText('Gimli Oakenshield')).toBeInTheDocument();
  });

  it('handles API errors', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Bad Request' }),
    } as Response);

    render(
      <NamesTab logEntries={[]} onLogEntriesChange={vi.fn()} />
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Generate'));
    });

    await waitFor(() => {
      expect(screen.getByText('Bad Request')).toBeInTheDocument();
    });
  });

  it('saves to log correctly', async () => {
    const mockResponse = {
      names: [
        { first: 'Gimli', last: 'Oakenshield', firstCulture: 'Dwarven', lastCulture: 'Dwarven' }
      ]
    };

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    const onLogEntriesChangeMock = vi.fn();
    render(
      <NamesTab logEntries={[]} onLogEntriesChange={onLogEntriesChangeMock} />
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Generate'));
    });

    await waitFor(() => {
      expect(screen.getByText('Gimli Oakenshield')).toBeInTheDocument();
    });

    act(() => {
      fireEvent.click(screen.getByText('Save to log'));
    });

    expect(onLogEntriesChangeMock).toHaveBeenCalled();
  });

  it('copies name to clipboard', async () => {
    const mockResponse = {
      names: [
        { first: 'Gimli', last: 'Oakenshield', firstCulture: 'Dwarven', lastCulture: 'Dwarven' }
      ]
    };

    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockResponse,
    } as Response);

    render(
      <NamesTab logEntries={[]} onLogEntriesChange={vi.fn()} />
    );

    await act(async () => {
      fireEvent.click(screen.getByText('Generate'));
    });

    await waitFor(() => {
      expect(screen.getByText('Gimli Oakenshield')).toBeInTheDocument();
    });

    await act(async () => {
      fireEvent.click(screen.getByText('Gimli Oakenshield'));
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Gimli Oakenshield');
  });
});
