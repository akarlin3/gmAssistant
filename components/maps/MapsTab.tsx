'use client';

// Maps layer — campaign editor tab. Lists maps, creates them (upload or blank
// pointcrawl, AI generation on encounter maps), and edits a selected map on a
// pan/zoom canvas: markers tied to wiki entities, GM-only / player-visible
// layers, and pointcrawl nodes + travel-time edges that advance the World Clock.
//
// Map images live in Firebase Storage (client-side upload — the Admin SDK is
// unavailable here). Map data lives on the campaign blob at data.maps and is
// persisted by the editor's existing autosave; player-visible layers are pushed
// to Player Mode by the editor's auto-publish.

import { useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  ArrowLeft, MousePointer2, MapPin, Dot, Spline, Sparkles,
} from 'lucide-react';
import { LockedInline } from '@/components/LockedFeature';
import {
  newId, readMaps,
  type CampaignMap, type MapLayer, type MapMarker, type PointcrawlEdge, type PointcrawlNode,
} from '@/lib/maps/types';
import { deleteMapImage } from '@/lib/maps/storage';
import { shortestPath, travelToNode } from '@/lib/maps/travel';

import { type Tool, entityName } from './mapsTab/helpers';
import { Modal, ModalActions, ToolButton } from './mapsTab/ui';
import { MapList } from './mapsTab/MapList';
import { MarkerEditor, NodeEditor, LayerPanel } from './mapsTab/editors';
import { EdgeEditModal, GenerateMapModal, buildEdge } from './mapsTab/modals';

const MapCanvas = dynamic(() => import('./MapCanvas'), { ssr: false });

type Props = {
  data: Record<string, any>;
  onMapsChange: (maps: CampaignMap[]) => void;
  onDataChange: (updater: (prev: Record<string, any>) => Record<string, any>) => void;
  isPro: boolean;
};

export default function MapsTab({ data, onMapsChange, onDataChange, isPro }: Props) {
  const maps = useMemo(() => readMaps(data), [data]);
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null);
  const selectedMap = maps.find((m) => m.id === selectedMapId) ?? null;

  if (!selectedMap) {
    return (
      <MapList
        maps={maps}
        onOpen={setSelectedMapId}
        onCreate={(m) => {
          onMapsChange([...maps, m]);
          setSelectedMapId(m.id);
        }}
        onDelete={(m) => {
          if (m.imageStoragePath) void deleteMapImage(m.imageStoragePath);
          onMapsChange(maps.filter((x) => x.id !== m.id));
        }}
      />
    );
  }

  return (
    <MapEditor
      key={selectedMap.id}
      map={selectedMap}
      data={data}
      isPro={isPro}
      onBack={() => setSelectedMapId(null)}
      onChange={(next) => onMapsChange(maps.map((m) => (m.id === next.id ? next : m)))}
      onDataChange={onDataChange}
    />
  );
}

// ─── Single-map editor ──────────────────────────────────────────────────────

