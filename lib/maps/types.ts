// Maps layer — data model.
//
// Maps live on the campaign `data` blob under `data.maps` (capped at 20). A map
// is an image (uploaded or AI-generated) or a blank pointcrawl canvas, carrying
// markers (points tied to wiki entities), layers (GM-only / player-visible
// toggles wired into Player Mode), and — for `pointcrawl` maps — a graph of
// nodes and travel-time edges that feed the World Clock.
//
// All coordinates are stored normalized (0–1) against the map's intrinsic
// width/height so the same data renders correctly at any zoom or container size.

import { nanoid } from 'nanoid';

export const MAPS_CAP = 20;

// Marker icons available in the editor. Rendered as labelled dots on the canvas.
export const MARKER_ICONS = [
  'pin',
  'star',
  'sword',
  'eye',
  'skull',
  'house',
  'cave',
  'tree',
] as const;
export type MarkerIcon = (typeof MARKER_ICONS)[number];

export const MAP_TYPES = ['pointcrawl', 'region', 'encounter', 'dungeon'] as const;
export type MapType = (typeof MAP_TYPES)[number];

// Campaign entity arrays a marker (or pointcrawl node) can be linked to. These
// are the keys on the campaign `data` blob holding `{ id, name, ... }` records.
export const MAP_ENTITY_TYPES = ['npcs', 'locations', 'factions', 'monsters', 'items'] as const;
export type MapEntityType = (typeof MAP_ENTITY_TYPES)[number];

export type MapMarker = {
  id: string;
  x: number; // 0–1 normalized
  y: number;
  layerId: string;
  entityType?: MapEntityType;
  entityId?: string;
  label: string;
  color?: string; // hex; defaults to layer color
  icon?: MarkerIcon;
  notes?: string; // GM-only; never published to players
};

export type MapLayer = {
  id: string;
  name: string;
  color: string;
  visible: boolean; // GM-side visibility
  visibleToPlayers: boolean; // pushed to Player Mode
  order: number;
};

export type PointcrawlNode = {
  id: string;
  x: number;
  y: number;
  label: string;
  locationId?: string; // FK to data.locations
  layerId: string;
};

export type PointcrawlEdge = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  label?: string; // "2 days on foot"
  travelTimeDays?: number; // numeric for World Clock integration
  hazardous?: boolean;
  layerId: string;
};

export type PointcrawlData = {
  nodes: PointcrawlNode[];
  edges: PointcrawlEdge[];
};

export type MapTokenVisibility = 'private' | 'party';

export type MapTokenPin = {
  id: string;
  label: string;
  x: number; // 0–1 normalized
  y: number; // 0–1 normalized
  size: number; // relative grid size (e.g. 1 = medium, 2 = large)
  color: string;
  pcId?: string;
  visibility: MapTokenVisibility;
  gmNotes?: string; // GM-only; never published to players
  isTrap?: boolean; // GM-only trap flag; never published to players
};

export type MapFogPoint = {
  x: number;
  y: number;
};

export type MapFogRegion = {
  id: string;
  label?: string;
  shape?: 'rect' | 'polygon' | 'brush';
  x: number; // 0–1 normalized
  y: number; // 0–1 normalized
  width: number; // 0–1 normalized
  height: number; // 0–1 normalized
  radius?: number; // 0–1 normalized brush radius
  points?: MapFogPoint[];
  revealed: boolean; // default: false (hidden) until brushed open or revealed room-by-room
  gmNotes?: string; // GM-only room secret notes; never published to players
};

export type MapTrapPin = {
  id: string;
  label: string;
  x: number; // 0–1 normalized
  y: number; // 0–1 normalized
  dc?: number;
  damage?: string;
  notes?: string; // GM-only trap mechanics
  triggered?: boolean;
};

export type MapPing = {
  id?: string;
  pcId: string;
  x: number; // 0–1 normalized
  y: number; // 0–1 normalized
  color: string;
  timestamp: number;
};

export type CampaignMap = {
  id: string;
  name: string;
  type: MapType;
  imageUrl?: string; // Firebase Storage download URL or data URL; absent for blank pointcrawl
  imageStoragePath?: string;
  width: number; // intrinsic pixel width of image (or canvas)
  height: number;
  markers: MapMarker[];
  layers: MapLayer[];
  pointcrawl?: PointcrawlData; // present only when type === 'pointcrawl'
  tokens?: MapTokenPin[];
  fogEnabled?: boolean;
  fogRevealedRegions?: MapFogRegion[];
  traps?: MapTrapPin[]; // GM-only trap markers; strictly stripped in player projection
  gmMapNotes?: string; // GM-only secret notes; strictly stripped in player projection
  pings?: MapPing[];
  createdAt: number;
};

// Default canvas size for a blank (imageless) pointcrawl whiteboard.
export const BLANK_CANVAS_WIDTH = 1600;
export const BLANK_CANVAS_HEIGHT = 1000;

export const DEFAULT_LAYER_COLOR = '#f472b6';

export function newId(prefix = ''): string {
  return prefix ? `${prefix}_${nanoid(10)}` : nanoid(10);
}

