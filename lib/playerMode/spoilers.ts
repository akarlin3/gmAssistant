// GM Spoiler Block redaction and unified `player_visible: boolean` helpers
// for Module 2 (Relational Lore Graph & Player-Safe Reveal Toggle).
//
// Supports inline redactable GM spoiler blocks in any text field using:
//   - `||secret text||`
//   - `[gm]secret text[/gm]`
//   - `[spoiler]secret text[/spoiler]`
// Plus explicit `gmSpoiler` fields and `player_visible: boolean` toggles on
// every lore card/entity and custom item.

import { DEFAULT_FIELD_VISIBILITY, cloneDefaultFieldVisibility } from './fieldDefaults';
import { resolveVisibility } from './resolveVisibility';
import {
  PLAYER_ENTITY_TYPES,
  normalizeItem,
  type CampaignItem,
  type EntityVisibility,
  type PlayerConfig,
  type PlayerEntityType,
} from './types';
import { buildEntityIndex } from '@/lib/wiki/entities';
import { extractAllMentions } from '@/lib/wiki/mentions';
import { ruleFor } from '@/lib/wiki/catalog';
import type { EntityType, Relationship } from '@/lib/wiki/types';

const SPOILER_REGEX = /\|\|([\s\S]*?)\|\||\[gm\]([\s\S]*?)\[\/gm\]|\[spoiler\]([\s\S]*?)\[\/spoiler\]/gi;

/**
 * Strips all inline GM spoiler blocks (`||...||`, `[gm]...[/gm]`, `[spoiler]...[/spoiler]`)
 * from a string. If no spoiler markers are present, returns the input string verbatim.
 */
export function redactSpoilers(text: string): string {
  if (typeof text !== 'string' || !text) return text;
  if (!text.includes('||') && !/\[(gm|spoiler)\]/i.test(text)) {
    return text;
  }
  return text
    .replace(SPOILER_REGEX, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function hasSpoilers(text: string | undefined | null): boolean {
  if (typeof text !== 'string' || !text) return false;
  SPOILER_REGEX.lastIndex = 0;
  return SPOILER_REGEX.test(text);
}

export type SpoilerSegment = {
  type: 'text' | 'spoiler';
  kind: 'text' | 'spoiler';
  content: string;
  text: string;
  raw: string;
};

/**
 * Splits text into normal visible segments and redactable GM spoiler segments.
 */
export function parseSpoilerSegments(text: string): SpoilerSegment[] {
  if (!text) return [];
  const segments: SpoilerSegment[] = [];
  let lastIndex = 0;
  const re = new RegExp(SPOILER_REGEX.source, 'gi');
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const slice = text.slice(lastIndex, match.index);
      segments.push({
        type: 'text',
        kind: 'text',
        content: slice,
        text: slice,
        raw: slice,
      });
    }
    const inner = (match[1] ?? match[2] ?? match[3] ?? '').trim();
    segments.push({
      type: 'spoiler',
      kind: 'spoiler',
      content: inner,
      text: inner,
      raw: match[0],
    });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    const tail = text.slice(lastIndex);
    segments.push({
      type: 'text',
      kind: 'text',
      content: tail,
      text: tail,
      raw: tail,
    });
  }
  return segments;
}

/**
 * Checks whether a lore entity or card is marked `player_visible` (either via
 * the direct `player_visible` / `isPublic` boolean on the entity or via
 * `playerConfig.entityVisibility`).
 */
