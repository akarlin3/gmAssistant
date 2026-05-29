import { describe, it, expect } from 'vitest';
import { buildSlotProjection, buildShareMeta } from '../projection';
import { initPlayerMode } from '../migration';
import type { PlayerModeData } from '../types';

function seedCampaignData(): PlayerModeData {
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
  return data as PlayerModeData;
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
    data.playerLog![0].visibility = { mode: 'party' };
    const log = buildSlotProjection(data, 'C', 'slot-a').sessionLog;
    expect(log).toHaveLength(1);
    expect(log[0].text).toBe('They met Sera.');
    expect(log[0]).not.toHaveProperty('visibility');
    expect(log[0].id).toBe('log1');
  });

  it('custom-visibility player-log entries reach only listed slots', () => {
    const data = seedCampaignData();
    data.playerLog![0].visibility = { mode: 'custom', allowedSlotIds: ['slot-b'] };
    expect(buildSlotProjection(data, 'C', 'slot-a').sessionLog).toHaveLength(0);
    expect(buildSlotProjection(data, 'C', 'slot-b').sessionLog).toHaveLength(1);
  });

  it('changing a campaign field default cascades to the projection', () => {
    const data = seedCampaignData();
    data.player.entityVisibility.npcs = { npc1: { mode: 'party' } };
    // goal is private by default -> hidden
    expect(buildSlotProjection(data, 'C', 'slot-a').entities.npcs![0]).not.toHaveProperty('goal');
    // flip the campaign default for npc.goal to public
    data.player.fieldDefaults.npcs!.goal = 'public';
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

  it('projects only public planning stage aspects and filters lists by index', () => {
    const raw = seedCampaignData();
    const data = raw as any;
    
    // Seed some premise / worldbuilding aspects
    data.pitch = 'A dark fantasy campaign.';
    data.genre = 'Grimdark Fantasy';
    data.gWorld = ['Magic is dying.', 'The gods are silent.'];
    data.facts = ['The empire fell.', 'Monsters roam the forest.'];

    // Initially nothing is shared (fail-closed)
    let proj = buildSlotProjection(data, 'C', 'slot-a');
    expect(proj.planning).toBeDefined();
    expect(proj.planning?.pitch).toBeNull();
    expect(proj.planning?.genre).toBeNull();
    expect(proj.planning?.gWorld).toEqual([]);
    expect(proj.planning?.facts).toEqual([]);

    // Share pitch and the first world fact, second setting fact
    data.player.planningVisibility = {
      pitch: true,
      genre: false,
      gWorld: [true, false],
      facts: [false, true],
    };

    proj = buildSlotProjection(data, 'C', 'slot-a');
    expect(proj.planning?.pitch).toBe('A dark fantasy campaign.');
    expect(proj.planning?.genre).toBeNull();
    expect(proj.planning?.gWorld).toEqual(['Magic is dying.']);
    expect(proj.planning?.facts).toEqual(['Monsters roam the forest.']);
  });

  it('projects only public PC goals and redacts internal settings', () => {
    const data = seedCampaignData();
    (data as any).pcGoals = [
      { text: 'Uncover the cult', timeframe: 'mid', success: 'Cult stopped', isPublic: true, status: 'Active' },
      { text: 'A secret GM-only goal', timeframe: 'short', success: 'GM secret', isPublic: false, status: 'Active' },
      { text: 'Another private goal by default', timeframe: 'long' }
    ];

    const proj = buildSlotProjection(data, 'C', 'slot-a');
    expect(proj.pcGoals).toBeDefined();
    expect(proj.pcGoals).toHaveLength(1);
    expect(proj.pcGoals![0].text).toBe('Uncover the cult');
    expect(proj.pcGoals![0].timeframe).toBe('mid');
    expect(proj.pcGoals![0].success).toBe('Cult stopped');
    expect(proj.pcGoals![0]).not.toHaveProperty('isPublic');
  });

  it('projects the full unredacted PC sheet for player-owned PCs matching the active slot', () => {
    const data = seedCampaignData();
    data.pcs = [
      {
        id: 'pc1',
        name: 'Aragorn',
        level: 5,
        ac: 15,
        hp: { current: 40, max: 40, temp: 0 },
        ownership: { ownerType: 'player', playerSlotId: 'slot-a' },
        notes: 'Secret Aragorn notes',
      } as any,
      {
        id: 'pc2',
        name: 'Legolas',
        level: 5,
        ac: 14,
        hp: { current: 30, max: 30, temp: 0 },
        ownership: { ownerType: 'player', playerSlotId: 'slot-b' },
      } as any,
    ];

    const proj = buildSlotProjection(data, 'C', 'slot-a');
    const pcs = proj.entities.pcs ?? [];
    expect(pcs).toHaveLength(1);
    expect(pcs[0].id).toBe('pc1');
    expect(pcs[0].name).toBe('Aragorn');
    expect(pcs[0].notes).toBe('Secret Aragorn notes');
    expect(pcs[0].hp).toEqual({ current: 40, max: 40, temp: 0 });
    expect(pcs[0].ac).toBe(15);
  });
});

