'use client';

import React, { useState, useMemo } from 'react';
import {
  Printer,
  CheckCircle2,
  Clock,
  Layers,
  ExternalLink,
  Plus,
  Trash2,
  Skull,
  Shield,
  Mountain,
  Box,
} from 'lucide-react';
import type { PrintStatus } from '@/lib/campaign-types';
import {
  buildK1CPrintQueue,
  cyclePrintStatus,
  PRINT_STATUS_LABELS,
  PRINT_STATUS_STYLES,
  updatePrintQueueItemInState,
  type PrintItemCategory,
  type PrintQueueItem,
} from '@/lib/printQueue';

interface K1CPrintQueuePanelProps {
  state: Record<string, any>;
  setState: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  compact?: boolean;
}

export default function K1CPrintQueuePanel({
  state,
  setState,
  compact = false,
}: K1CPrintQueuePanelProps) {
  const [categoryFilter, setCategoryFilter] = useState<'all' | PrintItemCategory>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | PrintStatus>('all');
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<PrintItemCategory>('miniature');
  const [newStl, setNewStl] = useState('');
  const [newQty, setNewQty] = useState(1);

  const items = useMemo(() => buildK1CPrintQueue(state), [state]);

  const counts = useMemo(() => {
    const queued = items.filter((i) => i.print_status === 'queued').length;
    const sliced = items.filter((i) => i.print_status === 'sliced').length;
    const printed = items.filter((i) => i.print_status === 'printed').length;
    return { total: items.length, queued, sliced, printed };
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((it) => {
      if (categoryFilter !== 'all' && it.category !== categoryFilter) return false;
      if (statusFilter !== 'all' && it.print_status !== statusFilter) return false;
      return true;
    });
  }, [items, categoryFilter, statusFilter]);

  const handleCycleStatus = (item: PrintQueueItem) => {
    const nextStatus = cyclePrintStatus(item.print_status);
    setState((prev) => updatePrintQueueItemInState(prev, item, { print_status: nextStatus }));
  };

  const handleSetStatus = (item: PrintQueueItem, status: PrintStatus) => {
    setState((prev) => updatePrintQueueItemInState(prev, item, { print_status: status }));
  };

  const handleStlChange = (item: PrintQueueItem, stl_link: string) => {
    setState((prev) => updatePrintQueueItemInState(prev, item, { stl_link }));
  };

  const handleQtyChange = (item: PrintQueueItem, quantity: number) => {
    setState((prev) => updatePrintQueueItemInState(prev, item, { quantity: Math.max(1, quantity) }));
  };

  const handleAddCustomJob = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setState((prev) => {
      const existing = Array.isArray(prev.k1cPrintQueue) ? prev.k1cPrintQueue : [];
      return {
        ...prev,
        k1cPrintQueue: [
          ...existing,
          {
            id: `k1c-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            name: newName.trim(),
            category: newCategory,
            stl_link: newStl.trim(),
            print_status: 'queued' as PrintStatus,
            quantity: Math.max(1, newQty),
          },
        ],
      };
    });
    setNewName('');
    setNewStl('');
    setNewQty(1);
  };

  const handleRemoveCustomJob = (sourceIndex: number) => {
    setState((prev) => {
      const existing = Array.isArray(prev.k1cPrintQueue) ? prev.k1cPrintQueue : [];
      return {
        ...prev,
        k1cPrintQueue: existing.filter((_: any, i: number) => i !== sourceIndex),
      };
    });
  };

  const categoryBadge = (cat: PrintItemCategory) => {
    if (cat === 'boss') {
      return (
        <span className="inline-flex items-center gap-1 rounded border border-crimson/40 bg-crimson/10 px-1.5 py-0.5 font-display text-[9px] uppercase tracking-wider text-crimson">
          <Skull size={10} /> Boss Token
        </span>
      );
    }
    if (cat === 'terrain') {
      return (
        <span className="inline-flex items-center gap-1 rounded border border-brass/50 bg-brass/10 px-1.5 py-0.5 font-display text-[9px] uppercase tracking-wider text-brass-deep">
          <Mountain size={10} /> Terrain
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 rounded border border-wine/40 bg-wine/10 px-1.5 py-0.5 font-display text-[9px] uppercase tracking-wider text-wine">
        <Shield size={10} /> Miniature
      </span>
    );
  };

  return (
    <section className="space-y-3 rounded border border-rule bg-parchment p-3.5 shadow-card">
      {/* Header + K1C Telemetry Summary */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-2.5">
        <div className="flex items-center gap-2">
          <Printer size={16} className="text-crimson" />
          <div>
            <h3 className="font-display text-sm uppercase tracking-wider text-ink">
              Creality K1C Hardware Bridge · Print Queue
            </h3>
            <p className="font-serif text-xs italic text-ink-mute">
              Miniatures, Boss Tokens &amp; Terrain Pieces for upcoming encounters
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 font-display text-[10px] uppercase tracking-wider">
          <span className="rounded border border-amber-600/40 bg-amber-500/10 px-2 py-0.5 text-amber-800">
            Queued: {counts.queued}
          </span>
          <span className="rounded border border-sky-600/40 bg-sky-500/10 px-2 py-0.5 text-sky-800">
            Sliced: {counts.sliced}
          </span>
          <span className="rounded border border-moss/50 bg-moss/15 px-2 py-0.5 text-moss">
            Printed: {counts.printed}
          </span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {([
            ['all', `All (${items.length})`],
            ['miniature', 'Miniatures'],
            ['boss', 'Boss Tokens'],
            ['terrain', 'Terrain'],
          ] as const).map(([cat, label]) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategoryFilter(cat)}
              className={`rounded border px-2 py-0.5 font-display text-[10px] uppercase tracking-wider transition-colors ${
                categoryFilter === cat
                  ? 'border-crimson bg-crimson text-parchment'
                  : 'border-rule bg-parchment-soft text-ink-soft hover:bg-parchment-deep'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1">
          {(['all', 'queued', 'sliced', 'printed'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded border px-2 py-0.5 font-display text-[10px] uppercase tracking-wider transition-colors ${
                statusFilter === st
                  ? 'border-brass-deep bg-brass text-parchment'
                  : 'border-rule bg-parchment-soft text-ink-mute hover:text-ink'
              }`}
            >
              {st === 'all' ? 'Any Status' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Queue List */}
      {filtered.length === 0 ? (
        <div className="rounded border border-dashed border-rule bg-parchment-soft p-4 text-center font-serif text-xs italic text-ink-mute">
          No print jobs match the current filter. Add monsters, NPCs, or locations to your prep or queue a custom .stl below.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-2 rounded border border-rule bg-parchment-soft p-2.5 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  {categoryBadge(item.category)}
                  <span className="font-display text-xs font-semibold tracking-wide text-ink">
                    {item.name}
                  </span>
                  {item.subtitle && (
                    <span className="font-serif text-[11px] italic text-ink-mute">
                      · {item.subtitle}
                    </span>
                  )}
                </div>

                {/* STL Link input + Open link */}
                <div className="flex items-center gap-1.5">
                  <Box size={12} className="flex-shrink-0 text-brass-deep" />
                  <input
                    type="text"
                    value={item.stl_link}
                    onChange={(e) => handleStlChange(item, e.target.value)}
                    placeholder="Paste .stl URL or local Creality Print path (e.g. https://.../model.stl)"
                    className="min-w-0 flex-1 rounded border border-rule bg-parchment px-2 py-0.5 font-serif text-xs text-ink placeholder:italic placeholder:text-ink-faint focus:border-crimson focus:outline-none"
                  />
                  {item.stl_link.trim() && (
                    <a
                      href={item.stl_link.trim()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded border border-brass-deep/60 bg-brass/10 px-2 py-0.5 font-display text-[9px] uppercase tracking-wider text-brass-deep hover:bg-brass hover:text-parchment"
                      title="Open .stl file or repository link"
                    >
                      .STL <ExternalLink size={10} />
                    </a>
                  )}
                </div>
              </div>

              {/* Quantity + 1-Click Status Toggle */}
              <div className="flex flex-wrap items-center gap-1.5 sm:flex-shrink-0">
                <label className="flex items-center gap-1 font-display text-[10px] uppercase tracking-wider text-ink-mute">
                  Qty
                  <input
                    type="number"
                    min={1}
                    max={99}
                    value={item.quantity}
                    onChange={(e) => handleQtyChange(item, Number(e.target.value) || 1)}
                    className="w-11 rounded border border-rule bg-parchment px-1.5 py-0.5 text-center font-serif text-xs text-ink"
                  />
                </label>

                {/* 1-Click cycle button */}
                <button
                  type="button"
                  onClick={() => handleCycleStatus(item)}
                  className={`inline-flex items-center gap-1 rounded border px-2.5 py-1 font-display text-[10px] uppercase tracking-wider transition-colors ${PRINT_STATUS_STYLES[item.print_status]}`}
                  title="Click to cycle status: Queued → Sliced → Printed"
                >
                  {item.print_status === 'queued' && <Clock size={11} />}
                  {item.print_status === 'sliced' && <Layers size={11} />}
                  {item.print_status === 'printed' && <CheckCircle2 size={11} />}
                  {PRINT_STATUS_LABELS[item.print_status]}
                </button>

                {/* Direct status pills for 1-click jump */}
                {!compact && (
                  <div className="flex rounded border border-rule bg-parchment p-0.5">
                    {(['queued', 'sliced', 'printed'] as PrintStatus[]).map((st) => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => handleSetStatus(item, st)}
                        className={`rounded-sm px-1.5 py-0.5 font-display text-[9px] uppercase tracking-wider ${
                          item.print_status === st
                            ? 'bg-crimson text-parchment'
                            : 'text-ink-mute hover:text-ink'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                )}

                {item.sourceType === 'customQueue' && (
                  <button
                    type="button"
                    onClick={() => handleRemoveCustomJob(item.sourceIndex)}
                    className="p-1 text-ink-mute hover:text-crimson"
                    title="Remove custom print job"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Standalone K1C Print Job */}
      <form
        onSubmit={handleAddCustomJob}
        className="flex flex-wrap items-center gap-1.5 border-t border-rule pt-2.5"
      >
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add miniature, boss token, or scatter terrain…"
          className="min-w-44 flex-1 rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-xs text-ink placeholder:italic placeholder:text-ink-faint focus:border-crimson focus:outline-none"
        />
        <select
          value={newCategory}
          onChange={(e) => setNewCategory(e.target.value as PrintItemCategory)}
          className="rounded border border-rule bg-parchment-soft px-2 py-1 font-display text-[10px] uppercase tracking-wider text-ink"
        >
          <option value="miniature">Miniature</option>
          <option value="boss">Boss Token</option>
          <option value="terrain">Terrain Piece</option>
        </select>
        <input
          type="text"
          value={newStl}
          onChange={(e) => setNewStl(e.target.value)}
          placeholder=".stl link (optional)"
          className="min-w-36 flex-1 rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-xs text-ink placeholder:italic placeholder:text-ink-faint focus:border-crimson focus:outline-none"
        />
        <input
          type="number"
          min={1}
          max={99}
          value={newQty}
          onChange={(e) => setNewQty(Number(e.target.value) || 1)}
          className="w-14 rounded border border-rule bg-parchment-soft px-1.5 py-1 text-center font-serif text-xs text-ink"
          title="Quantity"
        />
        <button
          type="submit"
          className="inline-flex items-center gap-1 rounded border border-crimson bg-crimson px-2.5 py-1 font-display text-[10px] uppercase tracking-wider text-parchment hover:bg-wine"
        >
          <Plus size={11} /> Queue K1C Print
        </button>
      </form>
    </section>
  );
}
