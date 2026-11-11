import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeWorldClockState,
  advanceWorldClock,
  advanceToNextDawn,
  rechargeDawnPoolsForParty,
  addPresetTimer,
  addCustomTimer,
  computeTimeOfDayBadge,
  formatInWorldDate,
  projectWorldClockForPlayers,
} from '../worldClock';
import {
  MAX_VAULT_SNAPSHOTS,
  pushToSnapshotRing,
  captureVaultSnapshot,
  getVaultSnapshotsSync,
  restoreVaultSnapshot,
  computeSnapshotDiff,
  clearVaultSnapshots,
  type CampaignSnapshotRecord,
} from '../snapshotVault';
import {
  buildGeminiBridgePrompt,
  stripMarkdownCodeFences,
  validateAndParseGeminiBridgeJson,
  applyGeminiBridgePayload,
} from '../geminiCampaignBridge';
import { formatSpokenTextWithMentions } from '../tabletopErgonomics';
import { newPc } from '../pc/factory';

describe('worldClock: duration expiry & automated dawn pool recharges', () => {
  it('computes all 5 time-of-day badges, custom calendar/day labels, and party/private visibility round-trips', () => {
    assert.equal(computeTimeOfDayBadge(6 * 3600), 'Dawn');
    assert.equal(computeTimeOfDayBadge(9 * 3600), 'Morning');
    assert.equal(computeTimeOfDayBadge(14 * 3600), 'Afternoon');
    assert.equal(computeTimeOfDayBadge(19 * 3600), 'Dusk');
    assert.equal(computeTimeOfDayBadge(23 * 3600), 'Night');

    const customClock = normalizeWorldClockState({
      currentDay: 12,
      timeOfDaySeconds: 18 * 3600,
      visibleToParty: true,
      calendar: {
        calendarName: 'Barovian Lunar Reckoning',
        customDayLabel: 'Blood Moon Eve',
        monthNames: ['Mistfall'],
        daysPerMonth: 30,
      },
    });
    assert.equal(customClock.timeOfDay, 'Dusk');
    assert.equal(customClock.visibleToParty, true);
    assert.equal(customClock.visibility, 'party');
    const formatted = formatInWorldDate(customClock);
    assert.ok(formatted.includes('Blood Moon Eve'));
    assert.ok(formatted.includes('Barovian Lunar Reckoning'));
    assert.ok(projectWorldClockForPlayers({ worldClock: customClock }));

    const toggledPrivate = normalizeWorldClockState({
      ...customClock,
      visibleToParty: false,
      visibility: 'private',
    });
    assert.equal(toggledPrivate.visibleToParty, false);
    assert.equal(toggledPrivate.visibility, 'private');
    assert.equal(projectWorldClockForPlayers({ worldClock: toggledPrivate }), undefined);
  });

  it('tracks exploration timers (Torch 60m, Light 60m, Mage Armor 8h) and alerts immediately on expiry', () => {
    let clock = normalizeWorldClockState({
      elapsedSeconds: 8 * 3600, // 08:00 Morning
      visibility: 'party',
    });
    assert.equal(computeTimeOfDayBadge(clock.elapsedSeconds), 'Morning');

    clock = addPresetTimer(clock, 'torch', 'Explorer');
    clock = addPresetTimer(clock, 'light', 'Cleric');
    clock = addPresetTimer(clock, 'mage_armor', 'Wizard');
    clock = addCustomTimer(clock, 'Poison Mist', 10);
    assert.equal(clock.timers.length, 4);

    // Advance +10m (Dungeon Turn = 600s) -> Poison Mist (10m) expires; Torch & Light have 50m remaining
    const turnStep = advanceWorldClock(clock, 600, []);
    assert.equal(turnStep.expiredTimers.length, 1);
    assert.equal(turnStep.expiredTimers[0].label, 'Poison Mist');
    assert.equal(turnStep.nextClock.timers.length, 3);

    // Advance +1 Hour (3600s) -> Torch (60m) and Light (60m) expire; Mage Armor (8h) remains active
    const hourStep = advanceWorldClock(turnStep.nextClock, 3600, []);
    assert.equal(hourStep.expiredTimers.length, 2);
    const expiredLabels = hourStep.expiredTimers.map((t) => t.label).sort();
    assert.deepEqual(expiredLabels, ['Light — 60m', 'Torch — 60m']);
    assert.equal(hourStep.nextClock.timers.length, 1);
    assert.equal(hourStep.nextClock.timers[0].label, 'Mage Armor — 8h');

    // Advance +7 Hours -> Mage Armor expires
    const sevenHoursStep = advanceWorldClock(hourStep.nextClock, 7 * 3600, []);
    assert.equal(sevenHoursStep.expiredTimers.length, 1);
    assert.equal(sevenHoursStep.expiredTimers[0].label, 'Mage Armor — 8h');
    assert.equal(sevenHoursStep.nextClock.timers.length, 0);
  });

  it('recharges all party PC resource pools marked rechargeOn: "dawn" when advancing past Dawn (+1 Day)', () => {
    const pc1 = newPc({
      id: 'pc-aria',
      name: 'Aria',
      resourcePools: [
        { id: 'pool-staff', name: 'Staff of Power', current: 1, max: 10, rechargeOn: 'dawn' },
        { id: 'pool-ki', name: 'Ki Points', current: 0, max: 5, rechargeOn: 'short' },
      ],
    });
    const pc2 = newPc({
      id: 'pc-bram',
      name: 'Bram',
      resourcePools: [
        { id: 'pool-cloak', name: 'Cloak of Stars', current: 0, max: 3, rechargeOn: 'dawn' },
      ],
    });

    const clock = normalizeWorldClockState({
      elapsedSeconds: 14 * 3600, // Day 1, 14:00
    });

    const result = advanceToNextDawn(clock, [pc1, pc2]);
    assert.equal(result.dawnCrossed, true);
    assert.equal(result.promptFactionClocksAndDowntime, true);
    assert.equal(result.nextClock.currentDay, 2);
    assert.equal(result.nextClock.timeOfDay, 'Dawn');
    assert.equal(result.rechargedPools.length, 2);

    const updatedAria = result.updatedPcs.find((p) => p.id === 'pc-aria')!;
    const updatedBram = result.updatedPcs.find((p) => p.id === 'pc-bram')!;

    assert.equal((updatedAria.resourcePools ?? []).find((r) => r.id === 'pool-staff')!.current, 10);
    // Short-rest pool is untouched by dawn trigger
    assert.equal((updatedAria.resourcePools ?? []).find((r) => r.id === 'pool-ki')!.current, 0);
    assert.equal((updatedBram.resourcePools ?? []).find((r) => r.id === 'pool-cloak')!.current, 3);

    // Direct helper check when already full
    const secondCheck = rechargeDawnPoolsForParty(result.updatedPcs);
    assert.equal(secondCheck.recharged.length, 0);
  });
});

