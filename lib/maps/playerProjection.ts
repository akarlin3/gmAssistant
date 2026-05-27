// Player Mode projection for maps.
//
// Players only ever see layers explicitly flagged `visibleToPlayers`, and only
// the markers / pointcrawl nodes & edges that sit on those layers. A map with no
// player-visible layer is omitted entirely (the "default reveal is any map with
// at least one player-visible layer" rule). GM-only fields (marker notes, entity
// links, edge travel times) are stripped here — this projection is the security
// boundary for what reaches the published share doc.

import { readMaps, type CampaignMap } from './types';

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
};

function projectMap(map: CampaignMap): PlayerMap | null {
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
  return out;
}

// Build the list of player-visible maps from a campaign `data` blob (or a
// pre-read maps array). Maps with no player-visible layer are dropped.
export function projectPlayerMaps(
  source: Record<string, unknown> | CampaignMap[] | null | undefined,
): PlayerMap[] {
  const maps = Array.isArray(source) ? source : readMaps(source);
  const out: PlayerMap[] = [];
  for (const map of maps) {
    const projected = projectMap(map);
    if (projected) out.push(projected);
  }
  return out;
}
