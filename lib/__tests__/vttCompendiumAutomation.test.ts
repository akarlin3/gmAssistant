import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import {
  SRD_CORE_MONSTERS,
  SRD_MAGIC_ITEMS,
  SRD_SPELLS,
  SRD_CONDITIONS,
  createPartyLootFromItem,
  getSrdMagicItemBySlugOrName,
  getSrdMonsterBySlugOrName,
  getSrdSpellBySlugOrName,
  grantMagicItemToPc,
  grantSpellToPc,
  instantiateMonsterCombatants,
  rollHitPointsFormula,
  searchSrdCompendium,
} from '../srdCompendium';
import {
  applyVttImportToCampaign,
  detectVttExportFormat,
  parseVttExport,
  stripHtmlAndVttTags,
} from '../vttImporter';
import {
  applyAutomatedDamageToCombatant,
  applyAutomatedDamageToPc,
  autoRollMonsterSavePrompt,
  buildAoeSvgGeometry,
  computeTokensInAoe,
  createCombatSavePrompt,
  formatSavePromptBanner,
  measureMapDistance,
  projectSavePromptsForSlot,
  resolveSavePromptForPlayer,
} from '../combatAutomation';
import { emptyPc } from '../pc/factory';
import { executeSheetRoll } from '../diceRoller';
import {
  emitLocalVisualRoll,
  filterPublicVisualRolls,
  shouldBroadcastVisualRoll,
  subscribeLocalVisualRolls,
} from '../visualDiceBus';
import { extractVisualDiceFaces } from '../../components/VisualDiceOverlay';
import { getVaultSnapshotsSync } from '../snapshotVault';

