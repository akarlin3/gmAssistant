import { describe, test, expect } from 'vitest';
import {
  abilityMod,
  proficiencyBonusForLevel,
  pcTotalLevel,
  pcInitiative,
  formatMod,
} from '../derived';
import { skillModifier, savingThrowModifier, passivePerception } from '../skills';
import { syncAttackMacros, attackMacrosFor, dropPcMacros, type PcMacros } from '../macros';
import { longRest, shortRest } from '../rest';
import { mapParsedToPc } from '../from-parser';
import { normalizePc, makePc, capPcs, emptyPc } from '../factory';
import { pcToMarkdown } from '../export';
import { PC_CAP } from '../types';
import { emptyCharacter } from '@/lib/character-schema';

describe('derived', () => {
  test('abilityMod', () => {
    expect(abilityMod(10)).toBe(0);
    expect(abilityMod(16)).toBe(3);
    expect(abilityMod(8)).toBe(-1);
    expect(abilityMod(1)).toBe(-5);
    expect(abilityMod(20)).toBe(5);
  });

  test('proficiencyBonusForLevel thresholds', () => {
    expect(proficiencyBonusForLevel(1)).toBe(2);
    expect(proficiencyBonusForLevel(4)).toBe(2);
    expect(proficiencyBonusForLevel(5)).toBe(3);
    expect(proficiencyBonusForLevel(9)).toBe(4);
    expect(proficiencyBonusForLevel(13)).toBe(5);
    expect(proficiencyBonusForLevel(17)).toBe(6);
    expect(proficiencyBonusForLevel(20)).toBe(6);
  });

  test('pcTotalLevel sums multiclass', () => {
    const pc = makePc({
      classes: [
        { name: 'Fighter', level: 3 },
        { name: 'Wizard', level: 2 },
      ],
    });
    expect(pcTotalLevel(pc)).toBe(5);
  });

  test('pcInitiative honors the stored initiativeMod override', () => {
    const pc = makePc({
      abilities: { STR: 10, DEX: 18, CON: 10, INT: 10, WIS: 10, CHA: 10 },
      initiativeMod: 2,
    });
    expect(pcInitiative(pc)).toBe(2);
  });

  test('formatMod', () => {
    expect(formatMod(3)).toBe('+3');
    expect(formatMod(-2)).toBe('-2');
    expect(formatMod(0)).toBe('+0');
  });
});

describe('skills/saves', () => {
  const pc = makePc({
    abilities: { STR: 10, DEX: 16, CON: 12, INT: 10, WIS: 14, CHA: 8 },
    proficiencies: {
      skills: ['Stealth', 'Perception'],
      savingThrows: ['DEX'],
      languages: [],
      tools: [],
      armor: [],
      weapons: [],
    },
    proficiencyBonus: 3,
  });

  test('skill with proficiency adds bonus', () => {
    expect(skillModifier(pc, 'Stealth')).toBe(3 + 3); // DEX +3 + prof 3
  });

  test('skill without proficiency is bare ability', () => {
    expect(skillModifier(pc, 'Acrobatics')).toBe(3); // DEX +3
  });

  test('saving throw proficiency', () => {
    expect(savingThrowModifier(pc, 'DEX')).toBe(3 + 3);
    expect(savingThrowModifier(pc, 'STR')).toBe(0);
  });

  test('passive perception', () => {
    // WIS 14 (+2) + prof 3 + 10 = 15
    expect(passivePerception(pc)).toBe(15);
  });

  test('modifiers update when ability scores change', () => {
    const before = skillModifier(pc, 'Stealth');
    const buffed = { ...pc, abilities: { ...pc.abilities, DEX: 20 } };
    expect(skillModifier(buffed, 'Stealth')).toBe(before + 2);
  });
});

