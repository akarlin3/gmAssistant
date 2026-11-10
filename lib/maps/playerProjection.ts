// Player Mode projection for maps.
//
// Players only ever see layers explicitly flagged `visibleToPlayers`, and only
// the markers / pointcrawl nodes & edges that sit on those layers. A map with no
// player-visible layer is omitted entirely (the "default reveal is any map with
// at least one player-visible layer" rule). GM-only fields (marker notes, entity
// links, edge travel times) are stripped here — this projection is the security
// boundary for what reaches the published share doc.

import {
  readMaps,
  type CampaignMap,
  type MapFogPoint,
  type MapFogRegion,
  type MapPing,
  type MapTokenPin,
} from './types';

export type PlayerMapLayer = { id: string; name: string; color: string; order: number };
export type PlayerMapMarker = {
  id: string;
  x: number;
  y: number;
  layerId: string;
  label: string;
  color?: string;
  icon?: string;
};
export type PlayerMapNode = { id: string; x: number; y: number; label: string; layerId: string };
export type PlayerMapEdge = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  layerId: string;
  label?: string;
  hazardous?: boolean;
};

export type PlayerMapTokenPin = {
  id: string;
  label: string;
  x: number;
  y: number;
  size: number;
  color: string;
  pcId?: string;
  visibility: 'party';
};

export type PlayerMapFogRegion = {
  id: string;
  label?: string;
  shape?: 'rect' | 'polygon' | 'brush';
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
  points?: MapFogPoint[];
  revealed: true;
};

export type PlayerMapPing = {
  pcId: string;
  x: number;
  y: number;
  color: string;
  timestamp: number;
};

export type PlayerMap = {
  id: string;
  name: string;
  type: CampaignMap['type'];
  imageUrl?: string;
  width: number;
  height: number;
  layers: PlayerMapLayer[];
  markers: PlayerMapMarker[];
  nodes: PlayerMapNode[];
  edges: PlayerMapEdge[];
  tokens?: PlayerMapTokenPin[];
  fogEnabled?: boolean;
  fogRevealedRegions?: PlayerMapFogRegion[];
  pings?: PlayerMapPing[];
};

export function projectMapTokens(
  tokens: ReadonlyArray<MapTokenPin> | undefined,
  pcOverrides?: Map<string, { x: number; y: number; mapId?: string }>,
  mapId?: string,
): PlayerMapTokenPin[] {
  if (!Array.isArray(tokens)) return [];
  const out: PlayerMapTokenPin[] = [];
  for (const t of tokens) {
    if (!t || typeof t !== 'object') continue;
    // Strict redaction: private tokens and trap tokens are completely stripped.
    if (t.visibility !== 'party' || t.isTrap === true) continue;
    let x = typeof t.x === 'number' ? Math.max(0, Math.min(1, t.x)) : 0.5;
    let y = typeof t.y === 'number' ? Math.max(0, Math.min(1, t.y)) : 0.5;
    if (t.pcId && pcOverrides?.has(t.pcId)) {
      const ov = pcOverrides.get(t.pcId)!;
      if (!ov.mapId || !mapId || ov.mapId === mapId) {
        x = Math.max(0, Math.min(1, ov.x));
        y = Math.max(0, Math.min(1, ov.y));
      }
    }
    const clean: PlayerMapTokenPin = {
      id: String(t.id),
      label: String(t.label ?? 'Token'),
      x,
      y,
      size: typeof t.size === 'number' && t.size > 0 ? t.size : 1,
      color: typeof t.color === 'string' && t.color ? t.color : '#38bdf8',
      visibility: 'party',
    };
    if (typeof t.pcId === 'string' && t.pcId) clean.pcId = t.pcId;
    out.push(clean);
  }
  return out;
}

export function projectFogRegions(
  regions: ReadonlyArray<MapFogRegion> | undefined,
): PlayerMapFogRegion[] {
  if (!Array.isArray(regions)) return [];
  const out: PlayerMapFogRegion[] = [];
  for (const r of regions) {
    if (!r || typeof r !== 'object') continue;
    // Strict redaction: unrevealed fog regions (revealed !== true) and GM notes are completely stripped.
    if (r.revealed !== true) continue;
    const clean: PlayerMapFogRegion = {
      id: String(r.id),
      x: typeof r.x === 'number' ? Math.max(0, Math.min(1, r.x)) : 0,
      y: typeof r.y === 'number' ? Math.max(0, Math.min(1, r.y)) : 0,
      width: typeof r.width === 'number' ? Math.max(0, Math.min(1, r.width)) : 0.2,
      height: typeof r.height === 'number' ? Math.max(0, Math.min(1, r.height)) : 0.2,
      revealed: true,
    };
    if (typeof r.label === 'string' && r.label) clean.label = r.label;
    if (r.shape === 'rect' || r.shape === 'polygon' || r.shape === 'brush') clean.shape = r.shape;
    if (typeof r.radius === 'number' && r.radius > 0) clean.radius = r.radius;
    if (Array.isArray(r.points) && r.points.length > 0) {
      clean.points = r.points.map((pt: MapFogPoint) => ({
        x: Math.max(0, Math.min(1, pt.x)),
        y: Math.max(0, Math.min(1, pt.y)),
      }));
    }
    out.push(clean);
  }
  return out;
}

