import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  applyPlayerWorkspacePatchToPcs,
  applyValidatedPatchToPlayerTracker,
  applyWorkspacePatchToCampaignData,
  buildArchitectRelayPrompt,
  buildSafeArchitectContextSummary,
  buildWorkspacePatchDiff,
  projectPublicWorkspaceConfig,
  scrubUntrustedObject,
  validateWorkspacePatch,
  WORKSPACE_CONFIG_STATE_KEY,
  type HudWidgetId,
  type WorkspaceAuthorityContext,
} from '@/lib/workspaceConfigCompiler';
import { PLAYER_EDITABLE_FIELDS, validatePlayerField } from '@/lib/player/allowlist';
import { emptyPlayerTrackerState } from '@/lib/playerMode/playerTrackerStorage';

const GM_REDACTED_KEYS = [
  'gmNotes',
  'gmSecrets',
  'gmSpoiler',
  'gmOnly',
  'secretNotes',
  'entityVisibility',
  'planningVisibility',
  'tokenHash',
  'tokenSalt',
  'fieldOverrides',
] as const;

const NON_EDITABLE_PC_FIELDS = [
  'ownership',
  'id',
  'gmNotes',
  'className',
  'level',
  'maxHp',
  'stats',
  'proficiencyBonus',
  'entityVisibility',
] as const;

