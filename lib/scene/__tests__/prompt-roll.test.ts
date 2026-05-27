import { describe, it, expect } from 'vitest';
import { buildSceneTurnPrompt, buildVoiceCheckPrompt, buildSummarizeTurnsPrompt } from '../prompt';
import { formatRollExpr, rollLabel, resolveCheck } from '../roll';

describe('buildSceneTurnPrompt', () => {
  it('includes location, NPC cards, party state, and the new action', () => {
    const prompt = buildSceneTurnPrompt({
      location: { id: 'l1', name: 'The Salt Wheel', description: 'A coastal inn.' },
      npcs: [{ id: 'npc-inn', name: 'Inka', traits: 'Wary', voice: 'Curt', goals: 'Survive' }],
      partyState: 'just arrived',
      earlierSummary: null,
      recentTurns: [],
      newAction: 'I look around carefully.',
    });
    expect(prompt).toContain('The Salt Wheel: A coastal inn.');
    expect(prompt).toContain('ID: npc-inn');
    expect(prompt).toContain('Traits: Wary');
    expect(prompt).toContain('just arrived');
    expect(prompt).toContain('I look around carefully.');
    expect(prompt).toContain('(no turns yet');
    expect(prompt).toContain('SRD 5.1 DC reference');
  });
});

describe('voice + summarize prompts', () => {
  it('voice-check prompt embeds traits, voice, and the line', () => {
    const p = buildVoiceCheckPrompt({ traits: 'Gruff', voice: 'Clipped', line: 'Hello darling!' });
    expect(p).toContain('NPC traits: Gruff');
    expect(p).toContain('"Hello darling!"');
    expect(p).toContain('WARN:');
  });
  it('summarize prompt embeds the turns JSON', () => {
    const p = buildSummarizeTurnsPrompt('[{"x":1}]');
    expect(p).toContain('[{"x":1}]');
    expect(p).toContain('3-5 sentences');
  });
});

describe('roll helpers', () => {
  it('formats the d20 expression with the modifier sign', () => {
    expect(formatRollExpr(3)).toBe('1d20+3');
    expect(formatRollExpr(0)).toBe('1d20');
    expect(formatRollExpr(-2)).toBe('1d20-2');
  });
  it('builds a human roll label', () => {
    expect(rollLabel({ ability: 'DEX', skill: 'Stealth', dc: 14, reason: '' })).toBe(
      'Roll DEX (Stealth) DC 14',
    );
    expect(rollLabel({ ability: 'STR', dc: 10, reason: '' })).toBe('Roll STR DC 10');
  });
  it('resolves a check within bounds and computes success', () => {
    for (let i = 0; i < 50; i++) {
      const r = resolveCheck(5, 10);
      expect(r.result).toBeGreaterThanOrEqual(6);
      expect(r.result).toBeLessThanOrEqual(25);
      expect(r.success).toBe(r.result >= 10);
    }
  });
});