export function makeDefaultLayer(order = 0): MapLayer {
  return {
    id: newId('layer'),
    name: 'Markers',
    color: DEFAULT_LAYER_COLOR,
    visible: true,
    visibleToPlayers: false,
    order,
  };
}

export function makeMap(args: {
  name: string;
  type: MapType;
  imageUrl?: string;
  imageStoragePath?: string;
  width?: number;
  height?: number;
  now?: number;
}): CampaignMap {
  const isBlankPointcrawl = args.type === 'pointcrawl' && !args.imageUrl;
  const width = args.width ?? (isBlankPointcrawl ? BLANK_CANVAS_WIDTH : BLANK_CANVAS_WIDTH);
  const height = args.height ?? (isBlankPointcrawl ? BLANK_CANVAS_HEIGHT : BLANK_CANVAS_HEIGHT);
  const map: CampaignMap = {
    id: newId('map'),
    name: args.name.trim() || 'Untitled Map',
    type: args.type,
    width,
    height,
    markers: [],
    layers: [makeDefaultLayer(0)],
    createdAt: args.now ?? Date.now(),
  };
  if (args.imageUrl) map.imageUrl = args.imageUrl;
  if (args.imageStoragePath) map.imageStoragePath = args.imageStoragePath;
  if (args.type === 'pointcrawl') map.pointcrawl = { nodes: [], edges: [] };
  return map;
}

// Read the maps array off a campaign `data` blob, tolerating absent/malformed
// values. Never mutates the input. Each map is normalized so historical or
// partially-written docs still render.
export function readMaps(data: Record<string, unknown> | null | undefined): CampaignMap[] {
  const raw = data && typeof data === 'object' ? (data as any).maps : null;
  if (!Array.isArray(raw)) return [];
  return raw.filter((m) => m && typeof m === 'object' && typeof m.id === 'string').map(normalizeMap);
}

function normalizeMap(m: any): CampaignMap {
  const layers: MapLayer[] = Array.isArray(m.layers) && m.layers.length > 0
    ? m.layers.map(normalizeLayer)
    : [makeDefaultLayer(0)];
  const fallbackLayerId = layers[0].id;
  const type: MapType = MAP_TYPES.includes(m.type) ? m.type : 'region';
  const out: CampaignMap = {
    id: String(m.id),
    name: typeof m.name === 'string' ? m.name : 'Untitled Map',
    type,
    width: typeof m.width === 'number' && m.width > 0 ? m.width : BLANK_CANVAS_WIDTH,
    height: typeof m.height === 'number' && m.height > 0 ? m.height : BLANK_CANVAS_HEIGHT,
    markers: Array.isArray(m.markers)
      ? m.markers.filter((mk: any) => mk && typeof mk.id === 'string').map((mk: any) => normalizeMarker(mk, fallbackLayerId))
      : [],
    layers,
    createdAt: typeof m.createdAt === 'number' ? m.createdAt : 0,
  };
  if (typeof m.imageUrl === 'string') out.imageUrl = m.imageUrl;
  if (typeof m.imageStoragePath === 'string') out.imageStoragePath = m.imageStoragePath;
  if (type === 'pointcrawl' || m.pointcrawl) {
    const pc = m.pointcrawl ?? {};
    out.pointcrawl = {
      nodes: Array.isArray(pc.nodes)
        ? pc.nodes.filter((n: any) => n && typeof n.id === 'string').map((n: any) => normalizeNode(n, fallbackLayerId))
        : [],
      edges: Array.isArray(pc.edges)
        ? pc.edges.filter((e: any) => e && typeof e.id === 'string').map((e: any) => normalizeEdge(e, fallbackLayerId))
        : [],
    };
  }
  if (typeof m.fogEnabled === 'boolean') out.fogEnabled = m.fogEnabled;
  if (Array.isArray(m.tokens)) {
    out.tokens = m.tokens
      .filter((t: any) => t && typeof t.id === 'string')
      .map(normalizeTokenPin);
  }
  if (Array.isArray(m.fogRevealedRegions)) {
    out.fogRevealedRegions = m.fogRevealedRegions
      .filter((r: any) => r && typeof r.id === 'string')
      .map(normalizeFogRegion);
  }
  if (Array.isArray(m.traps)) {
    out.traps = m.traps
      .filter((tr: any) => tr && typeof tr.id === 'string')
      .map(normalizeTrapPin);
  }
  if (typeof m.gmMapNotes === 'string') {
    out.gmMapNotes = m.gmMapNotes;
  }
  if (Array.isArray(m.pings)) {
    out.pings = m.pings
      .filter((p: any) => p && typeof p.pcId === 'string' && typeof p.timestamp === 'number')
      .map(normalizeMapPing);
  }
  return out;
}