describe('macros', () => {
  test('attack produces hit + damage macros', () => {
    const pc = makePc({
      attacks: [
        {
          id: 'a1',
          name: 'Shortsword',
          attackBonus: 5,
          damageExpr: '1d6+3',
          damageType: 'piercing',
          range: '5 ft.',
        },
      ],
    });
    const macros = attackMacrosFor(pc);
    expect(macros).toHaveLength(2);
    expect(macros[0]).toMatchObject({
      id: 'attack:a1:hit',
      name: 'Shortsword — Attack',
      formula: '1d20+5',
    });
    expect(macros[1]).toMatchObject({
      id: 'attack:a1:dmg',
      name: 'Shortsword — Damage (piercing)',
      formula: '1d6+3',
    });
  });

  test('syncAttackMacros is idempotent and preserves manual macros', () => {
    const pc = makePc({
      id: 'pc1',
      attacks: [
        { id: 'a1', name: 'Bow', attackBonus: 7, damageExpr: '1d8+4', damageType: 'piercing', range: '150/600 ft.' },
      ],
    });
    let store: PcMacros = { pc1: [{ id: 'custom:1', name: 'Custom', formula: '2d6' }] };
    store = syncAttackMacros(pc, store);
    expect(store.pc1).toHaveLength(3); // 1 custom + 2 attack
    const again = syncAttackMacros(pc, store);
    expect(again.pc1).toHaveLength(3); // no duplication
    expect(again.pc1.find((m) => m.id === 'custom:1')).toBeDefined();
  });

  test('negative attack bonus formats correctly', () => {
    const pc = makePc({
      attacks: [{ id: 'a1', name: 'Improvised', attackBonus: -1, damageExpr: '1d4', damageType: 'bludgeoning', range: '5 ft.' }],
    });
    expect(attackMacrosFor(pc)[0].formula).toBe('1d20-1');
  });

  test('dropPcMacros removes the bucket', () => {
    const store = { pc1: [{ id: 'x', name: 'y', formula: '1d6' }] };
    expect(dropPcMacros('pc1', store)).toEqual({});
  });
});

describe('rest', () => {
  const pc = makePc({
    hp: { current: 4, max: 30, temp: 5 },
    hitDice: { dieSize: 10, max: 5, used: 5 },
    exhaustion: 2,
    deathSaves: { successes: 2, failures: 1 },
    spellSlots: { 1: { max: 4, used: 3 }, 2: { max: 2, used: 2 } },
    features: [
      { id: 'f1', name: 'Second Wind', source: 'Fighter', description: '', uses: { max: 1, used: 1, refresh: 'short' } },
      { id: 'f2', name: 'Action Surge', source: 'Fighter', description: '', uses: { max: 1, used: 1, refresh: 'short' } },
      { id: 'f3', name: 'Bardic Inspiration', source: 'Bard', description: '', uses: { max: 3, used: 2, refresh: 'long' } },
    ],
  });

  test('short rest resets only short-refresh features', () => {
    const rested = shortRest(pc);
    expect(rested.features.find((f) => f.id === 'f1')!.uses!.used).toBe(0);
    expect(rested.features.find((f) => f.id === 'f3')!.uses!.used).toBe(2); // long unchanged
    expect(rested.hp.current).toBe(4); // HP untouched
  });

  test('long rest resets slots, features, halves used hit dice', () => {
    const rested = longRest(pc);
    expect(rested.hp.current).toBe(30);
    expect(rested.hp.temp).toBe(0);
    expect(rested.hitDice.used).toBe(2); // floor(5/2)
    expect(rested.spellSlots![1]!.used).toBe(0);
    expect(rested.spellSlots![2]!.used).toBe(0);
    expect(rested.features.every((f) => !f.uses || f.uses.used === 0)).toBe(true);
    expect(rested.exhaustion).toBe(1); // reduced by 1
    expect(rested.deathSaves).toEqual({ successes: 0, failures: 0 });
  });
});

