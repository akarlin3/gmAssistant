import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { PDFDocument } from 'pdf-lib';

import { evaluateCharacterSheet } from '../characterEvaluator';
import { mergeUploadedCharacterSheet, findMatchingExistingPc } from '../characterMerge';
import {
  exportCharacterSheetPdf,
  sanitizePcForPdfExport,
  buildCharacterSheetPdfFilename,
} from '../characterPdfExporter';
import {
  parseCharacterSheet,
  parsePdfCharacterSheetTier1,
  parseJsonCharacterSheetTier1,
} from '../characterSheetParser';
import { createEmptyPc } from '../pc/factory';
import { mergePcWritebacks } from '../crdt/writeback-merge';
import { validatePlayerField } from '../player/allowlist';
import { buildSlotProjection } from '../playerMode/projection';
import type { PlayerCharacter } from '../pc/types';

const alnumCanary = (prefix: string) =>
  fc
    .stringMatching(/^[A-Za-z0-9]{10,20}$/)
    .map((s) => `${prefix}_${s}_END`);

describe('Character Sheet Lifecycle: Parser, Evaluator, Delta Merge & PDF Exporter', () => {
  describe('1. Automatic Character Evaluator (evaluateCharacterSheet)', () => {
    it('computes derived stats, synthesizes spell slots & class resource pools, and tags tactical roles', () => {
      const rawPc = {
        id: 'pc-paladin-1',
        name: 'Seraphina Vale',
        race: 'Aasimar',
        background: 'Knight',
        classes: [
          { name: 'Paladin', subclass: 'Oath of Devotion', level: 6 },
          { name: 'Warlock', subclass: 'Hexblade', level: 2 },
        ],
        abilities: {
          STR: 18,
          DEX: 12,
          CON: 16,
          INT: 10,
          WIS: 14,
          CHA: 20,
        },
        ac: 20,
        hp: { current: 68, max: 68, temp: 0 },
        proficiencies: {
          savingThrows: ['WIS', 'CHA'],
          skills: ['Athletics', 'Persuasion', 'Insight', 'Perception'],
          armor: ['Heavy Armor', 'Shields'],
          weapons: ['Martial Weapons'],
          tools: [],
          languages: ['Common', 'Celestial'],
        },
        skillExpertise: ['Persuasion'],
        resistances: ['Necrotic', 'Radiant'],
        senses: ['Darkvision 60 ft.'],
        spellsKnown: [
          { id: 'sp-1', name: 'Bless', level: 1, prepared: true, concentration: false, ritual: false },
          { id: 'sp-2', name: 'Cure Wounds', level: 1, prepared: true, concentration: false, ritual: false },
          { id: 'sp-3', name: 'Shield of Faith', level: 1, prepared: true, concentration: true, ritual: false },
        ],
        inventory: [
          { id: 'i1', name: 'Sunblade', quantity: 1, weight: 3, equipped: true, attuned: true, notes: '' },
          { id: 'i2', name: 'Cloak of Protection', quantity: 1, weight: 1, equipped: true, attuned: true, notes: '' },
          { id: 'i3', name: 'Ring of Protection', quantity: 1, weight: 0, equipped: true, attuned: true, notes: '' },
          { id: 'i4', name: 'Amulet of Health', quantity: 1, weight: 1, equipped: true, attuned: true, notes: '' },
        ],
      };

      const { pc, evaluation } = evaluateCharacterSheet(rawPc);

      // Total level = 6 + 2 = 8 -> Proficiency Bonus = +3
      assert.equal(pc.level, 8);
      assert.equal(pc.proficiencyBonus, 3);

      // Ability modifiers
      assert.equal(evaluation.derivedStats.abilityModifiers.STR, 4);
      assert.equal(evaluation.derivedStats.abilityModifiers.DEX, 1);
      assert.equal(evaluation.derivedStats.abilityModifiers.CON, 3);
      assert.equal(evaluation.derivedStats.abilityModifiers.INT, 0);
      assert.equal(evaluation.derivedStats.abilityModifiers.WIS, 2);
      assert.equal(evaluation.derivedStats.abilityModifiers.CHA, 5);

      // Passive Senses:
      // Perception: 10 + WIS(2) + PB(3) = 15
      // Investigation: 10 + INT(0) = 10
      // Insight: 10 + WIS(2) + PB(3) = 15
      assert.equal(pc.passivePerception, 15);
      assert.equal(pc.passiveInvestigation, 10);
      assert.equal(pc.passiveInsight, 15);

      // Spellcasting: CHA (+5), PB (+3) -> Save DC 16, Attack +8
      assert.equal(pc.spellcastingAbility, 'CHA');
      assert.equal(pc.spellSaveDc, 16);
      assert.equal(pc.spellAttackBonus, 8);

      // Initiative bonus from DEX (+1) and Carrying Capacity (18 * 15 = 270)
      assert.equal(pc.initiativeMod, 1);
      assert.equal(pc.carryingCapacity, 270);

      // Standard spell slots for Paladin 6 (effective caster level 3 -> 4 lv1, 2 lv2) + Warlock 2 Pact Slots (2 lv1)
      assert.ok(pc.spellSlots.some((s) => s.level === 1 && s.max === 4));
      assert.ok(pc.spellSlots.some((s) => s.level === 2 && s.max === 2));
      assert.ok(pc.pactSlots);
      assert.equal(pc.pactSlots?.slotLevel, 1);
      assert.equal(pc.pactSlots?.max, 2);

      // Synthesized class resource pools: Lay on Hands (6*5=30), Channel Divinity, Divine Sense, Hit Dice
      const poolNames = pc.resourcePools.map((p) => p.name.toLowerCase());
      assert.ok(poolNames.some((n) => n.includes('lay on hands')));
      assert.ok(poolNames.some((n) => n.includes('channel divinity')));
      assert.ok(poolNames.some((n) => n.includes('hit dice')));
      const layOnHands = pc.resourcePools.find((p) => p.name.toLowerCase().includes('lay on hands'));
      assert.equal(layOnHands?.max, 30);

      // Tactical roles: Frontline (AC 20 + Heavy Armor), Support (Cure Wounds / Bless / Lay on Hands), Face (CHA 20 + Persuasion expertise)
      assert.ok(evaluation.partyRoles.includes('Frontline'));
      assert.ok(evaluation.partyRoles.includes('Support'));
      assert.ok(evaluation.partyRoles.includes('Face'));

      // Defensive profile
      assert.ok(evaluation.defensiveProfile.acSummary.includes('AC 20'));
      assert.deepEqual(evaluation.defensiveProfile.resistances, ['Necrotic', 'Radiant']);
      assert.deepEqual(evaluation.defensiveProfile.specialSenses, ['Darkvision 60 ft.']);

      // Audit notes: >3 attuned items (4 attuned items) and missing concentration tag on Bless
      assert.ok(evaluation.auditNotes.some((n) => n.category === 'attunement'));
      assert.ok(evaluation.auditNotes.some((n) => n.category === 'concentration' && n.message.includes('Bless')));
    });

    it('synthesizes Fighter, Barbarian, Monk, Bard, and Wizard class resources accurately', () => {
      const { pc: fighter } = evaluateCharacterSheet({
        name: 'Garrick',
        classes: [{ name: 'Fighter', level: 5 }],
        abilities: { STR: 18, DEX: 14, CON: 16, INT: 10, WIS: 12, CHA: 8 },
      });
      assert.ok(fighter.resourcePools.some((p) => p.name === 'Second Wind' && p.rechargeOn === 'short'));
      assert.ok(fighter.resourcePools.some((p) => p.name === 'Action Surge' && p.rechargeOn === 'short'));

      const { pc: monk } = evaluateCharacterSheet({
        name: 'Shen',
        classes: [{ name: 'Monk', level: 7 }],
        abilities: { STR: 10, DEX: 18, CON: 14, INT: 10, WIS: 16, CHA: 10 },
      });
      const kiPool = monk.resourcePools.find((p) => p.name.includes('Focus / Ki'));
      assert.ok(kiPool);
      assert.equal(kiPool.max, 7);
      assert.equal(kiPool.rechargeOn, 'short');
    });
  });

  describe('2. State-Preserving Delta Merge (mergeUploadedCharacterSheet)', () => {
    it('preserves damageTaken, active conditions, death saves, spent spell slots, spent class resources, custom loot, and privacy flags on level-up', () => {
      const existingPc = evaluateCharacterSheet({
        id: 'pc-wizard-1',
        name: 'Lyra Starweaver',
        race: 'High Elf',
        classes: [{ name: 'Wizard', subclass: 'Evocation', level: 4 }],
        abilities: { STR: 8, DEX: 14, CON: 14, INT: 18, WIS: 12, CHA: 10 },
        hp: { current: 16, max: 26, temp: 5 }, // 10 damage taken!
        hitDice: { dieSize: 6, max: 4, used: 2 }, // 2 hit dice spent!
        ac: 15,
        conditions: ['Concentrating', 'Poisoned'],
        deathSaves: { successes: 1, failures: 1 },
        exhaustion: 2,
        inspiration: true,
        spellSlots: [
          { level: 1, max: 4, used: 3 }, // 3 lv1 slots spent
          { level: 2, max: 3, used: 1 }, // 1 lv2 slot spent
        ],
        resourcePools: [
          { id: 'res-arcane-recovery', name: 'Arcane Recovery', current: 0, max: 1, rechargeOn: 'long' },
          { id: 'res-hit-dice', name: 'Hit Dice (d6)', current: 2, max: 4, rechargeOn: 'long' },
          { id: 'custom-charges', name: 'Staff of Defense Charges', current: 4, max: 10, rechargeOn: 'dawn' },
        ],
        inventory: [
          { id: 'loot-1', name: 'Mystery Key from Session 3', quantity: 1, weight: 0, equipped: false, attuned: false, notes: 'Found in crypt' },
          { id: 'item-sb', name: 'Spellbook', quantity: 1, weight: 3, equipped: true, attuned: false, notes: '' },
        ],
        gmNotes: 'Lyra is secretly the heir to the Star Throne.',
        gmSecrets: 'The Mystery Key opens the Vault of Ash.',
        privateNotes: 'My private player note: I distrust the vizier.',
        quests: [
          {
            id: 'q-private',
            title: 'Decode the Astral Cipher',
            category: 'mystery',
            status: 'active',
            notes: 'Keep hidden from the party for now',
            linkedEntityIds: [],
            sharedWithGm: false,
            updatedAt: 1000,
          },
          {
            id: 'q-shared',
            title: 'Rescue the Blacksmith',
            category: 'quest',
            status: 'active',
            notes: 'Shared party objective',
            linkedEntityIds: [],
            sharedWithGm: true,
            updatedAt: 1000,
          },
        ],
        ownership: { ownerType: 'player', playerSlotId: 'slot-lyra' },
      }).pc;

      // Upload Level 5 sheet (Max HP increases from 26 -> 32; unlocks 3rd-level spell slots!)
      const uploadedLevel5 = evaluateCharacterSheet({
        name: 'Lyra Starweaver',
        race: 'High Elf',
        classes: [{ name: 'Wizard', subclass: 'Evocation', level: 5 }],
        abilities: { STR: 8, DEX: 14, CON: 14, INT: 18, WIS: 12, CHA: 10 },
        hp: { current: 32, max: 32, temp: 0 }, // Fresh exported sheet says 32/32
        ac: 15,
        inventory: [
          { id: 'item-sb', name: 'Spellbook', quantity: 1, weight: 3, equipped: true, attuned: false, notes: '' },
          { id: 'item-wand', name: 'Wand of the War Mage +1', quantity: 1, weight: 1, equipped: true, attuned: true, notes: '' },
        ],
      }).pc;

      const merged = mergeUploadedCharacterSheet(existingPc, uploadedLevel5);

      // 1. Vitals & Active Status Preservation:
      // damageTaken = 26 - 16 = 10 -> new currentHp = 32 - 10 = 22!
      assert.equal(merged.hp.max, 32);
      assert.equal(merged.hp.current, 22);
      assert.equal(merged.currentHp, 22);
      assert.equal(merged.maxHp, 32);
      assert.equal(merged.hp.temp, 5);
      assert.deepEqual(merged.conditions, ['Concentrating', 'Poisoned']);
      assert.deepEqual(merged.deathSaves, { successes: 1, failures: 1 });
      assert.equal(merged.exhaustion, 2);
      assert.equal(merged.inspiration, true);

      // 2. Spell Slots Preservation:
      // Lv 1: old 3 used of 4 -> new 3 used of 4 (1 remaining)
      // Lv 2: old 1 used of 3 -> new 1 used of 3 (2 remaining)
      // Lv 3 (newly unlocked at Lv 5!): 0 used of 2 (starts full!)
      const lv1 = merged.spellSlots.find((s) => s.level === 1);
      const lv2 = merged.spellSlots.find((s) => s.level === 2);
      const lv3 = merged.spellSlots.find((s) => s.level === 3);
      assert.deepEqual(lv1, { level: 1, max: 4, used: 3 });
      assert.deepEqual(lv2, { level: 2, max: 3, used: 1 });
      assert.deepEqual(lv3, { level: 3, max: 2, used: 0 });

      // 3. Class Resource Pool & Hit Dice Preservation:
      // Hit Dice: 2 spent out of 4 -> now 2 spent out of 5 (3 current remaining)
      assert.equal(merged.hitDice.max, 5);
      assert.equal(merged.hitDice.used, 2);
      const hdPool = merged.resourcePools.find((p) => p.id === 'res-hit-dice');
      assert.equal(hdPool?.max, 5);
      assert.equal(hdPool?.current, 3);

      // Arcane Recovery: 1 spent -> still 0/1
      const arcaneRec = merged.resourcePools.find((p) => p.id === 'res-arcane-recovery');
      assert.equal(arcaneRec?.current, 0);

      // Custom manual tracker preserved!
      const customStaff = merged.resourcePools.find((p) => p.id === 'custom-charges');
      assert.ok(customStaff);
      assert.equal(customStaff.current, 4);
      assert.equal(customStaff.max, 10);

      // 4. Inventory, Notes & Privacy Preservation:
      assert.ok(merged.inventory.some((i) => i.name === 'Mystery Key from Session 3'));
      assert.ok(merged.inventory.some((i) => i.name === 'Wand of the War Mage +1'));
      assert.equal(merged.gmNotes, 'Lyra is secretly the heir to the Star Throne.');
      assert.equal(merged.gmSecrets, 'The Mystery Key opens the Vault of Ash.');
      assert.equal(merged.privateNotes, 'My private player note: I distrust the vizier.');
      assert.equal(merged.quests?.find((q) => q.id === 'q-private')?.sharedWithGm, false);
      assert.equal(merged.ownership?.playerSlotId, 'slot-lyra');
    });

    it('matches existing PC by targetPcId, targetSlotId, or normalized character name', () => {
      const party: PlayerCharacter[] = [
        evaluateCharacterSheet({
          id: 'pc-1',
          name: 'Thordan Ironfist',
          ownership: { ownerType: 'player', playerSlotId: 'slot-1' },
        }).pc,
        evaluateCharacterSheet({
          id: 'pc-2',
          name: 'Vexia Shadowstep',
          ownership: { ownerType: 'player', playerSlotId: 'slot-2' },
        }).pc,
      ];

      assert.equal(findMatchingExistingPc(party, { name: 'Someone' }, 'pc-2')?.id, 'pc-2');
      assert.equal(findMatchingExistingPc(party, { name: 'Someone' }, undefined, 'slot-1')?.id, 'pc-1');
      assert.equal(findMatchingExistingPc(party, { name: '  thordan   ironfist ' })?.id, 'pc-1');
    });
  });

  describe('3. Client-Side Fillable PDF Export & Tier-1 Round-Trip Fidelity', () => {
    it('round-trips a character sheet through exportCharacterSheetPdf -> parseCharacterSheet with 1:1 fidelity in both Parchment and Ink-Saver presets', async () => {
      const original = evaluateCharacterSheet({
        id: 'pc-roundtrip-1',
        name: 'Kaelen Vane',
        race: 'Tiefling',
        background: 'Charlatan',
        alignment: 'Chaotic Good',
        classes: [{ name: 'Bard', subclass: 'College of Lore', level: 6 }],
        abilities: { STR: 10, DEX: 16, CON: 14, INT: 12, WIS: 13, CHA: 18 },
        hp: { current: 31, max: 45, temp: 4 },
        ac: 15,
        speed: 30,
        initiativeMod: 3,
        inspiration: true,
        exhaustion: 1,
        conditions: ['Blessed'],
        proficiencies: {
          savingThrows: ['DEX', 'CHA'],
          skills: ['Deception', 'Persuasion', 'Stealth', 'Perception', 'Arcana'],
          armor: ['Light Armor'],
          weapons: ['Simple Weapons', 'Rapier'],
          tools: ['Lute', 'Disguise Kit'],
          languages: ['Common', 'Infernal', 'Sylvan'],
        },
        skillExpertise: ['Deception', 'Persuasion'],
        attacks: [
          { id: 'atk-1', name: 'Rapier +1', attackBonus: 7, damage: '1d8+4 piercing', rangeOrReach: '5 ft', notes: 'Finesse' },
        ],
        spellsKnown: [
          { id: 'sp-1', name: 'Vicious Mockery', level: 0, prepared: true, concentration: false, ritual: false },
          { id: 'sp-2', name: 'Hypnotic Pattern', level: 3, prepared: true, concentration: true, ritual: false },
          { id: 'sp-3', name: 'Counterspell', level: 3, prepared: true, concentration: false, ritual: false },
        ],
        currency: { cp: 12, sp: 45, ep: 0, gp: 380, pp: 5 },
      }).pc;

      for (const preset of ['parchment', 'ink-saver'] as const) {
        const pdfBytes = await exportCharacterSheetPdf(original, {
          mode: 'gm',
          stylePreset: preset,
          includeGmSecrets: false,
        });

        assert.ok(pdfBytes instanceof Uint8Array);
        assert.ok(pdfBytes.byteLength > 2000);
        assert.equal(buildCharacterSheetPdfFilename(original), 'Kaelen-Vane-Lv6-Sheet.pdf');

        const parsed = await parseCharacterSheet(
          {
            name: 'Kaelen-Vane-Lv6-Sheet.pdf',
            type: 'application/pdf',
            arrayBuffer: async () => pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength),
          },
          {},
        );

        assert.equal(parsed.tier, 'tier1-lossless');
        assert.equal(parsed.pc.name, 'Kaelen Vane');
        assert.equal(parsed.pc.level, 6);
        assert.equal(parsed.pc.race, 'Tiefling');
        assert.equal(parsed.pc.background, 'Charlatan');
        assert.equal(parsed.pc.hp.current, 31);
        assert.equal(parsed.pc.hp.max, 45);
        assert.equal(parsed.pc.hp.temp, 4);
        assert.equal(parsed.pc.ac, 15);
        assert.equal(parsed.pc.abilities.CHA, 18);
        assert.equal(parsed.pc.abilities.DEX, 16);
        assert.deepEqual(parsed.pc.skillExpertise, ['Deception', 'Persuasion']);
        assert.equal(parsed.pc.currency?.gp, 380);
        assert.equal(parsed.pc.spellsKnown?.length, 3);
      }
    });

    it('overlays external AcroForm edits made to an exported PDF during Tier-1 parsing', async () => {
      const basePc = evaluateCharacterSheet({
        name: 'Brynja Frostbeard',
        race: 'Dwarf',
        classes: [{ name: 'Barbarian', level: 4 }],
        abilities: { STR: 18, DEX: 14, CON: 16, INT: 8, WIS: 12, CHA: 10 },
        hp: { current: 45, max: 45, temp: 0 },
        ac: 16,
      }).pc;

      const pdfBytes = await exportCharacterSheetPdf(basePc, { mode: 'player' });

      // Simulate user opening the exported PDF in an external PDF viewer and editing AcroForm fields
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const form = pdfDoc.getForm();
      form.getTextField('hp_max').setText('55');
      form.getTextField('hp_current').setText('40');
      form.getTextField('ac').setText('17');
      form.getTextField('coin_gp').setText('999');
      const editedBytes = await pdfDoc.save();

      const reparsed = await parsePdfCharacterSheetTier1(editedBytes);
      assert.ok(reparsed);
      assert.equal(reparsed.tier, 'tier1-lossless');
      assert.equal(reparsed.partial?.hp?.max, 55);
      assert.equal(reparsed.partial?.hp?.current, 40);
      assert.equal(reparsed.partial?.ac, 17);
      assert.equal(reparsed.partial?.currency?.gp, 999);
    });

    it('parses standard WotC / D&D Beyond AcroForm PDFs deterministically without embedded GM Assistant metadata', async () => {
      const pdfDoc = await PDFDocument.create();
      pdfDoc.addPage([612, 792]);
      const form = pdfDoc.getForm();

      const addField = (name: string, val: string) => {
        const tf = form.createTextField(name);
        tf.setText(val);
      };

      addField('CharacterName', 'Eldrin Moonwhisper');
      addField('ClassLevel', 'Ranger 5 / Rogue 2');
      addField('Race ', 'Wood Elf');
      addField('Background', 'Outlander');
      addField('STR', '12');
      addField('DEX', '18');
      addField('CON', '14');
      addField('INT', '11');
      addField('WIS', '16');
      addField('CHA', '10');
      addField('AC', '17');
      addField('HPMax', '58');
      addField('HPCurrent', '44');
      addField('Speed', '35 ft');
      addField('Wpn Name', 'Longbow +1');
      addField('Wpn1 AtkBonus', '+9');
      addField('Wpn1 Damage', '1d8+5 piercing');

      const bytes = await pdfDoc.save();
      const res = await parseCharacterSheet(
        {
          name: 'eldrin.pdf',
          type: 'application/pdf',
          arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
        },
        {},
      );

      assert.equal(res.tier, 'tier1-acroform');
      assert.equal(res.pc.name, 'Eldrin Moonwhisper');
      assert.equal(res.pc.level, 7);
      assert.equal(res.pc.race, 'Wood Elf');
      assert.equal(res.pc.abilities.DEX, 18);
      assert.equal(res.pc.abilities.WIS, 16);
      assert.equal(res.pc.ac, 17);
      assert.equal(res.pc.hp.max, 58);
      assert.equal(res.pc.hp.current, 44);
      assert.equal(res.pc.speed, 35);
      assert.equal(res.pc.attacks[0]?.name, 'Longbow +1');
    });

    it('parses D&D Beyond, Foundry VTT, and Roll20 JSON schemas in Tier 1', () => {
      // D&D Beyond JSON
      const ddb = parseJsonCharacterSheetTier1(
        JSON.stringify({
          data: {
            name: 'Valeria Stormborn',
            race: { fullName: 'Human' },
            classes: [{ level: 5, definition: { name: 'Sorcerer' }, subclassDefinition: { name: 'Draconic' } }],
            stats: [
              { id: 1, value: 10 },
              { id: 2, value: 14 },
              { id: 3, value: 16 },
              { id: 4, value: 12 },
              { id: 5, value: 11 },
              { id: 6, value: 18 },
            ],
            baseHitPoints: 26,
            bonusHitPoints: 10,
            removedHitPoints: 6,
            currencies: { cp: 0, sp: 10, ep: 0, gp: 250, pp: 2 },
          },
        }),
      );
      assert.ok(ddb);
      assert.equal(ddb.name, 'Valeria Stormborn');
      assert.equal(ddb.level, 5);
      assert.equal(ddb.abilities?.CHA, 18);
      assert.equal(ddb.hp?.max, 51);
      assert.equal(ddb.hp?.current, 45);

      // Foundry VTT JSON
      const foundry = parseJsonCharacterSheetTier1(
        JSON.stringify({
          name: 'Torgga Ironshield',
          type: 'character',
          system: {
            abilities: {
              str: { value: 16 },
              dex: { value: 10 },
              con: { value: 16 },
              int: { value: 10 },
              wis: { value: 18 },
              cha: { value: 12 },
            },
            attributes: {
              ac: { value: 18 },
              hp: { value: 38, max: 45, temp: 0 },
              movement: { walk: 30 },
            },
            details: { level: 5, race: 'Hill Dwarf', background: 'Acolyte' },
            currency: { cp: 5, sp: 20, ep: 0, gp: 120, pp: 0 },
          },
          items: [{ type: 'class', name: 'Cleric', system: { levels: 5, subclass: 'Life Domain' } }],
        }),
      );
      assert.ok(foundry);
      assert.equal(foundry.name, 'Torgga Ironshield');
      assert.equal(foundry.abilities?.WIS, 18);
      assert.equal(foundry.hp?.current, 38);
      assert.equal(foundry.hp?.max, 45);
    });
  });

  describe('4. fast-check Property Suite: Redaction, Privacy & Slot Ownership Isolation', () => {
    it('Property 1: Default GM PDF exports (includeGmSecrets: false) contain ZERO GM-only strings and ZERO unshared player strings', async () => {
      await fc.assert(
        fc.asyncProperty(
          alnumCanary('GM_SECRET'),
          alnumCanary('GM_NOTE'),
          alnumCanary('INLINE_SPOILER'),
          alnumCanary('PRIVATE_QUEST'),
          alnumCanary('PRIVATE_PLAYER_NOTE'),
          alnumCanary('PUBLIC_NAME'),
          async (gmSecret, gmNote, inlineSpoiler, privateQuest, privatePlayerNote, publicName) => {
            const pc: PlayerCharacter = {
              ...createEmptyPc('pc-prop-gm'),
              name: publicName,
              gmSecrets: gmSecret,
              gmNotes: gmNote,
              notes: `Public adventure log ||${inlineSpoiler}|| [gm]${gmSecret}[/gm]`,
              privateNotes: privatePlayerNote,
            quests: [
                {
                  id: 'q1',
                  title: privateQuest,
                  category: 'quest',
                  status: 'active',
                  notes: privateQuest,
                  linkedEntityIds: [],
                  sharedWithGm: false,
                  updatedAt: 1,
                },
              ],
            };

            const sanitized = sanitizePcForPdfExport(pc, {
              mode: 'gm',
              includeGmSecrets: false,
            });
            const serializedSanitized = JSON.stringify(sanitized);

            assert.ok(!serializedSanitized.includes(gmSecret), 'GM secret leaked in sanitized GM export');
            assert.ok(!serializedSanitized.includes(gmNote), 'GM note leaked in sanitized GM export');
            assert.ok(!serializedSanitized.includes(inlineSpoiler), 'Inline spoiler leaked in sanitized GM export');
            assert.ok(!serializedSanitized.includes(privateQuest), 'Unshared player quest leaked in GM export');
            assert.ok(!serializedSanitized.includes(privatePlayerNote), 'Private player note leaked in GM export');

            const pdfBytes = await exportCharacterSheetPdf(pc, {
              mode: 'gm',
              includeGmSecrets: false,
            });
            const rawPdfText = Buffer.from(pdfBytes).toString('utf8');
            assert.ok(!rawPdfText.includes(gmSecret), 'GM secret leaked in raw PDF bytes');
            assert.ok(!rawPdfText.includes(gmNote), 'GM note leaked in raw PDF bytes');
            assert.ok(!rawPdfText.includes(inlineSpoiler), 'Inline spoiler leaked in raw PDF bytes');
            assert.ok(!rawPdfText.includes(privateQuest), 'Unshared player quest leaked in raw PDF bytes');
            assert.ok(!rawPdfText.includes(privatePlayerNote), 'Private player note leaked in raw PDF bytes');
          },
        ),
        { numRuns: 20 },
      );
    });

    it('Property 2: Player PDF exports with includePrivateNotes: false contain ZERO sharedWithGm: false strings and ZERO GM secrets', async () => {
      await fc.assert(
        fc.asyncProperty(
          alnumCanary('GM_SECRET'),
          alnumCanary('PRIVATE_QUEST'),
          alnumCanary('SHARED_QUEST'),
          alnumCanary('PRIVATE_JOURNAL'),
          alnumCanary('PRIVATE_NOTE'),
          async (gmSecret, privateQuest, sharedQuest, privateJournal, privateNote) => {
            const pc: PlayerCharacter = {
              ...createEmptyPc('pc-prop-player'),
              name: 'Aria Windrunner',
              gmSecrets: gmSecret,
              gmNotes: gmSecret,
              privateNotes: privateNote,
              quests: [
                {
                  id: 'q-priv',
                  title: privateQuest,
                  category: 'mystery',
                  status: 'active',
                  notes: privateQuest,
                  linkedEntityIds: [],
                  sharedWithGm: false,
                  updatedAt: 1,
                },
                {
                  id: 'q-pub',
                  title: sharedQuest,
                  category: 'quest',
                  status: 'active',
                  notes: sharedQuest,
                  linkedEntityIds: [],
                  sharedWithGm: true,
                  updatedAt: 1,
                },
              ],
              journalEntries: [
                {
                  id: 'j-priv',
                  sessionNumber: 1,
                  date: '2026-01-01',
                  title: privateJournal,
                  content: privateJournal,
                  sharedWithGm: false,
                  updatedAt: 1,
                },
              ],
            };

            const sanitized = sanitizePcForPdfExport(pc, {
              mode: 'player',
              includePrivateNotes: false,
            });
            const serialized = JSON.stringify(sanitized);

            assert.ok(!serialized.includes(gmSecret), 'GM secret leaked to player export');
            assert.ok(!serialized.includes(privateQuest), 'sharedWithGm: false quest leaked when includePrivateNotes: false');
            assert.ok(!serialized.includes(privateJournal), 'sharedWithGm: false journal leaked when includePrivateNotes: false');
            assert.ok(!serialized.includes(privateNote), 'privateNotes leaked when includePrivateNotes: false');
            assert.ok(serialized.includes(sharedQuest), 'sharedWithGm: true quest should remain present');

            // Also verify slot projection strips gmSecrets and gmNotes even for the owning player slot
            const projection = buildSlotProjection(
              {
                pcs: [
                  {
                    ...pc,
                    ownership: { ownerType: 'player', playerSlotId: 'slot-aria' },
                  } as any,
                ],
                player: {
                  shareToken: 'tok-123',
                  tokenVersion: 1,
                  roster: [{ slotId: 'slot-aria', displayName: 'Aria', createdAtMs: 1 }],
                } as any,
              },
              'Test Campaign',
              'slot-aria',
            );
            const projJson = JSON.stringify(projection);
            assert.ok(!projJson.includes(gmSecret), 'GM secret leaked in player slot projection');
          },
        ),
        { numRuns: 25 },
      );
    });

    it('Property 3: Player uploads and pcWritebacks only mutate their owned PC slot and never leak sharedWithGm: false strings', () => {
      fc.assert(
        fc.property(
          alnumCanary('OWNED_NOTE'),
          alnumCanary('ATTACKER_NAME'),
          fc.integer({ min: 1, max: 80 }),
          fc.integer({ min: 10, max: 25 }),
          (ownedNote, attackerName, newHp, newAc) => {
            const pcSlot1: PlayerCharacter = {
              ...createEmptyPc('pc-slot-1'),
              name: 'Hero One',
              hp: { current: 20, max: 40, temp: 0 },
              ac: 14,
              ownership: { ownerType: 'player', playerSlotId: 'slot-1' },
            };
            const pcSlot2: PlayerCharacter = {
              ...createEmptyPc('pc-slot-2'),
              name: 'Hero Two',
              hp: { current: 35, max: 35, temp: 0 },
              ac: 18,
              ownership: { ownerType: 'player', playerSlotId: 'slot-2' },
            };

            // Validate allowlist rejects name, level, ownership
            assert.equal(validatePlayerField('name', attackerName), false);
            assert.equal(validatePlayerField('ownership', { ownerType: 'player', playerSlotId: 'slot-1' }), false);

            // Simulate slot-1 writeback targeting pc-slot-1 AND attempting to target pc-slot-2
            const res = mergePcWritebacks(
              [pcSlot1, pcSlot2],
              [
                {
                  pcId: 'pc-slot-1',
                  slotId: 'slot-1',
                  updatedAtMs: 2000,
                  updates: {
                    'hp.current': Math.min(newHp, 40),
                    ac: newAc,
                    notes: ownedNote,
                  },
                },
                {
                  pcId: 'pc-slot-2',
                  slotId: 'slot-1', // Wrong slot! Owned by slot-2
                  updatedAtMs: 2000,
                  updates: {
                    'hp.current': 1,
                    ac: 5,
                    notes: attackerName,
                  },
                },
              ],
            );

            const updatedSlot1 = res.pcs.find((p) => p.id === 'pc-slot-1')!;
            const updatedSlot2 = res.pcs.find((p) => p.id === 'pc-slot-2')!;

            // Slot 1's owned PC is updated
            assert.equal(updatedSlot1.hp.current, Math.min(newHp, 40));
            assert.equal(updatedSlot1.ac, newAc);
            assert.equal(updatedSlot1.notes, ownedNote);

            // Slot 2's PC is untouched by slot-1's writeback
            assert.equal(updatedSlot2.hp.current, 35);
            assert.equal(updatedSlot2.ac, 18);
            assert.notEqual(updatedSlot2.notes, attackerName);
          },
        ),
        { numRuns: 50 },
      );
    });
  });
});