export function projectMapPings(
  pings: ReadonlyArray<MapPing> | undefined,
  pcPings?: ReadonlyArray<MapPing>,
): PlayerMapPing[] {
  const combined = [...(Array.isArray(pings) ? pings : []), ...(Array.isArray(pcPings) ? pcPings : [])];
  const out: PlayerMapPing[] = [];
  for (const p of combined) {
    if (!p || typeof p !== 'object' || typeof p.pcId !== 'string' || typeof p.timestamp !== 'number') continue;
    out.push({
      pcId: p.pcId,
      x: typeof p.x === 'number' ? Math.max(0, Math.min(1, p.x)) : 0.5,
      y: typeof p.y === 'number' ? Math.max(0, Math.min(1, p.y)) : 0.5,
      color: typeof p.color === 'string' && p.color ? p.color : '#f59e0b',
      timestamp: p.timestamp,
    });
  }
  return out;
}

function projectMap(
  map: CampaignMap,
  pcOverrides?: Map<string, { x: number; y: number; mapId?: string }>,
  pcPingsByMap?: Map<string, MapPing[]>,
): PlayerMap | null {
  const visibleLayers = map.layers.filter((l) => l.visibleToPlayers);
  if (visibleLayers.length === 0) return null;
  const visibleIds = new Set(visibleLayers.map((l) => l.id));

  const layers: PlayerMapLayer[] = visibleLayers
    .map((l) => ({ id: l.id, name: l.name, color: l.color, order: l.order }))
    .sort((a, b) => a.order - b.order);

  const markers: PlayerMapMarker[] = map.markers
    .filter((m) => visibleIds.has(m.layerId))
    .map((m) => {
      const out: PlayerMapMarker = { id: m.id, x: m.x, y: m.y, layerId: m.layerId, label: m.label };
      if (m.color) out.color = m.color;
      if (m.icon) out.icon = m.icon;
      return out;
    });

  const nodes: PlayerMapNode[] = (map.pointcrawl?.nodes ?? [])
    .filter((n) => visibleIds.has(n.layerId))
    .map((n) => ({ id: n.id, x: n.x, y: n.y, label: n.label, layerId: n.layerId }));

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges: PlayerMapEdge[] = (map.pointcrawl?.edges ?? [])
    .filter((e) => visibleIds.has(e.layerId) && nodeIds.has(e.fromNodeId) && nodeIds.has(e.toNodeId))
    .map((e) => {
      const out: PlayerMapEdge = {
        id: e.id,
        fromNodeId: e.fromNodeId,
        toNodeId: e.toNodeId,
        layerId: e.layerId,
      };
      if (e.label) out.label = e.label;
      if (e.hazardous) out.hazardous = true;
      return out;
    });

  const out: PlayerMap = {
    id: map.id,
    name: map.name,
    type: map.type,
    width: map.width,
    height: map.height,
    layers,
    markers,
    nodes,
    edges,
  };
  if (map.imageUrl) out.imageUrl = map.imageUrl;
  if (typeof map.fogEnabled === 'boolean') out.fogEnabled = map.fogEnabled;

  if (Array.isArray(map.tokens)) {
    out.tokens = projectMapTokens(map.tokens, pcOverrides, map.id);
  }
  if (Array.isArray(map.fogRevealedRegions)) {
    out.fogRevealedRegions = projectFogRegions(map.fogRevealedRegions);
  }
  const extraPings = [
    ...(pcPingsByMap?.get(map.id) ?? []),
    ...(pcPingsByMap?.get('*') ?? []),
  ];
  if (Array.isArray(map.pings) || extraPings.length > 0) {
    out.pings = projectMapPings(map.pings, extraPings);
  }
  return out;
}

// Build the list of player-visible maps from a campaign `data` blob (or a
// pre-read maps array). Maps with no player-visible layer are dropped.
export function projectPlayerMaps(
  source: Record<string, unknown> | CampaignMap[] | null | undefined,
): PlayerMap[] {
  const maps = Array.isArray(source) ? source : readMaps(source);
  const pcOverrides = new Map<string, { x: number; y: number; mapId?: string }>();
  const pcPingsByMap = new Map<string, MapPing[]>();

  if (source && !Array.isArray(source) && typeof source === 'object') {
    const pcs = Array.isArray((source as any).pcs) ? (source as any).pcs : [];
    for (const pc of pcs) {
      if (!pc || typeof pc !== 'object' || typeof pc.id !== 'string') continue;
      if (
        pc.tokenPosition &&
        typeof pc.tokenPosition === 'object' &&
        typeof pc.tokenPosition.x === 'number' &&
        typeof pc.tokenPosition.y === 'number'
      ) {
        pcOverrides.set(pc.id, {
          x: pc.tokenPosition.x,
          y: pc.tokenPosition.y,
          mapId: typeof pc.tokenPosition.mapId === 'string' ? pc.tokenPosition.mapId : undefined,
        });
      }
      if (
        pc.mapPing &&
        typeof pc.mapPing === 'object' &&
        typeof pc.mapPing.x === 'number' &&
        typeof pc.mapPing.y === 'number' &&
        typeof pc.mapPing.timestamp === 'number'
      ) {
        const targetMap = typeof pc.mapPing.mapId === 'string' ? pc.mapPing.mapId : '*';
        const bucket = pcPingsByMap.get(targetMap) ?? [];
        bucket.push({
          pcId: pc.id,
          x: pc.mapPing.x,
          y: pc.mapPing.y,
          color: typeof pc.mapPing.color === 'string' ? pc.mapPing.color : '#f59e0b',
          timestamp: pc.mapPing.timestamp,
        });
        pcPingsByMap.set(targetMap, bucket);
      }
    }
  }

  const out: PlayerMap[] = [];
  for (const map of maps) {
    const projected = projectMap(map, pcOverrides, pcPingsByMap);
    if (projected) out.push(projected);
  }
  return out;
}
