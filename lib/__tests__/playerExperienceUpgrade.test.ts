import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createEmptyPc, normalizePc } from '../pc/factory';
import { shortRest, longRest } from '../pc/rest';
import {
  computeEffectiveCharacterStats,
  createBuffFromPreset,
  expireActiveBuffs,
} from '../activeModifiers';
import {
  buildNewCharacterFromWizard,
  applyLevelUpWizardTransition,
} from '../../components/CharacterWizardModal';
import {
  SYNC_CAPSULE_PREFIX,
  encryptPlayerSyncCapsule,
  decryptPlayerSyncCapsule,
  serializeCapsuleFile,
  buildSyncHandoffUrl,
  extractSyncCapsuleFromHash,
} from '../playerSyncCapsule';
import {
  claimPartyLootItem,
  resolveConcurrentPartyLootClaims,
  splitPartyLootGold,
  splitPartyLootDropGold,
} from '../crdt/writeback-merge';
import {
  rollAbilityCheck,
  rollSavingThrow,
  rollConcentrationCheck,
  applySpellCastToPc,
  deductFeatureOrResourceUse,
  sanitizeRollEventsForOutbound,
} from '../diceRoller';
import type { PartyLootItem } from '../pc/types';

describe('Player Experience Upgrade Suite', () => {
  describe('1. computeEffectiveCharacterStats & Active Buff Engine', () => {
    it('calculates Shield (+5 AC), Bless (+1d4), Poisoned, Grappled, and Exhaustion without mutating base PC fields', () => {
      const basePc = normalizePc({
        ...createEmptyPc('pc-seraphina'),
        name: 'Seraphina',
        ac: 16,
        speed: 30,
        abilities: { STR: 14, DEX: 16, CON: 14, INT: 10, WIS: 12, CHA: 10 },
        proficiencies: {
          savingThrows: ['DEX', 'CON'],
          skills: ['Stealth'],
          languages: ['Common'],
          tools: [],
          armor: [],
          weapons: [],
        },
        conditions: ['Poisoned', 'Grappled'],
        exhaustion: 1,
        activeBuffs: [
          createBuffFromPreset('shield')!,
          createBuffFromPreset('bless')!,
        ],
      });

      const snapshotBefore = JSON.stringify(basePc);
      const eff = computeEffectiveCharacterStats(basePc);

      // Base PC must remain 100% untouched
      assert.equal(JSON.stringify(basePc), snapshotBefore);
      assert.equal(basePc.ac, 16);
      assert.equal(basePc.speed, 30);

      // Shield adds +5 AC -> 21
      assert.equal(eff.baseAc, 16);
      assert.equal(eff.ac, 21);
      assert.equal(eff.acDelta, 5);

      // Grappled reduces speed to 0 ft
      assert.equal(eff.baseSpeed, 30);
      assert.equal(eff.speed, 0);

      // Bless adds +1d4 to attacks and saving throws
      assert.ok(eff.attackBonusDice.includes('1d4'));
      assert.ok(eff.saveBonusDice.includes('1d4'));

      // Poisoned + Exhaustion Lv1 impose Disadvantage on ability checks and attacks
      assert.equal(eff.abilityChecks.STR.rollMode, 'disadvantage');
      assert.equal(eff.skills.Stealth.rollMode, 'disadvantage');
      assert.equal(eff.attackRollMode, 'disadvantage');
    });

    it('automatically expires turn, round, shortRest, and longRest buffs on trigger', () => {
      const pc = normalizePc({
        ...createEmptyPc('pc-kaelen'),
        name: 'Kaelen',
        activeBuffs: [
          createBuffFromPreset('shield')!, // expiresOn: 'round'
          createBuffFromPreset('guidance')!, // expiresOn: 'turn'
          createBuffFromPreset('rage')!, // expiresOn: 'shortRest'
          createBuffFromPreset('mage-armor')!, // expiresOn: 'longRest'
        ],
      });

      assert.deepEqual(
        expireActiveBuffs(pc.activeBuffs ?? [], 'turn').map((b) => b.presetKey),
        ['shield', 'rage', 'mage-armor'],
      );
      assert.deepEqual(
        expireActiveBuffs(pc.activeBuffs ?? [], 'round').map((b) => b.presetKey),
        ['rage', 'mage-armor'],
      );

      const afterShort = shortRest(pc);
      assert.deepEqual(
        (afterShort.activeBuffs ?? []).map((b) => b.presetKey),
        ['mage-armor'],
      );

      const afterLong = longRest(pc);
      assert.equal((afterLong.activeBuffs ?? []).length, 0);
    });
  });

  describe('2. Guided Character Builder & 1-Tap Level-Up Wizard State Transitions', () => {
    it('builds an evaluated character from scratch and levels up while preserving damageTaken, tempHp, conditions, spent resources, and private notes', () => {
      const builtPc = buildNewCharacterFromWizard({
        name: 'Lyra Vance',
        player: 'Alex',
        race: 'Half-Elf',
        background: 'Sage',
        alignment: 'Chaotic Good',
        className: 'Wizard',
        subclass: 'School of Evocation',
        level: 3,
        abilities: { STR: 8, DEX: 14, CON: 14, INT: 17, WIS: 12, CHA: 10 },
        savingThrows: ['INT', 'WIS'],
        skills: ['Arcana', 'Investigation'],
        equipmentNames: ['Quarterstaff', 'Spellbook', 'Component Pouch'],
        spellsKnown: ['Fire Bolt (Cantrip)', 'Shield (Lv 1)', 'Misty Step (Lv 2)'],
        startingGold: 45,
      });

      assert.equal(builtPc.name, 'Lyra Vance');
      assert.equal(builtPc.level, 3);
      assert.ok(builtPc.evaluation);
      assert.equal(builtPc.spellSlots?.[1]?.max, 4);
      assert.equal(builtPc.spellSlots?.[2]?.max, 2);

      // Simulate mid-session combat state: took 6 damage, has 5 temp HP, 2 spent 1st-level slots, Poisoned condition, and private notes
      const midSessionPc = normalizePc({
        ...builtPc,
        hp: {
          current: builtPc.hp.max - 6,
          max: builtPc.hp.max,
          temp: 5,
        },
        conditions: ['Poisoned'],
        concentrationSpell: 'Blur',
        spellSlots: {
          ...builtPc.spellSlots,
          1: { used: 2, max: 4 },
        },
        resourcePools: [
          { id: 'pool-arcane-recovery', name: 'Arcane Recovery', current: 0, max: 1, rechargeOn: 'long' },
        ],
        notes: 'PRIVATE_WIZARD_SECRET_NOTE',
      });

      const leveledUp = applyLevelUpWizardTransition(midSessionPc, {
        targetClassName: 'Wizard',
        hpGainMethod: 'fixed',
        asiOrFeatChoice: {
          type: 'asi',
          bonuses: { INT: 2 },
        },
        newSpellsLearned: ['Counterspell (Lv 3)'],
      });

      // Level advances 3 -> 4, INT 17 -> 19
      assert.equal(leveledUp.level, 4);
      assert.equal(leveledUp.abilities.INT, 19);

      // Max HP increased and the 6 damageTaken is preserved!
      const damageTakenBefore = midSessionPc.hp.max - midSessionPc.hp.current;
      const damageTakenAfter = leveledUp.hp.max - leveledUp.hp.current;
      assert.equal(damageTakenAfter, damageTakenBefore);
      assert.equal(leveledUp.hp.temp, 5);

      // Conditions, active concentration, spent slots, spent resources, and private notes remain intact
      assert.ok(leveledUp.conditions.includes('Poisoned'));
      assert.equal(leveledUp.concentrationSpell, 'Blur');
      assert.equal(leveledUp.spellSlots?.[1]?.used, 2);
      assert.equal(leveledUp.spellSlots?.[2]?.max, 3); // Level 4 Wizard unlocks 3rd 2nd-level slot
      assert.equal(
        leveledUp.resourcePools?.find((r) => r.name === 'Arcane Recovery')?.current,
        0,
      );
      assert.equal(leveledUp.notes, 'PRIVATE_WIZARD_SECRET_NOTE');
    });
  });

  describe('3. Encrypted Cross-Device Sync Capsule (Web Crypto AES-GCM + PBKDF2)', () => {
    it('round-trips 100% of private local tracker data and rejects wrong passphrases', async () => {
      const payload = {
        campaignId: 'camp-emerald-spire',
        slotId: 'slot-aria',
        pcId: 'pc-aria',
        shareToken: 'tok-secret-link',
        trackerState: {
          quests: [
            {
              id: 'q-priv-1',
              title: 'Investigate the Duke',
              status: 'active' as const,
              notes: 'He met the cultist at midnight',
              linkedEntityIds: ['npc-duke'],
              sharedWithGm: false,
            },
          ],
          annotations: [
            {
              id: 'ann-priv-1',
              entityId: 'npc-duke',
              attitudeTag: 'suspicious' as const,
              privateNotes: 'Carries a signet ring of Cyric',
              sharedNotes: '',
              sharedWithGm: false,
            },
          ],
          journal: [],
          theoryLinks: [
            {
              id: 'tlink-priv-1',
              sourceId: 'npc-duke',
              targetId: 'loc-crypt',
              label: 'Funnels gold to',
              color: 'crimson' as const,
              sharedWithGm: false,
            },
          ],
          stickyCards: [
            {
              id: 'sticky-priv-1',
              title: 'Cipher Key',
              content: 'Shift letters by +3',
              color: 'gold' as const,
              x: 120,
              y: 180,
              sharedWithGm: false,
            },
          ],
          nodePositions: { 'npc-duke': { x: 240, y: 160 } },
          secretRolls: [],
          pendingTombstones: [],
          updatedAt: 42000,
        },
      };

      const capsuleString = await encryptPlayerSyncCapsule(payload, 'correct-horse-battery-staple');
      assert.equal(capsuleString.startsWith(`${SYNC_CAPSULE_PREFIX}.`), true);
      // Ciphertext must never contain plaintext private notes
      assert.equal(capsuleString.includes('Investigate the Duke'), false);
      assert.equal(capsuleString.includes('signet ring of Cyric'), false);

      // Handoff URL & file format helpers
      const handoffUrl = buildSyncHandoffUrl('https://gmassistant.app/player?t=1', capsuleString);
      assert.equal(extractSyncCapsuleFromHash(new URL(handoffUrl).hash), capsuleString);

      const fileContent = serializeCapsuleFile(capsuleString, {
        campaignHint: 'camp-emerald-spire',
        slotHint: 'slot-aria',
      });
      const decrypted = await decryptPlayerSyncCapsule(fileContent, 'correct-horse-battery-staple');

      assert.equal(decrypted.campaignId, 'camp-emerald-spire');
      assert.equal(decrypted.slotId, 'slot-aria');
      assert.equal(decrypted.trackerState.quests[0]?.title, 'Investigate the Duke');
      assert.equal(decrypted.trackerState.theoryLinks?.[0]?.label, 'Funnels gold to');
      assert.equal(decrypted.trackerState.stickyCards?.[0]?.content, 'Shift letters by +3');
      assert.deepEqual(decrypted.trackerState.nodePositions?.['npc-duke'], { x: 240, y: 160 });

      // Wrong passphrase must reject
      await assert.rejects(
        () => decryptPlayerSyncCapsule(capsuleString, 'wrong-passphrase-123'),
      );
    });
  });

  describe('4. Idempotent Party Loot Claiming & Gold Splitter', () => {
    it('enforces idempotent loot claiming and resolves concurrent claims deterministically without item duplication', () => {
      const pc1 = normalizePc({ ...createEmptyPc('pc-aria'), name: 'Aria' });
      const pc2 = normalizePc({ ...createEmptyPc('pc-bram'), name: 'Bram' });
      const pcs = [pc1, pc2];
      const loot: PartyLootItem[] = [
        {
          id: 'loot-cloak',
          name: 'Cloak of Protection',
          qty: 1,
          weight: 1,
          notes: '+1 AC and saves',
        },
      ];

      const claim1 = claimPartyLootItem(loot, pcs, {
        lootId: 'loot-cloak',
        pcId: 'pc-aria',
        claimNonce: 'nonce-aria-1',
        timestampMs: 1000,
      });
      assert.equal(claim1.changed, true);
      assert.equal(claim1.alreadyClaimed, false);
      assert.equal(
        claim1.pcs[0]?.inventory.some((i) => i.name === 'Cloak of Protection'),
        true,
      );

      // Second claim attempt on already-claimed item is rejected idempotently
      const claim2 = claimPartyLootItem(claim1.lootItems, claim1.pcs, {
        lootId: 'loot-cloak',
        pcId: 'pc-bram',
        claimNonce: 'nonce-bram-1',
        timestampMs: 1005,
      });
      assert.equal(claim2.changed, false);
      assert.equal(claim2.alreadyClaimed, true);
      assert.equal(
        claim2.pcs[1]?.inventory.some((i) => i.name === 'Cloak of Protection'),
        false,
      );

      // Concurrent claims in divergent branches resolve to a single deterministic winner
      const resolved = resolveConcurrentPartyLootClaims(loot, pcs, [
        { lootId: 'loot-cloak', pcId: 'pc-aria', claimNonce: 'nonce-a', timestampMs: 2000 },
        { lootId: 'loot-cloak', pcId: 'pc-bram', claimNonce: 'nonce-b', timestampMs: 1500 },
      ]);
      assert.equal(resolved.accepted.length, 1);
      assert.equal(resolved.rejected.length, 1);
      assert.equal(resolved.lootItems[0]?.claimedByPcId, 'pc-bram'); // Earlier claim timestamp (1500 < 2000) wins
    });

    it('splits party gold evenly across active party PCs and tracks remainder accurately', () => {
      const pcs = [
        normalizePc({ ...createEmptyPc('pc-1'), name: 'Aria', currency: { cp: 0, sp: 0, ep: 0, gp: 10, pp: 0 } }),
        normalizePc({ ...createEmptyPc('pc-2'), name: 'Bram', currency: { cp: 0, sp: 0, ep: 0, gp: 5, pp: 0 } }),
        normalizePc({ ...createEmptyPc('pc-3'), name: 'Cora', currency: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 } }),
      ];

      // 10 GP split 3 ways -> 3 GP each with 1 GP remainder
      const splitRes = splitPartyLootGold(
        { cp: 0, sp: 0, ep: 0, gp: 10, pp: 0 },
        pcs,
        ['pc-1', 'pc-2', 'pc-3'],
      );
      assert.equal(splitRes.recipientCount, 3);
      assert.deepEqual(splitRes.sharePerPc, { pp: 0, gp: 3, ep: 0, sp: 0, cp: 0 });
      assert.deepEqual(splitRes.remainder, { pp: 0, gp: 1, ep: 0, sp: 0, cp: 0 });

      const lootDrops: PartyLootItem[] = [
        {
          id: 'loot-chest',
          name: 'Bandit Chest',
          qty: 1,
          weight: 5,
          notes: '',
          currency: { cp: 0, sp: 0, ep: 0, gp: 10, pp: 0 },
        },
      ];
      const dropSplit = splitPartyLootDropGold(lootDrops, pcs, {
        lootId: 'loot-chest',
        activePcIds: ['pc-1', 'pc-2', 'pc-3'],
      });
      assert.equal(dropSplit.changed, true);
      assert.equal(dropSplit.pcs[0]?.currency?.gp, 13);
      assert.equal(dropSplit.pcs[1]?.currency?.gp, 8);
      assert.equal(dropSplit.pcs[2]?.currency?.gp, 3);
      assert.equal(dropSplit.lootItems[0]?.currency?.gp, 1);
    });
  });

  describe('5. Click-to-Roll & Smart Spell / Resource Hooks', () => {
    it('deducts spell slots, sets concentrationSpell, and strips secretRoll events from outbound payloads', () => {
      const pc = normalizePc({
        ...createEmptyPc('pc-caster'),
        name: 'Seraphina',
        spellcastingAbility: 'WIS',
        spellSaveDc: 15,
        spellAttackBonus: 7,
        spellSlots: { 1: { used: 0, max: 4 }, 2: { used: 0, max: 2 } },
        spellsKnown: ['Sacred Flame (Cantrip)', 'Bless [C] (Lv 1)', 'Hold Person [C] (Lv 2)'],
        resourcePools: [{ id: 'res-cd', name: 'Channel Divinity', current: 2, max: 2, rechargeOn: 'short' }],
      });

      const castRes = applySpellCastToPc(pc, {
        spellName: 'Bless',
        slotKind: 'spell',
        slotLevel: 1,
        setConcentration: true,
      });

      assert.equal(castRes.updatedPc.spellSlots?.[1]?.used, 1);
      assert.equal(castRes.updatedPc.concentrationSpell, 'Bless');

      const featRes = deductFeatureOrResourceUse(castRes.updatedPc, 'Channel Divinity');
      assert.ok(featRes.deductedLabel);
      assert.equal(featRes.updatedPc.resourcePools?.[0]?.current, 1);

      const concRoll = rollConcentrationCheck(featRes.updatedPc, 24);
      assert.equal(concRoll.dc, 12); // max(10, floor(24 / 2))

      const pubRoll = rollAbilityCheck(featRes.updatedPc, 'WIS', { secretRoll: false });
      const secRoll = rollSavingThrow(featRes.updatedPc, 'WIS', { secretRoll: true });

      const outboundRolls = sanitizeRollEventsForOutbound([pubRoll, secRoll]);
      assert.equal(outboundRolls.length, 1);
      assert.equal(outboundRolls[0]?.id, pubRoll.id);
    });
  });
});