describe('snapshotVault: 7-snapshot rolling ring buffer rotation & diff restore', () => {
  it('rotates the ring buffer strictly at MAX_VAULT_SNAPSHOTS (7) and restores state accurately', () => {
    const campId = 'test-vault-camp';
    clearVaultSnapshots(campId);

    for (let i = 1; i <= 10; i++) {
      captureVaultSnapshot({
        campaignId: campId,
        campaignName: 'Vault Campaign',
        reason: 'manual_checkpoint',
        label: `Checkpoint #${i}`,
        data: {
          npcs: Array.from({ length: i }, (_, idx) => ({ id: `npc-${idx}`, name: `NPC ${idx}` })),
          versionCounter: i,
        },
        now: 1000 + i * 100,
      });
    }

    const stored = getVaultSnapshotsSync(campId);
    assert.equal(stored.length, MAX_VAULT_SNAPSHOTS);
    assert.equal(stored.length, 7);
    // Newest first (#10 down to #4); #1, #2, #3 rotated out
    assert.equal(stored[0].label, 'Checkpoint #10');
    assert.equal(stored[6].label, 'Checkpoint #4');

    // Verify pure ring buffer helper as well
    const customRing = pushToSnapshotRing(stored, {
      id: 'snap-11',
      campaignId: campId,
      campaignName: 'Vault Campaign',
      createdAt: 9999,
      reason: 'pre_json_import',
      label: 'Checkpoint #11',
      data: { versionCounter: 11 },
    } as unknown as CampaignSnapshotRecord);
    assert.equal(customRing.length, 7);
    assert.equal(customRing[0].id, 'snap-11');
    assert.equal(customRing[6].label, 'Checkpoint #5');

    // Diff verification & restore
    const targetSnap = stored[3]; // Checkpoint #7
    const diff = computeSnapshotDiff({ npcs: [], versionCounter: 99 }, targetSnap);
    assert.ok(diff.changedKeys.includes('npcs'));
    assert.ok(diff.changedKeys.includes('versionCounter'));
    assert.equal(diff.entityCounts.npcs.current, 0);
    assert.equal(diff.entityCounts.npcs.snapshot, 7);

    const restored = restoreVaultSnapshot(campId, targetSnap.id);
    assert.ok(restored);
    assert.equal(restored!.data.versionCounter, 7);
    assert.equal((restored!.data.npcs as unknown[]).length, 7);
  });
});

