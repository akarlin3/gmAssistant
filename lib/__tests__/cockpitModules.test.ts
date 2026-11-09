import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  redactSpoilers,
  hasSpoilers,
  parseSpoilerSegments,
  isEntityPlayerVisible,
  isItemPlayerVisible,
  syncEntityPlayerVisibility,
  buildPlayerSafeLoreSnapshot,
} from '../playerMode/spoilers';
import {
  deriveClockStatus,
  readSessionDeltaLog,
  applySessionDeltaToState,
} from '../world/sessionDelta';
import {
  rollImprovNpc,
  rollImprovEncounter,
  rollImprovItem,
  calculateConcentrationDc,
} from '../cockpit/improvRollers';
import {
  buildLoreRagContext,
  synthesizeLoreRagOutput,
} from '../loreRagContext';
import {
  buildK1CPrintQueue,
  cyclePrintStatus,
  updatePrintQueueItemInState,
} from '../printQueue';
import { allowedRelationships } from '../wiki/catalog';

describe('Module 2 — Relational Lore Graph & Player-Safe Reveal Toggle', () => {
  it('redacts ||spoiler|| and [gm]...[/gm] blocks from player-safe strings', () => {
    const raw =
      'The lantern hangs above @Old Docks. ||The Dockmaster works for @Iron Syndicate.|| Quiet waters [gm]Trap DC 15[/gm] tonight.';
    assert.equal(hasSpoilers(raw), true);
    const clean = redactSpoilers(raw);
    assert.ok(clean.includes('The lantern hangs above @Old Docks.'));
    assert.ok(!clean.includes('Iron Syndicate'));
    assert.ok(!clean.includes('Trap DC 15'));
  });

  it('parses spoiler and text segments accurately', () => {
    const segs = parseSpoilerSegments('Public lore ||Secret 1|| and [gm]Secret 2[/gm].');
    assert.deepEqual(
      segs.filter((s) => s.kind === 'spoiler').map((s) => s.text),
      ['Secret 1', 'Secret 2']
    );
  });

  it('synchronizes player_visible with playerConfig.entityVisibility', () => {
    const cfg = syncEntityPlayerVisibility({}, 'npcs', 'npc-1', true);
    assert.equal(cfg.entityVisibility.npcs?.['npc-1']?.mode, 'party');
    assert.equal(isEntityPlayerVisible({ id: 'npc-1' }, cfg, 'npcs'), true);

    const hiddenCfg = syncEntityPlayerVisibility(cfg, 'npcs', 'npc-1', false);
    assert.equal(hiddenCfg.entityVisibility.npcs?.['npc-1'], undefined);
    assert.equal(isEntityPlayerVisible({ id: 'npc-1', player_visible: false }, hiddenCfg, 'npcs'), false);
  });

  it('builds a player-safe lore snapshot excluding private entities and redacting spoilers', () => {
    const data = {
      npcs: [
        { id: 'n1', name: 'Captain Vane', archetype: 'Harbor Guard ||Cultist||', player_visible: true },
        { id: 'n2', name: 'Hidden Assassin', archetype: 'Shadow', player_visible: false },
      ],
      locations: [
        { id: 'l1', name: 'Old Docks', description: 'Foggy piers ||Smuggler tunnel||', player_visible: true },
      ],
      factions: [
        { id: 'f1', name: 'Iron Syndicate', identity: 'Merchants ||Blackmailers||', player_visible: true },
      ],
      items: [
        { id: 'i1', name: 'Lantern of Truth', description: 'Glows blue ||Cursed by Vane||', player_visible: true },
        { id: 'i2', name: 'Secret Key', description: 'Vault key', player_visible: false },
      ],
      clocks: [
        { id: 'c1', text: 'Harbor Lockdown', faction: 'Iron Syndicate', filled: 3, max: 6, player_visible: true },
      ],
    };

    const snap = buildPlayerSafeLoreSnapshot(data);
    assert.equal(snap.npcs.length, 1);
    assert.equal(snap.npcs[0].name, 'Captain Vane');
    assert.equal(snap.npcs[0].archetype, 'Harbor Guard');
    assert.equal(snap.locations[0].description, 'Foggy piers');
    assert.equal(snap.factions[0].identity, 'Merchants');
    assert.equal(snap.items.length, 1);
    assert.equal(isItemPlayerVisible(data.items[0]), true);
    assert.equal(snap.items[0].description, 'Glows blue');
    assert.equal(snap.clocks.length, 1);
  });

  it('supports relational catalog links for factionClock and monster with locations and factions', () => {
    const clockToLoc = allowedRelationships('factionClock', 'location');
    assert.ok(clockToLoc.length > 0);
    const monsterToLoc = allowedRelationships('monster', 'location');
    assert.ok(monsterToLoc.length > 0);
  });
});

