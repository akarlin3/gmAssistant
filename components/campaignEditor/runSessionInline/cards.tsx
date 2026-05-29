'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export function PrepStat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded border border-rule bg-parchment-soft p-2 text-center">
      <div className="font-display text-xl tabular-nums text-ink">{value}</div>
      <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">{label}</div>
      {sub && <div className="text-[9px] italic text-ink-mute">{sub}</div>}
    </div>
  );
}

export function ActivePrepGroup({
  title, icon: Icon, count, children,
}: { title: string; icon: any; count?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="rounded border border-rule bg-parchment-soft shadow-card">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-parchment-deep/30"
      >
        <Icon size={14} className="flex-shrink-0 text-brass-deep" />
        <span className="flex-1 font-display text-sm tracking-wide text-ink">{title}</span>
        {typeof count === 'number' && <span className="font-serif text-[11px] text-ink-mute">{count}</span>}
        {open ? <ChevronDown size={14} className="text-ink-mute" /> : <ChevronRight size={14} className="text-ink-mute" />}
      </button>
      {open && <div className="space-y-1.5 border-t border-rule px-3 pb-3 pt-1">{children}</div>}
    </section>
  );
}

export function CompactCard({
  label, status, action,
}: {
  label: string;
  status?: 'used';
  action?: { label: string; onClick: () => void };
}) {
  const dim = status === 'used';
  return (
    <div className={`flex items-start gap-2 rounded border px-2 py-1.5 font-serif text-sm ${dim ? 'border-brass/60 bg-brass/10' : 'border-rule bg-parchment'}`}>
      <span className={`flex-1 ${dim ? 'text-ink-mute line-through' : 'text-ink-soft'}`}>{label}</span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="flex-shrink-0 rounded-sm border border-brass-deep/60 px-2 py-0.5 font-display text-[10px] uppercase tracking-wider text-brass-deep hover:bg-brass hover:text-parchment"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

export function ExpandableCard({
  label, tag, children,
}: { label: string; tag?: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const hasContent = !!children && (React.Children.count(children) > 0);
  return (
    <div className="rounded border border-rule bg-parchment font-serif text-sm">
      <button
        type="button"
        onClick={() => hasContent && setOpen(o => !o)}
        className="flex w-full items-center gap-2 px-2 py-1.5 text-left hover:bg-parchment-deep/30"
      >
        {hasContent && (open ? <ChevronDown size={12} className="text-ink-mute" /> : <ChevronRight size={12} className="text-ink-mute" />)}
        <span className="flex-1 truncate text-ink">{label}</span>
        {tag && <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">{tag}</span>}
      </button>
      {open && hasContent && (
        <div className="space-y-0.5 border-t border-rule px-3 pb-2 pt-1 text-[12px] text-ink-soft">{children}</div>
      )}
    </div>
  );
}
