'use client';

import { Eye, EyeOff, User, ChevronUp, ChevronDown, Plus, Trash2, Footprints } from 'lucide-react';
import {
  MARKER_ICONS, makeDefaultLayer,
  type MapLayer, type MapMarker, type MapEntityType, type MarkerIcon, type PointcrawlEdge, type PointcrawlNode,
} from '@/lib/maps/types';
import { ENTITY_LABEL, entityName, entityList } from './helpers';
import { Panel, LabeledInput, LayerSelect, EntityLink, IconToggle } from './ui';

export function MarkerEditor({
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

export function NodeEditor({
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

export function LayerPanel({
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
