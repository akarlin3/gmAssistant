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

import { useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  ArrowLeft, MousePointer2, MapPin, Dot, Spline, Sparkles, Plus, Trash2,
  Eye, EyeOff, User, ChevronUp, ChevronDown, Link2, Footprints, X, Image as ImageIcon,
} from 'lucide-react';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { LockedInline } from '@/components/LockedFeature';
import {
  MAPS_CAP, MAP_ENTITY_TYPES, MARKER_ICONS, makeMap, makeDefaultLayer, newId, readMaps,
  type CampaignMap, type MapEntityType, type MapLayer, type MapMarker, type MapType,
  type MarkerIcon, type PointcrawlEdge, type PointcrawlNode,
} from '@/lib/maps/types';
import { uploadMapImage, uploadGeneratedImage, deleteMapImage, validateImageFile } from '@/lib/maps/storage';
import { shortestPath, travelToNode } from '@/lib/maps/travel';

const MapCanvas = dynamic(() => import('./MapCanvas'), { ssr: false });

type Tool = 'select' | 'addMarker' | 'addNode' | 'addEdge';

type Props = {
  data: Record<string, any>;
  onMapsChange: (maps: CampaignMap[]) => void;
  onDataChange: (updater: (prev: Record<string, any>) => Record<string, any>) => void;
  isPro: boolean;
};

const ENTITY_LABEL: Record<MapEntityType, string> = {
  npcs: 'NPC',
  locations: 'Location',
  factions: 'Faction',
  monsters: 'Monster',
  items: 'Item',
};

function uid(): string {
  return getFirebaseAuth().currentUser?.uid ?? '';
}

// Build [{id,name}] for an entity type from the campaign blob, tolerating the
// item array's string-or-object shape.
function entityList(data: Record<string, any>, type: MapEntityType): Array<{ id: string; name: string }> {
  const arr = Array.isArray(data?.[type]) ? data[type] : [];
  return arr
    .map((e: any, i: number) => {
      if (typeof e === 'string') return { id: `item_${i}`, name: e.split(' — ')[0] || e };
      if (e && typeof e === 'object') {
        const id = typeof e.id === 'string' ? e.id : `${type}_${i}`;
        const name = typeof e.name === 'string' ? e.name : '';
        return { id, name };
      }
      return null;
    })
    .filter((e: any): e is { id: string; name: string } => !!e && !!e.name);
}

function entityName(data: Record<string, any>, type: MapEntityType | undefined, id: string | undefined): string {
  if (!type || !id) return '';
  return entityList(data, type).find((e) => e.id === id)?.name ?? '';
}

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

// ─── Map list + creation ────────────────────────────────────────────────────

function MapList({
  maps, onOpen, onCreate, onDelete,
}: {
  maps: CampaignMap[];
  onOpen: (id: string) => void;
  onCreate: (m: CampaignMap) => void;
  onDelete: (m: CampaignMap) => void;
}) {
  const [showNew, setShowNew] = useState(false);
  const atCap = maps.length >= MAPS_CAP;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg uppercase tracking-wider text-ink">Maps</h2>
          <p className="font-serif text-sm italic text-ink-soft">
            Upload or generate maps, drop markers tied to your NPCs and locations, and share layers with players.
          </p>
        </div>
        <button
          type="button"
          disabled={atCap}
          onClick={() => setShowNew(true)}
          title={atCap ? `Map limit reached (${MAPS_CAP})` : 'Create a new map'}
          className="flex items-center gap-1.5 rounded bg-crimson px-3 py-1.5 font-display text-xs uppercase tracking-wider text-parchment hover:bg-wine disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={14} /> New Map
        </button>
      </div>

      {atCap && (
        <p className="rounded border border-brass/40 bg-brass/5 px-3 py-2 font-serif text-xs italic text-brass-deep">
          You&apos;ve reached the {MAPS_CAP}-map limit for this campaign. Delete one to add another.
        </p>
      )}

      {maps.length === 0 ? (
        <div className="rounded border border-dashed border-rule p-8 text-center font-serif text-sm italic text-ink-soft">
          No maps yet. Create your first map to start placing markers.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {maps.map((m) => (
            <div key={m.id} className="group relative overflow-hidden rounded border border-rule bg-parchment-deep">
              <button
                type="button"
                onClick={() => onOpen(m.id)}
                className="block w-full text-left"
              >
                <div className="flex aspect-video items-center justify-center bg-zinc-900">
                  {m.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.imageUrl} alt={m.name} className="size-full object-cover" />
                  ) : (
                    <ImageIcon size={28} className="text-zinc-600" />
                  )}
                </div>
                <div className="p-2">
                  <div className="truncate font-display text-xs uppercase tracking-wider text-ink">{m.name}</div>
                  <div className="font-serif text-[11px] capitalize italic text-ink-soft">
                    {m.type} · {m.markers.length} marker{m.markers.length === 1 ? '' : 's'}
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => onDelete(m)}
                title="Delete map"
                className="absolute right-1.5 top-1.5 rounded bg-ink/60 p-1 text-parchment opacity-0 transition-opacity hover:bg-crimson group-hover:opacity-100"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showNew && <NewMapModal onClose={() => setShowNew(false)} onCreate={(m) => { onCreate(m); setShowNew(false); }} />}
    </div>
  );
}

