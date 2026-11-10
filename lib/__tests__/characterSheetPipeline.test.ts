import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCharacterSheet } from '../characterEvaluator';
import {
  mergeUploadedCharacterSheet,
  buildPlayerWritebackFromMergedPc,
  findMatchingPc,
} from '../characterMerge';
import {
  parseCharacterJsonString,
  parsePdfDeterministicFromCorpus,
} from '../characterSheetParser';
import { emptyPc } from '../pc/factory';

describe('Automatic Character Evaluator (evaluateCharacterSheet)', () => {
  it('computes derived stats, backfills ability modifiers, passive scores, spell save DC, and carrying capacity', () => {
    const pc = evaluateCharacterSheet({
      name: 'Lyra Starweaver',
      race: 'High Elf (Darkvision 60 ft.)',
      classes: [{ name: 'Wizard', subclass: 'Evocation', level: 5 }],
      level: 5,
      abilities: { STR: 8, DEX: 16, CON: 14, INT: 18, WIS: 12, CHA: 10 },
      ac: 13,
      hp: { current: 32, max: 32, temp: 0 },
      proficiencies: {
        savingThrows: ['INT', 'WIS'],
        skills: ['Arcana', 'Perception', 'Investigation'],
        languages: ['Common', 'Elvish'],
        tools: [],
        armor: [],
        weapons: [],
      },
      skillExpertise: ['Arcana'],
      spellsKnown: ['Fireball', 'Haste'], // Haste without concentration tag should trigger concentration audit note
    });

    const evaluation = pc.evaluation!;
    assert.ok(evaluation);

    // Proficiency bonus at level 5 = +3
    assert.strictEqual(pc.proficiencyBonus, 3);
    assert.deepStrictEqual(pc.abilityModifiers, {
      STR: -1,
      DEX: 3,
      CON: 2,
      INT: 4,
      WIS: 1,
      CHA: 0,
    });

    // Passive Perception = 10 + WIS(+1) + PB(+3) = 14
    assert.strictEqual(pc.passivePerception, 14);
    // Passive Investigation = 10 + INT(+4) + PB(+3) = 17
    assert.strictEqual(pc.passiveInvestigation, 17);
    // Passive Insight = 10 + WIS(+1) = 11
    assert.strictEqual(pc.passiveInsight, 11);

    // Wizard (INT +4, PB +3) -> Spell Save DC = 8 + 3 + 4 = 15, Spell Attack = +7
    assert.strictEqual(pc.spellSaveDc, 15);
    assert.strictEqual(pc.spellAttackBonus, 7);

    // Carrying capacity = STR(8) * 15 = 120
    assert.strictEqual(pc.carryingCapacity, 120);

    // Synthesized standard spell slots for level 5 Wizard: 4 / 3 / 2
    assert.deepStrictEqual(pc.spellSlots?.[1], { max: 4, used: 0 });
    assert.deepStrictEqual(pc.spellSlots?.[2], { max: 3, used: 0 });
    assert.deepStrictEqual(pc.spellSlots?.[3], { max: 2, used: 0 });

    // Synthesized class resource pools: Hit Dice & Arcane Recovery
    assert.ok(pc.resourcePools?.some((p) => p.name.includes('Hit Dice') && p.max === 5));
    assert.ok(pc.resourcePools?.some((p) => p.name === 'Arcane Recovery'));

    // Tactical evaluation: Controller / Utility party roles, Darkvision sense, concentration audit flag
    assert.ok(evaluation.partyRoles.includes('Controller'));
    assert.ok(evaluation.defensiveProfile.senses.some((s) => s.toLowerCase().includes('darkvision')));
    assert.ok(
      evaluation.auditNotes.some(
        (n) => n.category === 'concentration' && n.message.toLowerCase().includes('haste'),
      ),
    );
  });

  it('synthesizes Warlock Pact Magic slots and flags >3 attuned items and ability modifier math discrepancies', () => {
    const pc = evaluateCharacterSheet({
      name: 'Malakor',
      classes: [
        { name: 'Warlock', level: 5 },
        { name: 'Fighter', level: 2 },
      ],
      abilities: { STR: 10, DEX: 14, CON: 14, INT: 10, WIS: 10, CHA: 18 },
      abilityModifiers: { STR: 0, DEX: 2, CON: 2, INT: 0, WIS: 0, CHA: 2 }, // CHA 18 should be +4, reported +2
      inventory: [
        { id: '1', name: 'Rod of the Pact Keeper', qty: 1, weight: 2, equipped: true, attuned: true, notes: '' },
        { id: '2', name: 'Cloak of Protection', qty: 1, weight: 1, equipped: true, attuned: true, notes: '' },
        { id: '3', name: 'Ring of Protection', qty: 1, weight: 0, equipped: true, attuned: true, notes: '' },
        { id: '4', name: 'Stone of Good Luck', qty: 1, weight: 0, equipped: true, attuned: true, notes: '' },
      ],
    });

    const evaluation = pc.evaluation!;
    assert.ok(evaluation);

    // Warlock 5 -> 2 Pact Magic slots of 3rd level
    assert.deepStrictEqual(pc.pactSlots, { level: 3, max: 2, used: 0 });

    // Fighter 2 -> Action Surge + Second Wind
    assert.ok(pc.resourcePools?.some((p) => p.name === 'Action Surge' && p.max === 1));
    assert.ok(pc.resourcePools?.some((p) => p.name === 'Second Wind' && p.max === 1));

    // Audit notes: >3 attuned items + ability math discrepancy on CHA
    assert.ok(evaluation.auditNotes.some((n) => n.category === 'attunement'));
    assert.ok(evaluation.auditNotes.some((n) => n.category === 'ability-math'));
  });
});