describe('1. Offline-First 5e SRD Compendium & Statblock Instantiation (srdCompendium)', () => {
  it('bundles CC-BY-4.0 SRD Core Monsters, Spells (0–9), Conditions, and Magic Items', () => {
    assert.ok(SRD_CORE_MONSTERS.length >= 40, 'Expected >= 40 core SRD monsters');
    assert.ok(SRD_SPELLS.length >= 250, 'Expected full SRD spell index');
    assert.ok(SRD_CONDITIONS.length >= 14, 'Expected core 5e SRD conditions');
    assert.ok(SRD_MAGIC_ITEMS.length >= 25, 'Expected >= 25 core SRD magic items');

    // Verify spell levels 0..9 are all covered
    for (let lvl = 0; lvl <= 9; lvl++) {
      assert.ok(
        SRD_SPELLS.some((s) => s.level === lvl),
        `Expected spells at level ${lvl}`,
      );
    }

    // Fireball extracts 8d6 fire, DEX save, halfOnSave, and 20ft sphere AoE
    const fireball = getSrdSpellBySlugOrName('Fireball');
    assert.ok(fireball);
    assert.equal(fireball.level, 3);
    assert.equal(fireball.damageFormula, '8d6');
    assert.equal(fireball.damageType, 'fire');
    assert.equal(fireball.saveAbility, 'DEX');
    assert.equal(fireball.halfOnSave, true);
    assert.deepEqual(fireball.aoe, { shape: 'sphere', sizeFt: 20 });
  });

  it('indexes and filters SRD entries deterministically by query, category, CR, level, concentration, and rarity', () => {
    const exactGoblin = searchSrdCompendium('Goblin', { category: 'monster' });
    assert.ok(exactGoblin.length >= 1);
    assert.equal(exactGoblin[0].name, 'Goblin');

    const lowCrMonsters = searchSrdCompendium('', { category: 'monster', maxCr: 0.5, limit: 100 });
    assert.ok(lowCrMonsters.length >= 4);
    assert.ok(
      lowCrMonsters.every((e) => e.category === 'monster' && e.monster.crNumeric <= 0.5),
    );

    const concLvl3 = searchSrdCompendium('', {
      category: 'spell',
      spellLevel: 3,
      concentrationOnly: true,
    });
    assert.ok(concLvl3.length > 0);
    assert.ok(
      concLvl3.every(
        (e) => e.category === 'spell' && e.spell.level === 3 && e.spell.concentration,
      ),
    );

    const rareItems = searchSrdCompendium('', { category: 'item', rarity: 'Rare' });
    assert.ok(rareItems.length > 0);
    assert.ok(rareItems.every((e) => e.category === 'item' && e.item.rarity === 'Rare'));
  });

  it('rolls hit dice formulas and instantiates numbered Private combatants + tokens (Goblin 1, Goblin 2)', () => {
    const minRoll = rollHitPointsFormula('2d6+2', 7, () => 0);
    const maxRoll = rollHitPointsFormula('2d6+2', 7, () => 0.999);
    assert.equal(minRoll, 4);
    assert.equal(maxRoll, 14);

    const goblin = getSrdMonsterBySlugOrName('goblin')!;
    assert.ok(goblin);

    const spawn1 = instantiateMonsterCombatants(goblin, {
      count: 2,
      rollHp: true,
      rng: () => 0.5,
    });
    assert.equal(spawn1.combatants.length, 2);
    assert.equal(spawn1.tokens.length, 2);
    assert.equal(spawn1.combatants[0].name, 'Goblin 1');
    assert.equal(spawn1.combatants[1].name, 'Goblin 2');
    // Strictly Private by default!
    assert.equal(spawn1.combatants[0].hidden, true);
    assert.equal(spawn1.combatants[0].player_visible, false);
    assert.equal(spawn1.tokens[0].visibility, 'private');

    // Subsequent spawn increments numbering cleanly (`Goblin 3`)
    const spawn2 = instantiateMonsterCombatants(goblin, {
      count: 1,
      existingCombatants: spawn1.combatants,
      existingTokens: spawn1.tokens,
      rng: () => 0.5,
    });
    assert.equal(spawn2.combatants[0].name, 'Goblin 3');
  });

  it('wires SRD Spells and Magic Items into PC sheet attacks, AC, attunement, and Party Loot', () => {
    let wizard = {
      ...emptyPc(),
      name: 'Lyra',
      classes: [{ name: 'Wizard', level: 5 }],
      abilities: { STR: 8, DEX: 14, CON: 14, INT: 18, WIS: 12, CHA: 10 },
      proficiencyBonus: 3,
      ac: 12,
    };

    const bless = getSrdSpellBySlugOrName('Bless')!;
    const fireball = getSrdSpellBySlugOrName('Fireball')!;
    wizard = grantSpellToPc(wizard, bless);
    wizard = grantSpellToPc(wizard, fireball);

    assert.ok((wizard.spellsKnown ?? []).includes('Bless'));
    assert.ok((wizard.spellsKnown ?? []).includes('Fireball'));
    const fbAttack = wizard.attacks.find((a) => a.name === 'Fireball');
    assert.ok(fbAttack, 'Expected Fireball attack/cast entry on PC sheet');
    assert.equal(fbAttack.damageExpr, '8d6');
    assert.equal(fbAttack.damageType, 'fire');
    assert.ok(fbAttack.notes?.includes('DEX save'), 'Expected save DC note on Fireball');

    const cloak = getSrdMagicItemBySlugOrName('Cloak of Protection')!;
    const flameTongue = getSrdMagicItemBySlugOrName('Flame Tongue')!;
    const prevAc = wizard.ac;
    wizard = grantMagicItemToPc(wizard, cloak);
    wizard = grantMagicItemToPc(wizard, flameTongue);

    assert.equal(wizard.ac, prevAc + 1);
    assert.equal(wizard.attunedCount, 2);
    const ftAttack = wizard.attacks.find((a) => a.name === 'Flame Tongue');
    assert.ok(ftAttack);
    assert.ok(ftAttack.damageExpr.includes('2d6'));

    const loot = createPartyLootFromItem(cloak, 1);
    assert.equal(loot.name, 'Cloak of Protection');
    assert.equal(loot.qty, 1);
    assert.ok(loot.notes?.includes('Uncommon'));
  });
});

