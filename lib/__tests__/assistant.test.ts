import { test, describe } from 'node:test';
import assert from 'node:assert';
import { buildCampaignSnapshot } from '../assistant/context';
import {
  searchEntities,
  getCampaignSummary,
  getDanglingThreads,
  getFactionStatus,
  getEntityDetails,
  getRecentSessions,
} from '../assistant/tools/read-impl';
import { applyWriteTool } from '../assistant/apply-write';
import { capConversations, type AssistantConversation } from '../assistant/types';

function sampleData() {
  return {
    name: 'The Last Wells',
    pitch: 'Magic is fading; the last wells must be protected.',
    genre: 'low fantasy',
    npcs: [
      { id: 'npc-1', name: 'Inka', traits: 'Wary innkeeper', faction: 'Wellkeepers' },
      { id: 'npc-2', name: 'Hara', traits: 'Smuggler captain' },
    ],
    factions: [
      {
        id: 'fac-1',
        name: 'Wellkeepers',
        shortGoals: 'Guard the wells',
        clocks: [{ name: 'Drought', filled: 2, max: 6 }],
      },
    ],
    locations: [{ id: 'loc-1', name: 'The Dry Tavern', aspects: ['dusty', 'tense'] }],
    secrets: ['The well is poisoned.'],
    sessionLogV2: [
      {
        id: 's1',
        number: 1,
        title: 'Arrival',
        recap: 'The party met Inka at the tavern.',
        events: [],
        secretsRevealed: [],
        scenesUsed: [],
      },
    ],
  };
}

describe('buildCampaignSnapshot', () => {
  test('maps entities and aggregates session text', () => {
    const snap = buildCampaignSnapshot(sampleData());
    assert.strictEqual(snap.title, 'The Last Wells');
    assert.strictEqual(snap.npcs.length, 2);
    assert.strictEqual(snap.factions.length, 1);
    assert.strictEqual(snap.factions[0].clocks[0].max, 6);
    assert.strictEqual(snap.sessions.length, 1);
    assert.match(snap.sessions[0].text, /Inka/);
  });
});

describe('read tools', () => {
  test('searchEntities finds by name and text', () => {
    const snap = buildCampaignSnapshot(sampleData());
    const byName = searchEntities(snap, { query: 'Hara' });
    assert.strictEqual(byName.results.length, 1);
    assert.strictEqual(byName.results[0].name, 'Hara');

    const byTrait = searchEntities(snap, { query: 'smuggler' });
    assert.strictEqual(byTrait.results[0].id, 'npc-2');
  });

  test('searchEntities respects type filter', () => {
    const snap = buildCampaignSnapshot(sampleData());
    const res = searchEntities(snap, { query: 'tavern', types: ['location'] });
    assert.strictEqual(res.results.length, 1);
    assert.strictEqual(res.results[0].type, 'location');
  });

  test('getCampaignSummary reports counts', () => {
    const snap = buildCampaignSnapshot(sampleData());
    const sum = getCampaignSummary(snap);
    assert.strictEqual(sum.counts.npcs, 2);
    assert.strictEqual(sum.counts.factions, 1);
    assert.strictEqual(sum.title, 'The Last Wells');
  });

  test('getDanglingThreads surfaces unreferenced NPCs only', () => {
    const snap = buildCampaignSnapshot(sampleData());
    const res = getDanglingThreads(snap, { sessionsBack: 3 });
    const names = res.danglingNpcs.map((n) => n.name);
    // Inka appears in the recap; Hara does not.
    assert.ok(names.includes('Hara'));
    assert.ok(!names.includes('Inka'));
  });

  test('getFactionStatus includes members and clocks', () => {
    const snap = buildCampaignSnapshot(sampleData());
    const res = getFactionStatus(snap, {});
    assert.strictEqual(res.factions.length, 1);
    assert.deepStrictEqual(res.factions[0].members, ['Inka']);
    assert.strictEqual(res.factions[0].clocks[0].name, 'Drought');
  });

  test('getEntityDetails returns one entity', () => {
    const snap = buildCampaignSnapshot(sampleData());
    const res = getEntityDetails(snap, { entityType: 'npc', entityId: 'npc-1' }) as {
      found: boolean;
      entity: { name: string };
    };
    assert.strictEqual(res.found, true);
    assert.strictEqual(res.entity.name, 'Inka');
    assert.strictEqual(
      (getEntityDetails(snap, { entityType: 'npc', entityId: 'nope' }) as { found: boolean }).found,
      false,
    );
  });

  test('getRecentSessions caps n', () => {
    const snap = buildCampaignSnapshot(sampleData());
    const res = getRecentSessions(snap, { n: 5 });
    assert.strictEqual(res.sessions.length, 1);
  });
});

