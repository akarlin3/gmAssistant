import { describe, it, expect } from 'vitest';
import { capScenes, type SceneEntry } from '../types';
import { sceneToMarkdown } from '../export';

function scene(id: string, status: 'active' | 'ended', startedAt: number): SceneEntry {
  return { id, startedAt, locationId: 'l1', presentNpcIds: [], partyState: '', turns: [], status };
}

describe('capScenes', () => {
  it('keeps everything below the cap', () => {
    const scenes = [scene('a', 'ended', 1), scene('b', 'ended', 2)];
    expect(capScenes(scenes, 20)).toHaveLength(2);
  });

  it('evicts oldest ended scenes beyond the cap', () => {
    const scenes = [scene('new', 'ended', 3), scene('mid', 'ended', 2), scene('old', 'ended', 1)];
    const out = capScenes(scenes, 2);
    expect(out.map((s) => s.id)).toEqual(['new', 'mid']);
  });

  it('never evicts active scenes', () => {
    const scenes = [scene('act', 'active', 1), scene('e1', 'ended', 5), scene('e2', 'ended', 4)];
    const out = capScenes(scenes, 2);
    expect(out.map((s) => s.id).sort()).toEqual(['act', 'e1']);
  });
});

describe('sceneToMarkdown', () => {
  const names = {
    locationName: (id: string) => (id === 'l1' ? 'The Salt Wheel' : '?'),
    npcName: (id: string) => (id === 'n1' ? 'Inka' : '?'),
  };

  it('renders a header, turns, rolls, and summary', () => {
    const s: SceneEntry = {
      id: 's1',
      startedAt: 0,
      endedAt: 1000,
      locationId: 'l1',
      presentNpcIds: ['n1'],
      partyState: 'just arrived',
      status: 'ended',
      summary: 'They met Inka and left.',
      turns: [
        {
          id: 't1',
          pcAction: 'I sit at the bar.',
          response: {
            dialogue: [{ npcId: 'n1', line: 'What do you want?' }],
            sensory: 'Smoke hangs low.',
            suggestedRoll: {
              ability: 'CHA',
              skill: 'Persuasion',
              dc: 14,
              reason: 'Winning her over is uncertain.',
            },
          },
          rolled: { expr: '1d20+3', result: 17, success: true },
          outcome: 'She warms up.',
          createdAt: 0,
        },
      ],
    };
    const md = sceneToMarkdown(s, names);
    expect(md).toContain('# Scene at The Salt Wheel');
    expect(md).toContain('> **PC:** I sit at the bar.');
    expect(md).toContain('*Inka:* "What do you want?"');
    expect(md).toContain('**Suggested roll:** CHA (Persuasion) DC 14');
    expect(md).toContain('**Rolled:** 1d20+3 = 17 (SUCCESS)');
    expect(md).toContain('**Outcome:** She warms up.');
    expect(md).toContain('## Summary');
    expect(md).toContain('They met Inka and left.');
  });
});