export function isEntityPlayerVisible(
  entity: Record<string, any> | null | undefined,
  entityTypeOrConfig?: PlayerEntityType | Partial<PlayerConfig> | null,
  maybeConfigOrType?: Partial<PlayerConfig> | PlayerEntityType | null,
): boolean {
  if (!entity || typeof entity !== 'object') return false;
  if (typeof entity.player_visible === 'boolean') return entity.player_visible;
  if (entity.isPublic === true) return true;
  const id = entity.id;
  if (!id) return false;
  const entityType: PlayerEntityType | undefined =
    typeof entityTypeOrConfig === 'string'
      ? entityTypeOrConfig
      : typeof maybeConfigOrType === 'string'
        ? maybeConfigOrType
        : undefined;
  const playerConfig: Partial<PlayerConfig> | null | undefined =
    typeof entityTypeOrConfig === 'object' && entityTypeOrConfig !== null
      ? entityTypeOrConfig
      : typeof maybeConfigOrType === 'object' && maybeConfigOrType !== null
        ? maybeConfigOrType
        : undefined;
  if (!entityType || !playerConfig) return false;
  const mode = playerConfig?.entityVisibility?.[entityType]?.[id]?.mode;
  return mode === 'party' || mode === 'custom';
}

/**
 * Checks whether a custom item (`CampaignItem` or raw string/object item) is player-visible.
 */
export function isItemPlayerVisible(item: string | Record<string, any> | null | undefined): boolean {
  if (!item) return false;
  if (typeof item === 'string') return false;
  if (typeof item.player_visible === 'boolean') return item.player_visible;
  if (item.isPublic === true) return true;
  if (item.assignedPlayerId) return true;
  return false;
}

/**
 * Synchronizes an entity's `player_visible` and `isPublic` booleans with
 * `playerConfig.entityVisibility[entityType][entityId]`.
 *
 * Supports two call signatures:
 *   1. `syncEntityPlayerVisibility(playerConfig, entityType, entityId, visible)` -> `PlayerConfig`
 *   2. `syncEntityPlayerVisibility(entity, visible, entityType, playerConfig?)` -> `{ entity, playerConfig }`
 */
export function syncEntityPlayerVisibility(
  playerConfig: Partial<PlayerConfig> | null | undefined,
  entityType: PlayerEntityType,
  entityId: string,
  visible: boolean,
): PlayerConfig;
export function syncEntityPlayerVisibility<T extends Record<string, any>>(
  entity: T,
  visible: boolean,
  entityType: PlayerEntityType,
  playerConfig?: Partial<PlayerConfig> | null,
): { entity: T & { player_visible: boolean; isPublic: boolean }; playerConfig: PlayerConfig };
export function syncEntityPlayerVisibility(
  arg1: any,
  arg2: any,
  arg3: any,
  arg4?: any,
): any {
  // Signature 1: (playerConfig, entityType, entityId, visible)
  if (typeof arg2 === 'string' && typeof arg3 === 'string' && typeof arg4 === 'boolean') {
    const playerConfig = arg1 as Partial<PlayerConfig> | null | undefined;
    const entityType = arg2 as PlayerEntityType;
    const entityId = arg3 as string;
    const visible = arg4 as boolean;
    const baseConfig: PlayerConfig = {
      shareToken: playerConfig?.shareToken || '',
      tokenVersion: playerConfig?.tokenVersion ?? 1,
      roster: playerConfig?.roster ?? [],
      fieldDefaults: playerConfig?.fieldDefaults ?? cloneDefaultFieldVisibility(),
      entityVisibility: { ...(playerConfig?.entityVisibility ?? {}) },
      ...(playerConfig?.handouts ? { handouts: playerConfig.handouts } : {}),
      ...(playerConfig?.planningVisibility ? { planningVisibility: playerConfig.planningVisibility } : {}),
    };
    if (entityId) {
      const bucket: Record<string, EntityVisibility> = {
        ...(baseConfig.entityVisibility[entityType] ?? {}),
      };
      if (visible) {
        bucket[entityId] = {
          ...(bucket[entityId] ?? {}),
          mode: 'party',
        };
      } else {
        delete bucket[entityId];
      }
      baseConfig.entityVisibility[entityType] = bucket;
    }
    return baseConfig;
  }

  // Signature 2: (entity, visible, entityType, playerConfig?)
  const entity = arg1 ?? {};
  const visible = Boolean(arg2);
  const entityType = arg3 as PlayerEntityType;
  const playerConfig = arg4 as Partial<PlayerConfig> | null | undefined;
  const nextEntity = {
    ...entity,
    player_visible: visible,
    isPublic: visible,
  };
  const updatedConfig = syncEntityPlayerVisibility(
    playerConfig,
    entityType,
    nextEntity.id || '',
    visible,
  );
  return { entity: nextEntity, playerConfig: updatedConfig };
}

