import { test, describe } from 'node:test';
import assert from 'node:assert';
import { parseNpcDialogueLines } from '../voice/parseNpcDialogue.js';

const NPCS = [
  { id: 'npc-inka', name: 'Inka' },
  { id: 'npc-marta', name: 'Marta Quill' },
];

describe('parseNpcDialogueLines', () => {
  test('extracts a bare @Name: "line" pattern', () => {
    const out = parseNpcDialogueLines('@Inka: "Stay back, traveler."', NPCS);
    assert.deepStrictEqual(out, [
      { npcId: 'npc-inka', npcName: 'Inka', line: 'Stay back, traveler.' },
    ]);
  });

  test('handles quoted multi-word names and curly quotes', () => {
    const out = parseNpcDialogueLines('@"Marta Quill": “The ledger lies.”', NPCS);
    assert.deepStrictEqual(out, [
      { npcId: 'npc-marta', npcName: 'Marta Quill', line: 'The ledger lies.' },
    ]);
  });

  test('resolves a light typo via the Levenshtein fallback', () => {
    const out = parseNpcDialogueLines('@Inkka: "Who goes there?"', NPCS);
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0].npcId, 'npc-inka');
  });

  test('drops unresolved names and lines without quotes', () => {
    const out = parseNpcDialogueLines('@Nobody: "Hi" and @Inka said hello', NPCS);
    assert.deepStrictEqual(out, []);
  });

  test('finds multiple lines in one block of text', () => {
    const text = 'The hall fell quiet. @Inka: "Sit." Then @Marta Quill: "No."';
    const out = parseNpcDialogueLines(text, NPCS);
    assert.deepStrictEqual(
      out.map((l) => l.npcId),
      ['npc-inka', 'npc-marta'],
    );
  });
});