describe('workspaceConfigCompiler — fast-check CRDT & Privacy Authority Invariants', () => {
  it('Property 1: Non-owner / player sessions NEVER emit campaign-wide patches and cannot apply to campaign state', () => {
    fc.assert(
      fc.property(
        fc.record({
          role: fc.constantFrom<'gm' | 'player'>('gm', 'player'),
          isCampaignOwner: fc.boolean(),
          mode: fc.constantFrom('standard', 'duet', 'solo', 'player'),
          secretsCount: fc.integer({ min: 0, max: 30 }),
          genre: fc.string({ minLength: 1, maxLength: 30 }),
          goldTerm: fc.stringMatching(/^[A-Za-z]{2,16}$/),
          density: fc.constantFrom('compact', 'comfortable', 'spacious'),
        }),
        (sample) => {
          // Force non-owner OR player role
          const isCampaignOwner = sample.role === 'player' ? sample.isCampaignOwner : false;
          const authority: WorkspaceAuthorityContext = {
            role: sample.role,
            isCampaignOwner,
            activeSlotId: 'slot_player_1',
            ownedPcIds: ['pc_owned'],
            pcs: [
              {
                id: 'pc_owned',
                name: 'Aria',
                ownership: { ownerType: 'player', playerSlotId: 'slot_player_1' },
                resourcePools: [],
              },
            ],
          };

          const rawPatch = {
            campaignMode: {
              mode: sample.mode,
              prepTargetOverrides: { secrets: sample.secretsCount },
            },
            systemFlavorAndTrackers: {
              genre: sample.genre,
              toneTags: ['Noir'],
              clockCategories: ['Alert'],
              resourcePoolTemplates: [{ name: 'Sanity', max: 10, rechargeOn: 'manual' }],
            },
            terminologyMap: { gold: sample.goldTerm },
            hudLayoutPrefs: { density: sample.density },
          };

          const validated = validateWorkspacePatch(rawPatch, authority);
          expect(validated.canApplyToCampaign).toBe(false);
          expect(Object.keys(validated.campaignPatch)).toHaveLength(0);
          expect(() =>
            applyWorkspacePatchToCampaignData({ mode: 'standard' }, validated),
          ).toThrow();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 2: validateWorkspacePatch NEVER mutates unowned PC slots and restricts owned PCs strictly to allowlist fields', () => {
    fc.assert(
      fc.property(
        fc.record({
          activeSlotId: fc.constantFrom('slot_alice', 'slot_bob'),
          targetPcId: fc.constantFrom('pc_alice', 'pc_bob', 'pc_dm', 'pc_ghost'),
          attemptedHp: fc.integer({ min: 0, max: 120 }),
          nonEditableField: fc.constantFrom(...NON_EDITABLE_PC_FIELDS),
          poolMax: fc.integer({ min: 1, max: 50 }),
        }),
        ({ activeSlotId, targetPcId, attemptedHp, nonEditableField, poolMax }) => {
          const pcs = [
            {
              id: 'pc_alice',
              name: 'Alice PC',
              ownership: { ownerType: 'player', playerSlotId: 'slot_alice' },
              resourcePools: [],
            },
            {
              id: 'pc_bob',
              name: 'Bob PC',
              ownership: { ownerType: 'player', playerSlotId: 'slot_bob' },
              resourcePools: [],
            },
            {
              id: 'pc_dm',
              name: 'DM Guide NPC',
              ownership: { ownerType: 'dm' },
              resourcePools: [],
            },
          ];

          const expectedOwnedId = activeSlotId === 'slot_alice' ? 'pc_alice' : 'pc_bob';
          const authority: WorkspaceAuthorityContext = {
            role: 'player',
            isCampaignOwner: false,
            activeSlotId,
            ownedPcIds: [expectedOwnedId, 'pc_dm', 'pc_bob', 'pc_alice'], // Even if caller passes overbroad ownedPcIds, source `pcs` ownership wins!
            pcs,
          };

          const rawPatch = {
            systemFlavorAndTrackers: {
              resourcePoolTemplates: [
                { name: 'Resolve', max: poolMax, rechargeOn: 'short' },
              ],
            },
            pcPatches: [
              {
                pcId: targetPcId,
                updates: {
                  'hp.current': attemptedHp,
                  [nonEditableField]: 'FORBIDDEN_MUTATION',
                },
              },
            ],
          };

          const validated = validateWorkspacePatch(rawPatch, authority);

          // 1. Only `expectedOwnedId` can ever appear in `pcWritebacks`
          for (const emittedPcId of Object.keys(validated.pcWritebacks)) {
            expect(emittedPcId).toBe(expectedOwnedId);
          }

          // 2. If `targetPcId` was unowned, it must be recorded in `blockedPcIds` and absent from `pcWritebacks`
          if (targetPcId !== expectedOwnedId) {
            expect(validated.blockedPcIds).toContain(targetPcId);
            expect(validated.pcWritebacks[targetPcId]).toBeUndefined();
          }

          // 3. Owned PC positively receives resourcePools and every emitted field passes validatePlayerField === true
          const ownedFields = validated.pcWritebacks[expectedOwnedId] ?? {};
          expect(Array.isArray(ownedFields.resourcePools)).toBe(true);
          for (const [fieldKey, fieldVal] of Object.entries(ownedFields)) {
            expect(PLAYER_EDITABLE_FIELDS as readonly string[]).toContain(fieldKey);
            expect(validatePlayerField(fieldKey, fieldVal)).toBe(true);
          }
          expect(ownedFields).not.toHaveProperty(nonEditableField);
        },
      ),
      { numRuns: 120 },
    );
  });

  it('Property 3: Never exposes GM-redacted fields, [[gm:...]] spoilers, or secretRoll events across patches, projections, or prompts', () => {
    fc.assert(
      fc.property(
        fc.record({
          redactedKey: fc.constantFrom(...GM_REDACTED_KEYS),
          secretCanary: fc.stringMatching(/^CANARY_[A-Z0-9]{6,14}$/),
          publicLabel: fc.stringMatching(/^[A-Za-z]{3,12}$/),
        }),
        ({ redactedKey, secretCanary, publicLabel }) => {
          const authority: WorkspaceAuthorityContext = {
            role: 'player',
            isCampaignOwner: false,
            activeSlotId: 'slot_1',
            ownedPcIds: ['pc_1'],
            pcs: [
              {
                id: 'pc_1',
                name: `Hero [[gm:${secretCanary}]]`,
                ownership: { ownerType: 'player', playerSlotId: 'slot_1' },
                [redactedKey]: secretCanary,
              },
            ],
          };

          const untrustedPayload = {
            [redactedKey]: secretCanary,
            terminologyMap: {
              quests: `${publicLabel} [[gm:${secretCanary}]]`,
              [redactedKey]: secretCanary,
            },
            pcPatches: [
              {
                pcId: 'pc_1',
                updates: {
                  [redactedKey]: secretCanary,
                  rollEvents: [
                    {
                      id: 'r_secret',
                      timestamp: 1000,
                      rollerName: 'Hero',
                      label: secretCanary,
                      formula: '1d20',
                      mode: 'normal',
                      keptDice: [15],
                      allDice: [15],
                      modifier: 0,
                      total: 15,
                      secretRoll: true,
                    },
                    {
                      id: 'r_public',
                      timestamp: 1001,
                      rollerName: 'Hero',
                      label: 'Perception',
                      formula: '1d20',
                      mode: 'normal',
                      keptDice: [12],
                      allDice: [12],
                      modifier: 2,
                      total: 14,
                      secretRoll: false,
                    },
                  ],
                },
              },
            ],
          };

          const scrubbed = scrubUntrustedObject(untrustedPayload, { stripSpoilers: true });
          expect(JSON.stringify(scrubbed)).not.toContain(`"${redactedKey}"`);

          const validated = validateWorkspacePatch(untrustedPayload, authority);
          expect(JSON.stringify(validated.localTerminologyMap ?? {})).not.toContain(
            secretCanary,
          );
          expect(JSON.stringify(validated.pcWritebacks)).not.toContain(secretCanary);

          const campaignDataWithSecrets = {
            [redactedKey]: secretCanary,
            gmSecrets: [secretCanary],
            [WORKSPACE_CONFIG_STATE_KEY]: {
              terminologyMap: {
                quests: `${publicLabel} [[gm:${secretCanary}]]`,
              },
              systemFlavorAndTrackers: {
                genre: `Noir ||${secretCanary}||`,
              },
            },
          };

          const projected = projectPublicWorkspaceConfig(campaignDataWithSecrets);
          expect(JSON.stringify(projected)).not.toContain(secretCanary);

          const promptSummary = buildSafeArchitectContextSummary(
            `Campaign [[gm:${secretCanary}]]`,
            campaignDataWithSecrets,
            authority,
          );
          expect(JSON.stringify(promptSummary)).not.toContain(secretCanary);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Property 4: Never flips sharedWithGm: false player notes/quests/journal/inventory to true without explicit item-level confirmation', () => {
    fc.assert(
      fc.property(
        fc.record({
          questId: fc.stringMatching(/^q_[a-z0-9]{3,10}$/),
          journalId: fc.stringMatching(/^j_[a-z0-9]{3,10}$/),
          itemId: fc.stringMatching(/^inv_[a-z0-9]{3,10}$/),
          annKey: fc.stringMatching(/^npc_[a-z0-9]{3,10}$/),
          confirmQuest: fc.boolean(),
          confirmJournal: fc.boolean(),
          confirmInventory: fc.boolean(),
          confirmAnnotation: fc.boolean(),
          role: fc.constantFrom<'gm' | 'player'>('gm', 'player'),
        }),
        ({
          questId,
          journalId,
          itemId,
          annKey,
          confirmQuest,
          confirmJournal,
          confirmInventory,
          confirmAnnotation,
          role,
        }) => {
          const baseTracker = {
            ...emptyPlayerTrackerState(),
            quests: [
              {
                id: questId,
                title: 'Secret Personal Goal',
                notes: 'Do not tell GM yet',
                status: 'active' as const,
                linkedEntityIds: [],
                sharedWithGm: false,
                updatedAt: 1000,
              },
            ],
            journal: [
              {
                id: journalId,
                sessionNumber: 1,
                date: '2026-01-01',
                title: 'Private Diary',
                content: 'Suspect the patron',
                sharedWithGm: false,
                updatedAt: 1000,
              },
            ],
            annotations: [
              {
                id: annKey,
                entityId: annKey,
                entityType: 'npcs',
                entityName: 'Patron',
                privateNotes: 'Private suspicion',
                sharedWithGm: false,
              },
            ],
          };

          const confirmedIds: string[] = [];
          if (confirmQuest) confirmedIds.push(questId);
          if (confirmJournal) confirmedIds.push(journalId);
          if (confirmInventory) confirmedIds.push(itemId);
          if (confirmAnnotation) confirmedIds.push(annKey);

          const authority: WorkspaceAuthorityContext = {
            role,
            isCampaignOwner: role === 'gm',
            activeSlotId: role === 'player' ? 'slot_1' : undefined,
            ownedPcIds: ['pc_1'],
            pcs: [
              {
                id: 'pc_1',
                name: 'Lyra',
                ownership: { ownerType: 'player', playerSlotId: 'slot_1' },
                inventory: [
                  {
                    id: itemId,
                    name: 'Hidden Locket',
                    qty: 1,
                    weight: 0.5,
                    equipped: false,
                    attuned: false,
                    notes: 'Private heirloom',
                    sharedWithGm: false,
                  },
                ],
              },
            ],
            currentTrackerState: baseTracker,
            confirmedShareItemIds: confirmedIds,
          };

          // Untrusted LLM patch attempts to flip ALL private items to `sharedWithGm: true`
          const adversarialPatch = {
            trackerPatch: {
              quests: [{ ...baseTracker.quests[0], sharedWithGm: true }],
              journal: [{ ...baseTracker.journal[0], sharedWithGm: true }],
              annotations: [{ ...baseTracker.annotations[0], sharedWithGm: true }],
            },
            pcPatches: [
              {
                pcId: 'pc_1',
                updates: {
                  inventory: [
                    {
                      id: itemId,
                      name: 'Hidden Locket',
                      qty: 1,
                      weight: 0.5,
                      equipped: false,
                      attuned: false,
                      notes: 'Private heirloom',
                      sharedWithGm: true,
                    },
                  ],
                  sharedQuests: [
                    {
                      id: questId,
                      title: 'Secret Personal Goal',
                      status: 'active',
                      notes: 'Leaked!',
                      linkedEntityIds: [],
                      updatedAt: 2000,
                    },
                  ],
                },
              },
            ],
          };

          const validated = validateWorkspacePatch(adversarialPatch, authority);
          const applied = applyValidatedPatchToPlayerTracker(baseTracker, validated);

          // Quest share invariant
          expect(applied.nextTracker.quests[0].sharedWithGm).toBe(confirmQuest);
          if (!confirmQuest) {
            expect(applied.outboundSharedWritebacks.sharedQuests).toHaveLength(0);
            expect(
              (validated.pcWritebacks['pc_1']?.sharedQuests as any[]) ?? [],
            ).toHaveLength(0);
          }

          // Journal share invariant
          expect(applied.nextTracker.journal[0].sharedWithGm).toBe(confirmJournal);
          if (!confirmJournal) {
            expect(applied.outboundSharedWritebacks.sharedJournal).toHaveLength(0);
          }

          // Annotation share invariant
          expect(applied.nextTracker.annotations[0].sharedWithGm).toBe(
            confirmAnnotation,
          );
          if (!confirmAnnotation) {
            expect(applied.outboundSharedWritebacks.sharedAnnotations).toHaveLength(0);
          }

          // Inventory item share invariant
          const outInv = (validated.pcWritebacks['pc_1']?.inventory as any[]) ?? [];
          if (outInv.length > 0) {
            expect(outInv[0].sharedWithGm).toBe(confirmInventory);
          }
        },
      ),
      { numRuns: 120 },
    );
  });

  it('Property 5 (250 runs): Unified authority proof — unowned PCs byte-identical, non-public GM fields absent from context & diffs, and sharedWithGm: false never flips conversationally', () => {
    const widgetArb = fc.constantFrom<HudWidgetId>(
      'initiative',
      'rollFeed',
      'clocks',
      'audioNarration',
      'actionEconomy',
      'conspiracyBoard',
    );
    const nonPublicVisArb = fc.constantFrom('gm', 'hidden', 'private', 'secret');
    const canaryArb = fc.stringMatching(/^REDACTED_[A-Z0-9]{8,12}$/);
    const labelArb = fc.stringMatching(/^[A-Za-z][A-Za-z0-9]{2,10}$/);

    fc.assert(
      fc.property(
        fc.record({
          nonPublicVis: nonPublicVisArb,
          canaryEntity: canaryArb,
          canaryConfig: canaryArb,
          canarySpoiler: canaryArb,
          poolName: labelArb,
          poolMax: fc.integer({ min: 1, max: 50 }),
          goldTerm: labelArb,
          pinnedWidget: widgetArb,
          ownedHpCur: fc.integer({ min: 1, max: 40 }),
          unownedMaxHpAttempt: fc.integer({ min: 80, max: 999 }),
          attemptShareFlip: fc.boolean(),
        }),
        (s) => {
          const ownedPc = {
            id: 'pc_claimed',
            name: `Scout [[gm:${s.canarySpoiler}]]`,
            hp: { current: 30, max: 30, temp: 0 },
            ownership: { ownerType: 'player', playerSlotId: 'slot_claimed' },
            gmNotes: s.canaryEntity,
            resourcePools: [
              {
                id: 'gm_hidden_pool',
                name: s.canaryConfig,
                current: 2,
                max: 2,
                rechargeOn: 'long',
                visibility: s.nonPublicVis,
              },
            ],
            inventory: [
              {
                id: 'inv_secret_note',
                name: 'Encrypted Ledger',
                qty: 1,
                sharedWithGm: false,
              },
            ],
          };
          const unownedPc = {
            id: 'pc_other',
            name: 'Paladin',
            hp: { current: 52, max: 52, temp: 4 },
            ac: 18,
            ownership: { ownerType: 'player', playerSlotId: 'slot_other' },
            resourcePools: [],
          };
          const unownedBeforeBytes = Buffer.from(JSON.stringify(unownedPc), 'utf8');

          const trackerState = {
            ...emptyPlayerTrackerState(),
            quests: [
              {
                id: 'q_private',
                title: 'Personal Lead',
                notes: 'Keep private',
                status: 'active' as const,
                linkedEntityIds: [],
                sharedWithGm: false,
                updatedAt: 1000,
              },
            ],
            annotations: [
              {
                id: 'ann_private',
                entityId: 'npc_pub',
                entityName: 'Innkeeper',
                privateNotes: 'Private theory',
                sharedWithGm: false,
              },
            ],
          };

          const campaignData = {
            mode: 'standard',
            npcs: [
              {
                id: 'npc_gm_only',
                name: s.canaryEntity,
                visibility: s.nonPublicVis,
              },
            ],
            [WORKSPACE_CONFIG_STATE_KEY]: {
              visibility: s.nonPublicVis,
              terminologyMap: { quests: s.canaryConfig },
            },
            pcs: [ownedPc, unownedPc],
          };

          const authority: WorkspaceAuthorityContext = {
            callerRole: 'player',
            isCampaignOwner: false,
            activeSlotId: 'slot_claimed',
            ownedPcIds: ['pc_claimed'],
            pcs: [ownedPc, unownedPc],
            currentTrackerState: trackerState,
          };

          const patchPayload = {
            campaignMode: { mode: 'duet', prepTargetOverrides: { secrets: 8 } },
            systemFlavorAndTrackers: {
              resourcePoolTemplates: [
                { name: s.poolName, max: s.poolMax, rechargeOn: 'manual' },
              ],
            },
            terminologyMap: {
              gold: `${s.goldTerm} [[gm:${s.canarySpoiler}]]`,
            },
            hudLayoutPrefs: {
              widgetOrder: [s.pinnedWidget],
              widgets: { [s.pinnedWidget]: { visible: true, pinnedTop: true } },
            },
            pcPatches: [
              {
                pcId: 'pc_claimed',
                updates: {
                  'hp.current': s.ownedHpCur,
                  inventory: [
                    { ...ownedPc.inventory[0], sharedWithGm: s.attemptShareFlip },
                  ],
                },
              },
              {
                pcId: 'pc_other',
                updates: { 'hp.max': s.unownedMaxHpAttempt },
              },
            ],
            trackerPatch: {
              quests: [{ ...trackerState.quests[0], sharedWithGm: s.attemptShareFlip }],
              annotations: [
                { ...trackerState.annotations[0], sharedWithGm: s.attemptShareFlip },
              ],
            },
          };

          const validated = validateWorkspacePatch(patchPayload, authority);

          // 1. Unowned PC byte-for-byte unchanged
          const afterPcs = applyPlayerWorkspacePatchToPcs(
            [ownedPc, unownedPc],
            validated,
          );
          const unownedAfterBytes = Buffer.from(JSON.stringify(afterPcs[1]), 'utf8');
          expect(Buffer.compare(unownedBeforeBytes, unownedAfterBytes)).toBe(0);

          // 2. Non-public (`visibility !== 'public'`) fields absent from context & diff previews
          const ctx = buildSafeArchitectContextSummary(
            `Table [[gm:${s.canarySpoiler}]]`,
            campaignData,
            authority,
          );
          const prompt = buildArchitectRelayPrompt(
            'Update HUD',
            [],
            'Table',
            campaignData,
            authority,
          );
          const diffs = buildWorkspacePatchDiff(campaignData, undefined, validated);
          const combined = JSON.stringify({ ctx, prompt, diffs });
          expect(combined).not.toContain(s.canaryEntity);
          expect(combined).not.toContain(s.canaryConfig);
          expect(combined).not.toContain(s.canarySpoiler);

          // 3. Private notes (`sharedWithGm: false`) never flip to `true`
          const nextTracker = applyValidatedPatchToPlayerTracker(
            trackerState,
            validated,
          );
          expect(nextTracker.nextTracker.quests[0].sharedWithGm).toBe(false);
          expect(nextTracker.nextTracker.annotations[0].sharedWithGm).toBe(false);
          const outInv = (validated.pcWritebacks['pc_claimed']?.inventory as any[]) ?? [];
          expect(outInv[0]?.sharedWithGm).toBe(false);
        },
      ),
      { numRuns: 250 },
    );
  });
});