export type PlayerSafeNode = {
  id: string;
  type: EntityType;
  name: string;
  subtitle?: string;
  summary: string;
  fields: Array<{ label: string; value: string }>;
  tags: string[];
};

export type PlayerSafeEdge = {
  id: string;
  fromType: EntityType;
  fromId: string;
  toType: EntityType;
  toId: string;
  kind: string;
  label: string;
  inverseLabel: string;
};

export type PlayerSafeLoreSnapshot = {
  campaignName: string;
  inWorldDay: number;
  nodes: PlayerSafeNode[];
  edges: PlayerSafeEdge[];
  revealedSecrets: string[];
  npcs: Array<Record<string, any>>;
  locations: Array<Record<string, any>>;
  factions: Array<Record<string, any>>;
  items: Array<Record<string, any>>;
  clocks: Array<Record<string, any>>;
};

const PLURAL_TO_WIKI_TYPE: Record<PlayerEntityType, EntityType> = {
  characters: 'pc',
  pcs: 'pc',
  npcs: 'npc',
  locations: 'location',
  factions: 'faction',
  clocks: 'factionClock',
};

/**
 * Computes a complete read-only Player-Safe Lore View snapshot from raw campaign
 * data. Only entities with `player_visible: true` (or `isPublic` / `party` visibility)
 * are included, private fields are stripped via `resolveVisibility`, and all
 * inline GM spoiler blocks (`||...||`, `[gm]...[/gm]`) are redacted.
 * Connected lore edges (both explicit relationships and `@mention` references)
 * are included only when both endpoints are player-visible.
 */
