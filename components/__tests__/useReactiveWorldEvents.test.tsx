import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useReactiveWorldEvents } from '@/lib/world/useReactiveWorldEvents';
import { PENDING_EVENTS_KEY } from '@/lib/world/proposals';

describe('useReactiveWorldEvents', () => {
  it('seeds baseline on first render and proposes nothing', () => {
    const npcs = [
      { id: 'npc-1', name: 'Inka', status: 'Dead' },
      { id: 'npc-2', name: 'Garrick', status: 'Active' },
    ];
    const relationships = [
      { id: 'e1', fromType: 'npc', fromId: 'npc-1', toType: 'npc', toId: 'npc-2', kind: 'allyOf', weight: 0.8 },
    ];

    const getMock = vi.fn((key: string, fb: any) => {
      if (key === 'npcs') return npcs;
      if (key === 'relationships') return relationships;
      if (key === PENDING_EVENTS_KEY) return [];
      return fb;
    });
    const setValMock = vi.fn();

    renderHook(() => useReactiveWorldEvents(getMock, setValMock));

    // Proposes nothing on first render when pre-existing deaths are loaded
    expect(setValMock).not.toHaveBeenCalled();
  });

  it('triggers a reactive:death event when an NPC transitions to dead', () => {
    let npcs = [
      { id: 'npc-1', name: 'Inka', status: 'Active' },
      { id: 'npc-2', name: 'Garrick', status: 'Active' },
    ];
    const relationships = [
      { id: 'e1', fromType: 'npc', fromId: 'npc-1', toType: 'npc', toId: 'npc-2', kind: 'allyOf', weight: 0.8 },
    ];

    const getMock = vi.fn((key: string, fb: any) => {
      if (key === 'npcs') return npcs;
      if (key === 'relationships') return relationships;
      if (key === PENDING_EVENTS_KEY) return [];
      return fb;
    });
    const setValMock = vi.fn();

    const { rerender } = renderHook(() => useReactiveWorldEvents(getMock, setValMock));

    // First render baseline is active, no transitions proposed yet
    expect(setValMock).not.toHaveBeenCalled();

    // Transition npcs state so npc-1 is dead
    npcs = [
      { id: 'npc-1', name: 'Inka', status: 'Dead' },
      { id: 'npc-2', name: 'Garrick', status: 'Active' },
    ];

    rerender();

    expect(setValMock).toHaveBeenCalledTimes(1);
    expect(setValMock).toHaveBeenCalledWith(PENDING_EVENTS_KEY, expect.any(Array));
    const events = setValMock.mock.calls[0][1];
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      sourceRule: 'reactive:death',
      anchorId: 'npc:npc-1',
      status: 'pending',
    });
  });

  it('ensures loop-safety so re-rendering with unchanged death states does not re-fire', () => {
    let npcs = [
      { id: 'npc-1', name: 'Inka', status: 'Active' },
    ];
    const relationships = [
      { id: 'e1', fromType: 'npc', fromId: 'npc-1', toType: 'npc', toId: 'npc-2', kind: 'allyOf', weight: 0.8 },
    ];

    const getMock = vi.fn((key: string, fb: any) => {
      if (key === 'npcs') return npcs;
      if (key === 'relationships') return relationships;
      if (key === PENDING_EVENTS_KEY) return [];
      return fb;
    });
    const setValMock = vi.fn();

    const { rerender } = renderHook(() => useReactiveWorldEvents(getMock, setValMock));

    npcs = [
      { id: 'npc-1', name: 'Inka', status: 'Dead' },
    ];
    rerender();
    expect(setValMock).toHaveBeenCalledTimes(1);

    // Re-render again with unchanged npcs (still dead)
    rerender();
    expect(setValMock).toHaveBeenCalledTimes(1); // loop safety: does not fire again!
  });

  it('does not propose anything on resurrection (dead -> alive)', () => {
    let npcs = [
      { id: 'npc-1', name: 'Inka', status: 'Dead' },
    ];

    const getMock = vi.fn((key: string, fb: any) => {
      if (key === 'npcs') return npcs;
      if (key === PENDING_EVENTS_KEY) return [];
      return fb;
    });
    const setValMock = vi.fn();

    const { rerender } = renderHook(() => useReactiveWorldEvents(getMock, setValMock));

    // First render baseline is dead NPC
    expect(setValMock).not.toHaveBeenCalled();

    // Resurrect NPC
    npcs = [
      { id: 'npc-1', name: 'Inka', status: 'Active' },
    ];
    rerender();

    expect(setValMock).not.toHaveBeenCalled();
  });
});