describe('Module 3 — Faction Clock & World-State Engine (Session Delta Log)', () => {
  it('derives clock status and applies Session Delta Log updates to clocks, heat, and world day', () => {
    assert.equal(deriveClockStatus({ filled: 6, max: 6 }), 'triggered');
    assert.equal(deriveClockStatus({ filled: 2, max: 6 }), 'active');

    const initialState = {
      clocks: [{ id: 'c1', text: 'Ritual of Ash', faction: 'Ash Cult', filled: 3, max: 4 }],
      factions: [{ id: 'f1', name: 'Ash Cult', heat: 2, renown: -1 }],
    };

    const nextState = applySessionDeltaToState(initialState, {
      inWorldDate: '14 Ches · Eclipse Night',
      inWorldDay: 12,
      consequences: [
        'The Ash Cult seized the old belltower.',
        'City watch doubled patrols along @Old Docks.',
        'The ritual clock reached completion.',
      ],
      clockDeltas: [
        {
          clockIndex: 0,
          clockText: 'Ritual of Ash',
          faction: 'Ash Cult',
          fromFilled: 3,
          toFilled: 4,
          max: 4,
        },
      ],
      factionHeatDeltas: [
        {
          factionIndex: 0,
          factionName: 'Ash Cult',
          fromHeat: 2,
          toHeat: 5,
        },
      ],
    });

    assert.equal(nextState.clocks[0].filled, 4);
    assert.equal(nextState.clocks[0].status, 'triggered');
    assert.equal(nextState.factions[0].heat, 5);
    assert.equal(nextState.worldClock.currentDay, 12);

    const log = readSessionDeltaLog(nextState);
    assert.equal(log.length, 1);
    assert.equal(log[0].inWorldDate, '14 Ches · Eclipse Night');
    assert.equal(log[0].consequences.length, 3);
  });
});

describe('Module 1 — Live Session Cockpit (Improv Panic Bar & Concentration Tracker)', () => {
  const ctx = {
    locationName: 'Sunken Reliquary',
    lighting: 'Flickering Bioluminescence',
    terrainTags: ['Flooded Crypt', 'Cracked Pillars'],
    factions: '@Deep Choir',
  };

  it('rolls location-grounded instant NPCs, weird encounters, and custom items', () => {
    const npc = rollImprovNpc(ctx, () => 0.25);
    assert.equal(npc.kind, 'npc');
    assert.ok(npc.groundedIn.includes('Sunken Reliquary'));
    assert.ok(npc.voiceAndMannerism.includes('Flooded Crypt'));

    const enc = rollImprovEncounter(ctx, () => 0.5);
    assert.equal(enc.kind, 'encounter');
    assert.ok(enc.mechanic.includes('Flooded Crypt'));

    const item = rollImprovItem(ctx, () => 0.75);
    assert.equal(item.kind, 'item');
    assert.ok(item.mechanic.includes('Flooded Crypt'));
  });

  it('calculates 5e Concentration Save DC = max(10, floor(damage / 2))', () => {
    assert.equal(calculateConcentrationDc(6), 10);
    assert.equal(calculateConcentrationDc(19), 10);
    assert.equal(calculateConcentrationDc(22), 11);
    assert.equal(calculateConcentrationDc(35), 17);
  });
});