function NewMapModal({ onClose, onCreate }: { onClose: () => void; onCreate: (m: CampaignMap) => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<MapType>('region');
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const blankPointcrawl = type === 'pointcrawl' && !file;

  async function handleCreate() {
    setError(null);
    if (file) {
      const v = validateImageFile(file);
      if (v) { setError(v); return; }
    } else if (type !== 'pointcrawl') {
      setError('Upload an image, or choose Pointcrawl for a blank canvas.');
      return;
    }
    setBusy(true);
    try {
      const base = makeMap({ name, type });
      if (file) {
        const u = await uploadMapImage(uid(), base.id, file);
        base.imageUrl = u.url;
        base.imageStoragePath = u.path;
        base.width = u.width;
        base.height = u.height;
      }
      onCreate(base);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
      setBusy(false);
    }
  }

  return (
    <Modal title="New Map" onClose={onClose}>
      <label className="block space-y-1">
        <span className="font-display text-xs uppercase tracking-wider text-ink-soft">Name</span>
        <input
          name="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="The Wells Region"
          className="w-full rounded border border-rule bg-parchment px-2 py-1.5 font-serif text-sm text-ink"
        />
      </label>
      <label className="block space-y-1">
        <span className="font-display text-xs uppercase tracking-wider text-ink-soft">Type</span>
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as MapType)}
          className="w-full rounded border border-rule bg-parchment px-2 py-1.5 font-serif text-sm text-ink"
        >
          <option value="region">Region</option>
          <option value="encounter">Encounter</option>
          <option value="dungeon">Dungeon</option>
          <option value="pointcrawl">Pointcrawl</option>
        </select>
      </label>
      <div className="space-y-1">
        <span className="font-display text-xs uppercase tracking-wider text-ink-soft">
          Image {type === 'pointcrawl' && <span className="normal-case text-ink-mute">(optional — blank canvas if omitted)</span>}
        </span>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); }}
          className="block w-full font-serif text-xs text-ink-soft file:mr-2 file:rounded file:border-0 file:bg-brass/15 file:px-2 file:py-1 file:font-display file:text-xs file:uppercase file:tracking-wider file:text-brass-deep"
        />
        {file && <p className="font-serif text-[11px] italic text-ink-soft">{file.name}</p>}
        {blankPointcrawl && <p className="font-serif text-[11px] italic text-ink-mute">Will create a blank pointcrawl whiteboard.</p>}
      </div>
      {error && <p className="font-serif text-xs italic text-crimson">{error}</p>}
      <ModalActions>
        <button type="button" onClick={onClose} className="rounded border border-brass px-3 py-1.5 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-brass/10">Cancel</button>
        <button
          type="button"
          onClick={handleCreate}
          disabled={busy}
          className="rounded bg-crimson px-3 py-1.5 font-display text-xs uppercase tracking-wider text-parchment hover:bg-wine disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create'}
        </button>
      </ModalActions>
    </Modal>
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
            saveEdge({
              id: newId('eg'),
              fromNodeId: pendingEdge.from,
              toNodeId: pendingEdge.to,
              layerId: activeLayer?.id ?? map.layers[0].id,
              ...(label ? { label } : {}),
              ...(typeof days === 'number' ? { travelTimeDays: days } : {}),
              ...(hazardous ? { hazardous: true } : {}),
            })
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