export function buildPlayerSafeLoreSnapshot(
  data: Record<string, any> | null | undefined,
  campaignName = 'Campaign',
): PlayerSafeLoreSnapshot {
  const d = data ?? {};
  const playerConfig = (d.player ?? {}) as Partial<PlayerConfig>;
  const defaults = playerConfig.fieldDefaults ?? DEFAULT_FIELD_VISIBILITY;
  const nodes: PlayerSafeNode[] = [];
  const visibleNodeKeys = new Set<string>();

  const registerNode = (node: PlayerSafeNode) => {
    const key = `${node.type}:${node.id}`;
    if (visibleNodeKeys.has(key)) return;
    visibleNodeKeys.add(key);
    nodes.push(node);
  };

  // 1. NPCs
  const npcs = Array.isArray(d.npcs) ? d.npcs : [];
  npcs.forEach((n: any, i: number) => {
    if (!n || typeof n !== 'object') return;
    const id = n.id || `npc-${i}`;
    if (!isEntityPlayerVisible({ ...n, id }, 'npcs', playerConfig)) return;
    const vis = playerConfig.entityVisibility?.npcs?.[id] ?? { mode: 'party' as const };
    const { visibleFields } = resolveVisibility({
      entityType: 'npcs',
      visibility: vis,
      slotId: '__party__',
      defaults,
      fields: Object.keys(n),
    });
    const getPub = (k: string) =>
      visibleFields.has(k) && typeof n[k] === 'string' ? redactSpoilers(n[k]) : '';

    const name = getPub('name') || redactSpoilers(n.name || `NPC ${i + 1}`);
    const fields: Array<{ label: string; value: string }> = [];
    if (getPub('archetype')) fields.push({ label: 'Archetype', value: getPub('archetype') });
    if (getPub('faction')) fields.push({ label: 'Faction', value: getPub('faction') });
    if (getPub('appearance')) fields.push({ label: 'Appearance', value: getPub('appearance') });
    if (getPub('mannerism')) fields.push({ label: 'Mannerism', value: getPub('mannerism') });
    if (getPub('talent')) fields.push({ label: 'Talent', value: getPub('talent') });
    if (getPub('goal')) fields.push({ label: 'Known Motive', value: getPub('goal') });
    if (typeof n.description === 'string' && n.description.trim()) {
      fields.push({ label: 'Description', value: redactSpoilers(n.description) });
    }

    registerNode({
      id,
      type: 'npc',
      name,
      subtitle: [getPub('archetype'), getPub('faction')].filter(Boolean).join(' · ') || 'NPC',
      summary:
        getPub('appearance') ||
        redactSpoilers(n.description || '') ||
        getPub('mannerism') ||
        'Discovered character.',
      fields,
      tags: [getPub('faction'), getPub('archetype')].filter(Boolean),
    });
  });

  // 2. Locations
  const locations = Array.isArray(d.locations) ? d.locations : [];
  locations.forEach((l: any, i: number) => {
    if (!l || typeof l !== 'object') return;
    const id = l.id || `loc-${i}`;
    if (!isEntityPlayerVisible({ ...l, id }, 'locations', playerConfig)) return;
    const name = redactSpoilers(l.name || `Location ${i + 1}`);
    const aspects = Array.isArray(l.aspects)
      ? l.aspects.map((a: string) => redactSpoilers(a || '')).filter(Boolean)
      : [];
    const terrainTags = Array.isArray(l.terrainTags)
      ? l.terrainTags.map((t: string) => redactSpoilers(t || '')).filter(Boolean)
      : [];
    const lighting = typeof l.lighting === 'string' ? redactSpoilers(l.lighting) : '';
    const desc = typeof l.description === 'string' ? redactSpoilers(l.description) : '';
    const factions = typeof l.factions === 'string' ? redactSpoilers(l.factions) : '';

    const fields: Array<{ label: string; value: string }> = [];
    if (desc) fields.push({ label: 'Description', value: desc });
    if (lighting) fields.push({ label: 'Lighting', value: lighting });
    if (terrainTags.length > 0) fields.push({ label: 'Terrain', value: terrainTags.join(', ') });
    if (aspects.length > 0) fields.push({ label: 'Aspects', value: aspects.join(' · ') });
    if (factions) fields.push({ label: 'Factions Present', value: factions });

    registerNode({
      id,
      type: 'location',
      name,
      subtitle: redactSpoilers(l.type || 'Location'),
      summary: desc || aspects.join(' · ') || 'Discovered location.',
      fields,
      tags: [redactSpoilers(l.type || ''), lighting, ...terrainTags].filter(Boolean),
    });
  });

  // 3. Factions
  const factions = Array.isArray(d.factions) ? d.factions : [];
  factions.forEach((f: any, i: number) => {
    if (!f || typeof f !== 'object') return;
    const id = f.id || `fac-${i}`;
    if (!isEntityPlayerVisible({ ...f, id }, 'factions', playerConfig)) return;
    const vis = playerConfig.entityVisibility?.factions?.[id] ?? { mode: 'party' as const };
    const { visibleFields } = resolveVisibility({
      entityType: 'factions',
      visibility: vis,
      slotId: '__party__',
      defaults,
      fields: Object.keys(f),
    });
    const getPub = (k: string) =>
      visibleFields.has(k) && typeof f[k] === 'string' ? redactSpoilers(f[k]) : '';

    const name = getPub('name') || redactSpoilers(f.name || `Faction ${i + 1}`);
    const fields: Array<{ label: string; value: string }> = [];
    if (getPub('archetype')) fields.push({ label: 'Archetype', value: getPub('archetype') });
    if (getPub('identity')) fields.push({ label: 'Identity', value: getPub('identity') });
    if (getPub('area')) fields.push({ label: 'Area of Operation', value: getPub('area') });
    if (getPub('ideology')) fields.push({ label: 'Ideology', value: getPub('ideology') });

    registerNode({
      id,
      type: 'faction',
      name,
      subtitle: getPub('archetype') || 'Faction',
      summary: getPub('identity') || getPub('area') || 'Known faction.',
      fields,
      tags: [getPub('archetype'), getPub('area')].filter(Boolean),
    });
  });

  // 4. Faction Clocks
  const clocks = Array.isArray(d.clocks) ? d.clocks : [];
  clocks.forEach((c: any, i: number) => {
    if (!c || typeof c !== 'object') return;
    const id = c.id || `clock-${i}`;
    if (!isEntityPlayerVisible({ ...c, id }, 'clocks', playerConfig)) return;
    const max = c.max || 6;
    const filled = c.filled || 0;
    const name = redactSpoilers(c.text || `Clock ${i + 1}`);
    const faction = redactSpoilers(c.faction || '');
    const status = redactSpoilers(c.status || 'active');
    const fields: Array<{ label: string; value: string }> = [
      { label: 'Progress', value: `${filled} / ${max} segments` },
    ];
    if (faction) fields.push({ label: 'Faction', value: faction });
    if (status) fields.push({ label: 'Status', value: status });

    registerNode({
      id,
      type: 'factionClock',
      name,
      subtitle: `${faction ? `${faction} · ` : ''}${filled}/${max}`,
      summary: `Progress Clock: ${filled}/${max} segments (${status}).`,
      fields,
      tags: [faction, `${filled}/${max}`, status].filter(Boolean),
    });
  });

  // 5. Custom Items & Artifacts (`items`)
  const items = Array.isArray(d.items) ? d.items : [];
  items.forEach((raw: any, i: number) => {
    if (!isItemPlayerVisible(raw)) return;
    const norm: CampaignItem & Record<string, any> =
      typeof raw === 'object' && raw
        ? { ...normalizeItem(raw, i), ...raw }
        : normalizeItem(raw, i);
    const id = norm.id || `item_${i}`;
    const name = redactSpoilers(norm.name || `Artifact ${i + 1}`);
    const desc =
      norm.playerVisibility === 'name-only'
        ? ''
        : redactSpoilers(norm.description || '');
    const mechanic =
      norm.playerVisibility === 'name-only'
        ? ''
        : redactSpoilers(norm.mechanic || '');
    const fields: Array<{ label: string; value: string }> = [];
    if (desc) fields.push({ label: 'Lore & Description', value: desc });
    if (mechanic) fields.push({ label: 'Item Mechanic', value: mechanic });

    registerNode({
      id,
      type: 'magicItem',
      name,
      subtitle: redactSpoilers(norm.rarity || 'Artifact / Item'),
      summary: desc || mechanic || 'Discovered item.',
      fields,
      tags: [redactSpoilers(norm.rarity || 'Artifact')].filter(Boolean),
    });
  });

  // 6. Revealed Secrets
  const secrets = Array.isArray(d.secrets) ? d.secrets : [];
  const revSec = (d.revSec ?? {}) as Record<number, boolean>;
  const planSecrets = playerConfig.planningVisibility?.secrets ?? [];
  const revealedSecrets: string[] = [];
  secrets.forEach((s: any, i: number) => {
    if (typeof s !== 'string' || !s.trim()) return;
    if (revSec[i] || planSecrets[i]) {
      revealedSecrets.push(redactSpoilers(s));
    }
  });

  // 7. Connected Edges (both explicit relationships and @tag mentions + faction/location matches)
  const edges: PlayerSafeEdge[] = [];
  const seenEdgeKeys = new Set<string>();
  const addEdge = (
    fromType: EntityType,
    fromId: string,
    toType: EntityType,
    toId: string,
    kind: string,
    id?: string,
  ) => {
    if (fromType === toType && fromId === toId) return;
    if (!visibleNodeKeys.has(`${fromType}:${fromId}`) || !visibleNodeKeys.has(`${toType}:${toId}`)) {
      return;
    }
    const dedupeKey =
      `${fromType}:${fromId}` < `${toType}:${toId}`
        ? `${fromType}:${fromId}|${toType}:${toId}|${kind}`
        : `${toType}:${toId}|${fromType}:${fromId}|${kind}`;
    if (seenEdgeKeys.has(dedupeKey)) return;
    seenEdgeKeys.add(dedupeKey);
    const rule = ruleFor(kind as any);
    edges.push({
      id: id || `edge-${edges.length + 1}`,
      fromType,
      fromId,
      toType,
      toId,
      kind,
      label: rule?.label ?? kind,
      inverseLabel: rule?.inverseLabel ?? rule?.label ?? kind,
    });
  };

  const rels: Relationship[] = Array.isArray(d.relationships) ? d.relationships : [];
  for (const r of rels) {
    if (!r || r.suggested || r.proposed) continue;
    // In player-safe view, include edges that are not explicitly set to private-only when both endpoints are player-visible,
    // or edges marked 'party' / 'custom'.
    addEdge(r.fromType, r.fromId, r.toType, r.toId, r.kind, r.id);
  }

  // Also infer links from matching Faction names on visible NPCs/Clocks/Locations and @mentions in visible text
  const visibleFactionsByName = new Map<string, PlayerSafeNode>();
  for (const n of nodes) {
    if (n.type === 'faction') visibleFactionsByName.set(n.name.toLowerCase(), n);
  }

  for (const n of nodes) {
    if (n.type === 'npc') {
      const facField = n.fields.find((f) => f.label === 'Faction');
      if (facField) {
        const targetFac = visibleFactionsByName.get(facField.value.toLowerCase());
        if (targetFac) addEdge('npc', n.id, 'faction', targetFac.id, 'memberOf');
      }
    }
    if (n.type === 'factionClock') {
      const facField = n.fields.find((f) => f.label === 'Faction');
      if (facField) {
        const targetFac = visibleFactionsByName.get(facField.value.toLowerCase());
        if (targetFac) addEdge('factionClock', n.id, 'faction', targetFac.id, 'related');
      }
    }
  }

  // Parse @mentions inside visible node fields
  const idx = buildEntityIndex(d);
  for (const n of nodes) {
    const allText = [n.summary, ...n.fields.map((f) => f.value)].join(' ');
    const mentions = extractAllMentions(allText, idx);
    for (const m of mentions) {
      addEdge(n.type, n.id, m.type, m.id, 'related');
    }
  }

  const inWorldDay =
    typeof d.worldClock?.currentDay === 'number' && d.worldClock.currentDay >= 1
      ? d.worldClock.currentDay
      : 1;

  const nodeToRecord = (n: PlayerSafeNode): Record<string, any> => {
    const rec: Record<string, any> = {
      id: n.id,
      name: n.name,
      summary: n.summary,
      subtitle: n.subtitle,
    };
    for (const f of n.fields) {
      const key = f.label.toLowerCase();
      if (key === 'archetype') rec.archetype = f.value;
      else if (key === 'faction') rec.faction = f.value;
      else if (key === 'appearance') rec.appearance = f.value;
      else if (key === 'mannerism') rec.mannerism = f.value;
      else if (key === 'talent') rec.talent = f.value;
      else if (key === 'known motive') rec.goal = f.value;
      else if (key === 'description' || key === 'lore & description') rec.description = f.value;
      else if (key === 'identity') rec.identity = f.value;
      else if (key === 'area of operation') rec.area = f.value;
      else if (key === 'ideology') rec.ideology = f.value;
      else if (key === 'item mechanic') rec.mechanic = f.value;
    }
    return rec;
  };

  return {
    campaignName,
    inWorldDay,
    nodes,
    edges,
    revealedSecrets,
    npcs: nodes.filter((n) => n.type === 'npc').map(nodeToRecord),
    locations: nodes.filter((n) => n.type === 'location').map(nodeToRecord),
    factions: nodes.filter((n) => n.type === 'faction').map(nodeToRecord),
    items: nodes.filter((n) => n.type === 'magicItem').map(nodeToRecord),
    clocks: nodes.filter((n) => n.type === 'factionClock').map(nodeToRecord),
  };
}
