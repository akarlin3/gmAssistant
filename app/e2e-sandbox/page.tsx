'use client';

import React, { Suspense, useState, useCallback, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useReactiveWorldEvents } from '@/lib/world/useReactiveWorldEvents';
import WorldEventsReview from '@/components/world/WorldEventsReview';
import WorkspaceArchitectModal from '@/components/WorkspaceArchitectModal';
import { useWorkspaceCustomization } from '@/lib/useWorkspaceHudPrefs';
import { WORKSPACE_CONFIG_STATE_KEY } from '@/lib/workspaceConfigCompiler';
import { OVERRIDES_STATE_KEY } from '@/lib/prepTargets';

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

function createDefaultCustomizerCampaign(): Record<string, any> {
  return {
    mode: 'standard',
    gmNotes: 'TOP_SECRET_CULT_LEADER_IS_MAYOR_VANCE',
    pcs: [
      {
        id: 'pc_alice',
        name: 'Investigator Alice',
        hp: { current: 28, max: 28, temp: 0 },
        ownership: { ownerType: 'player', playerSlotId: 'slot_alice' },
        resourcePools: [],
        activeBuffs: [],
      },
      {
        id: 'pc_bob',
        name: 'Partner Bob',
        hp: { current: 42, max: 42, temp: 0 },
        ownership: { ownerType: 'player', playerSlotId: 'slot_bob' },
        resourcePools: [],
        activeBuffs: [],
      },
    ],
  };
}