describe('2. Universal VTT & Encounter Importer (vttImporter)', () => {
  it('strips 5etools tags, Foundry @UUID links, and HTML cleanly', () => {
    const cleaned = stripHtmlAndVttTags(
      '<p>{@atk mw} {@hit 6} to hit, {@h}9 ({@damage 2d6 + 2}) slashing damage. Must pass {@dc 14} CON save vs @UUID[Compendium.dnd5e.rules.Poisoned]{Poisoned}.</p>',
    );
    assert.ok(!cleaned.includes('{@'));
    assert.ok(!cleaned.includes('<p>'));
    assert.ok(cleaned.includes('Melee Weapon Attack:'));
    assert.ok(cleaned.includes('2d6 + 2'));
    assert.ok(cleaned.includes('DC 14'));
    assert.ok(cleaned.includes('Poisoned'));
  });

  it('normalizes Foundry VTT Actor, Item, Scene/Wall/Trap, and Journal exports', () => {
    const foundryBundle = JSON.stringify({
      actors: [
        {
          name: 'Shadow Cultist',
          type: 'npc',
          system: {
            abilities: {
              str: { value: 11 },
              dex: { value: 15 },
              con: { value: 12 },
              int: { value: 10 },
              wis: { value: 13 },
              cha: { value: 14 },
            },
            attributes: {
              ac: { flat: 14 },
              hp: { value: 27, max: 27, formula: '6d8' },
              movement: { walk: 30 },
            },
            details: { cr: 2, type: { value: 'humanoid' }, biography: { value: '<p>Secret cult leader</p>' } },
          },
          items: [
            {
              name: 'Shadow Blade',
              type: 'weapon',
              system: { description: { value: '+5 to hit, Hit: 8 (2d6+1) necrotic damage.' } },
            },
          ],
        },
      ],
      items: [
        {
          name: 'Ruby Key of Vaults',
          type: 'loot',
          system: { description: { value: '<p>Opens the sunken vault.</p>' }, rarity: 'rare' },
        },
      ],
      scenes: [
        {
          name: 'Sunken Vault',
          width: 2000,
          height: 1500,
          grid: { size: 100, distance: 5, units: 'ft' },
          walls: [{ c: [0, 0, 100, 0] }, { c: [100, 0, 100, 100] }],
          tokens: [
            { name: 'Cultist Guard', x: 500, y: 600 },
            { name: 'Poison Dart Trap', x: 800, y: 400, flags: { isTrap: true, dc: 15 } },
          ],
          notes: [{ text: 'Secret Altar', x: 1000, y: 750, notes: 'DC 16 Investigation' }],
        },
      ],
      journal: [
        {
          name: 'Vault History',
          pages: [{ name: 'Chamber 1 Notes', text: { content: '<p>Hidden lever behind statue.</p>' } }],
        },
      ],
    });

    assert.equal(detectVttExportFormat(foundryBundle), 'foundry-bundle');
    const preview = parseVttExport(foundryBundle);
    assert.equal(preview.monsters.length, 1);
    assert.equal(preview.monsters[0].name, 'Shadow Cultist');
    assert.equal(preview.monsters[0].ac, 14);
    assert.equal(preview.monsters[0].player_visible, false);
    assert.equal(preview.npcs.length, 1);
    assert.equal(preview.items.length, 1);
    assert.equal(preview.maps.length, 1);
    assert.equal(preview.maps[0].traps?.length, 1);
    assert.equal(preview.locations.length, 1);
  });

  it('normalizes Open5e, 5etools Bestiary, Roll20, Kobold+, Markdown statblocks, and D&D Beyond schemas', () => {
    const open5e = JSON.stringify({
      slug: 'frost-hound',
      name: 'Frost Hound',
      size: 'Medium',
      type: 'elemental',
      armor_class: 13,
      hit_points: 33,
      hit_dice: '6d8+6',
      challenge_rating: '2',
      strength: 15,
      dexterity: 14,
      constitution: 13,
      intelligence: 6,
      wisdom: 12,
      charisma: 6,
      damage_immunities: 'cold',
      actions: [{ name: 'Frost Bite', desc: '+4 to hit, Hit: 7 (1d8+3) cold damage.' }],
    });
    assert.equal(detectVttExportFormat(open5e), 'open5e-monster');
    const pOpen5e = parseVttExport(open5e);
    assert.equal(pOpen5e.monsters[0].name, 'Frost Hound');
    assert.deepEqual(pOpen5e.monsters[0].damageImmunities, ['cold']);

    const fiveTools = JSON.stringify({
      monster: [
        {
          name: 'Clockwork Sentinel',
          source: 'HB',
          size: ['L'],
          type: 'construct',
          ac: [{ ac: 17 }],
          hp: { average: 68, formula: '8d10 + 24' },
          speed: { walk: 30 },
          str: 18,
          dex: 10,
          con: 16,
          int: 8,
          wis: 12,
          cha: 6,
          cr: '4',
          action: [
            {
              name: 'Slam',
              entries: ['{@atk mw} {@hit 6} to hit, reach 5 ft., one target. {@h}13 ({@damage 2d8 + 4}) bludgeoning damage.'],
            },
          ],
        },
      ],
    });
    assert.equal(detectVttExportFormat(fiveTools), '5etools-bestiary');
    const p5eTools = parseVttExport(fiveTools);
    assert.equal(p5eTools.monsters[0].ac, 17);
    assert.equal(p5eTools.monsters[0].actions[0].attackBonus, 6);

    const mdStatblock = `
### Bone Knight
*Medium undead, lawful evil*
**Armor Class** 18 (plate)
**Hit Points** 58 (9d8 + 18)
**Speed** 30 ft.
**Challenge** 3 (700 XP)
***Actions***
***Greatsword.*** *Melee Weapon Attack:* +6 to hit, reach 5 ft., one target. *Hit:* 10 (2d6 + 3) slashing damage.
`;
    assert.equal(detectVttExportFormat(mdStatblock), 'markdown-statblock');
    const pMd = parseVttExport(mdStatblock);
    assert.equal(pMd.monsters.length, 1);
    assert.equal(pMd.monsters[0].name, 'Bone Knight');
    assert.equal(pMd.monsters[0].ac, 18);
    assert.equal(pMd.monsters[0].hp, 58);

    const kobold = JSON.stringify({
      name: 'Goblin Ambush',
      monsters: [{ name: 'Goblin', count: 3 }],
    });
    assert.equal(detectVttExportFormat(kobold), 'kobold-encounter');
    const pKobold = parseVttExport(kobold);
    assert.equal(pKobold.combatants.length, 3);
    assert.ok(pKobold.combatants.every((c) => c.hidden === true));

    const ddbChar = JSON.stringify({
      data: {
        name: 'Theron Brightshield',
        baseHitPoints: 36,
        removedHitPoints: 4,
        temporaryHitPoints: 5,
        stats: [
          { id: 1, value: 16 },
          { id: 2, value: 12 },
          { id: 3, value: 14 },
          { id: 4, value: 10 },
          { id: 5, value: 13 },
          { id: 6, value: 15 },
        ],
        classes: [{ level: 5, definition: { name: 'Paladin', hitDice: 10 } }],
        race: { fullName: 'Human' },
        inventory: [
          { equipped: true, quantity: 1, definition: { name: 'Chain Mail', armorClass: 16, filterType: 'Armor' } },
        ],
      },
    });
    assert.equal(detectVttExportFormat(ddbChar), 'ddb-character');
    const pDdb = parseVttExport(ddbChar);
    assert.equal(pDdb.pcs.length, 1);
    assert.equal(pDdb.pcs[0].name, 'Theron Brightshield');
    assert.equal(pDdb.pcs[0].hp.max, 46);
    assert.equal(pDdb.pcs[0].hp.current, 42);
    assert.equal(pDdb.pcs[0].hp.temp, 5);
  });

  it('saves a pre-import snapshot to snapshotVault and merges cleanly into Y.Doc with Private defaults', () => {
    const preview = parseVttExport(`
### Crypt Stalker
*Medium undead, neutral evil*
**Armor Class** 15
**Hit Points** 45 (6d8 + 18)
**Challenge** 3 (700 XP)
`);
    const yDoc = new Y.Doc();
    const initialState = { npcs: [], locations: [], maps: [] };

    const applied = applyVttImportToCampaign({
      campaignId: 'test-vtt-camp-1',
      campaignName: 'Curse of Crypts',
      currentState: initialState,
      preview,
      captureSnapshot: true,
      yDoc,
    });

    assert.ok(applied.snapshot, 'Expected pre-import VaultSnapshot');
    assert.equal(applied.snapshot.reason, 'json_import');
    assert.ok(getVaultSnapshotsSync('test-vtt-camp-1').length >= 1);

    assert.equal(applied.importedCounts.monsters, 1);
    assert.equal(applied.importedCounts.combatants, 1);
    assert.equal(applied.nextState.homebrewMonsters[0].player_visible, false);
    assert.equal(applied.nextState.__initiative.combatants[0].hidden, true);
    assert.equal(applied.nextState.__initiative.combatants[0].player_visible, false);
  });
});

