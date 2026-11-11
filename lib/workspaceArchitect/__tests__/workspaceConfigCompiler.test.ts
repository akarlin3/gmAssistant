import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  applyWorkspacePatchToCampaignData,
  buildArchitectRelayPrompt,
  buildHudScopeKey,
  buildWorkspacePatchDiff,
  CampaignWorkspacePatchSchema,
  compileNaturalLanguageArchitectTurn,
  isChromeLanguageModelAvailable,
  loadLocalHudPrefs,
  loadLocalTerminologyPrefs,
  mergeBuffPresetsIntoPcBuffs,
  mergeResourcePoolTemplatesIntoPcPools,
  parseArchitectRelayResponse,
  projectPublicWorkspaceConfig,
  resolveEffectiveHudLayout,
  resolveTerm,
  runChromeLanguageModelArchitect,
  saveLocalHudPrefs,
  saveLocalTerminologyPrefs,
  validateWorkspacePatch,
  WORKSPACE_CONFIG_STATE_KEY,
  type WorkspaceAuthorityContext,
} from '@/lib/workspaceConfigCompiler';
import { OVERRIDES_STATE_KEY } from '@/lib/prepTargets';
import { buildSlotProjection } from '@/lib/playerMode/projection';

const gmAuthority: WorkspaceAuthorityContext = {
  role: 'gm',
  isCampaignOwner: true,
};