describe('State-Preserving Delta Merge (mergeUploadedCharacterSheet)', () => {
  it('preserves mid-session damageTaken, tempHp, conditions, deathSaves, exhaustion, inspiration, spent spell slots, spent class resources, and custom trackers on level-up re-upload', () => {
    const base = evaluateCharacterSheet({
      id: 'pc-aria',
      name: 'Aria Dawnblade',
      classes: [{ name: 'Paladin', level: 3 }],
      level: 3,
      abilities: { STR: 16, DEX: 10, CON: 14, INT: 10, WIS: 12, CHA: 16 },
      ac: 18,
      hp: { current: 28, max: 28, temp: 0 },
    });

    // Simulate mid-session combat state on the existing PC:
    // - Took 11 damage (currentHp = 17 / 28, damageTaken = 11)
    // - Has 6 tempHp, Poisoned condition, 1 exhaustion, inspiration = true, 1 death save failure
    // - Spent 2 of 3 level-1 spell slots (used = 2)
    // - Spent 10 of 15 Lay on Hands points (current = 5 / 15, spent = 10)
    // - Spent 1 Hit Die (used = 1 / 3)
    // - Added a custom manual resource tracker ("Divine Favor Token", 2 / 3)
    // - Added a custom loot item ("Mystery Dungeon Key", sharedWithGm: false) and partyLoot
    const midSessionPc = {
      ...base,
      hp: { current: 17, max: 28, temp: 6 },
      conditions: ['Poisoned', 'Blessed'],
      exhaustion: 1 as const,
      inspiration: true,
      deathSaves: { successes: 1 as const, failures: 1 as const },
      hitDice: { dieSize: 10, max: 3, used: 1 },
      spellSlots: {
        ...(base.spellSlots ?? {}),
        1: { max: 3, used: 2 },
      },
      resourcePools: [
        ...(base.resourcePools ?? []).map((p) =>
          p.name === 'Lay on Hands'
            ? { ...p, current: 5, max: 15 }
            : p.name.includes('Hit Dice')
            ? { ...p, current: 2, max: 3 }
            : p,
        ),
        {
          id: 'custom-token',
          name: 'Divine Favor Token',
          current: 2,
          max: 3,
          rechargeOn: 'manual' as const,
        },
      ],
      inventory: [
        {
          id: 'item-key',
          name: 'Mystery Dungeon Key',
          qty: 1,
          weight: 0.5,
          equipped: false,
          attuned: false,
          notes: 'Found in goblin vault',
          sharedWithGm: false,
        },
      ],
      partyLoot: 'Bag of Holding, 500 gp ruby, Alchemy Jug',
      notes: 'Active session combat notes',
    };

    // Player levels up to Paladin 5 and uploads updated sheet (new maxHp = 44, unlocks 2nd-level spell slots, Lay on Hands max = 25)
    const leveledUpUpload = evaluateCharacterSheet({
      name: 'Aria Dawnblade',
      classes: [{ name: 'Paladin', subclass: 'Devotion', level: 5 }],
      level: 5,
      abilities: { STR: 18, DEX: 10, CON: 14, INT: 10, WIS: 12, CHA: 16 },
      ac: 19,
      hp: { current: 44, max: 44, temp: 0 }, // freshly exported sheet says 44/44
      inventory: [
        {
          id: 'item-sword',
          name: '+1 Longsword',
          qty: 1,
          weight: 3,
          equipped: true,
          attuned: false,
          notes: 'Martial weapon',
        },
      ],
    });

    const merged = mergeUploadedCharacterSheet(midSessionPc, leveledUpUpload);

    // 1. Vitals preservation: damageTaken was 28 - 17 = 11 -> new currentHp = 44 - 11 = 33
    assert.strictEqual(merged.hp.max, 44);
    assert.strictEqual(merged.hp.current, 33);
    assert.strictEqual(merged.hp.temp, 6);
    assert.deepStrictEqual(merged.conditions, ['Poisoned', 'Blessed']);
    assert.strictEqual(merged.exhaustion, 1);
    assert.strictEqual(merged.inspiration, true);
    assert.deepStrictEqual(merged.deathSaves, { successes: 1, failures: 1 });

    // 2. Hit Dice preservation: 1 spent out of new max 5 -> used = 1, max = 5
    assert.deepStrictEqual(merged.hitDice, { dieSize: 10, max: 5, used: 1 });

    // 3. Spell Slots preservation:
    //    Level 1 had 2 spent, new max is 4 -> used = 2, max = 4 (2 remaining)
    //    Level 2 is newly unlocked at Paladin 5 -> used = 0, max = 2 (full)
    assert.deepStrictEqual(merged.spellSlots?.[1], { max: 4, used: 2 });
    assert.deepStrictEqual(merged.spellSlots?.[2], { max: 2, used: 0 });

    // 4. Class Resource Pool preservation:
    //    Lay on Hands had 10 spent (15 - 5 = 10), new max is 25 -> current = 25 - 10 = 15
    const layOnHands = merged.resourcePools?.find((p) => p.name === 'Lay on Hands');
    assert.ok(layOnHands);
    assert.strictEqual(layOnHands.max, 25);
    assert.strictEqual(layOnHands.current, 15);

    //    Custom manual resource tracker preserved intact
    const customPool = merged.resourcePools?.find((p) => p.name === 'Divine Favor Token');
    assert.ok(customPool);
    assert.strictEqual(customPool.current, 2);
    assert.strictEqual(customPool.max, 3);

    // 5. Inventory & Party Loot preservation:
    assert.ok(merged.inventory.some((i) => i.name === '+1 Longsword'));
    const preservedKey = merged.inventory.find((i) => i.name === 'Mystery Dungeon Key');
    assert.ok(preservedKey);
    assert.strictEqual(preservedKey.sharedWithGm, false);
    assert.ok(merged.partyLoot?.includes('Bag of Holding'));

    // 6. Outbound player writeback strips sharedWithGm === false inventory items
    const writeback = buildPlayerWritebackFromMergedPc(merged);
    const writebackJson = JSON.stringify(writeback);
    assert.ok(!writebackJson.includes('Mystery Dungeon Key'));
    assert.ok(writebackJson.includes('+1 Longsword'));
  });

  it('matches existing PCs by targetPcId, targetSlotId, or normalized character name', () => {
    const pc1 = { ...emptyPc(), id: 'pc-1', name: ' Seraphina   Vale ' };
    const pc2 = {
      ...emptyPc(),
      id: 'pc-2',
      name: 'Garrick',
      ownership: { ownerType: 'player' as const, playerSlotId: 'slot-garrick' },
    };

    const uploaded = { ...emptyPc(), id: 'pc-new', name: 'seraphina vale' };
    assert.strictEqual(findMatchingPc([pc1, pc2], uploaded)?.id, 'pc-1');
    assert.strictEqual(findMatchingPc([pc1, pc2], uploaded, 'pc-2')?.id, 'pc-2');
    assert.strictEqual(
      findMatchingPc([pc1, pc2], { ...emptyPc(), id: 'pc-x', name: 'Renamed' }, undefined, 'slot-garrick')?.id,
      'pc-2',
    );
  });
});

