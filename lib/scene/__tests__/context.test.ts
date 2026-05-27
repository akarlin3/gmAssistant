import { describe, it, expect, vi } from 'vitest';
import {
  deriveNpcCard,
  deriveLocationCard,
  buildSceneTurnRequest,
  VERBATIM_TURNS,
} from '../context';
import type { SceneTurn } from '../types';

describe('deriveNpcCard', () => {
  it('uses explicit traits/voice/goals when present', () => {
    const card = deriveNpcCard({
      id: 'n1',
      name: 'Inka',
      traits: 'Wary',
      voice: 'Curt',
      goals: 'Survive',
    });
    expect(card).toEqual({
      id: 'n1',
      name: 'Inka',
      traits: 'Wary',
      voice: 'Curt',
      goals: 'Survive',
    });
  });

  it('falls back to archetype/type/faction for traits and goal/method for goals', () => {
    const card = deriveNpcCard({
      id: 'n2',
      name: 'Brann',
      type: 'Villain',
      archetype: 'Schemer',
      faction: 'The Coil',
      goal: 'Seize the well',
      method: 'Bribery',
    });
    expect(card.traits).toContain('Schemer');
    expect(card.traits).toContain('The Coil');
    expect(card.goals).toContain('Seize the well');
    expect(card.goals).toContain('Bribery');
    expect(card.voice).toBe('');
  });
});

describe('deriveLocationCard', () => {
  it('prefers an explicit description', () => {
    const card = deriveLocationCard({ id: 'l1', name: 'Inn', description: 'A cozy inn.' });
    expect(card.description).toBe('A cozy inn.');
  });
  it('composes a description from type/aspects/factions', () => {
    const card = deriveLocationCard({
      id: 'l2',
      name: 'The Salt Wheel',
      type: 'Tavern',
      aspects: ['salt-stained beams', 'low fire'],
      factions: 'Smugglers',
    });
    expect(card.description).toContain('Tavern');
    expect(card.description).toContain('salt-stained beams');
    expect(card.description).toContain('Smugglers');
  });
});

function turn(i: number): SceneTurn {
  return {
    id: `t${i}`,
    pcAction: `action ${i}`,
    response: { dialogue: [], sensory: `s${i}`, suggestedRoll: null },
    createdAt: i,
  };
}

describe('buildSceneTurnRequest', () => {
  it('keeps the last VERBATIM_TURNS verbatim and summarizes the rest', async () => {
    const turns = Array.from({ length: VERBATIM_TURNS + 3 }, (_, i) => turn(i));
    const summarize = vi.fn().mockResolvedValue('older stuff happened');

    const req = await buildSceneTurnRequest({
      location: { id: 'l1', name: 'Inn' },
      npcs: [{ id: 'n1', name: 'Inka' }],
      scene: { partyState: 'tired', turns },
      newAction: 'I sit down.',
      summarizeTurns: summarize,
    });

    expect(req.recentTurns).toHaveLength(VERBATIM_TURNS);
    expect(req.recentTurns[req.recentTurns.length - 1].pcAction).toBe(
      `action ${VERBATIM_TURNS + 2}`,
    );
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(summarize.mock.calls[0][0]).toHaveLength(3);
    expect(req.earlierSummary).toBe('older stuff happened');
    expect(req.newAction).toBe('I sit down.');
  });

  it('does not summarize when there are no earlier turns', async () => {
    const summarize = vi.fn().mockResolvedValue('unused');
    const req = await buildSceneTurnRequest({
      location: { id: 'l1', name: 'Inn' },
      npcs: [],
      scene: { partyState: '', turns: [turn(0), turn(1)] },
      newAction: 'go',
      summarizeTurns: summarize,
    });
    expect(summarize).not.toHaveBeenCalled();
    expect(req.earlierSummary).toBeNull();
    expect(req.recentTurns).toHaveLength(2);
  });
});
