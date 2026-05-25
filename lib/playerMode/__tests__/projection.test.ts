import { describe, it, expect } from 'vitest';
import { buildSlotProjection, buildShareMeta } from '../projection';
import { initPlayerMode } from '../migration';

function seedCampaignData() {
  const base = {
    npcs: [
      { id: 'npc1', name: 'Sera', appearance: 'tall', goal: 'rule the city', flaw: 'greedy' },
      { id: 'npc2', name: 'Hidden One', appearance: 'cloaked', goal: 'secret' },
    ],
    locations: [
      { id: 'loc1', name: 'The Keep', type: 'Settlement', aspects: ['a', 'b', 'c'], factions: 'Crown' },
    ],
    handouts: 'The prophecy reads...',
    playerLog: [
      { id: 'log1', text: 'They met Sera.', mentions: [], authorRef: 'gm', postedAtMs: 1 },
      { id: 'log2', text: 'Secret stuff', mentions: [], authorRef: 'gm', postedAtMs: 2 },
    ],
  } as Record<string, any>;
  const { data } = initPlayerMode(base);
  return data;
}

describe('buildSlotProjection', () => {
  it('omits private entities and redacts private fields on visible ones', () => {
    const data = seedCampaignData();
    // npc1 -> party, npc2 left private
    data.player.entityVisibility.npcs = { npc1: { mode: 'party' } };

    const proj = buildSlotProjection(data, 'My Campaign', 'slot-a', 1000);
    const npcs = proj.entities.npcs ?? [];
    expect(npcs).toHaveLength(1);
    expect(npcs[0].id).toBe('npc1');
    expect(npcs[0].name).toBe('Sera');
    expect(npcs[0].appearance).toBe('tall');
    // goal & flaw are private by default — must not leak
    expect(npcs[0]).not.toHaveProperty('goal');
    expect(npcs[0]).not.toHaveProperty('flaw');
  });

  it('respects custom slot lists', () => {
    const data = seedCampaignData();
    data.player.entityVisibility.npcs = { npc1: { mode: 'custom', allowedSlotIds: ['slot-b'] } };
    expect((buildSlotProjection(data, 'C', 'slot-a').entities.npcs ?? [])).toHaveLength(0);
    expect((buildSlotProjection(data, 'C', 'slot-b').entities.npcs ?? [])).toHaveLength(1);
  });

  it('field overrides flip a private field public for that entity', () => {
    const data = seedCampaignData();
    data.player.entityVisibility.npcs = { npc1: { mode: 'party', fieldOverrides: { goal: 'public' } } };
    const npcs = buildSlotProjection(data, 'C', 'slot-a').entities.npcs ?? [];
    expect(npcs[0].goal).toBe('rule the city');
  });

  it('handouts only appear when explicitly shared', () => {
    const data = seedCampaignData();
    expect(buildSlotProjection(data, 'C', 'slot-a').handouts).toBeNull();
    data.player.handouts = { mode: 'party' };
    expect(buildSlotProjection(data, 'C', 'slot-a').handouts).toBe('The prophecy reads...');
  });

  it('player-log entries are hidden until shared and strip the internal visibility field', () => {
    const data = seedCampaignData();
    // nothing shared yet
    expect(buildSlotProjection(data, 'C', 'slot-a').sessionLog).toHaveLength(0);
    data.playerLog[0].visibility = { mode: 'party' };
    const log = buildSlotProjection(data, 'C', 'slot-a').sessionLog;
    expect(log).toHaveLength(1);
    expect(log[0].text).toBe('They met Sera.');
    expect(log[0]).not.toHaveProperty('visibility');
    expect(log[0].id).toBe('log1');
  });

  it('custom-visibility player-log entries reach only listed slots', () => {
    const data = seedCampaignData();
    data.playerLog[0].visibility = { mode: 'custom', allowedSlotIds: ['slot-b'] };
    expect(buildSlotProjection(data, 'C', 'slot-a').sessionLog).toHaveLength(0);
    expect(buildSlotProjection(data, 'C', 'slot-b').sessionLog).toHaveLength(1);
  });

  it('changing a campaign field default cascades to the projection', () => {
    const data = seedCampaignData();
    data.player.entityVisibility.npcs = { npc1: { mode: 'party' } };
    // goal is private by default -> hidden
    expect(buildSlotProjection(data, 'C', 'slot-a').entities.npcs![0]).not.toHaveProperty('goal');
    // flip the campaign default for npc.goal to public
    data.player.fieldDefaults.npcs.goal = 'public';
    expect(buildSlotProjection(data, 'C', 'slot-a').entities.npcs![0].goal).toBe('rule the city');
  });

  it('buildShareMeta exposes roster + version, not entity data', () => {
    const data = seedCampaignData();
    data.player.roster = [{ slotId: 'slot-a', displayName: 'Avery' }];
    const meta = buildShareMeta('camp1', data, 'My Campaign');
    expect(meta.campaignId).toBe('camp1');
    expect(meta.campaignName).toBe('My Campaign');
    expect(meta.tokenVersion).toBe(1);
    expect(meta.roster).toHaveLength(1);
    expect(meta).not.toHaveProperty('entities');
  });

  it('projects only assigned items to the active slot', () => {
    const data = seedCampaignData();
    // Prep 2 items: 1 string (legacy), 1 object assigned to slot-b
    data.items = [
      'Flame Tongue (rare) — A fiery blade',
      {
        id: 'structured_item_1',
        name: 'Mithral Chainmail',
        description: 'Light metal armor',
        assignedPlayerId: 'slot-b',
        playerVisibility: 'full'
      }
    ];

    const projA = buildSlotProjection(data, 'C', 'slot-a');
    expect(projA.items).toHaveLength(0); // none assigned to slot-a

    const projB = buildSlotProjection(data, 'C', 'slot-b');
    expect(projB.items).toHaveLength(1);
    expect(projB.items![0].name).toBe('Mithral Chainmail');
    expect(projB.items![0].description).toBe('Light metal armor');
  });

  it('redacts item description if playerVisibility is set to name-only', () => {
    const data = seedCampaignData();
    data.items = [
      {
        id: 'structured_item_1',
        name: 'Mithral Chainmail',
        description: 'Light metal armor',
        assignedPlayerId: 'slot-b',
        playerVisibility: 'name-only'
      }
    ];

    const projB = buildSlotProjection(data, 'C', 'slot-b');
    expect(projB.items).toHaveLength(1);
    expect(projB.items![0].name).toBe('Mithral Chainmail');
    expect(projB.items![0]).not.toHaveProperty('description');
  });
});