// ─── Marker editor ──────────────────────────────────────────────────────────

function MarkerEditor({
  marker, layers, data, onChange, onDelete, onClose,
}: {
  marker: MapMarker;
  layers: MapLayer[];
  data: Record<string, any>;
  onChange: (patch: Partial<MapMarker>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const linkedName = entityName(data, marker.entityType, marker.entityId);
  return (
    <Panel title="Marker" onClose={onClose}>
      <LabeledInput label="Label" value={marker.label} placeholder={linkedName || 'Marker label'} onChange={(v) => onChange({ label: v })} />
      <div className="space-y-1">
        <span className="font-display text-[11px] uppercase tracking-wider text-ink-soft">Icon</span>
        <div className="flex flex-wrap gap-1">
          {MARKER_ICONS.map((ic) => (
            <button
              key={ic}
              type="button"
              onClick={() => onChange({ icon: ic as MarkerIcon })}
              className={`rounded border px-1.5 py-0.5 text-sm ${marker.icon === ic ? 'border-crimson bg-crimson/10' : 'border-rule hover:bg-parchment-deep'}`}
              title={ic}
            >
              {({ pin: '📍', star: '⭐', sword: '⚔️', eye: '👁️', skull: '💀', house: '🏠', cave: '🕳️', tree: '🌲' } as Record<string, string>)[ic]}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="font-display text-[11px] uppercase tracking-wider text-ink-soft">Color</span>
        <input type="color" value={marker.color ?? '#f472b6'} onChange={(e) => onChange({ color: e.target.value })} className="h-7 w-10 cursor-pointer rounded border border-rule bg-transparent" />
      </div>
      <LayerSelect layers={layers} value={marker.layerId} onChange={(v) => onChange({ layerId: v })} />
      <EntityLink data={data} entityType={marker.entityType} entityId={marker.entityId} onChange={(type, id) => onChange({ entityType: type, entityId: id })} />
      {linkedName && (
        <div className="rounded border border-brass/40 bg-brass/5 p-2">
          <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">{ENTITY_LABEL[marker.entityType!]} linked</div>
          <div className="font-serif text-sm text-ink">{linkedName}</div>
        </div>
      )}
      <div className="space-y-1">
        <span className="font-display text-[11px] uppercase tracking-wider text-ink-soft">Notes (GM only)</span>
        <textarea value={marker.notes ?? ''} onChange={(e) => onChange({ notes: e.target.value })} rows={2} className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-sm text-ink" />
      </div>
      <button type="button" onClick={onDelete} className="flex items-center gap-1 font-display text-[11px] uppercase tracking-wider text-crimson hover:text-wine">
        <Trash2 size={12} /> Delete marker
      </button>
    </Panel>
  );
}

// ─── Node editor ────────────────────────────────────────────────────────────

function NodeEditor({
  node, data, edges, onChange, onDelete, onDeleteEdge, onTravel, onClose,
}: {
  node: PointcrawlNode;
  data: Record<string, any>;
  edges: PointcrawlEdge[];
  onChange: (patch: Partial<PointcrawlNode>) => void;
  onDelete: () => void;
  onDeleteEdge: (id: string) => void;
  onTravel: () => void;
  onClose: () => void;
}) {
  const locName = entityName(data, 'locations', node.locationId);
  const connected = edges.filter((e) => e.fromNodeId === node.id || e.toNodeId === node.id);
  return (
    <Panel title="Node" onClose={onClose}>
      <LabeledInput label="Label" value={node.label} placeholder={locName || 'Node label'} onChange={(v) => onChange({ label: v })} />
      <div className="space-y-1">
        <span className="font-display text-[11px] uppercase tracking-wider text-ink-soft">Linked Location</span>
        <select
          value={node.locationId ?? ''}
          onChange={(e) => onChange({ locationId: e.target.value || undefined })}
          className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-sm text-ink"
        >
          <option value="">— none —</option>
          {entityList(data, 'locations').map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </div>
      <button type="button" onClick={onTravel} disabled={connected.length === 0} className="flex w-full items-center justify-center gap-1.5 rounded bg-crimson px-2 py-1.5 font-display text-xs uppercase tracking-wider text-parchment hover:bg-wine disabled:opacity-50">
        <Footprints size={13} /> Travel
      </button>
      {connected.length > 0 && (
        <div className="space-y-1">
          <span className="font-display text-[11px] uppercase tracking-wider text-ink-soft">Edges</span>
          {connected.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-1 rounded border border-rule px-1.5 py-1 font-serif text-[11px] text-ink-soft">
              <span className="truncate">{e.label || (typeof e.travelTimeDays === 'number' ? `${e.travelTimeDays}d` : 'edge')}{e.hazardous ? ' ⚠' : ''}</span>
              <button type="button" onClick={() => onDeleteEdge(e.id)} className="text-crimson hover:text-wine"><Trash2 size={11} /></button>
            </div>
          ))}
        </div>
      )}
      <button type="button" onClick={onDelete} className="flex items-center gap-1 font-display text-[11px] uppercase tracking-wider text-crimson hover:text-wine">
        <Trash2 size={12} /> Delete node
      </button>
    </Panel>
  );
}

// ─── Layer panel ────────────────────────────────────────────────────────────

function LayerPanel({
  layers, activeLayerId, onSetActive, onChange,
}: {
  layers: MapLayer[];
  activeLayerId: string;
  onSetActive: (id: string) => void;
  onChange: (next: MapLayer[]) => void;
}) {
  const sorted = [...layers].sort((a, b) => a.order - b.order);
  function patch(id: string, p: Partial<MapLayer>) {
    onChange(layers.map((l) => (l.id === id ? { ...l, ...p } : l)));
  }
  function move(id: string, dir: -1 | 1) {
    const idx = sorted.findIndex((l) => l.id === id);
    const swap = idx + dir;
    if (swap < 0 || swap >= sorted.length) return;
    const a = sorted[idx], b = sorted[swap];
    onChange(layers.map((l) => (l.id === a.id ? { ...l, order: b.order } : l.id === b.id ? { ...l, order: a.order } : l)));
  }
  function addLayer() {
    const maxOrder = layers.reduce((m, l) => Math.max(m, l.order), -1);
    const l = makeDefaultLayer(maxOrder + 1);
    l.name = `Layer ${layers.length + 1}`;
    l.color = ['#f472b6', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa'][layers.length % 5];
    onChange([...layers, l]);
  }
  function removeLayer(id: string) {
    if (layers.length <= 1) return;
    onChange(layers.filter((l) => l.id !== id));
  }

  return (
    <Panel title="Layers">
      <div className="space-y-1">
        {sorted.map((l, i) => (
          <div key={l.id} className={`rounded border px-1.5 py-1 ${l.id === activeLayerId ? 'border-crimson/60 bg-crimson/5' : 'border-rule'}`}>
            <div className="flex items-center gap-1">
              <span className="size-3 shrink-0 rounded-full" style={{ background: l.color }} />
              <input
                value={l.name}
                onChange={(e) => patch(l.id, { name: e.target.value })}
                onFocus={() => onSetActive(l.id)}
                className="min-w-0 flex-1 bg-transparent font-serif text-xs text-ink focus:outline-none"
              />
              <input type="color" value={l.color} onChange={(e) => patch(l.id, { color: e.target.value })} className="size-5 cursor-pointer rounded border-0 bg-transparent p-0" title="Layer color" />
            </div>
            <div className="mt-1 flex items-center gap-1">
              <IconToggle on={l.visible} onClick={() => patch(l.id, { visible: !l.visible })} title="GM visibility">
                {l.visible ? <Eye size={12} /> : <EyeOff size={12} />}
              </IconToggle>
              <IconToggle on={l.visibleToPlayers} accent onClick={() => patch(l.id, { visibleToPlayers: !l.visibleToPlayers })} title="Visible to players">
                <User size={12} />
              </IconToggle>
              <button type="button" onClick={() => onSetActive(l.id)} className={`ml-auto rounded px-1.5 py-0.5 font-display text-[9px] uppercase tracking-wider ${l.id === activeLayerId ? 'bg-crimson text-parchment' : 'text-ink-mute hover:bg-parchment-deep'}`}>Active</button>
              <button type="button" onClick={() => move(l.id, -1)} disabled={i === 0} className="text-ink-mute hover:text-ink disabled:opacity-30"><ChevronUp size={13} /></button>
              <button type="button" onClick={() => move(l.id, 1)} disabled={i === sorted.length - 1} className="text-ink-mute hover:text-ink disabled:opacity-30"><ChevronDown size={13} /></button>
              {layers.length > 1 && <button type="button" onClick={() => removeLayer(l.id)} className="text-crimson hover:text-wine"><Trash2 size={11} /></button>}
            </div>
          </div>
        ))}
      </div>
      <button type="button" onClick={addLayer} className="flex w-full items-center justify-center gap-1 rounded border border-dashed border-brass/50 py-1 font-display text-[11px] uppercase tracking-wider text-brass-deep hover:bg-brass/5">
        <Plus size={12} /> New Layer
      </button>
    </Panel>
  );
}

// ─── Edge edit modal ────────────────────────────────────────────────────────

function EdgeEditModal({ onClose, onSave }: { onClose: () => void; onSave: (label: string, days: number | undefined, hazardous: boolean) => void }) {
  const [label, setLabel] = useState('');
  const [days, setDays] = useState('');
  const [hazardous, setHazardous] = useState(false);
  return (
    <Modal title="Connect Nodes" onClose={onClose}>
      <LabeledInput name="edgeLabel" label="Label" value={label} placeholder="forest road" onChange={setLabel} />
      <label className="block space-y-1">
        <span className="font-display text-[11px] uppercase tracking-wider text-ink-soft">Travel time (days)</span>
        <input name="travelTimeDays" type="number" min="0" step="0.5" value={days} onChange={(e) => setDays(e.target.value)} className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-sm text-ink" />
      </label>
      <label className="flex items-center gap-2 font-serif text-sm text-ink-soft">
        <input type="checkbox" checked={hazardous} onChange={(e) => setHazardous(e.target.checked)} /> Hazardous route
      </label>
      <ModalActions>
        <button type="button" onClick={onClose} className="rounded border border-brass px-3 py-1.5 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-brass/10">Cancel</button>
        <button type="button" onClick={() => onSave(label.trim(), days === '' ? undefined : Math.max(0, Number(days)), hazardous)} className="rounded bg-crimson px-3 py-1.5 font-display text-xs uppercase tracking-wider text-parchment hover:bg-wine">Save Edge</button>
      </ModalActions>
    </Modal>
  );
}

// ─── AI generation modal ────────────────────────────────────────────────────

const STYLES = ['top-down', 'isometric', 'dungeon', 'forest', 'urban'] as const;

function GenerateMapModal({
  mapId, onClose, onGenerated,
}: {
  mapId: string;
  onClose: () => void;
  onGenerated: (u: { url: string; path: string; width: number; height: number }) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState<(typeof STYLES)[number]>('top-down');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setError(null);
    if (!prompt.trim()) { setError('Describe the map you want.'); return; }
    setBusy(true);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('Not signed in');
      const idToken = await user.getIdToken();
      const res = await fetch('/api/maps/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ prompt: prompt.trim(), style, mapId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'Generation failed');
      const uploaded = await uploadGeneratedImage(user.uid, mapId, json.b64);
      onGenerated(uploaded);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
      setBusy(false);
    }
  }

  return (
    <Modal title="Generate Map" onClose={busy ? () => {} : onClose}>
      <div className="space-y-1">
        <span className="font-display text-[11px] uppercase tracking-wider text-ink-soft">Prompt</span>
        <textarea name="prompt" value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} placeholder="stone bridge over chasm at dawn" className="w-full rounded border border-rule bg-parchment px-2 py-1.5 font-serif text-sm text-ink" />
      </div>
      <label className="block space-y-1">
        <span className="font-display text-[11px] uppercase tracking-wider text-ink-soft">Style</span>
        <select name="style" value={style} onChange={(e) => setStyle(e.target.value as any)} className="w-full rounded border border-rule bg-parchment px-2 py-1.5 font-serif text-sm capitalize text-ink">
          {STYLES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </label>
      <p className="font-serif text-[11px] italic text-ink-mute">Generating replaces this map&apos;s current image. Limited to 10 generations per month.</p>
      {error && <p className="font-serif text-xs italic text-crimson">{error}</p>}
      <ModalActions>
        <button type="button" disabled={busy} onClick={onClose} className="rounded border border-brass px-3 py-1.5 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-brass/10 disabled:opacity-50">Cancel</button>
        <button type="button" disabled={busy} onClick={generate} className="flex items-center gap-1.5 rounded bg-crimson px-3 py-1.5 font-display text-xs uppercase tracking-wider text-parchment hover:bg-wine disabled:opacity-50">
          <Sparkles size={13} /> {busy ? 'Generating…' : 'Generate'}
        </button>
      </ModalActions>
    </Modal>
  );
}

// ─── Shared bits ────────────────────────────────────────────────────────────

function EntityLink({
  data, entityType, entityId, onChange,
}: {
  data: Record<string, any>;
  entityType?: MapEntityType;
  entityId?: string;
  onChange: (type: MapEntityType | undefined, id: string | undefined) => void;
}) {
  const list = entityType ? entityList(data, entityType) : [];
  return (
    <div className="space-y-1">
      <span className="flex items-center gap-1 font-display text-[11px] uppercase tracking-wider text-ink-soft"><Link2 size={11} /> Link Entity</span>
      <div className="flex gap-1">
        <select
          name="entityType"
          value={entityType ?? ''}
          onChange={(e) => onChange((e.target.value || undefined) as MapEntityType | undefined, undefined)}
          className="w-1/2 rounded border border-rule bg-parchment p-1 font-serif text-xs text-ink"
        >
          <option value="">— type —</option>
          {MAP_ENTITY_TYPES.map((t) => <option key={t} value={t}>{ENTITY_LABEL[t]}</option>)}
        </select>
        <select
          name="entityId"
          value={entityId ?? ''}
          disabled={!entityType}
          onChange={(e) => onChange(entityType, e.target.value || undefined)}
          className="w-1/2 rounded border border-rule bg-parchment p-1 font-serif text-xs text-ink disabled:opacity-50"
        >
          <option value="">— entity —</option>
          {list.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
    </div>
  );
}

function LayerSelect({ layers, value, onChange }: { layers: MapLayer[]; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block space-y-1">
      <span className="font-display text-[11px] uppercase tracking-wider text-ink-soft">Layer</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-sm text-ink">
        {[...layers].sort((a, b) => a.order - b.order).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
    </label>
  );
}

function LabeledInput({ label, value, onChange, placeholder, name }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; name?: string }) {
  return (
    <label className="block space-y-1">
      <span className="font-display text-[11px] uppercase tracking-wider text-ink-soft">{label}</span>
      <input name={name} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-sm text-ink" />
    </label>
  );
}

function ToolButton({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={title} className={`rounded border p-1.5 ${active ? 'border-crimson bg-crimson/15 text-crimson' : 'border-rule text-ink-soft hover:bg-parchment-deep'}`}>
      {children}
    </button>
  );
}

function IconToggle({ on, accent, onClick, title, children }: { on: boolean; accent?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  const activeClass = accent ? 'bg-brass text-parchment border-brass' : 'bg-crimson/15 text-crimson border-crimson/50';
  return (
    <button type="button" onClick={onClick} title={title} className={`rounded border px-1.5 py-0.5 ${on ? activeClass : 'border-rule text-ink-mute hover:bg-parchment-deep'}`}>
      {children}
    </button>
  );
}

function Panel({ title, onClose, children }: { title: string; onClose?: () => void; children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded border border-rule bg-parchment p-2">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xs uppercase tracking-wider text-ink">{title}</h3>
        {onClose && <button type="button" onClick={onClose} className="text-ink-mute hover:text-ink"><X size={14} /></button>}
      </div>
      {children}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div className="w-full max-w-md space-y-3 rounded border border-rule bg-parchment p-5 shadow-page" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg tracking-wide text-ink">{title}</h3>
        {children}
      </div>
    </div>
  );
}

function ModalActions({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-end gap-2 pt-1">{children}</div>;
}