function MapEditor({
  map, data, isPro, onBack, onChange, onDataChange,
}: {
  map: CampaignMap;
  data: Record<string, any>;
  isPro: boolean;
  onBack: () => void;
  onChange: (next: CampaignMap) => void;
  onDataChange: (updater: (prev: Record<string, any>) => Record<string, any>) => void;
}) {
  const [tool, setTool] = useState<Tool>('select');
  const [activeLayerId, setActiveLayerId] = useState<string>(map.layers[0]?.id ?? '');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingMarkerId, setEditingMarkerId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [pendingEdge, setPendingEdge] = useState<{ from: string; to: string } | null>(null);
  const [travelFrom, setTravelFrom] = useState<string | null>(null);
  const [travelTo, setTravelTo] = useState<string | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const isPointcrawl = map.type === 'pointcrawl';
  const isEncounter = map.type === 'encounter';
  const visibleLayerIds = useMemo(
    () => new Set(map.layers.filter((l) => l.visible).map((l) => l.id)),
    [map.layers],
  );
  const activeLayer = map.layers.find((l) => l.id === activeLayerId) ?? map.layers[0];

  // Display copy: resolve marker/node/edge labels for the canvas.
  const displayMap: CampaignMap = useMemo(() => {
    const markers = map.markers.map((m) => ({
      ...m,
      label: m.label?.trim() ? m.label : entityName(data, m.entityType, m.entityId),
    }));
    const pc = map.pointcrawl
      ? {
          nodes: map.pointcrawl.nodes.map((n) => ({
            ...n,
            label: n.label?.trim() ? n.label : entityName(data, 'locations', n.locationId),
          })),
          edges: map.pointcrawl.edges.map((e) => ({
            ...e,
            label: e.label?.trim()
              ? e.label
              : typeof e.travelTimeDays === 'number'
                ? `${e.travelTimeDays}d`
                : '',
          })),
        }
      : undefined;
    return { ...map, markers, pointcrawl: pc };
  }, [map, data]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  }

  // ── Marker ops ──
  function createMarker(pos: { x: number; y: number }) {
    if (!activeLayer) return;
    const marker: MapMarker = {
      id: newId('mk'),
      x: pos.x,
      y: pos.y,
      layerId: activeLayer.id,
      label: '',
      icon: 'pin',
    };
    onChange({ ...map, markers: [...map.markers, marker] });
    setSelectedId(marker.id);
    setEditingMarkerId(marker.id);
    setTool('select');
  }
  function updateMarker(id: string, patch: Partial<MapMarker>) {
    onChange({ ...map, markers: map.markers.map((m) => (m.id === id ? { ...m, ...patch } : m)) });
  }
  function deleteMarker(id: string) {
    onChange({ ...map, markers: map.markers.filter((m) => m.id !== id) });
    if (editingMarkerId === id) setEditingMarkerId(null);
    if (selectedId === id) setSelectedId(null);
  }

  // ── Node ops ──
  function createNode(pos: { x: number; y: number }) {
    if (!map.pointcrawl || !activeLayer) return;
    const node: PointcrawlNode = { id: newId('nd'), x: pos.x, y: pos.y, label: '', layerId: activeLayer.id };
    onChange({ ...map, pointcrawl: { ...map.pointcrawl, nodes: [...map.pointcrawl.nodes, node] } });
    setSelectedId(node.id);
    setEditingNodeId(node.id);
    setTool('select');
  }
  function updateNode(id: string, patch: Partial<PointcrawlNode>) {
    if (!map.pointcrawl) return;
    onChange({ ...map, pointcrawl: { ...map.pointcrawl, nodes: map.pointcrawl.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) } });
  }
  function deleteNode(id: string) {
    if (!map.pointcrawl) return;
    onChange({
      ...map,
      pointcrawl: {
        nodes: map.pointcrawl.nodes.filter((n) => n.id !== id),
        edges: map.pointcrawl.edges.filter((e) => e.fromNodeId !== id && e.toNodeId !== id),
      },
    });
    if (editingNodeId === id) setEditingNodeId(null);
    if (selectedId === id) setSelectedId(null);
  }

  // ── Edge ops ──
  function saveEdge(edge: PointcrawlEdge) {
    if (!map.pointcrawl) return;
    onChange({ ...map, pointcrawl: { ...map.pointcrawl, edges: [...map.pointcrawl.edges, edge] } });
    setPendingEdge(null);
  }
  function deleteEdge(id: string) {
    if (!map.pointcrawl) return;
    onChange({ ...map, pointcrawl: { ...map.pointcrawl, edges: map.pointcrawl.edges.filter((e) => e.id !== id) } });
  }

  // ── Layer ops ──
  function updateLayers(next: MapLayer[]) {
    onChange({ ...map, layers: next });
  }

  // ── Canvas event handlers ──
  function onNodeClick(nodeId: string, shiftKey: boolean) {
    if (shiftKey) { deleteNode(nodeId); return; }
    if (travelFrom) {
      if (nodeId === travelFrom) return;
      setTravelTo(nodeId);
      return;
    }
    setSelectedId(nodeId);
    setEditingNodeId(nodeId);
    setEditingMarkerId(null);
  }
  function onMarkerClick(markerId: string, shiftKey: boolean) {
    if (shiftKey) { deleteMarker(markerId); return; }
    setSelectedId(markerId);
    setEditingMarkerId(markerId);
    setEditingNodeId(null);
  }

  function confirmTravel() {
    if (!travelFrom || !travelTo) return;
    const path = map.pointcrawl ? shortestPath(map.pointcrawl, travelFrom, travelTo) : null;
    try {
      onDataChange((prev) => {
        const result = travelToNode({ data: prev, mapId: map.id, fromNodeId: travelFrom, toNodeId: travelTo });
        return result.data;
      });
      const days = path?.totalDays ?? 0;
      showToast(`Travelled — ${days} day${days === 1 ? '' : 's'} elapsed. The world advanced; see Living World for the briefing.`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Travel failed');
    }
    setTravelFrom(null);
    setTravelTo(null);
  }

  const editingMarker = map.markers.find((m) => m.id === editingMarkerId) ?? null;
  const editingNode = map.pointcrawl?.nodes.find((n) => n.id === editingNodeId) ?? null;
  const travelPath =
    travelFrom && travelTo && map.pointcrawl ? shortestPath(map.pointcrawl, travelFrom, travelTo) : null;

  return (
    <div className="flex h-[calc(100vh-220px)] min-h-[480px] flex-col">
      {/* Header / toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-rule pb-2">
        <button type="button" onClick={onBack} className="flex items-center gap-1 rounded border border-rule px-2 py-1 font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep">
          <ArrowLeft size={13} /> Maps
        </button>
        <input
          value={map.name}
          onChange={(e) => onChange({ ...map, name: e.target.value })}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 font-display text-base uppercase tracking-wider text-ink hover:border-rule focus:border-rule"
        />
        <div className="flex items-center gap-1">
          <ToolButton active={tool === 'select'} onClick={() => { setTool('select'); setTravelFrom(null); }} title="Select / pan / drag"><MousePointer2 size={15} /></ToolButton>
          <ToolButton active={tool === 'addMarker'} onClick={() => setTool('addMarker')} title="Add marker"><MapPin size={15} /></ToolButton>
          {isPointcrawl && <ToolButton active={tool === 'addNode'} onClick={() => setTool('addNode')} title="Add node"><Dot size={20} /></ToolButton>}
          {isPointcrawl && <ToolButton active={tool === 'addEdge'} onClick={() => setTool('addEdge')} title="Add edge — click two nodes"><Spline size={15} /></ToolButton>}
          {isEncounter && (
            isPro ? (
              <ToolButton active={false} onClick={() => setShowGenerate(true)} title="Generate map (Pro)"><Sparkles size={15} /></ToolButton>
            ) : (
              <LockedInline label="Generate Map" />
            )
          )}
        </div>
      </div>

      {/* Helper banner per tool */}
      {tool !== 'select' && (
        <p className="mt-1 font-serif text-xs italic text-brass-deep">
          {tool === 'addMarker' && 'Click the map to place a marker on the active layer.'}
          {tool === 'addNode' && 'Click the map to drop a pointcrawl node.'}
          {tool === 'addEdge' && 'Click two nodes to connect them.'}
        </p>
      )}
      {travelFrom && (
        <p className="mt-1 font-serif text-xs italic text-crimson">Select a destination node to travel to.</p>
      )}

      {/* Canvas + side panel */}
      <div className="mt-2 flex min-h-0 flex-1 gap-2">
        <div className="relative min-w-0 flex-1 overflow-hidden rounded border border-rule">
          {map.imageUrl && <span data-map-image className="hidden" />}
          <MapCanvas
            map={displayMap}
            selectedTool={tool}
            selectedId={selectedId}
            visibleLayerIds={visibleLayerIds}
            onMarkerCreate={createMarker}
            onMarkerClick={onMarkerClick}
            onMarkerDrag={(id, pos) => updateMarker(id, pos)}
            onNodeCreate={createNode}
            onNodeClick={onNodeClick}
            onNodeDrag={(id, pos) => updateNode(id, pos)}
            onEdgeCreate={(from, to) => setPendingEdge({ from, to })}
          />
          {toast && (
            <div className="absolute inset-x-2 bottom-2 rounded bg-ink/85 px-3 py-2 text-center font-serif text-xs text-parchment">
              {toast}
            </div>
          )}
        </div>

        <div className="w-60 shrink-0 space-y-3 overflow-y-auto">
          {editingMarker && (
            <MarkerEditor
              key={editingMarker.id}
              marker={editingMarker}
              layers={map.layers}
              data={data}
              onChange={(patch) => updateMarker(editingMarker.id, patch)}
              onDelete={() => deleteMarker(editingMarker.id)}
              onClose={() => setEditingMarkerId(null)}
            />
          )}
          {editingNode && (
            <NodeEditor
              key={editingNode.id}
              node={editingNode}
              data={data}
              edges={map.pointcrawl?.edges ?? []}
              onChange={(patch) => updateNode(editingNode.id, patch)}
              onDelete={() => deleteNode(editingNode.id)}
              onDeleteEdge={deleteEdge}
              onTravel={() => { setTravelFrom(editingNode.id); setEditingNodeId(null); setSelectedId(null); }}
              onClose={() => setEditingNodeId(null)}
            />
          )}
          <LayerPanel
            layers={map.layers}
            activeLayerId={activeLayerId}
            onSetActive={setActiveLayerId}
            onChange={updateLayers}
          />
        </div>
      </div>

      {pendingEdge && (
        <EdgeEditModal
          onClose={() => setPendingEdge(null)}
          onSave={(label, days, hazardous) =>
            saveEdge(buildEdge(
              pendingEdge.from,
              pendingEdge.to,
              activeLayer?.id ?? map.layers[0].id,
              label,
              days,
              hazardous,
            ))
          }
        />
      )}

      {travelTo && (
        <Modal title="Confirm Travel" onClose={() => { setTravelTo(null); setTravelFrom(null); }}>
          {travelPath ? (
            <p className="font-serif text-sm text-ink-soft">
              This route takes <strong className="text-ink">{travelPath.totalDays} day{travelPath.totalDays === 1 ? '' : 's'}</strong>.
              The World Clock will advance and a briefing will be recorded.
            </p>
          ) : (
            <p className="font-serif text-sm italic text-crimson">No path connects these nodes.</p>
          )}
          <ModalActions>
            <button type="button" onClick={() => { setTravelTo(null); setTravelFrom(null); }} className="rounded border border-brass px-3 py-1.5 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-brass/10">Cancel</button>
            <button type="button" disabled={!travelPath} onClick={confirmTravel} className="rounded bg-crimson px-3 py-1.5 font-display text-xs uppercase tracking-wider text-parchment hover:bg-wine disabled:opacity-50">Confirm Travel</button>
          </ModalActions>
        </Modal>
      )}

      {showGenerate && (
        <GenerateMapModal
          onClose={() => setShowGenerate(false)}
          onGenerated={(u) => {
            if (map.imageStoragePath && map.imageStoragePath !== u.path) void deleteMapImage(map.imageStoragePath);
            onChange({ ...map, imageUrl: u.url, imageStoragePath: u.path, width: u.width, height: u.height });
            setShowGenerate(false);
            showToast('Map generated.');
          }}
          mapId={map.id}
        />
      )}
    </div>
  );
}