function WorkspaceCustomizerSandbox({ initialRole }: { initialRole: 'gm' | 'player' }) {
  const [role, setRole] = useState<'gm' | 'player'>(initialRole);
  const [hydrated, setHydrated] = useState(false);
  const [customizerOpen, setCustomizerOpen] = useState(false);
  const [campaignData, setCampaignData] = useState<Record<string, any>>(() =>
    createDefaultCustomizerCampaign(),
  );

  const slotId = role === 'player' ? 'slot_alice' : undefined;
  const { hudLayout, term, setLocalHudPrefs, setLocalTerminology } =
    useWorkspaceCustomization({
      campaignId: 'e2e_camp_customizer',
      role,
      slotId,
      campaignStateOrProjectedConfig:
        role === 'gm'
          ? campaignData
          : {
              terminologyMap:
                campaignData[WORKSPACE_CONFIG_STATE_KEY]?.terminologyMap,
            },
    });

  useEffect(() => {
    setHydrated(true);
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCustomizerOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const resetCustomizerSandbox = () => {
    setCampaignData(createDefaultCustomizerCampaign());
    setLocalHudPrefs(null);
    setLocalTerminology(null);
    setCustomizerOpen(false);
  };

  const alice = (campaignData.pcs ?? []).find((p: any) => p.id === 'pc_alice');
  const bob = (campaignData.pcs ?? []).find((p: any) => p.id === 'pc_bob');
  const secretsOverrides = campaignData[OVERRIDES_STATE_KEY]?.secrets;
  const activeScale =
    campaignData.mode === 'duet' || campaignData.mode === 'solo'
      ? campaignData.mode
      : 'standard';
  const secretsTarget = secretsOverrides?.[activeScale];

  return (
    <main
      className="min-h-screen bg-parchment p-8 text-ink"
      data-testid="e2e-customizer-harness"
      data-hydrated={hydrated ? 'true' : 'false'}
    >
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-4">
          <div>
            <h1 className="font-display text-2xl text-crimson">
              E2E Sandbox (Workspace Customizer)
            </h1>
            <p className="text-xs italic text-ink-soft">
              Offline E2E harness for GM &amp; /player authority boundaries, Diff Preview, Apply, and Cmd/Ctrl+Z rollback.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-testid="e2e-switch-role"
              onClick={() => setRole((r) => (r === 'gm' ? 'player' : 'gm'))}
              className="rounded border border-rule bg-parchment px-3 py-1 font-mono text-xs"
            >
              Role: <span data-testid="e2e-role">{role}</span>
            </button>
            <button
              type="button"
              data-testid="e2e-open-customizer"
              onClick={() => setCustomizerOpen(true)}
              className="rounded border border-brass-deep/60 bg-brass-deep/10 px-3 py-1 font-display text-xs uppercase tracking-wider text-brass-deep"
            >
              Open Customizer (⌘⇧K)
            </button>
            <button
              type="button"
              data-testid="e2e-reset-customizer"
              onClick={resetCustomizerSandbox}
              className="rounded border border-crimson/50 bg-parchment px-3 py-1 text-xs text-crimson"
            >
              Reset
            </button>
          </div>
        </header>

        <section className="grid grid-cols-2 gap-3 rounded-md border border-rule bg-parchment-soft p-4 shadow-sm sm:grid-cols-4">
          <div className="rounded border border-rule bg-parchment p-2.5">
            <div className="font-mono text-[10px] uppercase text-ink-mute">Campaign Mode</div>
            <div data-testid="e2e-campaign-mode" className="mt-1 font-mono text-sm font-bold">
              {campaignData.mode ?? 'standard'}
            </div>
          </div>
          <div className="rounded border border-rule bg-parchment p-2.5">
            <div className="font-mono text-[10px] uppercase text-ink-mute">Secrets Prep Target</div>
            <div data-testid="e2e-prep-secrets" className="mt-1 font-mono text-sm font-bold">
              {secretsTarget !== undefined ? String(secretsTarget) : 'default'}
            </div>
          </div>
          <div className="rounded border border-rule bg-parchment p-2.5">
            <div className="font-mono text-[10px] uppercase text-ink-mute">Terminology</div>
            <div className="mt-1 font-mono text-xs">
              Gold: <span data-testid="e2e-gold-label">{term('gold', 'Gold')}</span> · Quests:{' '}
              <span data-testid="e2e-quests-label">{term('quests', 'Quests')}</span>
            </div>
          </div>
          <div className="rounded border border-rule bg-parchment p-2.5">
            <div className="font-mono text-[10px] uppercase text-ink-mute">Pinned HUD</div>
            <div data-testid="e2e-pinned-widgets" className="mt-1 font-mono text-xs font-bold">
              {hudLayout.pinnedTopWidgetIds.length > 0
                ? hudLayout.pinnedTopWidgetIds.join(', ')
                : 'none'}
            </div>
          </div>
          <div className="col-span-2 rounded border border-rule bg-parchment p-2.5">
            <div className="font-mono text-[10px] uppercase text-ink-mute">
              Claimed PC (pc_alice)
            </div>
            <div className="mt-1 font-mono text-xs">
              HP:{' '}
              <span data-testid="e2e-alice-hp">
                {alice?.hp?.current}/{alice?.hp?.max}
              </span>{' '}
              · Pools:{' '}
              <span data-testid="e2e-alice-pools">
                {(alice?.resourcePools ?? []).length > 0
                  ? alice.resourcePools.map((p: any) => p.name).join(', ')
                  : 'none'}
              </span>
            </div>
          </div>
          <div className="col-span-2 rounded border border-rule bg-parchment p-2.5">
            <div className="font-mono text-[10px] uppercase text-ink-mute">
              Unowned PC (pc_bob)
            </div>
            <div className="mt-1 font-mono text-xs">
              Max HP: <span data-testid="e2e-bob-maxhp">{bob?.hp?.max}</span>
            </div>
          </div>
        </section>
      </div>

      <WorkspaceArchitectModal
        open={customizerOpen}
        onClose={() => setCustomizerOpen(false)}
        campaignId="e2e_camp_customizer"
        campaignName="Arkham Casefiles"
        role={role}
        isCampaignOwner={role === 'gm'}
        campaignData={role === 'gm' ? campaignData : undefined}
        activeSlotId={slotId}
        ownedPcIds={role === 'player' ? ['pc_alice'] : ['pc_alice', 'pc_bob']}
        pcs={campaignData.pcs}
        allowUnauthenticatedCloudFetch={true}
        onApplyCampaignData={(nextData, nextMode) => {
          setCampaignData({
            ...nextData,
            ...(nextMode ? { mode: nextMode } : {}),
          });
        }}
        onApplyPlayerPcWriteback={(pcId, updates) => {
          setCampaignData((prev) => ({
            ...prev,
            pcs: (prev.pcs ?? []).map((pc: any) => {
              if (pc.id !== pcId) return pc;
              const nextPc: Record<string, any> = {
                ...pc,
                hp: pc.hp ? { ...pc.hp } : undefined,
              };
              for (const [k, v] of Object.entries(updates)) {
                if (k.includes('.')) {
                  const [parentKey, childKey] = k.split('.', 2);
                  nextPc[parentKey] = {
                    ...(nextPc[parentKey] ?? {}),
                    [childKey]: v,
                  };
                } else {
                  nextPc[k] = v;
                }
              }
              return nextPc;
            }),
          }));
        }}
      />
    </main>
  );
}

function ObserverComponent({ get, setVal }: { get: any; setVal: any }) {
  useReactiveWorldEvents(get, setVal);
  return null;
}

function ReactiveEventsSandbox() {
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
        <section className="space-y-4 rounded-md border border-rule bg-parchment-soft p-4 shadow-sm">
          <div className="flex items-center justify-between">
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
                className="rounded border border-crimson/50 bg-parchment px-3 py-1 text-xs text-crimson hover:bg-crimson/10"
              >
                Reset Sandbox
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* NPC */}
            <div className="rounded border border-rule bg-parchment p-3">
              <div className="font-display text-[10px] uppercase tracking-wider text-ink-mute">NPC Status</div>
              <div className="mt-1 flex items-center justify-between font-display text-lg text-ink">
                <span data-testid="npc-name-status">{inka?.name}: <span className={inka?.status === 'Dead' ? 'font-bold text-crimson' : 'text-emerald-700'}>{inka?.status}</span></span>
                <button
                  type="button"
                  data-testid="toggle-dead-btn"
                  onClick={toggleNpcDead}
                  className="rounded border border-brass-deep/60 bg-brass-deep/10 px-2 py-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-brass-deep hover:text-parchment"
                >
                  Toggle Dead
                </button>
              </div>
            </div>

            {/* Relationship */}
            <div className="rounded border border-rule bg-parchment p-3">
              <div className="font-display text-[10px] uppercase tracking-wider text-ink-mute">Relationship Edge</div>
              <div className="mt-1 font-mono text-sm text-ink-soft">
                Inka —allyOf→ Garrick
              </div>
              <div className="mt-1 font-display text-xl text-ink">
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

function E2ESandboxRouter() {
  const searchParams = useSearchParams();
  const suite = searchParams.get('suite');
  if (suite === 'workspace-customizer') {
    const role = searchParams.get('role') === 'player' ? 'player' : 'gm';
    return <WorkspaceCustomizerSandbox key={role} initialRole={role} />;
  }
  return <ReactiveEventsSandbox />;
}

export default function E2ESandboxPage() {
  return (
    <Suspense fallback={<ReactiveEventsSandbox />}>
      <E2ESandboxRouter />
    </Suspense>
  );
}