describe('factory/normalize', () => {
  test('normalizePc coerces junk to safe defaults', () => {
    const pc = normalizePc({
      name: 'Test',
      level: '5',
      abilities: { STR: '18', DEX: 'bad' },
      ac: '17',
      exhaustion: 99,
      proficiencies: { skills: ['Stealth', 'NotASkill'], savingThrows: ['DEX', 'XYZ'] },
    });
    expect(pc.level).toBe(5);
    expect(pc.abilities.STR).toBe(18);
    expect(pc.abilities.DEX).toBe(10); // bad -> default
    expect(pc.ac).toBe(17);
    expect(pc.exhaustion).toBe(6); // clamped
    expect(pc.proficiencies.skills).toEqual(['Stealth']);
    expect(pc.proficiencies.savingThrows).toEqual(['DEX']);
  });

  test('normalizePc round-trips a full PC', () => {
    const original = makePc({ name: 'Round', level: 3, ac: 16 });
    const round = normalizePc(JSON.parse(JSON.stringify(original)));
    expect(round.name).toBe('Round');
    expect(round.level).toBe(3);
    expect(round.ac).toBe(16);
  });

  test('capPcs enforces the cap', () => {
    const many = Array.from({ length: PC_CAP + 3 }, () => emptyPc());
    expect(capPcs(many)).toHaveLength(PC_CAP);
  });
});

describe('from-parser', () => {
  test('maps a parsed character into a structured PC', () => {
    const parsed = {
      ...emptyCharacter(),
      name: 'Avery',
      classLevel: 'Fighter 3 / Wizard 2 (Evocation)',
      race: 'Human',
      background: 'Soldier',
      abilities: { str: '16', dex: '14', con: '15', int: '12', wis: '10', cha: '8' },
      ac: '18',
      hp: '40',
      hpMax: '40',
      skills: 'Athletics +6, Perception +3',
      saves: 'STR, CON',
      attacks: [{ name: 'Longsword', bonus: '+6', damage: '1d8+3', notes: 'versatile' }],
      equipment: 'Longsword, Shield, Backpack',
      spells: 'Fire Bolt, Shield, Magic Missile',
    };
    const pc = mapParsedToPc(parsed);
    expect(pc.name).toBe('Avery');
    expect(pc.level).toBe(5);
    expect(pc.classes).toEqual([
      { name: 'Fighter', level: 3 },
      { name: 'Wizard', level: 2, subclass: 'Evocation' },
    ]);
    expect(pc.abilities.STR).toBe(16);
    expect(pc.ac).toBe(18);
    expect(pc.hp.max).toBe(40);
    expect(pc.proficiencies.skills).toContain('Athletics');
    expect(pc.proficiencies.skills).toContain('Perception');
    expect(pc.proficiencies.savingThrows).toContain('STR');
    expect(pc.proficiencies.savingThrows).toContain('CON');
    expect(pc.attacks[0]).toMatchObject({ name: 'Longsword', attackBonus: 6, damageExpr: '1d8+3' });
    expect(pc.inventory.map((i) => i.name)).toEqual(['Longsword', 'Shield', 'Backpack']);
    expect(pc.spellsKnown).toEqual(['Fire Bolt', 'Shield', 'Magic Missile']);
  });
});

describe('export', () => {
  test('pcToMarkdown includes core sections', () => {
    const pc = makePc({
      name: 'Avery',
      level: 3,
      race: 'Human',
      classes: [{ name: 'Fighter', level: 3 }],
      abilities: { STR: 16, DEX: 14, CON: 15, INT: 10, WIS: 12, CHA: 8 },
      ac: 18,
      hp: { current: 24, max: 24, temp: 0 },
      attacks: [{ id: 'a1', name: 'Shortsword', attackBonus: 5, damageExpr: '1d6+3', damageType: 'piercing', range: '5 ft.' }],
    });
    const md = pcToMarkdown(pc);
    expect(md).toContain('# Avery');
    expect(md).toContain('## Abilities');
    expect(md).toContain('**AC:** 18');
    expect(md).toContain('## Attacks');
    expect(md).toContain('Shortsword');
  });
});
