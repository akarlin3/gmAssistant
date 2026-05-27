import { test, expect } from 'vitest';
import { rollExprForSuggestion } from './roll-with-modifiers';
import { makePc } from '@/lib/pc/factory';

test('skill modifier with proficiency', () => {
  const pc = makePc({
    abilities: { STR: 10, DEX: 16, CON: 12, INT: 10, WIS: 13, CHA: 8 },
    proficiencies: {
      skills: ['Stealth'],
      savingThrows: [],
      languages: [],
      tools: [],
      armor: [],
      weapons: [],
    },
    proficiencyBonus: 2,
  });
  expect(
    rollExprForSuggestion(pc, { ability: 'DEX', skill: 'Stealth', dc: 15, reason: '' }),
  ).toBe('1d20+5'); // DEX 16 (+3) + prof 2
});

test('ability modifier without skill', () => {
  const pc = makePc({
    abilities: { STR: 16, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    proficiencyBonus: 2,
  });
  expect(rollExprForSuggestion(pc, { ability: 'STR', dc: 15, reason: '' })).toBe(
    '1d20+3',
  );
});

test('skill without proficiency uses bare ability mod', () => {
  const pc = makePc({
    abilities: { STR: 10, DEX: 16, CON: 12, INT: 10, WIS: 13, CHA: 8 },
    proficiencyBonus: 2,
  });
  expect(
    rollExprForSuggestion(pc, { ability: 'DEX', skill: 'Acrobatics', dc: 15, reason: '' }),
  ).toBe('1d20+3'); // DEX 16 (+3), not proficient
});

test('negative modifier formats without double sign', () => {
  const pc = makePc({
    abilities: { STR: 6, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 },
    proficiencyBonus: 2,
  });
  expect(rollExprForSuggestion(pc, { ability: 'STR', dc: 10, reason: '' })).toBe(
    '1d20-2',
  );
});
