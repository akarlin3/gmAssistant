import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import WorldEventsReview from '@/components/world/WorldEventsReview';
import { PENDING_EVENTS_KEY, type PendingWorldEvent } from '@/lib/world/proposals';

describe('WorldEventsReview', () => {
  const mockNpcs = [{ id: 'npc-1', name: 'Inka' }];
  const mockRelationships = [
    { id: 'e1', fromType: 'npc', fromId: 'npc-1', toType: 'npc', toId: 'npc-2', kind: 'allyOf', weight: 0.8 },
  ];
  const mockEvents: PendingWorldEvent[] = [
    {
      id: 'event-1',
      sourceRule: 'reactive:death',
      anchorId: 'npc:npc-1',
      status: 'pending',
      deltas: [
        {
          target: { collection: 'relationships', id: 'e1' },
          targetId: 'e1',
          field: 'weight',
          from: 0.8,
          to: 0.3,
        },
      ],
      createdAt: 1000,
    },
  ];

  it('renders pending proposals correctly', () => {
    const getMock = vi.fn((key: string, fb: any) => {
      if (key === 'npcs') return mockNpcs;
      if (key === 'relationships') return mockRelationships;
      if (key === PENDING_EVENTS_KEY) return mockEvents;
      return fb;
    });
    const setValMock = vi.fn();

    render(<WorldEventsReview get={getMock} setVal={setValMock} />);

    expect(screen.getAllByText(/NPC death ripple/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Inka/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/0.80 →/i)).toBeInTheDocument();
    expect(screen.getByText(/0.30/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Approve/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reject/i })).toBeInTheDocument();
  });

  it('approves a proposal via CRDT write path and removes it from pending events', () => {
    const getMock = vi.fn((key: string, fb: any) => {
      if (key === 'npcs') return mockNpcs;
      if (key === 'relationships') return mockRelationships;
      if (key === PENDING_EVENTS_KEY) return mockEvents;
      return fb;
    });
    const setValMock = vi.fn();

    render(<WorldEventsReview get={getMock} setVal={setValMock} />);

    const approveButton = screen.getByRole('button', { name: /Approve/i });
    fireEvent.click(approveButton);

    // Assert the relationships weight was updated
    expect(setValMock).toHaveBeenCalledWith('relationships', [
      { id: 'e1', fromType: 'npc', fromId: 'npc-1', toType: 'npc', toId: 'npc-2', kind: 'allyOf', weight: 0.3, updatedAt: expect.any(Number) },
    ]);
    // Assert the event was removed from the pending queue
    expect(setValMock).toHaveBeenCalledWith(PENDING_EVENTS_KEY, []);
  });

  it('rejects a proposal and removes it from the pending events without touching relationships', () => {
    const getMock = vi.fn((key: string, fb: any) => {
      if (key === 'npcs') return mockNpcs;
      if (key === 'relationships') return mockRelationships;
      if (key === PENDING_EVENTS_KEY) return mockEvents;
      return fb;
    });
    const setValMock = vi.fn();

    render(<WorldEventsReview get={getMock} setVal={setValMock} />);

    const rejectButton = screen.getByRole('button', { name: /Reject/i });
    fireEvent.click(rejectButton);

    // Assert setVal was NOT called for relationships
    expect(setValMock).not.toHaveBeenCalledWith('relationships', expect.any(Array));
    // Assert the event was removed from the pending queue
    expect(setValMock).toHaveBeenCalledWith(PENDING_EVENTS_KEY, []);
  });

  it('commits silently when a rule has autoApply toggled on', () => {
    const getMock = vi.fn((key: string, fb: any) => {
      if (key === 'npcs') return mockNpcs;
      if (key === 'relationships') return mockRelationships;
      if (key === 'worldEventSettings') return { autoApply: { 'reactive:death': true } };
      if (key === PENDING_EVENTS_KEY) return mockEvents;
      return fb;
    });
    const setValMock = vi.fn();

    render(<WorldEventsReview get={getMock} setVal={setValMock} />);

    // Since 'reactive:death' has autoApply: true, it should immediately auto-commit in useEffect
    expect(setValMock).toHaveBeenCalledWith('relationships', [
      { id: 'e1', fromType: 'npc', fromId: 'npc-1', toType: 'npc', toId: 'npc-2', kind: 'allyOf', weight: 0.3, updatedAt: expect.any(Number) },
    ]);
    expect(setValMock).toHaveBeenCalledWith(PENDING_EVENTS_KEY, []);
  });
});
