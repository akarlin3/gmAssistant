'use client';

import React, { useState, useCallback } from 'react';
import { useReactiveWorldEvents } from '@/lib/world/useReactiveWorldEvents';
import WorldEventsReview from '@/components/world/WorldEventsReview';

const DEFAULT_STATE = {
  npcs: [
    { id: 'npc-1', name: 'Inka', status: 'Active' },
    { id: 'npc-2', name: 'Garrick', status: 'Active' },
  ],
  relationships: [
    {
      id: 'e1',
      fromType: 'npc',
      fromId: 'npc-1',
      toType: 'npc',
      toId: 'npc-2',
      kind: 'allyOf',
      weight: 0.8,
      createdAt: 0,
    },
  ],
  pendingWorldEvents: [],
  worldEventSettings: {
    autoApply: {},
  },
};

function ObserverComponent({ get, setVal }: { get: any; setVal: any }) {
  useReactiveWorldEvents(get, setVal);
  return null;
}

export default function E2ESandboxPage() {
  const [state, setState] = useState<Record<string, any>>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('e2e-sandbox-state');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error('Failed to parse sandbox state from sessionStorage:', e);
        }
      }
    }
    return DEFAULT_STATE;
  });

  const get = useCallback(
    (k: string, fb: any) => {
      return state[k] !== undefined ? state[k] : fb;
    },
    [state]
  );

  const setVal = useCallback((k: string, v: any) => {
    setState((prev) => {
      const next = { ...prev, [k]: v };
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('e2e-sandbox-state', JSON.stringify(next));
      }
      return next;
    });
  }, []);

  const toggleNpcDead = () => {
    const currentStatus = get('npcs', [])[0]?.status;
    const nextStatus = currentStatus === 'Dead' ? 'Active' : 'Dead';
    const nextNpcs = [
      { id: 'npc-1', name: 'Inka', status: nextStatus },
      { id: 'npc-2', name: 'Garrick', status: 'Active' },
    ];
    setVal('npcs', nextNpcs);
  };

  const forceReload = () => {
    window.location.reload();
  };

  const resetSandbox = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('e2e-sandbox-state');
    }
    setState(DEFAULT_STATE);
  };

  const npcs = get('npcs', []);
  const relationships = get('relationships', []);
  const inka = npcs.find((n: any) => n.id === 'npc-1');
  const edge = relationships.find((r: any) => r.id === 'e1');

  return (
    <main className="min-h-screen bg-parchment p-8 text-ink">
      <ObserverComponent get={get} setVal={setVal} />

      <div className="mx-auto max-w-2xl space-y-6">
        <header className="border-b border-rule pb-4">
          <h1 className="font-display text-3xl text-crimson">E2E Sandbox (Reactive Events)</h1>
          <p className="text-sm italic text-ink-soft">
            Testing useReactiveWorldEvents wiring & WorldEventsReview approval round-trip.
          </p>
        </header>

        {/* State readout & controller */}
        <section className="rounded-md border border-rule bg-parchment-soft p-4 shadow-sm space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="font-display text-sm uppercase tracking-wider text-brass-deep">Simulated State</h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={forceReload}
                className="rounded border border-rule bg-parchment px-3 py-1 text-xs hover:bg-parchment-deep"
              >
                Force Page Reload
              </button>
              <button
                type="button"
                onClick={resetSandbox}
                className="rounded border border-crimson/50 text-crimson bg-parchment px-3 py-1 text-xs hover:bg-crimson/10"
              >
                Reset Sandbox
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* NPC */}
            <div className="rounded border border-rule bg-parchment p-3">
              <div className="text-[10px] uppercase tracking-wider text-ink-mute font-display">NPC Status</div>
              <div className="text-lg font-display text-ink mt-1 flex justify-between items-center">
                <span data-testid="npc-name-status">{inka?.name}: <span className={inka?.status === 'Dead' ? 'text-crimson font-bold' : 'text-emerald-700'}>{inka?.status}</span></span>
                <button
                  type="button"
                  data-testid="toggle-dead-btn"
                  onClick={toggleNpcDead}
                  className="rounded border border-brass-deep/60 bg-brass-deep/10 px-2 py-1 text-xs text-brass-deep hover:bg-brass-deep hover:text-parchment font-display uppercase tracking-wider"
                >
                  Toggle Dead
                </button>
              </div>
            </div>

            {/* Relationship */}
            <div className="rounded border border-rule bg-parchment p-3">
              <div className="text-[10px] uppercase tracking-wider text-ink-mute font-display">Relationship Edge</div>
              <div className="text-sm font-mono mt-1 text-ink-soft">
                Inka —allyOf→ Garrick
              </div>
              <div className="text-xl font-display text-ink mt-1">
                Weight: <span data-testid="edge-weight" className="font-mono">{edge?.weight.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Live interactive UI under test */}
        <section className="space-y-2">
          <h2 className="font-display text-sm uppercase tracking-wider text-brass-deep">Component Under Test</h2>
          <WorldEventsReview get={get} setVal={setVal} />
        </section>
      </div>
    </main>
  );
}