describe('3. Automated Tactical Saving Throws, AoE Templates & Damage Application (combatAutomation)', () => {
  it('measures configurable grid distance (5ft/sq & 10ft/sq) and highlights tokens in Sphere/Cone/Cube/Line AoEs', () => {
    // STAGE_SQUARES_X = 20, STAGE_SQUARES_Y = 12.5
    // dx = 0.3 * 20 = 6 sq, dy = 0.32 * 12.5 = 4 sq
    const dist5e = measureMapDistance({
      startX: 0.1,
      startY: 0.1,
      endX: 0.4,
      endY: 0.42,
      gridFeetPerSquare: 5,
      diagonalRule: '5e-chebyshev',
    });
    assert.equal(dist5e.dxSquares, 6);
    assert.equal(dist5e.dySquares, 4);
    assert.equal(dist5e.squares, 6);
    assert.equal(dist5e.feet, 30);

    const dist10ft = measureMapDistance({
      startX: 0.1,
      startY: 0.1,
      endX: 0.4,
      endY: 0.42,
      gridFeetPerSquare: 10,
      diagonalRule: '5-10-5',
    });
    // 4 diagonals => +2 extra squares => 8 squares * 10ft = 80 ft
    assert.equal(dist10ft.squares, 8);
    assert.equal(dist10ft.feet, 80);

    const tokens = [
      { id: 'tok-center', x: 0.5, y: 0.5, size: 1 },
      { id: 'tok-near', x: 0.58, y: 0.5, size: 1 }, // 1.6 sq away (<= 4 sq radius)
      { id: 'tok-far', x: 0.9, y: 0.9, size: 1 },
    ];

    const sphereHits = computeTokensInAoe(
      {
        id: 'aoe-1',
        shape: 'sphere',
        originX: 0.5,
        originY: 0.5,
        targetX: 0.7,
        targetY: 0.5,
        sizeFt: 20,
        gridFeetPerSquare: 5,
      },
      tokens,
    );
    assert.deepEqual(sphereHits, ['tok-center', 'tok-near']);

    // Verify all 4 AoE SVG geometry builders succeed cleanly
    for (const shape of ['sphere', 'cube', 'cone', 'line'] as const) {
      const geo = buildAoeSvgGeometry({
        id: `aoe-${shape}`,
        shape,
        originX: 0.3,
        originY: 0.5,
        targetX: 0.7,
        targetY: 0.5,
        sizeFt: 30,
      });
      const expectedKind = shape === 'sphere' ? 'circle' : shape === 'cube' ? 'rect' : 'polygon';
      assert.equal(geo.kind, expectedKind);
    }
  });

  it('deducts tempHp first, halves resisted damage via evaluateCharacterSheet, zeroes immunities, and triggers Concentration DC', () => {
    let tiefling = {
      ...emptyPc(),
      name: 'Kael',
      race: 'Tiefling',
      hp: { current: 28, max: 28, temp: 5 },
      concentrationSpell: 'Hex',
    };

    const { updatedPc, result } = applyAutomatedDamageToPc(tiefling, {
      rawDamage: 28,
      outcome: 'full',
      damageType: 'fire',
    });

    assert.equal(result.defenseApplied, 'resistant');
    assert.equal(result.finalDamage, 14);
    assert.equal(updatedPc.hp.temp, 0);
    assert.equal(updatedPc.hp.current, 19);
    assert.equal(result.concentrationCheckRequired, true);
    assert.equal(result.concentrationDc, 10);
    assert.equal(result.concentrationSpell, 'Hex');

    const bigHit = applyAutomatedDamageToPc(tiefling, {
      rawDamage: 50,
      outcome: 'full',
      damageType: 'force',
    });
    assert.equal(bigHit.result.concentrationDc, 25);

    const immunePc = { ...tiefling, immunities: ['poison'] };
    const poisonHit = applyAutomatedDamageToPc(immunePc, {
      rawDamage: 40,
      outcome: 'full',
      damageType: 'poison',
    });
    assert.equal(poisonHit.result.defenseApplied, 'immune');
    assert.equal(poisonHit.result.finalDamage, 0);
    assert.equal(poisonHit.updatedPc.hp.temp, 5);
    assert.equal(poisonHit.updatedPc.hp.current, 28);
    assert.equal(poisonHit.result.concentrationCheckRequired, false);
  });

  it('projects targeted save prompts only to owning slots, enforces slot ownership on resolution, and auto-rolls monsters', () => {
    const pcA = {
      ...emptyPc(),
      id: 'pc-aria',
      name: 'Aria',
      hp: { current: 30, max: 30, temp: 4 },
      ownership: { ownerType: 'player' as const, playerSlotId: 'slot-aria' },
    };
    const pcB = {
      ...emptyPc(),
      id: 'pc-bram',
      name: 'Bram',
      hp: { current: 35, max: 35, temp: 0 },
      ownership: { ownerType: 'player' as const, playerSlotId: 'slot-bram' },
    };

    const prompt = createCombatSavePrompt({
      id: 'save-fb-1',
      sourceName: 'Fireball',
      ability: 'DEX',
      dc: 15,
      baseDamage: 28,
      damageType: 'fire',
      halfOnSuccess: true,
      targetPcIds: ['pc-aria'],
      targetCombatantIds: ['mon-1'],
      gmNotes: 'GM_TRAP_SECRET',
    });

    assert.equal(
      formatSavePromptBanner(prompt),
      '⚡ Roll DEX Save (DC 15 vs. Fireball)',
    );

    const campData = { pcs: [pcA, pcB], combatSavePrompts: [prompt] };
    const projAria = projectSavePromptsForSlot(campData, 'slot-aria');
    const projBram = projectSavePromptsForSlot(campData, 'slot-bram');

    assert.equal(projAria.length, 1);
    assert.equal(projAria[0].bannerText, '⚡ Roll DEX Save (DC 15 vs. Fireball)');
    assert.equal(projBram.length, 0);
    assert.ok(!JSON.stringify(projAria).includes('GM_TRAP_SECRET'));
    assert.ok(!JSON.stringify(projAria).includes('mon-1'));

    // Cross-slot resolution attempt fails closed!
    const crossAttempt = resolveSavePromptForPlayer({
      prompt,
      pc: pcA,
      resolverSlotId: 'slot-bram',
    });
    assert.equal(crossAttempt.ok, false);

    // Owned slot resolution succeeds cleanly
    const ownedRes = resolveSavePromptForPlayer({
      prompt,
      pc: pcA,
      resolverSlotId: 'slot-aria',
      rng: () => 0.95,
    });
    assert.equal(ownedRes.ok, true);
    if (ownedRes.ok) {
      assert.equal(ownedRes.passed, true);
      assert.equal(ownedRes.updatedPc.hp.temp, 0);
      assert.equal(ownedRes.updatedPc.hp.current, 20);
      assert.equal(ownedRes.writebackUpdates['hp.current'], 20);
      assert.equal(ownedRes.writebackUpdates['hp.temp'], 0);
    }

    // Monster auto-roller
    const goblin = getSrdMonsterBySlugOrName('goblin')!;
    const { combatants } = instantiateMonsterCombatants(goblin, { count: 1, rollHp: false });
    combatants[0].id = 'mon-1';
    const monMap = new Map([[goblin.id, goblin]]);
    const monAuto = autoRollMonsterSavePrompt({
      prompt,
      combatants,
      monstersById: monMap,
      rng: () => 0.1,
    });
    assert.equal(monAuto.updatedCombatants[0].hp.current, 0);
    assert.equal(monAuto.logLines.length, 1);
    assert.equal(applyAutomatedDamageToCombatant(combatants[0], { rawDamage: 4, outcome: 'half' }).result.finalDamage, 2);
  });
});