describe('geminiCampaignBridge: fence stripping, Zod validation, diff preview & apply', () => {
  it('generates context-aware prompts for GM and Player presets without leaking private GM state to player prompts', () => {
    const campaignData = {
      tone: 'Gothic intrigue',
      secrets: ['TOP_SECRET_VILLAIN_TWIST'],
      npcs: [{ id: 'n1', name: 'Lady Vesper', role: 'Spymaster' }],
      locations: [{ id: 'l1', name: 'Obsidian Spire', type: 'Tower' }],
      playerLog: [{ id: 'log1', text: 'The party entered the Obsidian Spire.', visibility: { mode: 'party' } }],
    };

    const gmRecapPrompt = buildGeminiBridgePrompt({
      preset: 'session_recap',
      campaignName: 'Shadows of Vesper',
      campaignData,
    });
    assert.ok(gmRecapPrompt.includes('Shadows of Vesper'));
    assert.ok(gmRecapPrompt.includes('The party entered the Obsidian Spire.'));

    const structuredPrompt = buildGeminiBridgePrompt({
      preset: 'structured_entities',
      campaignName: 'Shadows of Vesper',
      campaignData,
      prepScale: 'dungeon',
    });
    assert.ok(structuredPrompt.includes('dungeon'));
    assert.ok(structuredPrompt.includes('encounters'));

    const playerPrompt = buildGeminiBridgePrompt({
      preset: 'player_journal_summary',
      campaignName: 'Shadows of Vesper',
      campaignData,
      playerState: {
        pcName: 'Kaelen',
        quests: [{ id: 'q1', title: 'Find the Signet Ring', status: 'active', notes: 'Check the vault' }],
        journal: [{ id: 'j1', sessionNumber: 1, date: '2026-04-01', title: 'Tower Entry', content: 'Met Lady Vesper.' }],
        revealedEntities: [{ id: 'n1', name: 'Lady Vesper', type: 'NPC' }],
      },
    });
    assert.ok(playerPrompt.includes('Kaelen'));
    assert.ok(!playerPrompt.includes('TOP_SECRET_VILLAIN_TWIST'));
  });

  it('strips markdown fences, validates Gemini JSON against schema, previews diffs, and supports selective checkbox merges', () => {
    const rawFencedResponse = [
      'Here is your structured campaign JSON:',
      '```json',
      JSON.stringify({
        recap: {
          title: 'Session 4: The Obsidian Pact',
          previouslyOn: 'Previously on Shadows of Vesper, the heroes climbed the spire...',
          highlights: ['Confronted Lady Vesper', 'Recovered the Signet Ring'],
        },
        npcs: [
          { name: 'Vaelor the Undying', role: 'Lich Herald', description: 'Draped in tattered astral silk.' },
        ],
        monsters: [
          { name: 'Gloom Stalker Construct', cr: '5', summary: 'Clockwork sentinel powered by shadowgems.' },
        ],
        encounters: [
          { name: 'Ambush on the Glass Bridge', difficulty: 'Hard', monsters: ['Gloom Stalker Construct'], tactics: 'Push foes off the bridge.' },
        ],
        items: [
          { name: 'Lantern of True Dawn', rarity: 'Rare', description: 'Sheds sunlight in a 30-ft radius.' },
        ],
        secrets: ['The Signet Ring is a phylactery key.'],
        playerJournalEntry: {
          title: 'Notes from the Spire',
          content: 'We barely escaped Vaelor.',
          sessionNumber: 4,
        },
      }),
      '```',
    ].join('\n');

    const stripped = stripMarkdownCodeFences(rawFencedResponse);
    assert.ok(stripped.startsWith('{'));
    assert.ok(stripped.endsWith('}'));

    const validation = validateAndParseGeminiBridgeJson(rawFencedResponse);
    assert.equal(validation.ok, true);
    if (!validation.ok) return;

    assert.equal(validation.diff.hasRecap, true);
    assert.equal(validation.diff.npcsCount, 1);
    assert.equal(validation.diff.monstersCount, 1);
    assert.equal(validation.diff.encountersCount, 1);
    assert.equal(validation.diff.itemsCount, 1);
    assert.equal(validation.diff.secretsCount, 1);
    assert.equal(validation.diff.hasPlayerJournal, true);

    const nextState = applyGeminiBridgePayload({
      campaignData: { npcs: [], items: [], secrets: [], encounters: [], playerLog: [] },
      payload: validation.payload,
      publishRecapToPartyFeed: true,
      selection: { secrets: false },
      now: 123456789,
    });

    assert.equal((nextState.npcs as unknown[]).length, 1);
    assert.equal((nextState.encounters as unknown[]).length, 1);
    assert.equal((nextState.items as unknown[]).length, 1);
    // Deselected via Diff Preview checkbox -> untouched!
    assert.equal((nextState.secrets as unknown[]).length, 0);
    assert.equal((nextState.playerLog as unknown[]).length, 1);
    assert.equal((nextState.__playerCompanionJournal as unknown[]).length, 1);
  });
});

describe('tabletopErgonomics: voice dictation @-mention formatting', () => {
  it('converts spoken entity names into @-mention tokens cleanly', () => {
    const formatted = formatSpokenTextWithMentions(
      'We met Lady Vesper outside the Obsidian Spire',
      ['Lady Vesper', 'Obsidian Spire'],
    );
    assert.ok(formatted.includes('@Lady Vesper'));
    assert.ok(formatted.includes('@Obsidian Spire'));
  });
});
