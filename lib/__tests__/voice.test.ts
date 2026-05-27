import { test, describe } from 'node:test';
import assert from 'node:assert';
import { parseNpcDialogueLines } from '../voice/parseNpcDialogue.js';
import { voiceProfileSignature } from '../voice/hash.js';
import { currentUsageMonth, nextResetDate } from '../voice/usage.js';
import type { VoiceProfile } from '../voice/types.js';

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
    assert.deepStrictEqual(out.map((l) => l.npcId), ['npc-inka', 'npc-marta']);
  });
});

describe('voiceProfileSignature', () => {
  const base: VoiceProfile = { provider: 'openai', voiceId: 'nova', voiceName: 'Nova', speed: 1 };

  test('ignores cosmetic voiceName changes', () => {
    const renamed: VoiceProfile = { ...base, voiceName: 'Nova (Inka)' };
    assert.strictEqual(voiceProfileSignature(base), voiceProfileSignature(renamed));
  });

  test('changes when a meaningful field changes', () => {
    const faster: VoiceProfile = { ...base, speed: 1.5 };
    assert.notStrictEqual(voiceProfileSignature(base), voiceProfileSignature(faster));
  });

  test('distinguishes providers and voice ids', () => {
    const el: VoiceProfile = { provider: 'elevenlabs', voiceId: 'abc', voiceName: 'Nova' };
    assert.notStrictEqual(voiceProfileSignature(base), voiceProfileSignature(el));
  });
});

describe('usage date helpers', () => {
  test('currentUsageMonth is YYYY-MM', () => {
    const m = currentUsageMonth(Date.UTC(2026, 4, 27)); // May 2026
    assert.strictEqual(m, '2026-05');
  });

  test('nextResetDate is the first of the following month', () => {
    assert.strictEqual(nextResetDate(Date.UTC(2026, 4, 27)), '2026-06-01');
    assert.strictEqual(nextResetDate(Date.UTC(2026, 11, 15)), '2027-01-01');
  });
});
