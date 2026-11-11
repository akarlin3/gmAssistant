import { beforeEach, describe, expect, it } from 'vitest';
import {
  applyJsonPatch,
  buildKeyValueDiff,
  clearCustomizationHistory,
  commitCustomizationPreview,
  computeJsonPatch,
  createDefaultActiveCustomizationConfig,
  invertJsonPatch,
  isUndoDirective,
  loadCustomizationHistory,
  MAX_CUSTOMIZATION_HISTORY,
  processCustomizationDirective,
  undoLastCustomization,
  validateCustomizationMutation,
} from '@/lib/customization';

describe('Conversational Customization Layer (`lib/customization`)', () => {
  beforeEach(() => {
    clearCustomizationHistory();
    clearCustomizationHistory('camp_alpha');
  });

  describe('RFC 6902 JSON Patch & Structured Key-Value Diff', () => {
    it('generates deterministic add/replace/remove patches, formats [prev -> next] diffs, and inverts cleanly', () => {
      const before = {
        workflow: {
          cruiseCeilingBlocks: 8,
          blockDurationMinutes: 25,
        },
        terminologyMap: {
          hp: 'Hit Points',
          obsoleteKey: 'Legacy',
        },
      };
      const after = {
        workflow: {
          cruiseCeilingBlocks: 12,
          blockDurationMinutes: 25,
        },
        terminologyMap: {
          hp: 'Grit',
          sanity: 'Resolve',
        },
      };

      const patch = computeJsonPatch(before, after);
      expect(patch).toEqual([
        { op: 'replace', path: '/terminologyMap/hp', value: 'Grit' },
        { op: 'remove', path: '/terminologyMap/obsoleteKey' },
        { op: 'add', path: '/terminologyMap/sanity', value: 'Resolve' },
        { op: 'replace', path: '/workflow/cruiseCeilingBlocks', value: 12 },
      ]);

      const applied = applyJsonPatch(before, patch);
      expect(applied).toEqual(after);
      // Original state is never mutated in place
      expect(before.workflow.cruiseCeilingBlocks).toBe(8);

      const kvDiff = buildKeyValueDiff(before, after, patch);
      const cruiseDiff = kvDiff.find(
        (d) => d.path === '/workflow/cruiseCeilingBlocks',
      );
      expect(cruiseDiff?.formatted).toBe('[8 -> 12]');

      const inverse = invertJsonPatch(before, patch);
      const rolledBack = applyJsonPatch(applied, inverse);
      expect(rolledBack).toEqual(before);
    });

    it('blocks prototype-pollution JSON Pointer segments', () => {
      const target = { safe: true };
      expect(() =>
        applyJsonPatch(target, [
          { op: 'add', path: '/__proto__/polluted', value: 'yes' },
        ]),
      ).toThrow(/Forbidden prototype-pollution segment/);
    });
  });

  describe('Strict Domain Guardrails & Invariants', () => {
    it('enforces block durations strictly between 5 and 60 minutes', () => {
      expect(
        validateCustomizationMutation({
          workflow: { blockDurationMinutes: 4 },
        }).valid,
      ).toBe(false);

      expect(
        validateCustomizationMutation({
          workflow: { blockDurationMinutes: 61 },
        }).valid,
      ).toBe(false);

      expect(
        validateCustomizationMutation({
          workflow: { blockDurationMinutes: 5 },
        }).valid,
      ).toBe(true);

      expect(
        validateCustomizationMutation({
          workflow: { blockDurationMinutes: 60 },
        }).valid,
      ).toBe(true);
    });

    it('validates channel and pillar enum keys and rejects unknown values', () => {
      const validRes = validateCustomizationMutation({
        workflow: {
          activePillars: ['combat', 'mystery'],
          channels: [{ key: 'Guitar', sticky: true, blockMinutes: 30 }],
        },
      });
      expect(validRes.valid).toBe(true);

      const badChannel = validateCustomizationMutation({
        workflow: {
          channels: [{ key: 'InvalidChannelName', sticky: true }],
        },
      });
      expect(badChannel.valid).toBe(false);

      const badPillar = validateCustomizationMutation({
        workflow: {
          activePillars: ['astrology'],
        },
      });
      expect(badPillar.valid).toBe(false);
    });

    it('rejects destructive list wipes and protected GM secret keys', () => {
      const existing = createDefaultActiveCustomizationConfig();
      existing.houseRules = [
        {
          id: 'rule_flanking',
          title: 'Flanking',
          category: 'combat',
          ruleText: '+2 melee bonus when flanking.',
          enabled: true,
        },
      ];

      const emptyWipe = validateCustomizationMutation(
        { houseRules: [] },
        { existingConfig: existing },
      );
      expect(emptyWipe.valid).toBe(false);

      const opWipe = validateCustomizationMutation({
        op: 'delete_all',
        workflow: { cruiseCeilingBlocks: 10 },
      });
      expect(opWipe.valid).toBe(false);

      const secretInjection = validateCustomizationMutation({
        gmNotes: 'leak',
        workflow: { cruiseCeilingBlocks: 10 },
      });
      expect(secretInjection.valid).toBe(false);
      expect(secretInjection.strippedKeys).toContain('gmNotes');
    });

    it('enforces GM vs Player authority boundaries', () => {
      const playerAttempt = validateCustomizationMutation(
        {
          houseRules: [
            {
              id: 'rule_flanking',
              title: 'Flanking',
              category: 'combat',
              ruleText: 'Allies flanking gain advantage.',
              enabled: true,
            },
          ],
        },
        { role: 'player', isCampaignOwner: false },
      );
      expect(playerAttempt.valid).toBe(false);
      expect(playerAttempt.violations.join(' ')).toMatch(/Players cannot/i);

      const playerLocalHud = validateCustomizationMutation(
        {
          hudLayoutPrefs: { density: 'compact' },
          terminologyMap: { hp: 'Resolve' },
        },
        { role: 'player', isCampaignOwner: false },
      );
      expect(playerLocalHud.valid).toBe(true);
    });
  });

  describe('Natural-Language Preview Pipeline & Non-Destructive State Merge', () => {
    it('parses Cruise ceiling + Guitar sticky channel into a preview without mutating live config', async () => {
      const liveConfig = createDefaultActiveCustomizationConfig();
      const snapshotBefore = JSON.stringify(liveConfig);

      const preview = await processCustomizationDirective({
        directive:
          'Change my default Cruise ceiling to 12 blocks and move Guitar to a sticky channel',
        currentConfig: liveConfig,
        role: 'gm',
        isCampaignOwner: true,
      });

      // Live config untouched before explicit commit!
      expect(JSON.stringify(liveConfig)).toBe(snapshotBefore);

      expect(preview.status).toBe('preview_ready');
      expect(preview.actions.canApply).toBe(true);
      expect(preview.previewConfig.workflow.cruiseCeilingBlocks).toBe(12);
      expect(
        preview.previewConfig.workflow.channels.find((c) => c.key === 'Guitar'),
      ).toEqual({ key: 'Guitar', sticky: true });
      // Existing default channels preserved non-destructively
      expect(
        preview.previewConfig.workflow.channels.some(
          (c) => c.key === 'initiative',
        ),
      ).toBe(true);
      expect(preview.jsonPatch.length).toBeGreaterThanOrEqual(2);
      expect(
        preview.keyValueDiff.some((d) => d.formatted === '[8 -> 12]'),
      ).toBe(true);
    });

    it('appends custom house rules non-destructively alongside existing campaign rules', async () => {
      const liveConfig = createDefaultActiveCustomizationConfig();
      liveConfig.houseRules = [
        {
          id: 'rule_bonus_action_potions',
          title: 'Bonus Action Healing Potions',
          category: 'combat',
          ruleText: 'Self-drinking a healing potion uses a Bonus Action.',
          enabled: true,
        },
      ];

      const preview = await processCustomizationDirective({
        directive: 'Add a custom house rule for flanking in this campaign',
        currentConfig: liveConfig,
      });

      expect(preview.status).toBe('preview_ready');
      expect(preview.previewConfig.houseRules).toHaveLength(2);
      expect(preview.previewConfig.houseRules[0].id).toBe(
        'rule_bonus_action_potions',
      );
      expect(preview.previewConfig.houseRules[1].id).toBe('rule_flanking');
      // Original array untouched
      expect(liveConfig.houseRules).toHaveLength(1);
    });
  });

  describe('10-Entry `customization_history` Ring Buffer & Undo Flow', () => {
    it('caps customization_history at exactly 10 mutations and supports single-click + conversational undo', async () => {
      expect(MAX_CUSTOMIZATION_HISTORY).toBe(10);
      expect(isUndoDirective('undo last change')).toBe(true);
      expect(isUndoDirective('Revert previous tweak')).toBe(true);

      let state = createDefaultActiveCustomizationConfig();

      // Commit 12 distinct mutations (Cruise ceiling 9..20)
      for (let ceiling = 9; ceiling <= 20; ceiling += 1) {
        const preview = await processCustomizationDirective({
          directive: `Change my default Cruise ceiling to ${ceiling} blocks`,
          currentConfig: state,
          scopeKey: 'camp_alpha',
        });
        const committed = commitCustomizationPreview(state, preview, {
          scopeKey: 'camp_alpha',
        });
        state = committed.nextConfig;
      }

      expect(state.workflow.cruiseCeilingBlocks).toBe(20);
      const history = loadCustomizationHistory('camp_alpha');
      expect(history).toHaveLength(10);
      // Oldest 2 (ceilings 9 and 10) evicted; oldest retained had afterState ceiling = 11
      expect(history[0].directive).toContain('11 blocks');
      expect(history[9].directive).toContain('20 blocks');

      // 1. Conversational undo ("undo last change")
      const undoPreview = await processCustomizationDirective({
        directive: 'undo last change',
        currentConfig: state,
        scopeKey: 'camp_alpha',
      });
      expect(undoPreview.status).toBe('undo_ready');
      expect(undoPreview.intent).toBe('undo');
      expect(undoPreview.previewConfig.workflow.cruiseCeilingBlocks).toBe(19);

      const afterConversationalUndo = commitCustomizationPreview(
        state,
        undoPreview,
        { scopeKey: 'camp_alpha' },
      );
      state = afterConversationalUndo.nextConfig;
      expect(state.workflow.cruiseCeilingBlocks).toBe(19);
      expect(afterConversationalUndo.history).toHaveLength(9);

      // 2. Direct single-click undo helper
      const directUndo = undoLastCustomization(state, 'camp_alpha');
      expect(directUndo.undone).toBe(true);
      expect(directUndo.nextConfig.workflow.cruiseCeilingBlocks).toBe(18);
      expect(directUndo.history).toHaveLength(8);
    });
  });
});
