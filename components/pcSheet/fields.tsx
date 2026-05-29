'use client';

import React from 'react';
import { X, Plus } from 'lucide-react';
import { inputCls } from './primitives';

export function TextInput({
  value, onChange, placeholder, name,
}: { value: string; onChange: (v: string) => void; placeholder?: string; name?: string }) {
  return (
    <input
      type="text"
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={inputCls}
    />
  );
}

export function NumInput({
  value, onChange, name, min, max, className,
}: { value: number; onChange: (v: number) => void; name?: string; min?: number; max?: number; className?: string }) {
  return (
    <input
      type="number"
      name={name}
      min={min}
      max={max}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => {
        const n = parseInt(e.target.value, 10);
        onChange(Number.isFinite(n) ? n : 0);
      }}
      className={className ?? `${inputCls} text-center`}
    />
  );
}

export function Bubbles({
  label, color, count, onSet,
}: { label: string; color: 'emerald' | 'crimson'; count: number; onSet: (n: 0 | 1 | 2 | 3) => void }) {
  const filledCls = color === 'emerald' ? 'border-emerald-700 bg-emerald-600' : 'border-crimson bg-crimson';
  return (
    <div className="flex items-center gap-1">
      <span className={`font-display text-xs ${color === 'emerald' ? 'text-emerald-700' : 'text-crimson'}`}>{label}</span>
      {[1, 2, 3].map((n) => (
        <button
          key={n}
          onClick={() => onSet((count >= n ? n - 1 : n) as 0 | 1 | 2 | 3)}
          aria-label={`${label} ${n}`}
          className={`size-4 rounded-full border ${count >= n ? filledCls : 'border-ink-mute'}`}
        />
      ))}
    </div>
  );
}

export function ListEditor({
  values, onChange, placeholder,
}: { values: string[]; onChange: (next: string[]) => void; placeholder: string }) {
  return (
    <div className="space-y-1">
      {values.map((v, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            value={v}
            onChange={(e) => onChange(values.map((x, xi) => (xi === i ? e.target.value : x)))}
            className={`${inputCls} flex-1`}
          />
          <button onClick={() => onChange(values.filter((_, xi) => xi !== i))} className="text-ink-mute hover:text-crimson"><X size={12} /></button>
        </div>
      ))}
      <button onClick={() => onChange([...values, ''])} className="flex items-center gap-1 font-display text-[10px] uppercase tracking-wider text-brass-deep hover:text-crimson">
        <Plus size={10} /> {placeholder}
      </button>
    </div>
  );
}