describe('Tier 1 Client-Side Deterministic Parser (JSON & PDF AcroForm/Text)', () => {
  it('parses D&D Beyond JSON exports deterministically with zero LLM calls', () => {
    const ddbJson = JSON.stringify({
      data: {
        name: 'Theren Moonwhisper',
        race: { fullName: 'Wood Elf' },
        classes: [
          {
            level: 4,
            definition: { name: 'Ranger', hitDice: 10 },
            subclassDefinition: { name: 'Gloom Stalker' },
          },
        ],
        stats: [
          { id: 1, value: 12 },
          { id: 2, value: 18 },
          { id: 3, value: 14 },
          { id: 4, value: 10 },
          { id: 5, value: 16 },
          { id: 6, value: 8 },
        ],
        baseHitPoints: 28,
        removedHitPoints: 5,
        temporaryHitPoints: 0,
        currencies: { cp: 0, sp: 15, ep: 0, gp: 120, pp: 2 },
        inventory: [
          {
            definition: { name: 'Longbow', weight: 2, damage: { diceString: '1d8' }, damageType: 'Piercing' },
            quantity: 1,
            equipped: true,
          },
        ],
      },
    });

    const res = parseCharacterJsonString(ddbJson);
    assert.strictEqual(res.pc.name, 'Theren Moonwhisper');
    assert.strictEqual(res.pc.race, 'Wood Elf');
    assert.strictEqual(res.pc.level, 4);
    assert.strictEqual(res.pc.abilities.DEX, 18);
    assert.strictEqual(res.pc.abilities.WIS, 16);
    // Max HP = 28 + CON(+2)*4 = 36, removed = 5 -> current = 31
    assert.strictEqual(res.pc.hp.max, 36);
    assert.strictEqual(res.pc.hp.current, 31);
    assert.strictEqual(res.pc.currency?.gp, 120);
  });

  it('extracts AcroForm PDF fields deterministically when present', () => {
    const fakePdfCorpus = `
      << /T (CharacterName) /V (Kaelen Ironheart) >>
      << /T (ClassLevel) /V (Barbarian 4) >>
      << /T (Race ) /V (Mountain Dwarf) >>
      << /T (Background) /V (Soldier) >>
      << /T (STR) /V (18) >>
      << /T (DEX) /V (14) >>
      << /T (CON) /V (16) >>
      << /T (INT) /V (8) >>
      << /T (WIS) /V (12) >>
      << /T (CHA) /V (10) >>
      << /T (AC) /V (16) >>
      << /T (HPMax) /V (45) >>
      << /T (HPCurrent) /V (38) >>
      << /T (Speed) /V (25 ft) >>
    `;

    const parsed = parsePdfDeterministicFromCorpus(fakePdfCorpus);
    assert.ok(parsed);
    assert.strictEqual(parsed.name, 'Kaelen Ironheart');
    assert.strictEqual(parsed.level, 4);
    assert.strictEqual(parsed.abilities.STR, 18);
    assert.strictEqual(parsed.abilities.CON, 16);
    assert.strictEqual(parsed.ac, 16);
    assert.strictEqual(parsed.hp.max, 45);
    assert.strictEqual(parsed.hp.current, 38);
    // Evaluated Rage resource pool synthesized automatically for Barbarian 4
    assert.ok(parsed.resourcePools?.some((p) => p.name === 'Rage' && p.max === 3));
  });
});
