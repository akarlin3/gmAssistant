// Graph palette. The app's surface is a warm "parchment" cream, so the bright
// dark-mode pastels from the original spec would wash out. These are the same
// hues, shifted to read as saturated dots on a light ground while staying
// distinguishable from one another. Each maps an EntityType to a node fill;
// a handful of relationship kinds get a signal edge color, the rest fall back
// to a neutral ink line.

import type { EntityType, RelationshipKind } from './types';

export const ENTITY_COLORS: Record<EntityType, string> = {
  npc: '#9a1d2e', // crimson
  faction: '#5c1f3d', // wine
  location: '#3d5a2a', // moss
  fantasticLocation: '#1e6b6b', // teal
  secret: '#a87f2e', // brass
  pc: '#1d4e89', // deep blue
  monster: '#7a2d12', // burnt umber
  magicItem: '#5a6e1a', // olive
  factionClock: '#6b3fa0', // violet
  scene: '#52443a', // ink-soft
  potentialScene: '#8a7a6a', // ink-mute
};

export const ENTITY_LABELS: Record<EntityType, string> = {
  npc: 'NPC',
  faction: 'Faction',
  location: 'Location',
  fantasticLocation: 'Fantastic Location',
  secret: 'Secret',
  pc: 'PC',
  monster: 'Monster',
  magicItem: 'Magic Item',
  factionClock: 'Faction Clock',
  scene: 'Scene',
  potentialScene: 'Potential Scene',
};

export const RELATIONSHIP_EDGE_COLORS: Partial<Record<RelationshipKind, string>> = {
  enemyOf: '#c1121f',
  allyOf: '#3d5a2a',
  knows: '#a87f2e',
};

export const DEFAULT_EDGE_COLOR = '#b3a48f'; // ink-faint

export function edgeColor(kind: RelationshipKind): string {
  return RELATIONSHIP_EDGE_COLORS[kind] ?? DEFAULT_EDGE_COLOR;
}