function normalizeTokenPin(t: any): MapTokenPin {
  const out: MapTokenPin = {
    id: String(t.id),
    label: typeof t.label === 'string' ? t.label : 'Token',
    x: clamp01(t.x),
    y: clamp01(t.y),
    size: typeof t.size === 'number' && t.size > 0 ? Math.min(6, Math.max(0.5, t.size)) : 1,
    color: typeof t.color === 'string' && t.color ? t.color : '#38bdf8',
    visibility: t.visibility === 'party' ? 'party' : 'private',
  };
  if (typeof t.pcId === 'string' && t.pcId) out.pcId = t.pcId;
  if (typeof t.gmNotes === 'string') out.gmNotes = t.gmNotes;
  if (t.isTrap === true) out.isTrap = true;
  return out;
}

function normalizeFogRegion(r: any): MapFogRegion {
  const out: MapFogRegion = {
    id: String(r.id),
    x: clamp01(r.x),
    y: clamp01(r.y),
    width: clamp01(typeof r.width === 'number' ? r.width : 0.2),
    height: clamp01(typeof r.height === 'number' ? r.height : 0.2),
    revealed: r.revealed === true, // Default false (hidden) until explicitly revealed
  };
  if (typeof r.label === 'string') out.label = r.label;
  if (r.shape === 'rect' || r.shape === 'polygon' || r.shape === 'brush') out.shape = r.shape;
  if (typeof r.radius === 'number' && r.radius > 0) out.radius = clamp01(r.radius);
  if (Array.isArray(r.points)) {
    out.points = r.points
      .filter((pt: any) => pt && typeof pt.x === 'number' && typeof pt.y === 'number')
      .map((pt: any) => ({ x: clamp01(pt.x), y: clamp01(pt.y) }));
  }
  if (typeof r.gmNotes === 'string') out.gmNotes = r.gmNotes;
  return out;
}

function normalizeTrapPin(tr: any): MapTrapPin {
  const out: MapTrapPin = {
    id: String(tr.id),
    label: typeof tr.label === 'string' ? tr.label : 'Trap',
    x: clamp01(tr.x),
    y: clamp01(tr.y),
  };
  if (typeof tr.dc === 'number') out.dc = tr.dc;
  if (typeof tr.damage === 'string') out.damage = tr.damage;
  if (typeof tr.notes === 'string') out.notes = tr.notes;
  if (typeof tr.triggered === 'boolean') out.triggered = tr.triggered;
  return out;
}

function normalizeMapPing(p: any): MapPing {
  const out: MapPing = {
    pcId: String(p.pcId),
    x: clamp01(p.x),
    y: clamp01(p.y),
    color: typeof p.color === 'string' && p.color ? p.color : '#f59e0b',
    timestamp: typeof p.timestamp === 'number' ? p.timestamp : 0,
  };
  if (typeof p.id === 'string') out.id = p.id;
  return out;
}

function normalizeLayer(l: any): MapLayer {
  return {
    id: typeof l.id === 'string' ? l.id : newId('layer'),
    name: typeof l.name === 'string' ? l.name : 'Layer',
    color: typeof l.color === 'string' ? l.color : DEFAULT_LAYER_COLOR,
    visible: l.visible !== false,
    visibleToPlayers: l.visibleToPlayers === true,
    order: typeof l.order === 'number' ? l.order : 0,
  };
}

function normalizeMarker(mk: any, fallbackLayerId: string): MapMarker {
  const out: MapMarker = {
    id: String(mk.id),
    x: clamp01(mk.x),
    y: clamp01(mk.y),
    layerId: typeof mk.layerId === 'string' ? mk.layerId : fallbackLayerId,
    label: typeof mk.label === 'string' ? mk.label : '',
  };
  if (MAP_ENTITY_TYPES.includes(mk.entityType)) out.entityType = mk.entityType;
  if (typeof mk.entityId === 'string') out.entityId = mk.entityId;
  if (typeof mk.color === 'string') out.color = mk.color;
  if (MARKER_ICONS.includes(mk.icon)) out.icon = mk.icon;
  if (typeof mk.notes === 'string') out.notes = mk.notes;
  return out;
}

function normalizeNode(n: any, fallbackLayerId: string): PointcrawlNode {
  const out: PointcrawlNode = {
    id: String(n.id),
    x: clamp01(n.x),
    y: clamp01(n.y),
    label: typeof n.label === 'string' ? n.label : '',
    layerId: typeof n.layerId === 'string' ? n.layerId : fallbackLayerId,
  };
  if (typeof n.locationId === 'string') out.locationId = n.locationId;
  return out;
}

function normalizeEdge(e: any, fallbackLayerId: string): PointcrawlEdge {
  const out: PointcrawlEdge = {
    id: String(e.id),
    fromNodeId: String(e.fromNodeId ?? ''),
    toNodeId: String(e.toNodeId ?? ''),
    layerId: typeof e.layerId === 'string' ? e.layerId : fallbackLayerId,
  };
  if (typeof e.label === 'string') out.label = e.label;
  if (typeof e.travelTimeDays === 'number' && e.travelTimeDays >= 0) out.travelTimeDays = e.travelTimeDays;
  if (e.hazardous === true) out.hazardous = true;
  return out;
}

function clamp01(v: unknown): number {
  const n = typeof v === 'number' ? v : 0;
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