describe('applyWriteTool', () => {
  test('createNpc appends an NPC with generated id', () => {
    const data = sampleData();
    const res = applyWriteTool(data, 'createNpc', {
      name: 'Garrick the Smith',
      traits: 'Gruff, honest',
      goals: ['Reforge the well-seal'],
      factionId: 'fac-1',
    });
    const npcs = res.data.npcs as Array<{ name: string; faction?: string }>;
    assert.strictEqual(npcs.length, 3);
    const created = npcs.find((n) => n.name === 'Garrick the Smith');
    assert.ok(created);
    assert.strictEqual(created!.faction, 'Wellkeepers');
    assert.ok(res.createdId);
    // original data not mutated
    assert.strictEqual((data.npcs as unknown[]).length, 2);
  });

  test('createSecret appends a string secret', () => {
    const res = applyWriteTool(sampleData(), 'createSecret', {
      text: 'The mayor is a doppelganger.',
    });
    const secrets = res.data.secrets as string[];
    assert.strictEqual(secrets.length, 2);
    assert.strictEqual(secrets[1], 'The mayor is a doppelganger.');
  });

  test('createPotentialScene formats a scene line', () => {
    const res = applyWriteTool(sampleData(), 'createPotentialScene', {
      type: 'action',
      title: 'Ambush at the Well',
      hook: 'Raiders strike at dawn.',
    });
    const scenes = res.data.scenes as string[];
    assert.match(scenes[0], /\[action\] Ambush at the Well/);
  });

  test('addFactionClock resolves faction name and clamps segments', () => {
    const res = applyWriteTool(sampleData(), 'addFactionClock', {
      factionId: 'fac-1',
      name: 'War Footing',
      maxSegments: 99,
    });
    const clocks = res.data.clocks as Array<{
      text: string;
      faction: string;
      max: number;
      filled: number;
    }>;
    assert.strictEqual(clocks[0].text, 'War Footing');
    assert.strictEqual(clocks[0].faction, 'Wellkeepers');
    assert.strictEqual(clocks[0].max, 12);
    assert.strictEqual(clocks[0].filled, 0);
  });

  test('addCluePath persists revelation plus clues as secrets', () => {
    const res = applyWriteTool(sampleData(), 'addCluePath', {
      revelation: 'The baron sabotaged the well',
      clues: ['A torn baron crest', 'A bribed guard', 'Matching boot prints'],
    });
    const secrets = res.data.secrets as string[];
    // 1 original + 1 revelation + 3 clues
    assert.strictEqual(secrets.length, 5);
    assert.match(secrets[1], /Revelation:/);
  });
});

describe('capConversations', () => {
  function conv(
    id: string,
    lastActiveAt: number,
    status: 'active' | 'archived' = 'active',
  ): AssistantConversation {
    return { id, title: id, startedAt: 0, lastActiveAt, messages: [], status };
  }

  test('archives the oldest active conversations beyond the cap', () => {
    const convs = Array.from({ length: 32 }, (_, i) => conv(`c${i}`, i));
    const capped = capConversations(convs, 30);
    const active = capped.filter((c) => c.status === 'active');
    assert.strictEqual(active.length, 30);
    // The two oldest (c0, c1) should be archived.
    assert.strictEqual(capped.find((c) => c.id === 'c0')!.status, 'archived');
    assert.strictEqual(capped.find((c) => c.id === 'c1')!.status, 'archived');
    assert.strictEqual(capped.find((c) => c.id === 'c31')!.status, 'active');
  });

  test('no-op when under the cap', () => {
    const convs = [conv('a', 1), conv('b', 2)];
    assert.deepStrictEqual(capConversations(convs, 30), convs);
  });
});