describe('buildSlotProjection — graph edges', () => {
  // Make npc1 and loc1 visible to the party; npc2 stays private.
  function seedWithVisibleEndpoints(): PlayerModeData {
    const data = seedCampaignData();
    data.player.entityVisibility.npcs = { npc1: { mode: 'party' } };
    data.player.entityVisibility.locations = { loc1: { mode: 'party' } };
    return data;
  }

  it('a private edge is absent from a player projection', () => {
    const data = seedWithVisibleEndpoints();
    data.relationships = [
      { id: 'e1', fromType: 'npc', fromId: 'npc1', toType: 'location', toId: 'loc1', kind: 'locatedAt', createdAt: 0, visibility: 'private' },
    ];
    const proj = buildSlotProjection(data, 'C', 'slot-a');
    expect(proj.edges).toEqual([]);
  });

  it('an untagged edge defaults to private (fail-closed) and is absent', () => {
    const data = seedWithVisibleEndpoints();
    data.relationships = [
      { id: 'e1', fromType: 'npc', fromId: 'npc1', toType: 'location', toId: 'loc1', kind: 'locatedAt', createdAt: 0 },
    ];
    expect(buildSlotProjection(data, 'C', 'slot-a').edges).toEqual([]);
  });

  it('a party edge between two visible entities appears, with a weight and no GM fields', () => {
    const data = seedWithVisibleEndpoints();
    data.relationships = [
      { id: 'e1', fromType: 'npc', fromId: 'npc1', toType: 'location', toId: 'loc1', kind: 'locatedAt', createdAt: 0, visibility: 'party', notes: 'GM only' },
    ];
    const edges = buildSlotProjection(data, 'C', 'slot-a').edges ?? [];
    expect(edges).toHaveLength(1);
    expect(edges[0].id).toBe('e1');
    expect(edges[0].kind).toBe('locatedAt');
    expect(typeof edges[0].weight).toBe('number');
    expect(edges[0]).not.toHaveProperty('notes');
    expect(edges[0]).not.toHaveProperty('visibility');
  });

  it('a party edge to a HIDDEN endpoint never leaks (endpoint guard)', () => {
    const data = seedWithVisibleEndpoints(); // npc2 is private
    data.relationships = [
      { id: 'e1', fromType: 'npc', fromId: 'npc1', toType: 'npc', toId: 'npc2', kind: 'allyOf', createdAt: 0, visibility: 'party' },
    ];
    expect(buildSlotProjection(data, 'C', 'slot-a').edges).toEqual([]);
  });

  it('a custom edge reaches only listed slots', () => {
    const data = seedWithVisibleEndpoints();
    data.relationships = [
      { id: 'e1', fromType: 'npc', fromId: 'npc1', toType: 'location', toId: 'loc1', kind: 'locatedAt', createdAt: 0, visibility: 'custom', customVisibleTo: ['slot-b'] },
    ];
    expect(buildSlotProjection(data, 'C', 'slot-a').edges).toEqual([]);
    expect(buildSlotProjection(data, 'C', 'slot-b').edges).toHaveLength(1);
  });

  it('suggested (unconfirmed) edges are never published', () => {
    const data = seedWithVisibleEndpoints();
    data.relationships = [
      { id: 'e1', fromType: 'npc', fromId: 'npc1', toType: 'location', toId: 'loc1', kind: 'locatedAt', createdAt: 0, visibility: 'party', suggested: true },
    ];
    expect(buildSlotProjection(data, 'C', 'slot-a').edges).toEqual([]);
  });
});

