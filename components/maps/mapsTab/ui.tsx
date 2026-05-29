'use client';

import { Link2, X } from 'lucide-react';
import { type MapEntityType, type MapLayer, MAP_ENTITY_TYPES } from '@/lib/maps/types';
import { ENTITY_LABEL, entityList } from './helpers';

export function Panel({ title, onClose, children }: { title: string; onClose?: () => void; children: React.ReactNode }) {
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

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-[2px]" onClick={onClose}>
      <div className="w-full max-w-md space-y-3 rounded border border-rule bg-parchment p-5 shadow-page" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-lg tracking-wide text-ink">{title}</h3>
        {children}
      </div>
    </div>
  );
}

export function ModalActions({ children }: { children: React.ReactNode }) {
  return <div className="flex justify-end gap-2 pt-1">{children}</div>;
}

export function ToolButton({ active, onClick, title, children }: { active: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} title={title} className={`rounded border p-1.5 ${active ? 'border-crimson bg-crimson/15 text-crimson' : 'border-rule text-ink-soft hover:bg-parchment-deep'}`}>
      {children}
    </button>
  );
}

export function IconToggle({ on, accent, onClick, title, children }: { on: boolean; accent?: boolean; onClick: () => void; title: string; children: React.ReactNode }) {
  const activeClass = accent ? 'bg-brass text-parchment border-brass' : 'bg-crimson/15 text-crimson border-crimson/50';
  return (
    <button type="button" onClick={onClick} title={title} className={`rounded border px-1.5 py-0.5 ${on ? activeClass : 'border-rule text-ink-mute hover:bg-parchment-deep'}`}>
      {children}
    </button>
  );
}

export function LabeledInput({ label, value, onChange, placeholder, name }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; name?: string }) {
  return (
    <label className="block space-y-1">
      <span className="font-display text-[11px] uppercase tracking-wider text-ink-soft">{label}</span>
      <input name={name} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-sm text-ink" />
    </label>
  );
}

export function LayerSelect({ layers, value, onChange }: { layers: MapLayer[]; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block space-y-1">
      <span className="font-display text-[11px] uppercase tracking-wider text-ink-soft">Layer</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-sm text-ink">
        {[...layers].sort((a, b) => a.order - b.order).map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
    </label>
  );
}

export function EntityLink({
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
