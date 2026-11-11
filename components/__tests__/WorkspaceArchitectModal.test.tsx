import React, { useState } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { WorkspaceArchitectModal } from '@/components/WorkspaceArchitectModal';
import {
  buildHudScopeKey,
  loadLocalHudPrefs,
  loadLocalTerminologyPrefs,
  WORKSPACE_CONFIG_STATE_KEY,
} from '@/lib/workspaceConfigCompiler';

const mockUseAuth = vi.fn();

vi.mock('@/lib/firebase/auth-context', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('WorkspaceArchitectModal', () => {
  beforeEach(() => {
    window.localStorage.clear();
    mockUseAuth.mockReturnValue({
      user: null,
      isPro: false,
      loading: false,
    });
  });

  afterEach(() => {
    delete (globalThis as any).LanguageModel;
    vi.restoreAllMocks();
  });

  it('lets a GM owner compile a plain-English setup, click Option A/B chips, apply to Campaign, and 1-tap Undo', async () => {
    const appliedStates: Array<Record<string, any>> = [];
    const initialData = {
      mode: 'standard',
      genre: 'Fantasy',
      pcs: [{ id: 'pc_1', name: 'Detective Mara', resourcePools: [] }],
    };

    function GmHarness() {
      const [data, setData] = useState<Record<string, any>>(initialData);
      return (
        <WorkspaceArchitectModal
          open
          onClose={() => {}}
          campaignId="camp_gm_1"
          campaignName="Arkham Files"
          role="gm"
          isCampaignOwner
          campaignData={data}
          onApplyCampaignData={(nextData) => {
            appliedStates.push(nextData);
            setData(nextData);
          }}
        />
      );
    }

    render(<GmHarness />);

    // Non-Pro users see LockedInline CTA for Cloud AI while still having full local/relay tools
    expect(screen.getByText(/Cloud AI \(Pro\)/i)).toBeInTheDocument();

    const input = screen.getByLabelText(
      /Describe your system, custom trackers, terminology, or HUD layout/i,
    );
    fireEvent.change(input, {
      target: {
        value:
          'Set up a 2-player cosmic horror mystery: switch to Duet prep counts, add Sanity and Luck trackers to PCs, rename Gold to Cash and Quests to Leads, and pin Clocks + Investigation Board to the top of Run',
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /Compile/i }));

    // Assistant reply + Option A / Option B chips + Diff Preview appear
    await waitFor(() => {
      expect(screen.getByTestId('workspace-diff-preview')).toBeInTheDocument();
    });
    expect(screen.getByText(/Ready to apply:/i)).toBeInTheDocument();

    const optionAChip = screen.getByRole('button', {
      name: /Option A: d100 Sanity/i,
    });
    expect(
      screen.getByRole('button', { name: /Option B: 10-Pip Sanity/i }),
    ).toBeInTheDocument();

    // Clicking Option A updates Sanity max to 99 in the Diff Preview
    fireEvent.click(optionAChip);
    await waitFor(() => {
      expect(screen.getByTestId('workspace-diff-preview').textContent).toContain(
        'Sanity (max 99, manual)',
      );
    });

    // Apply to Campaign
    const applyCampaignBtn = screen.getByRole('button', {
      name: /Apply to Campaign/i,
    });
    expect(applyCampaignBtn).not.toBeDisabled();
    fireEvent.click(applyCampaignBtn);

    expect(appliedStates).toHaveLength(1);
    const applied = appliedStates[0];
    expect(applied.mode).toBe('duet');
    expect(applied[WORKSPACE_CONFIG_STATE_KEY]?.terminologyMap).toMatchObject({
      gold: 'Cash',
      quests: 'Leads',
    });
    expect(applied.pcs[0].resourcePools.map((p: any) => p.name)).toEqual(
      expect.arrayContaining(['Sanity', 'Luck']),
    );
    expect(
      applied.pcs[0].resourcePools.find((p: any) => p.name === 'Sanity')?.max,
    ).toBe(99);

    const gmHudScope = buildHudScopeKey('camp_gm_1', 'gm');
    expect(loadLocalHudPrefs(gmHudScope)?.widgets?.clocks?.pinnedTop).toBe(true);

    // 1-tap Undo rolls back both campaign data and local HUD prefs
    const undoBtn = screen.getByRole('button', { name: /Undo/i });
    fireEvent.click(undoBtn);

    await waitFor(() => {
      expect(appliedStates).toHaveLength(2);
    });
    expect(appliedStates[1]).toEqual(initialData);
    expect(loadLocalHudPrefs(gmHudScope)).toBeNull();
  });

  it('strictly locks "Apply to Campaign" in Player mode and routes customizations only to local HUD + owned PC', async () => {
    const writebackSpy = vi.fn();

    render(
      <WorkspaceArchitectModal
        open
        onClose={() => {}}
        campaignId="camp_shared"
        campaignName="Shared Campaign"
        role="player"
        isCampaignOwner={false}
        activeSlotId="slot_1"
        ownedPcIds={['pc_owned']}
        pcs={[
          {
            id: 'pc_owned',
            name: 'Kaelen',
            ownership: { ownerType: 'player', playerSlotId: 'slot_1' },
            resourcePools: [],
          } as any,
          {
            id: 'pc_other',
            name: 'Unowned Rival',
            ownership: { ownerType: 'player', playerSlotId: 'slot_2' },
            resourcePools: [],
          } as any,
        ]}
        onApplyPlayerPcWriteback={writebackSpy}
      />,
    );

    const input = screen.getByLabelText(
      /Describe your system, custom trackers, terminology, or HUD layout/i,
    );
    fireEvent.change(input, {
      target: {
        value:
          'Switch to Solo mode, pin Clocks to the top, rename Gold to Credits, and add Sanity and Luck trackers',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /Compile/i }));

    await waitFor(() => {
      expect(screen.getByTestId('workspace-diff-preview')).toBeInTheDocument();
    });

    // CRDT Privacy & Authority Guard warns that campaign mode was stripped
    expect(screen.getByText(/CRDT Privacy & Authority Guard/i)).toBeInTheDocument();

    // "Apply to Campaign" MUST remain disabled for players
    const applyCampaignBtn = screen.getByRole('button', {
      name: /Apply to Campaign/i,
    });
    expect(applyCampaignBtn).toBeDisabled();

    // Apply to Local HUD & My Sheet applies ONLY to pc_owned and local storage
    const applyPlayerBtn = screen.getByRole('button', {
      name: /Apply to Local HUD & My Sheet/i,
    });
    fireEvent.click(applyPlayerBtn);

    await waitFor(() => {
      expect(writebackSpy).toHaveBeenCalledTimes(1);
    });
    expect(writebackSpy).toHaveBeenCalledWith(
      'pc_owned',
      expect.objectContaining({
        resourcePools: expect.arrayContaining([
          expect.objectContaining({ name: 'Sanity' }),
          expect.objectContaining({ name: 'Luck' }),
        ]),
      }),
    );

    const playerScope = buildHudScopeKey('camp_shared', 'player', 'slot_1');
    expect(loadLocalHudPrefs(playerScope)?.widgets?.clocks?.pinnedTop).toBe(true);
    expect(loadLocalTerminologyPrefs(playerScope)?.gold).toBe('Credits');
  });

  it('validates fenced JSON in Copy/Paste Prompt Relay tab', async () => {
    render(
      <WorkspaceArchitectModal
        open
        onClose={() => {}}
        campaignId="camp_relay"
        campaignName="Relay Test"
        role="gm"
        isCampaignOwner
        campaignData={{ mode: 'standard' }}
        onApplyCampaignData={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Copy\/Paste Prompt Relay/i }));

    const pasteArea = screen.getByLabelText(/Step 2 — Paste Structured JSON Reply/i);
    fireEvent.change(pasteArea, {
      target: {
        value:
          '```json\n{"reply":"Applied Cyberpunk terms.","patch":{"terminologyMap":{"gold":"Eurodollars","quests":"Gigs"}}}\n```',
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /Validate & Preview Diff/i }));

    await waitFor(() => {
      expect(screen.getByTestId('workspace-diff-preview')).toBeInTheDocument();
    });
    expect(screen.getByText('Eurodollars')).toBeInTheDocument();
    expect(screen.getByText('Gigs')).toBeInTheDocument();
  });

  it('mocks /api/workspace-architect offline, opens via Cmd/Ctrl+Shift+K, renders guardrail warnings + Diff Preview, applies, and rolls back cleanly on Cmd/Ctrl+Z', async () => {
    mockUseAuth.mockReturnValue({
      user: {
        uid: 'pro-player-uid',
        getIdToken: vi.fn().mockResolvedValue('mock-id-token'),
      },
      isPro: true,
      loading: false,
    });

    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          provider: 'cloud_pro',
          turn: {
            reply: 'Prepared Investigation HUD and Sanity tracker for your character.',
            patch: {
              campaignMode: {
                mode: 'duet',
                prepTargetOverrides: { secrets: 9 },
              },
              systemFlavorAndTrackers: {
                resourcePoolTemplates: [
                  { name: 'Sanity', max: 10, rechargeOn: 'manual' },
                ],
              },
              terminologyMap: { gold: 'Credits' },
              hudLayoutPrefs: {
                widgetOrder: ['clocks', 'conspiracyBoard'],
                widgets: { clocks: { visible: true, pinnedTop: true, order: 0 } },
              },
              pcPatches: [
                {
                  pcId: 'pc_unowned_rival',
                  updates: { 'hp.max': 999 },
                },
              ],
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const writebacks: Array<{ pcId: string; updates: Record<string, unknown> }> = [];

    function PlayerShortcutHarness() {
      const [open, setOpen] = useState(false);
      const [pcsState, setPcsState] = useState<any[]>([
        {
          id: 'pc_claimed_1',
          name: 'Detective Ada',
          hp: { current: 24, max: 24, temp: 0 },
          ownership: { ownerType: 'player', playerSlotId: 'slot_ada' },
          resourcePools: [],
        },
        {
          id: 'pc_unowned_rival',
          name: 'Rival Agent',
          hp: { current: 40, max: 40, temp: 0 },
          ownership: { ownerType: 'player', playerSlotId: 'slot_other' },
          resourcePools: [],
        },
      ]);

      React.useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
          if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'k') {
            e.preventDefault();
            setOpen((prev) => !prev);
          }
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
      }, []);

      return (
        <div>
          <div data-testid="owned-pools-count">
            {pcsState[0].resourcePools.length}
          </div>
          <div data-testid="unowned-max-hp">{pcsState[1].hp.max}</div>
          <WorkspaceArchitectModal
            open={open}
            onClose={() => setOpen(false)}
            campaignId="camp_offline_ci"
            campaignName="Midnight Casebook"
            role="player"
            isCampaignOwner={false}
            activeSlotId="slot_ada"
            ownedPcIds={['pc_claimed_1']}
            pcs={pcsState}
            onApplyPlayerPcWriteback={(pcId, updates) => {
              writebacks.push({ pcId, updates });
              setPcsState((prev) =>
                prev.map((p) =>
                  p.id === pcId ? { ...p, ...updates } : p,
                ),
              );
            }}
          />
        </div>
      );
    }

    render(<PlayerShortcutHarness />);

    // 1. Open Customizer via Cmd/Ctrl + Shift + K
    fireEvent.keyDown(window, { key: 'K', ctrlKey: true, shiftKey: true });
    expect(
      screen.getByRole('dialog', {
        name: /Conversational Campaign & Table Customizer/i,
      }),
    ).toBeInTheDocument();

    // 2. Submit mixed prompt (intercepted offline by mocked /api/workspace-architect)
    const input = screen.getByLabelText(
      /Describe your system, custom trackers, terminology, or HUD layout/i,
    );
    fireEvent.change(input, {
      target: {
        value:
          'Switch to Duet prep counts, set Rival max HP to 999, pin Clocks, rename Gold to Credits, and add Sanity to my sheet',
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /Compile/i }));

    // 3. Inspect Diff Preview + CRDT Privacy & Authority Guard warning
    await waitFor(() => {
      expect(screen.getByTestId('workspace-diff-preview')).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/CRDT Privacy & Authority Guard/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Blocked modification to unowned PC "pc_unowned_rival"/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Campaign mode and prep target overrides require GM campaign-owner authority/i,
      ),
    ).toBeInTheDocument();

    // 4. Click Apply to Local HUD & My Sheet
    fireEvent.click(
      screen.getByRole('button', { name: /Apply to Local HUD & My Sheet/i }),
    );
    await waitFor(() => {
      expect(screen.getByTestId('owned-pools-count').textContent).toBe('1');
    });
    expect(screen.getByTestId('unowned-max-hp').textContent).toBe('40');

    const scope = buildHudScopeKey('camp_offline_ci', 'player', 'slot_ada');
    expect(loadLocalHudPrefs(scope)?.widgets?.clocks?.pinnedTop).toBe(true);
    expect(loadLocalTerminologyPrefs(scope)?.gold).toBe('Credits');

    // 5. Press Cmd/Ctrl + Z to roll back cleanly
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    await waitFor(() => {
      expect(screen.getByTestId('owned-pools-count').textContent).toBe('0');
    });
    expect(loadLocalHudPrefs(scope)).toBeNull();
    expect(loadLocalTerminologyPrefs(scope)).toBeNull();
    expect(screen.getByText(/Rolled back workspace customization/i)).toBeInTheDocument();
  });
});