describe('4. Visual Dice Tray & Secret Roll Isolation (VisualDiceOverlay & visualDiceBus)', () => {
  it('extracts polyhedral dice faces (d4..d100), Nat 20 gold bursts, and Nat 1 shatters while isolating secretRoll', () => {
    const receivedLocal: string[] = [];
    const unsub = subscribeLocalVisualRolls((r) => receivedLocal.push(r.id));

    const nat20Public = executeSheetRoll({
      actorName: 'Aria',
      label: 'Longbow Attack',
      isD20: true,
      baseMod: 7,
      rng: () => 0.999,
    });

    const nat1Secret = executeSheetRoll({
      actorName: 'GM',
      label: 'Hidden Assassin Stealth',
      isD20: true,
      baseMod: 6,
      secretRoll: true,
      rng: () => 0.0,
    });

    unsub();

    assert.ok(receivedLocal.includes(nat20Public.id));
    assert.ok(receivedLocal.includes(nat1Secret.id));

    const faces20 = extractVisualDiceFaces(nat20Public);
    assert.equal(faces20.length, 1);
    assert.equal(faces20[0].dieType, 'd20');
    assert.equal(faces20[0].value, 20);
    assert.equal(faces20[0].isCrit20, true);
    assert.equal(shouldBroadcastVisualRoll(nat20Public), true);

    const faces1 = extractVisualDiceFaces(nat1Secret);
    assert.equal(faces1[0].isCrit1, true);
    assert.equal(shouldBroadcastVisualRoll(nat1Secret), false);
    const filtered = filterPublicVisualRolls([nat20Public, nat1Secret]);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].id, nat20Public.id);

    const multiDmg = executeSheetRoll({
      actorName: 'Aria',
      label: 'Flame Blade',
      isD20: false,
      baseFormula: '2d6+1d4',
      rng: () => 0.5,
    });
    const dmgFaces = extractVisualDiceFaces(multiDmg);
    assert.equal(dmgFaces.filter((f) => f.dieType === 'd6').length, 2);
    assert.equal(dmgFaces.filter((f) => f.dieType === 'd4').length, 1);

    let count = 0;
    const u2 = subscribeLocalVisualRolls(() => {
      count++;
    });
    emitLocalVisualRoll(nat1Secret);
    u2();
    assert.equal(count, 1);
  });
});
