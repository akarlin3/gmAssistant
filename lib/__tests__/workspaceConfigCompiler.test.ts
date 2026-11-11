import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
  applyPlayerWorkspacePatchToPcs,
  applyValidatedPatchToPlayerTracker,
  applyWorkspacePatchToCampaignData,
  buildArchitectRelayPrompt,
  buildSafeArchitectContextSummary,
  buildWorkspacePatchDiff,
  compileNaturalLanguageArchitectTurn,
  resolveEffectiveHudLayout,
  validateWorkspacePatch,
  WORKSPACE_CONFIG_STATE_KEY,
  type CampaignWorkspacePatch,
  type HudWidgetId,
  type WorkspaceAuthorityContext,
} from '../workspaceConfigCompiler';
import { OVERRIDES_STATE_KEY } from '../prepTargets';
import { PLAYER_EDITABLE_FIELDS, validatePlayerField } from '../player/allowlist';
import { emptyPlayerTrackerState } from '../playerMode/playerTrackerStorage';

describe('Conversational Campaign & Table Customizer — Authority & Redaction Suite', () => {
  it('GM smoke scenario (callerRole === "gm"): applies Duet prep targets, Sanity & Luck pools, terminology overrides, and pins Clocks to Run', () => {
    const initialCampaignData = {
      mode: 'standard',
      genre: 'Mystery',
      pcs: [
        {
          id: 'pc_investigator_1',
          name: 'Inspector Vance',
          hp: { current: 24, max: 24, temp: 0 },
          ownership: { ownerType: 'player', playerSlotId: 'slot_1' },
          resourcePools: [
            { id: 'pool_hd', name: 'Hit Dice', current: 3, max: 3, rechargeOn: 'long' },
          ],
        },
        {
          id: 'pc_investigator_2',
          name: 'Dr. Holloway',
          hp: { current: 19, max: 19, temp: 0 },
          ownership: { ownerType: 'player', playerSlotId: 'slot_2' },
          resourcePools: [],
        },
      ],
    };

    const gmAuthority: WorkspaceAuthorityContext = {
      callerRole: 'gm',
      isCampaignOwner: true,
      pcs: initialCampaignData.pcs,
    };

    const { validated } = compileNaturalLanguageArchitectTurn(
      'Set up a 2-player cosmic horror mystery: switch to Duet prep counts, 6 Secrets, 4 NPCs, 3 Locations, 2 Encounters, add Sanity and Luck trackers to PCs, rename Gold to Cash and Quests to Leads, and pin Clocks to the top of Run',
      gmAuthority,
    );

    assert.equal(validated.ok, true);
    assert.equal(validated.canApplyToCampaign, true);
    assert.equal(validated.campaignPatch.campaignMode?.mode, 'duet');
    assert.deepEqual(validated.campaignPatch.campaignMode?.prepTargetOverrides, {
      secrets: 6,
      npcs: 4,
      locations: 3,
      monsters: 2,
    });
    assert.deepEqual(validated.campaignPatch.terminologyMap, {
      gold: 'Cash',
      quests: 'Leads',
    });

    const poolNames = (
      validated.campaignPatch.systemFlavorAndTrackers?.resourcePoolTemplates ?? []
    ).map((p) => p.name);
    assert.ok(poolNames.includes('Sanity'));
    assert.ok(poolNames.includes('Luck'));

    const resolvedHud = resolveEffectiveHudLayout(validated.localHudPrefs);
    assert.ok(resolvedHud.pinnedTopWidgetIds.includes('clocks'));
    assert.equal(resolvedHud.orderedWidgets[0].id, 'clocks');

    const { nextData, undoSnapshot } = applyWorkspacePatchToCampaignData(
      initialCampaignData,
      validated,
    );

    assert.equal(nextData.mode, 'duet');
    assert.equal(nextData.__prepScale, 'duet');
    assert.equal(nextData[OVERRIDES_STATE_KEY]?.secrets?.duet, 6);
    assert.equal(nextData[OVERRIDES_STATE_KEY]?.npcs?.duet, 4);
    assert.equal(nextData[OVERRIDES_STATE_KEY]?.locations?.duet, 3);
    assert.equal(nextData[OVERRIDES_STATE_KEY]?.monsters?.duet, 2);
    assert.deepEqual(nextData[WORKSPACE_CONFIG_STATE_KEY]?.terminologyMap, {
      gold: 'Cash',
      quests: 'Leads',
    });

    for (const pc of nextData.pcs) {
      const names = pc.resourcePools.map((r: { name: string }) => r.name);
      assert.ok(names.includes('Sanity'));
      assert.ok(names.includes('Luck'));
    }

    assert.deepEqual(undoSnapshot, initialCampaignData);
  });

  it('Player smoke scenario (callerRole === "player"): permits local HUD reordering & owned PC writebacks while blocking unowned PC max HP, prep targets, and GM-only fields', () => {
    const claimedPc = {
      id: 'pc_claimed_alice',
      name: 'Alice Starweaver',
      hp: { current: 28, max: 28, temp: 0 },
      ownership: { ownerType: 'player', playerSlotId: 'slot_alice' },
      resourcePools: [],
      notes: 'Initial notes',
    };
    const unownedPc = {
      id: 'pc_unowned_bob',
      name: 'Bob Ironshield',
      hp: { current: 42, max: 42, temp: 0 },
      ownership: { ownerType: 'player', playerSlotId: 'slot_bob' },
      resourcePools: [],
      notes: 'Bob private sheet',
    };
    const dmNpcPc = {
      id: 'pc_dm_guide',
      name: 'Archmage Velis',
      hp: { current: 65, max: 65, temp: 0 },
      ownership: { ownerType: 'dm' },
      resourcePools: [],
    };

    const playerAuthority: WorkspaceAuthorityContext = {
      callerRole: 'player',
      isCampaignOwner: false,
      activeSlotId: 'slot_alice',
      ownedPcIds: ['pc_claimed_alice'],
      pcs: [claimedPc, unownedPc, dmNpcPc],
    };

    const mixedUntrustedPayload = {
      // Forbidden campaign-wide prep targets & mode
      campaignMode: {
        mode: 'duet',
        prepTargetOverrides: { secrets: 12, npcs: 9, locations: 7 },
      },
      // Forbidden GM-only keys
      gmNotes: 'GM_SECRET_VILLAIN_TWIST',
      gmSecrets: ['Ancient betrayal'],
      entityVisibility: { npc_1: 'public' },
      // Allowed resource pool templates (converted strictly to owned PC writeback) + forbidden campaign genre/clocks
      systemFlavorAndTrackers: {
        genre: 'Cosmic Horror',
        clockCategories: ['Doomsday'],
        resourcePoolTemplates: [
          { name: 'Sanity', max: 10, rechargeOn: 'manual' },
          { name: 'Luck', max: 5, rechargeOn: 'long' },
        ],
      },
      // Allowed local HUD reordering
      hudLayoutPrefs: {
        density: 'compact',
        widgetOrder: [
          'clocks',
          'conspiracyBoard',
          'rollFeed',
          'initiative',
          'actionEconomy',
          'audioNarration',
        ],
        widgets: {
          clocks: { visible: true, pinnedTop: true, order: 0 },
          audioNarration: { visible: false },
        },
      },
      // Mixed PC patches: owned PC whitelisted + GM-only field, AND unowned PC max HP attack
      pcPatches: [
        {
          pcId: 'pc_claimed_alice',
          updates: {
            'hp.current': 21,
            notes: 'Investigating the lighthouse',
            gmNotes: 'SHOULD_BE_STRIPPED',
            maxHp: 999,
            ownership: { ownerType: 'dm' },
          },
        },
        {
          pcId: 'pc_unowned_bob',
          updates: {
            'hp.max': 999,
            maxHp: 999,
            'hp.current': 1,
          },
        },
        {
          pcId: 'pc_dm_guide',
          updates: {
            'hp.max': 1,
          },
        },
      ],
    };

    const validated = validateWorkspacePatch(mixedUntrustedPayload, playerAuthority);

    // 1. Campaign-wide mutations strictly stripped/blocked
    assert.equal(validated.ok, true);
    assert.equal(validated.canApplyToCampaign, false);
    assert.deepEqual(validated.campaignPatch, {});
    assert.ok(validated.blockedScopes.includes('campaignMode'));
    assert.throws(() =>
      applyWorkspacePatchToCampaignData({ mode: 'standard' }, validated),
    );

    // 2. Local HUD reordering permitted
    assert.equal(validated.localHudPrefs?.density, 'compact');
    assert.deepEqual(validated.localHudPrefs?.widgetOrder?.slice(0, 2), [
      'clocks',
      'conspiracyBoard',
    ]);
    assert.equal(validated.localHudPrefs?.widgets?.clocks?.pinnedTop, true);
    assert.equal(validated.localHudPrefs?.widgets?.audioNarration?.visible, false);

    // 3. Owned PC receives ONLY whitelisted writebacks; GM-only / non-editable fields blocked
    assert.deepEqual(Object.keys(validated.pcWritebacks), ['pc_claimed_alice']);
    const aliceWriteback = validated.pcWritebacks.pc_claimed_alice;
    assert.equal(aliceWriteback['hp.current'], 21);
    assert.equal(aliceWriteback.notes, 'Investigating the lighthouse');
    assert.ok(Array.isArray(aliceWriteback.resourcePools));
    assert.equal('gmNotes' in aliceWriteback, false);
    assert.equal('maxHp' in aliceWriteback, false);
    assert.equal('ownership' in aliceWriteback, false);
    assert.ok(validated.blockedFields.includes('pc_claimed_alice.maxHp'));
    assert.ok(validated.blockedFields.includes('pc_claimed_alice.ownership'));
    assert.ok(validated.strippedRedactedKeys.includes('gmNotes'));
    assert.ok(validated.strippedRedactedKeys.includes('gmSecrets'));
    assert.ok(validated.strippedRedactedKeys.includes('entityVisibility'));

    // 4. Unowned PC max HP mutation strictly blocked & byte-for-byte preserved
    assert.ok(validated.blockedPcIds.includes('pc_unowned_bob'));
    assert.ok(validated.blockedPcIds.includes('pc_dm_guide'));
    assert.equal(validated.pcWritebacks.pc_unowned_bob, undefined);
    assert.equal(validated.pcWritebacks.pc_dm_guide, undefined);

    const beforeBobBytes = Buffer.from(JSON.stringify(unownedPc), 'utf8');
    const updatedPcs = applyPlayerWorkspacePatchToPcs(
      [claimedPc, unownedPc, dmNpcPc],
      validated,
    );
    const afterAlice = updatedPcs.find((p) => p.id === 'pc_claimed_alice')!;
    const afterBob = updatedPcs.find((p) => p.id === 'pc_unowned_bob')!;
    const afterBobBytes = Buffer.from(JSON.stringify(afterBob), 'utf8');

    assert.equal(afterAlice.hp.current, 21);
    assert.equal(afterAlice.hp.max, 28);
    assert.equal(afterBob.hp.max, 42);
    assert.equal(Buffer.compare(beforeBobBytes, afterBobBytes), 0);
  });

  it('fast-check (250 runs): proves unowned PC byte-identity, non-public GM redaction across context/diffs, and private note immutability', () => {
    const widgetIdArb = fc.constantFrom<HudWidgetId>(
      'initiative',
      'rollFeed',
      'clocks',
      'audioNarration',
      'actionEconomy',
      'conspiracyBoard',
    );

    const nonPublicVisibilityArb = fc.constantFrom(
      'gm',
      'hidden',
      'private',
      'secret',
      'party-hidden',
    );

    const safeWordArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9]{2,12}$/);
    const canaryArb = fc.stringMatching(/^GM_CANARY_[A-Z0-9]{8,14}$/);

    const randomPatchArb = fc.record({
      mode: fc.option(fc.constantFrom('standard', 'duet', 'solo', 'player'), {
        nil: undefined,
      }),
      secretsTarget: fc.integer({ min: 0, max: 25 }),
      npcsTarget: fc.integer({ min: 0, max: 25 }),
      poolName: safeWordArb,
      poolMax: fc.integer({ min: 1, max: 100 }),
      rechargeOn: fc.constantFrom('short', 'long', 'dawn', 'manual'),
      goldLabel: safeWordArb,
      questsLabel: safeWordArb,
      density: fc.constantFrom('compact', 'comfortable', 'spacious'),
      pinnedWidget: widgetIdArb,
      targetPcChoice: fc.constantFrom(
        'pc_owned',
        'pc_unowned_1',
        'pc_unowned_2',
        'pc_dm_npc',
      ),
      attemptedHpCurrent: fc.integer({ min: 0, max: 80 }),
      attemptedUnownedMaxHp: fc.integer({ min: 100, max: 999 }),
      flipPrivateNotesToTrue: fc.boolean(),
    });

    const arbitraryCampaignStateArb = fc.record({
      activeSlotId: fc.constantFrom('slot_p1', 'slot_p2'),
      nonPublicVis: nonPublicVisibilityArb,
      secretNpcCanary: canaryArb,
      secretConfigCanary: canaryArb,
      secretSpoilerCanary: canaryArb,
      unownedHp1: fc.integer({ min: 10, max: 90 }),
      unownedHp2: fc.integer({ min: 10, max: 90 }),
      ownedHp: fc.integer({ min: 10, max: 90 }),
      privateQuestId: fc.stringMatching(/^q_priv_[a-z0-9]{4,8}$/),
      privateJournalId: fc.stringMatching(/^j_priv_[a-z0-9]{4,8}$/),
      privateAnnId: fc.stringMatching(/^ann_priv_[a-z0-9]{4,8}$/),
      privateInvId: fc.stringMatching(/^inv_priv_[a-z0-9]{4,8}$/),
    });

    fc.assert(
      fc.property(
        arbitraryCampaignStateArb,
        randomPatchArb,
        (stateSample, patchSample) => {
          const otherSlotId =
            stateSample.activeSlotId === 'slot_p1' ? 'slot_p2' : 'slot_p1';

          const ownedPc = {
            id: 'pc_owned',
            name: `Claimed Hero [[gm:${stateSample.secretSpoilerCanary}]]`,
            hp: { current: stateSample.ownedHp, max: stateSample.ownedHp, temp: 0 },
            ownership: {
              ownerType: 'player',
              playerSlotId: stateSample.activeSlotId,
            },
            gmNotes: stateSample.secretNpcCanary,
            resourcePools: [
              {
                id: 'pool_secret_gm',
                name: stateSample.secretConfigCanary,
                current: 3,
                max: 3,
                rechargeOn: 'long',
                visibility: stateSample.nonPublicVis,
              },
            ],
            inventory: [
              {
                id: stateSample.privateInvId,
                name: 'Private Cipher Notebook',
                qty: 1,
                weight: 1,
                equipped: false,
                attuned: false,
                notes: 'Never share automatically',
                sharedWithGm: false,
              },
            ],
          };

          const unownedPc1 = {
            id: 'pc_unowned_1',
            name: 'Other Player Vanguard',
            hp: {
              current: stateSample.unownedHp1,
              max: stateSample.unownedHp1,
              temp: 2,
            },
            ac: 17,
            ownership: { ownerType: 'player', playerSlotId: otherSlotId },
            resourcePools: [
              { id: 'hd_1', name: 'Hit Dice', current: 4, max: 4, rechargeOn: 'long' },
            ],
            notes: 'Unowned sheet 1',
          };

          const unownedPc2 = {
            id: 'pc_unowned_2',
            name: 'Unclaimed Companion',
            hp: {
              current: stateSample.unownedHp2,
              max: stateSample.unownedHp2,
              temp: 0,
            },
            ac: 15,
            ownership: { ownerType: 'player', playerSlotId: 'slot_p3' },
            resourcePools: [],
            notes: 'Unowned sheet 2',
          };

          const dmNpcPc = {
            id: 'pc_dm_npc',
            name: 'GM Patron',
            hp: { current: 88, max: 88, temp: 10 },
            ac: 19,
            ownership: { ownerType: 'dm' },
            resourcePools: [],
          };

          const initialPcs = [ownedPc, unownedPc1, unownedPc2, dmNpcPc];
          const unownedBeforeBytes = new Map<string, Buffer>([
            ['pc_unowned_1', Buffer.from(JSON.stringify(unownedPc1), 'utf8')],
            ['pc_unowned_2', Buffer.from(JSON.stringify(unownedPc2), 'utf8')],
            ['pc_dm_npc', Buffer.from(JSON.stringify(dmNpcPc), 'utf8')],
          ]);

          const trackerBefore = {
            ...emptyPlayerTrackerState(),
            quests: [
              {
                id: stateSample.privateQuestId,
                title: 'Private Conspiracy Lead',
                notes: 'Keep hidden from GM',
                status: 'active' as const,
                linkedEntityIds: [],
                sharedWithGm: false,
                updatedAt: 1000,
              },
            ],
            journal: [
              {
                id: stateSample.privateJournalId,
                sessionNumber: 1,
                date: '2026-11-10',
                title: 'Private Session Notes',
                content: 'My secret theory',
                sharedWithGm: false,
                updatedAt: 1000,
              },
            ],
            annotations: [
              {
                id: stateSample.privateAnnId,
                entityId: 'npc_public_1',
                entityName: 'Harbormaster',
                privateNotes: 'Private player note',
                sharedWithGm: false,
              },
            ],
          };

          // Campaign state containing non-public (`visibility !== 'public'`) entities & GM secrets
          const arbitraryCampaignData = {
            mode: 'standard',
            gmNotes: stateSample.secretNpcCanary,
            secrets: [stateSample.secretNpcCanary],
            npcs: [
              {
                id: 'npc_hidden',
                name: stateSample.secretNpcCanary,
                visibility: stateSample.nonPublicVis,
                gmNotes: stateSample.secretConfigCanary,
              },
              {
                id: 'npc_public_1',
                name: 'Harbormaster',
                visibility: 'public',
              },
            ],
            locations: [
              {
                id: 'loc_gm_vault',
                name: stateSample.secretConfigCanary,
                visibility: stateSample.nonPublicVis,
              },
            ],
            [WORKSPACE_CONFIG_STATE_KEY]: {
              visibility: stateSample.nonPublicVis,
              terminologyMap: {
                quests: stateSample.secretConfigCanary,
                gold: `Coins [[gm:${stateSample.secretSpoilerCanary}]]`,
              },
              systemFlavorAndTrackers: {
                genre: `Mystery ||${stateSample.secretSpoilerCanary}||`,
                resourcePoolTemplates: [
                  {
                    name: stateSample.secretConfigCanary,
                    max: 6,
                    rechargeOn: 'long',
                    visibility: stateSample.nonPublicVis,
                  },
                ],
              },
            },
            pcs: initialPcs,
          };

          // Conversational player authority (no confirmedShareItemIds!)
          const playerAuthority: WorkspaceAuthorityContext = {
            callerRole: 'player',
            isCampaignOwner: false,
            activeSlotId: stateSample.activeSlotId,
            ownedPcIds: ['pc_owned', 'pc_unowned_1'], // Even overbroad caller hint cannot bypass slot ownership!
            pcs: initialPcs,
            currentTrackerState: trackerBefore,
          };

          const rawConversationalPatch: CampaignWorkspacePatch & Record<string, unknown> = {
            ...(patchSample.mode
              ? {
                  campaignMode: {
                    mode: patchSample.mode,
                    prepTargetOverrides: {
                      secrets: patchSample.secretsTarget,
                      npcs: patchSample.npcsTarget,
                    },
                  },
                }
              : {}),
            gmNotes: stateSample.secretNpcCanary,
            systemFlavorAndTrackers: {
              genre: `Noir [[gm:${stateSample.secretSpoilerCanary}]]`,
              resourcePoolTemplates: [
                {
                  name: patchSample.poolName,
                  max: patchSample.poolMax,
                  rechargeOn: patchSample.rechargeOn,
                },
              ],
            },
            terminologyMap: {
              gold: `${patchSample.goldLabel} [[gm:${stateSample.secretSpoilerCanary}]]`,
              quests: patchSample.questsLabel,
            },
            hudLayoutPrefs: {
              density: patchSample.density,
              widgetOrder: [patchSample.pinnedWidget],
              widgets: {
                [patchSample.pinnedWidget]: { visible: true, pinnedTop: true, order: 0 },
              },
            },
            pcPatches: [
              {
                pcId: patchSample.targetPcChoice,
                updates: {
                  'hp.current': patchSample.attemptedHpCurrent,
                  gmNotes: stateSample.secretNpcCanary,
                },
              },
              {
                pcId: 'pc_unowned_1',
                updates: {
                  'hp.max': patchSample.attemptedUnownedMaxHp,
                  'hp.current': 1,
                },
              },
              {
                pcId: 'pc_owned',
                updates: {
                  inventory: [
                    {
                      ...ownedPc.inventory[0],
                      sharedWithGm: patchSample.flipPrivateNotesToTrue,
                    },
                  ],
                  sharedQuests: patchSample.flipPrivateNotesToTrue
                    ? [
                        {
                          ...trackerBefore.quests[0],
                          sharedWithGm: true,
                        },
                      ]
                    : [],
                },
              },
            ],
            trackerPatch: {
              quests: [
                {
                  ...trackerBefore.quests[0],
                  sharedWithGm: patchSample.flipPrivateNotesToTrue,
                },
              ],
              journal: [
                {
                  ...trackerBefore.journal[0],
                  sharedWithGm: patchSample.flipPrivateNotesToTrue,
                },
              ],
              annotations: [
                {
                  ...trackerBefore.annotations[0],
                  sharedWithGm: patchSample.flipPrivateNotesToTrue,
                },
              ],
            },
          };

          const validated = validateWorkspacePatch(
            rawConversationalPatch,
            playerAuthority,
          );

          // -------------------------------------------------------------------
          // Proof 1: Unowned PC records are byte-for-byte unchanged
          // -------------------------------------------------------------------
          assert.equal(validated.canApplyToCampaign, false);
          for (const writtenPcId of Object.keys(validated.pcWritebacks)) {
            assert.equal(writtenPcId, 'pc_owned');
            for (const [fKey, fVal] of Object.entries(
              validated.pcWritebacks[writtenPcId] ?? {},
            )) {
              assert.ok((PLAYER_EDITABLE_FIELDS as readonly string[]).includes(fKey));
              assert.equal(validatePlayerField(fKey, fVal), true);
            }
          }

          const pcsAfter = applyPlayerWorkspacePatchToPcs(initialPcs, validated);
          for (const [unownedId, expectedBytes] of unownedBeforeBytes.entries()) {
            const afterRecord = pcsAfter.find((p) => p.id === unownedId);
            const actualBytes = Buffer.from(JSON.stringify(afterRecord), 'utf8');
            assert.equal(
              Buffer.compare(expectedBytes, actualBytes),
              0,
              `Unowned PC ${unownedId} mutated!`,
            );
          }

          // -------------------------------------------------------------------
          // Proof 2: GM-redacted fields (`visibility !== 'public'`) NEVER appear
          // in player-facing compiler context, relay prompt, or diff previews
          // -------------------------------------------------------------------
          const playerContextSummary = buildSafeArchitectContextSummary(
            `Campaign [[gm:${stateSample.secretSpoilerCanary}]]`,
            arbitraryCampaignData,
            playerAuthority,
          );
          const relayPrompt = buildArchitectRelayPrompt(
            `Customize HUD ||${stateSample.secretSpoilerCanary}||`,
            [],
            `Campaign [[gm:${stateSample.secretSpoilerCanary}]]`,
            arbitraryCampaignData,
            playerAuthority,
          );
          const playerDiffPreview = buildWorkspacePatchDiff(
            arbitraryCampaignData,
            undefined,
            validated,
          );

          const serializedPlayerSurfaces = JSON.stringify({
            playerContextSummary,
            relayPrompt,
            playerDiffPreview,
          });

          assert.equal(
            serializedPlayerSurfaces.includes(stateSample.secretNpcCanary),
            false,
          );
          assert.equal(
            serializedPlayerSurfaces.includes(stateSample.secretConfigCanary),
            false,
          );
          assert.equal(
            serializedPlayerSurfaces.includes(stateSample.secretSpoilerCanary),
            false,
          );

          // -------------------------------------------------------------------
          // Proof 3: Player private notes (`sharedWithGm: false`) NEVER flip to
          // `true` via a conversational patch
          // -------------------------------------------------------------------
          const appliedTracker = applyValidatedPatchToPlayerTracker(
            trackerBefore,
            validated,
          );
          assert.equal(appliedTracker.nextTracker.quests[0].sharedWithGm, false);
          assert.equal(appliedTracker.nextTracker.journal[0].sharedWithGm, false);
          assert.equal(appliedTracker.nextTracker.annotations[0].sharedWithGm, false);
          assert.equal(
            appliedTracker.outboundSharedWritebacks.sharedQuests.length,
            0,
          );
          assert.equal(
            appliedTracker.outboundSharedWritebacks.sharedJournal.length,
            0,
          );
          assert.equal(
            appliedTracker.outboundSharedWritebacks.sharedAnnotations.length,
            0,
          );

          const ownedOutInv =
            (validated.pcWritebacks.pc_owned?.inventory as Array<{
              sharedWithGm?: boolean;
            }>) ?? [];
          for (const invItem of ownedOutInv) {
            assert.equal(invItem.sharedWithGm, false);
          }
          const ownedOutSharedQuests =
            (validated.pcWritebacks.pc_owned?.sharedQuests as unknown[]) ?? [];
          assert.equal(ownedOutSharedQuests.length, 0);
        },
      ),
      { numRuns: 250 },
    );
  });
});