describe('Module 4 — Lore-Grounded RAG Prep & Stat-Block Assistant', () => {
  const sampleData = {
    locations: [
      {
        id: 'loc-1',
        name: 'Glass Foundry',
        type: 'Faction Stronghold',
        lighting: 'Bright Light',
        terrainTags: ['Molten Slag', 'Catwalks'],
        description: 'Operated by @Iron Syndicate and guarded by @Master Vaelen.',
        factions: '@Iron Syndicate',
      },
    ],
    npcs: [
      {
        id: 'npc-1',
        name: 'Master Vaelen',
        type: 'Villain',
        faction: '@Iron Syndicate',
        archetype: 'Artificer',
        goal: 'Forge the Glass Colossus',
        flaw: 'Terrified of cold iron',
      },
    ],
    factions: [
      {
        id: 'fac-1',
        name: 'Iron Syndicate',
        archetype: 'Mercantile',
        identity: 'Monopoly on smelters',
        heat: 4,
        renown: -3,
      },
    ],
    clocks: [
      {
        id: 'clk-1',
        text: 'Awaken the Glass Colossus',
        faction: 'Iron Syndicate',
        filled: 4,
        max: 6,
        triggerNote: 'Colossus marches on the harbor',
      },
    ],
  };

  it('injects Module 2 & 3 context into JSON/Markdown and synthesizes canon outputs', () => {
    const bundle = buildLoreRagContext(sampleData, { selectedLocationId: 'loc-1' });
    assert.equal(bundle.jsonContext.location?.name, 'Glass Foundry');
    assert.equal(bundle.jsonContext.linkedNpcs[0]?.name, 'Master Vaelen');
    assert.equal(bundle.jsonContext.linkedFactions[0]?.name, 'Iron Syndicate');
    assert.equal(bundle.jsonContext.factionClocks[0]?.text, 'Awaken the Glass Colossus');
    assert.ok(bundle.markdownContext.includes('@Glass Foundry'));

    const rumors = synthesizeLoreRagOutput(bundle, 'rumors');
    assert.equal(rumors.rumors?.length, 3);
    assert.ok(rumors.markdown.includes('Glass Foundry'));

    const statblock = synthesizeLoreRagOutput(bundle, 'statblock', { targetCr: '5' });
    assert.equal(statblock.monster?.challenge_rating, '5');
    assert.equal(statblock.monster?.is_boss, true);
    assert.equal(statblock.monster?.print_status, 'queued');
  });
});

describe('Module 5 — Creality K1C Hardware Bridge (Print Queue)', () => {
  it('aggregates miniatures, boss tokens, and terrain pieces and cycles print_status', () => {
    assert.equal(cyclePrintStatus('queued'), 'sliced');
    assert.equal(cyclePrintStatus('sliced'), 'printed');
    assert.equal(cyclePrintStatus('printed'), 'queued');

    let state: Record<string, any> = {
      homebrewMonsters: [
        {
          slug: 'ash-drake',
          name: 'Ash Drake',
          challenge_rating: '6',
          cr: 6,
          size: 'Large',
          type: 'dragon',
          stl_link: 'https://example.com/ash_drake.stl',
          print_status: 'queued',
          is_boss: true,
        },
      ],
      npcs: [
        {
          id: 'npc-1',
          name: 'Inquisitor Thorne',
          type: 'Villain',
          stl_link: 'https://example.com/inquisitor.stl',
          print_status: 'sliced',
        },
      ],
      locations: [
        {
          id: 'loc-1',
          name: 'Obsidian Altar',
          terrainTags: ['Altar', 'Pillars'],
          stl_link: 'https://example.com/altar.stl',
          print_status: 'queued',
        },
      ],
    };

    const queue = buildK1CPrintQueue(state);
    assert.equal(queue.length, 3);
    assert.equal(queue.find((q) => q.name === 'Ash Drake')?.category, 'boss');
    assert.equal(queue.find((q) => q.name === 'Obsidian Altar')?.category, 'terrain');

    const drakeItem = queue.find((q) => q.name === 'Ash Drake')!;
    state = updatePrintQueueItemInState(state, drakeItem, { print_status: 'printed' });
    assert.equal(state.homebrewMonsters[0].print_status, 'printed');
  });
});