describe('workspaceConfigCompiler', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    delete (globalThis as any).LanguageModel;
    vi.restoreAllMocks();
  });

  it('compiles a multi-clause cosmic horror natural-language request into a typed patch + Option A/B chips', () => {
    const prompt =
      'Set up a 2-player cosmic horror mystery: switch to Duet prep counts, add Sanity and Luck trackers to PCs, rename Gold to Cash and Quests to Leads, and pin Clocks + Investigation Board to the top of Run';

    const { turn, validated } = compileNaturalLanguageArchitectTurn(
      prompt,
      gmAuthority,
    );

    expect(validated.ok).toBe(true);
    expect(validated.canApplyToCampaign).toBe(true);

    const patch = turn.patch;
    expect(patch.campaignMode?.mode).toBe('duet');
    expect(patch.systemFlavorAndTrackers?.genre).toBe('Cosmic Horror Mystery');
    expect(patch.systemFlavorAndTrackers?.clockCategories).toEqual(
      expect.arrayContaining(['Investigation', 'Cosmic Dread']),
    );

    const poolNames = (patch.systemFlavorAndTrackers?.resourcePoolTemplates ?? []).map(
      (p) => p.name,
    );
    expect(poolNames).toEqual(expect.arrayContaining(['Sanity', 'Luck']));

    expect(patch.terminologyMap).toMatchObject({
      gold: 'Cash',
      quests: 'Leads',
    });

    expect(patch.hudLayoutPrefs?.widgets?.clocks?.pinnedTop).toBe(true);
    expect(patch.hudLayoutPrefs?.widgets?.conspiracyBoard?.pinnedTop).toBe(true);
    expect(patch.hudLayoutPrefs?.widgetOrder?.slice(0, 2)).toEqual([
      'clocks',
      'conspiracyBoard',
    ]);

    // Ambiguous Sanity scale produces Option A / Option B follow-up chips
    expect(turn.followUpOptions).toBeDefined();
    expect(turn.followUpOptions!.length).toBeGreaterThanOrEqual(2);
    expect(turn.followUpOptions![0].label).toContain('Option A');
    expect(turn.followUpOptions![1].label).toContain('Option B');
  });

  it('normalizes slash-separated terminology overrides and prep target aliases (encounters -> monsters)', () => {
    const { validated } = compileNaturalLanguageArchitectTurn(
      'Switch to Solo mode with 5 Secrets, 4 NPCs, 3 Locations, and 2 Encounters; rename Quests / Dungeons / Gold to Cases / Sites / Credits',
      gmAuthority,
    );

    expect(validated.ok).toBe(true);
    expect(validated.campaignPatch.campaignMode?.mode).toBe('solo');
    expect(validated.campaignPatch.campaignMode?.prepTargetOverrides).toMatchObject({
      secrets: 5,
      npcs: 4,
      locations: 3,
      monsters: 2,
    });
    expect(validated.campaignPatch.terminologyMap).toMatchObject({
      quests: 'Cases',
      dungeons: 'Sites',
      gold: 'Credits',
    });
  });

  it('applies a validated patch to campaign data idempotently and supports exact 1-tap Undo snapshot restoration', () => {
    const initialData = {
      mode: 'standard',
      genre: 'High Fantasy',
      pcs: [
        {
          id: 'pc_1',
          name: 'Inspector Vance',
          resourcePools: [{ id: 'hd', name: 'Hit Dice', current: 3, max: 3, rechargeOn: 'long' }],
        },
      ],
    };

    const { validated } = compileNaturalLanguageArchitectTurn(
      'Set up a cosmic horror mystery: switch to Duet prep counts, 6 secrets, add Sanity (99) and Resolve trackers, and rename Gold to Cash',
      gmAuthority,
    );

    const diff = buildWorkspacePatchDiff(initialData, undefined, validated);
    expect(diff.some((d) => d.id === 'campaignMode.mode' && d.after === 'duet')).toBe(true);
    expect(diff.some((d) => d.id === 'term.gold' && d.after === 'Cash')).toBe(true);

    const { nextData, undoSnapshot } = applyWorkspacePatchToCampaignData(
      initialData,
      validated,
    );

    expect(nextData.mode).toBe('duet');
    expect(nextData.__prepScale).toBe('duet');
    expect(nextData.__soloMode).toBe(true);
    expect(nextData[OVERRIDES_STATE_KEY]?.secrets?.duet).toBe(6);
    expect(nextData[WORKSPACE_CONFIG_STATE_KEY]?.terminologyMap?.gold).toBe('Cash');

    // PCs receive new resource pools without clobbering existing Hit Dice
    const updatedPools = nextData.pcs[0].resourcePools;
    expect(updatedPools.map((p: any) => p.name)).toEqual([
      'Hit Dice',
      'Sanity',
      'Resolve',
    ]);
    expect(updatedPools.find((p: any) => p.name === 'Sanity')?.max).toBe(99);

    // Applying the same patch a second time updates in-place without duplicating pools
    const secondApply = applyWorkspacePatchToCampaignData(nextData, validated);
    expect(secondApply.nextData.pcs[0].resourcePools).toHaveLength(3);

    // Undo snapshot matches initialData cleanly and initialData was never mutated
    expect(undoSnapshot).toEqual(initialData);
    expect(initialData.mode).toBe('standard');
  });

  it('projects spoiler-scrubbed workspaceConfig through SlotProjection only when configured', () => {
    const basePlayerConfig = {
      tokenVersion: 1,
      roster: [{ id: 'slot_1', displayName: 'Player 1' }],
      entityVisibility: {},
    };

    const unconfiguredProj = buildSlotProjection(
      { player: basePlayerConfig, npcs: [{ id: 'n1', name: 'Secret Cultist' }] } as any,
      'Test Campaign',
      'slot_1',
    );
    expect(unconfiguredProj.workspaceConfig).toBeUndefined();

    const configuredData = {
      player: basePlayerConfig,
      [WORKSPACE_CONFIG_STATE_KEY]: {
        terminologyMap: {
          quests: 'Cases [[gm:True Cult Plot]]',
          gold: 'Credits',
        },
        systemFlavorAndTrackers: {
          genre: 'Cyberpunk [[gm:AI Twist]]',
          clockCategories: ['Corp Alert', 'ICE Trace ||GM Secret||'],
          resourcePoolTemplates: [{ name: 'Street Cred', max: 10, rechargeOn: 'manual' }],
        },
      },
    };

    const proj = buildSlotProjection(
      configuredData as any,
      'Test Campaign',
      'slot_1',
    );
    expect(proj.workspaceConfig).toBeDefined();
    expect(proj.workspaceConfig?.terminologyMap?.quests).toBe('Cases');
    expect(proj.workspaceConfig?.terminologyMap?.gold).toBe('Credits');
    expect(proj.workspaceConfig?.systemFlavorAndTrackers?.genre).toBe('Cyberpunk');
    expect(proj.workspaceConfig?.systemFlavorAndTrackers?.clockCategories).toEqual([
      'Corp Alert',
      'ICE Trace',
    ]);
    expect(JSON.stringify(proj)).not.toContain('True Cult Plot');
    expect(JSON.stringify(proj)).not.toContain('GM Secret');
  });

  it('persists local HUD layout & terminology prefs and computes pinned widget ordering + density classes', () => {
    const scopeKey = buildHudScopeKey('camp_42', 'player', 'slot_a');
    saveLocalHudPrefs(scopeKey, {
      density: 'compact',
      widgets: {
        clocks: { visible: true, pinnedTop: true, order: 0 },
        conspiracyBoard: { visible: true, pinnedTop: true, order: 1 },
        audioNarration: { visible: false },
      },
    });
    saveLocalTerminologyPrefs(scopeKey, { quests: 'Leads', gold: 'Cash' });

    const loadedHud = loadLocalHudPrefs(scopeKey);
    const resolved = resolveEffectiveHudLayout(loadedHud);
    expect(resolved.density).toBe('compact');
    expect(resolved.densitySpacingClass).toContain('space-y-2');
    expect(resolved.pinnedTopWidgetIds).toEqual(['clocks', 'conspiracyBoard']);
    expect(resolved.orderedWidgets.slice(0, 2).map((w) => w.id)).toEqual([
      'clocks',
      'conspiracyBoard',
    ]);
    expect(resolved.isWidgetVisible('audioNarration')).toBe(false);
    expect(resolved.isWidgetVisible('initiative')).toBe(true);

    const loadedTerms = loadLocalTerminologyPrefs(scopeKey);
    expect(resolveTerm(loadedTerms, 'quests', 'Quests')).toBe('Leads');
    expect(resolveTerm(loadedTerms, 'dungeons', 'Dungeons')).toBe('Dungeons');
  });

  it('strips markdown code fences in parseArchitectRelayResponse and supports Chrome LanguageModel fallback', async () => {
    const fencedJson = [
      'Here is your configuration:',
      '```json',
      JSON.stringify({
        reply: 'Configured Sci-Fi table labels and Resolve pool.',
        patch: {
          terminologyMap: { quests: 'Missions', gold: 'Credits' },
          systemFlavorAndTrackers: {
            resourcePoolTemplates: [{ name: 'Resolve', max: 6, rechargeOn: 'short' }],
          },
        },
        followUpOptions: [
          {
            id: 'opt_a',
            label: 'Option A: Add Hull Clock',
            promptReply: 'Add Hull Integrity clock category',
          },
        ],
      }),
      '```',
    ].join('\n');

    const parsed = parseArchitectRelayResponse(fencedJson, gmAuthority);
    expect(parsed.ok).toBe(true);
    expect(parsed.turn?.patch.terminologyMap).toEqual({
      quests: 'Missions',
      gold: 'Credits',
    });
    expect(parsed.turn?.followUpOptions).toHaveLength(1);

    // Mock Chrome Built-in LanguageModel API
    const destroySpy = vi.fn();
    (globalThis as any).LanguageModel = {
      availability: vi.fn().mockResolvedValue('available'),
      create: vi.fn().mockResolvedValue({
        prompt: vi.fn().mockResolvedValue(fencedJson),
        destroy: destroySpy,
      }),
    };

    expect(await isChromeLanguageModelAvailable()).toBe(true);
    const onDeviceRes = await runChromeLanguageModelArchitect(
      'Sci-fi setup',
      [],
      'Starfall',
      {},
      gmAuthority,
    );
    expect(onDeviceRes.ok).toBe(true);
    expect(onDeviceRes.turn?.patch.terminologyMap?.gold).toBe('Credits');
    expect(destroySpy).toHaveBeenCalledTimes(1);
  });

  it('validates ConditionBuffPreset merging and rejects malformed top-level patches', () => {
    const mergedBuffs = mergeBuffPresetsIntoPcBuffs(
      [],
      [
        {
          name: 'Inspired',
          checkBonusFormula: '1d6',
          affectsChecks: true,
          expiresOn: 'shortRest',
        },
      ],
    );
    expect(mergedBuffs).toHaveLength(1);
    expect(mergedBuffs[0].name).toBe('Inspired');
    expect(mergedBuffs[0].active).toBe(false);

    const mergedPools = mergeResourcePoolTemplatesIntoPcPools(
      [{ id: 'p1', name: 'Sanity', current: 8, max: 10, rechargeOn: 'manual' }],
      [{ name: 'Sanity', max: 6, rechargeOn: 'long' }],
    );
    expect(mergedPools[0].max).toBe(6);
    expect(mergedPools[0].current).toBe(6); // clamped to new max

    expect(CampaignWorkspacePatchSchema.safeParse('not-an-object').success).toBe(false);
    expect(validateWorkspacePatch(null, gmAuthority).ok).toBe(false);

    const relayPrompt = buildArchitectRelayPrompt(
      'Rename Gold to Credits',
      [],
      'Test Campaign',
      { gmSecrets: 'TOP_SECRET_VILLAIN' },
      { role: 'player', isCampaignOwner: false, activeSlotId: 'slot_1' },
    );
    expect(relayPrompt).not.toContain('TOP_SECRET_VILLAIN');
  });
});
