// Save-to-campaign pipeline.
//
// Per audit: campaigns store all entities as keyed arrays inside the single
// `data` blob (no subcollections); writes happen via the editor's `setVal`
// (debounced 1.5s autosync). To avoid racing the local state, the save
// pipeline is a pure function that takes the current `data` + a generator
// result and returns a patched `data` + the refs of created entities. The
// caller (the GeneratorPanel embedded in CampaignEditor) calls setVal('data',
// patched) to commit.

import type {
  CoinPurse,
  EntityRef,
  GenerationHistoryEntry,
  GeneratorResult,
  ItemCategory,
  ItemRarity,
  StructuredItem,
  StructuredLocation,
  StructuredNpc,
  SavePipelineResult,
} from './types';

const HISTORY_CAP = 20;

function rid(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;
}

function appendTo<T>(data: Record<string, unknown>, key: string, entity: T): { entity: T; index: number } {
  const cur = Array.isArray(data[key]) ? (data[key] as T[]) : [];
  const next = [...cur, entity];
  data[key] = next;
  return { entity, index: next.length - 1 };
}

function pushHistory(
  data: Record<string, unknown>,
  result: GeneratorResult,
  title: string,
): string {
  const entry: GenerationHistoryEntry = {
    id: rid('gen'),
    kind: result.kind,
    seed: result.seed,
    title,
    createdAtMs: Date.now(),
    result,
  };
  const cur = Array.isArray(data.generationsHistory)
    ? (data.generationsHistory as GenerationHistoryEntry[])
    : [];
  const next = [entry, ...cur].slice(0, HISTORY_CAP);
  data.generationsHistory = next;
  return entry.id;
}

function coinsToString(c: CoinPurse): string {
  return (['pp', 'gp', 'ep', 'sp', 'cp'] as const)
    .map((k) => (c[k] > 0 ? `${c[k]} ${k}` : ''))
    .filter(Boolean)
    .join(', ');
}

// Public entry point. Returns the patched data and the refs.
export function applyGeneratorResultToData(
  inputData: Record<string, unknown>,
  result: GeneratorResult,
): { data: Record<string, unknown>; saved: SavePipelineResult } {
  const data = { ...inputData };
  const refs: EntityRef[] = [];

  if (result.kind === 'treasure-hoard') {
    // One per magic item -> data.items (structured). Coins+gems+art -> note line in data.items? We'll
    // append a single descriptive Item for the hoard as a "note" wrapped in StructuredItem with
    // category 'gear' (mundane). Per-magic-item structured items follow.
    const summary: StructuredItem = {
      id: rid('item'),
      name: `Treasure Hoard (CR ${result.inputs.crTier})`,
      category: 'gear',
      rarity: 'mundane',
      source: 'generator:treasure-hoard',
      description: [
        coinsToString(result.coins) ? `Coins: ${coinsToString(result.coins)}` : '',
        result.gems.length ? `Gems: ${result.gems.map(g => `${g.name} (${g.value} gp)`).join('; ')}` : '',
        result.artObjects.length ? `Art: ${result.artObjects.map(a => `${a.name} (${a.value} gp)`).join('; ')}` : '',
        result.enhancementNote ? `Note: ${result.enhancementNote}` : '',
      ].filter(Boolean).join(' · '),
    };
    const { index } = appendTo(data, 'items', summary);
    refs.push({ entityType: 'item', entityKey: 'items', entityId: summary.id, entityIndex: index });

    for (const mi of result.magicItems) {
      const item: StructuredItem = {
        id: rid('item'),
        name: mi.name,
        category: mi.category,
        rarity: mi.rarity,
        attunement: false,
        source: 'generator:treasure-hoard',
        description: mi.note,
      };
      const { index: i2 } = appendTo(data, 'items', item);
      refs.push({ entityType: 'item', entityKey: 'items', entityId: item.id, entityIndex: i2 });
    }
  }

  else if (result.kind === 'trinket') {
    for (const t of result.trinkets) {
      const item: StructuredItem = {
        id: rid('item'),
        name: t.description.length > 60 ? t.description.slice(0, 57) + '…' : t.description,
        category: 'trinket',
        rarity: 'mundane',
        source: 'generator:trinket',
        description: [t.description, t.hook ? `Hook: ${t.hook}` : ''].filter(Boolean).join('\n'),
      };
      const { index } = appendTo(data, 'items', item);
      refs.push({ entityType: 'item', entityKey: 'items', entityId: item.id, entityIndex: index });
    }
  }

  else if (result.kind === 'mundane-shop' || result.kind === 'magic-shop') {
    const shopKind = result.kind === 'magic-shop' ? 'magic' : 'mundane';
    const ownerNpc: StructuredNpc = {
      id: rid('npc'),
      name: result.owner.name,
      tier: 'minor',
      descriptor: result.owner.descriptor,
      type: 'Neutral',
      source: `generator:${result.kind}`,
    };
    const { index: ni } = appendTo(data, 'npcs', ownerNpc);
    refs.push({ entityType: 'npc', entityKey: 'npcs', entityId: ownerNpc.id, entityIndex: ni });

    const loc: StructuredLocation = {
      id: rid('loc'),
      name: result.shopName,
      type: result.kind === 'magic-shop' ? `Magic Shop · ${result.inputs.archetype}` : `Shop · ${result.inputs.shopType}`,
      subtype: 'shop',
      source: `generator:${result.kind}`,
      details: {
        shopKind,
        shopType: result.kind === 'magic-shop' ? result.inputs.archetype : result.inputs.shopType,
        settlementSize: result.inputs.settlementSize,
        owner: { name: result.owner.name, descriptor: result.owner.descriptor, npcId: ownerNpc.id },
        inventory: result.inventory,
        hours: result.kind === 'mundane-shop' ? result.hours : undefined,
        rumor: result.kind === 'mundane-shop' ? result.rumor : undefined,
      },
    };
    const { index: li } = appendTo(data, 'locations', loc);
    refs.push({ entityType: 'location', entityKey: 'locations', entityId: loc.id, entityIndex: li });
  }

  else if (result.kind === 'tavern') {
    // Owner NPC + each patron NPC + Location (tavern subtype).
    const ownerNpc: StructuredNpc = {
      id: rid('npc'),
      name: result.details.owner.name,
      tier: 'minor',
      descriptor: result.details.owner.descriptor,
      type: 'Neutral',
      source: 'generator:tavern',
    };
    const { index: oi } = appendTo(data, 'npcs', ownerNpc);
    refs.push({ entityType: 'npc', entityKey: 'npcs', entityId: ownerNpc.id, entityIndex: oi });

    const patronRefs = result.details.patrons.map((p) => {
      const npc: StructuredNpc = {
        id: rid('npc'),
        name: p.name,
        tier: 'minor',
        descriptor: p.descriptor,
        type: 'Neutral',
        source: 'generator:tavern',
      };
      const { index } = appendTo(data, 'npcs', npc);
      refs.push({ entityType: 'npc', entityKey: 'npcs', entityId: npc.id, entityIndex: index });
      return { name: p.name, descriptor: p.descriptor, npcId: npc.id };
    });

    const loc: StructuredLocation = {
      id: rid('loc'),
      name: result.name,
      type: 'Tavern / Inn',
      subtype: 'tavern',
      source: 'generator:tavern',
      details: {
        ...result.details,
        owner: { ...result.details.owner, npcId: ownerNpc.id },
        patrons: patronRefs,
      },
    };
    const { index: li } = appendTo(data, 'locations', loc);
    refs.push({ entityType: 'location', entityKey: 'locations', entityId: loc.id, entityIndex: li });
  }

  else if (result.kind === 'dungeon') {
    // Rooms saved inside details.rooms — NOT as separate locations.
    const loc: StructuredLocation = {
      id: rid('loc'),
      name: result.name,
      type: 'Dungeon',
      subtype: 'dungeon',
      source: 'generator:dungeon',
      details: result.details,
    };
    const { index } = appendTo(data, 'locations', loc);
    refs.push({ entityType: 'location', entityKey: 'locations', entityId: loc.id, entityIndex: index });
  }

  else if (result.kind === 'settlement') {
    // Notable NPCs as minor NPCs + Location (settlement subtype).
    const notableRefs = result.details.notables.map((n) => {
      const npc: StructuredNpc = {
        id: rid('npc'),
        name: n.name,
        tier: 'minor',
        descriptor: n.role,
        type: 'Neutral',
        source: 'generator:settlement',
      };
      const { index } = appendTo(data, 'npcs', npc);
      refs.push({ entityType: 'npc', entityKey: 'npcs', entityId: npc.id, entityIndex: index });
      return { name: n.name, role: n.role, npcId: npc.id };
    });

    const loc: StructuredLocation = {
      id: rid('loc'),
      name: result.name,
      type: result.details.sizeClass.replace(/^./, (c) => c.toUpperCase()),
      subtype: 'settlement',
      source: 'generator:settlement',
      details: { ...result.details, notables: notableRefs },
    };
    const { index } = appendTo(data, 'locations', loc);
    refs.push({ entityType: 'location', entityKey: 'locations', entityId: loc.id, entityIndex: index });
  }

  const historyEntryId = pushHistory(data, result, summariseTitle(result));
  return { data, saved: { refs, historyEntryId } };
}

export function summariseTitle(result: GeneratorResult): string {
  switch (result.kind) {
    case 'treasure-hoard': return `Treasure (CR ${result.inputs.crTier})`;
    case 'trinket': return `${result.trinkets.length} trinket${result.trinkets.length === 1 ? '' : 's'}`;
    case 'mundane-shop': return result.shopName;
    case 'magic-shop': return result.shopName;
    case 'tavern': return result.name;
    case 'tavern-name': return `${result.names.length} tavern name${result.names.length === 1 ? '' : 's'}`;
    case 'dungeon': return result.name;
    case 'settlement': return result.name;
    case 'plot-segue': return result.segues.length === 1
      ? `Plot segue · ${result.segues[0].arcFlavor}`
      : `${result.segues.length} plot segues`;
  }
}

// History-only push (for "Recent Generations" without saving entities).
export function recordHistoryOnly(
  inputData: Record<string, unknown>,
  result: GeneratorResult,
): { data: Record<string, unknown>; historyEntryId: string } {
  const data = { ...inputData };
  const id = pushHistory(data, result, summariseTitle(result));
  return { data, historyEntryId: id };
}
