'use client';

// Compact "Add to campaign" affordance shared by the live result panel and
// each log row. Renders a per-item checklist (single-item generators show a
// single row), a destination picker constrained to the kinds allowed by the
// generator, and an "Add to campaign" button.

import { useEffect, useMemo, useState } from 'react';
import { Plus, Check, FolderPlus } from 'lucide-react';
import type { LogKind } from '@/lib/generators/log';
import {
  allowedDestsFor,
  defaultDestFor,
  itemsFor,
  type CampaignDestKey,
  type SelectableItem,
} from '@/lib/generators/addToCampaign';
import { DEST_LABEL } from '@/lib/generators/addToCampaign';

export type AddToCampaignPickerProps = {
  kind: LogKind;
  payload: unknown;
  // Called with the chosen destination and the user-ticked items. The caller
  // does the actual buildPatch + setVal — we only collect the user's intent.
  onAdd: (dest: CampaignDestKey, items: SelectableItem[]) => void;
  // Optional: pre-tick all items by default. Default = true.
  autoSelectAll?: boolean;
  // Destinations that are listed but not selectable. Used by plot-segue to
  // surface the "Session Log" option while a Run Session is not open.
  disabledDests?: readonly CampaignDestKey[];
};

const DISABLED_TITLE: Partial<Record<CampaignDestKey, string>> = {
  'session-log': 'Start a Run Session to enable this',
};

export default function AddToCampaignPicker({
  kind,
  payload,
  onAdd,
  autoSelectAll = true,
  disabledDests,
}: AddToCampaignPickerProps) {
  const allowed = allowedDestsFor(kind);
  const items = useMemo(() => itemsFor(kind, payload), [kind, payload]);
  const isDisabled = (d: CampaignDestKey) => disabledDests?.includes(d) ?? false;

  // Default destination, falling back away from any disabled one.
  const initialDest = useMemo(() => {
    const fallback = defaultDestFor(kind);
    if (fallback && !isDisabled(fallback)) return fallback;
    const first = allowed.find((d) => !isDisabled(d));
    return first ?? fallback;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, allowed, disabledDests]);
  const [dest, setDest] = useState<CampaignDestKey | null>(initialDest);
  const [selected, setSelected] = useState<Set<string>>(() =>
    autoSelectAll ? new Set(items.map((i) => i.id)) : new Set(),
  );
  const [justAdded, setJustAdded] = useState<{ count: number; dest: CampaignDestKey } | null>(null);

  // If the underlying items list changes (e.g. result re-rolled in place),
  // re-seed the selection so the user doesn't have to re-tick everything.
  useEffect(() => {
    setSelected(autoSelectAll ? new Set(items.map((i) => i.id)) : new Set());
    setJustAdded(null);
  }, [items, autoSelectAll]);

  if (allowed.length === 0 || items.length === 0) return null;

  const toggle = (id: string) => {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setJustAdded(null);
  };

  const selectAll = () => setSelected(new Set(items.map((i) => i.id)));
  const selectNone = () => setSelected(new Set());

  const handleAdd = () => {
    if (!dest) return;
    const picked = items.filter((i) => selected.has(i.id));
    if (picked.length === 0) return;
    onAdd(dest, picked);
    setJustAdded({ count: picked.length, dest });
  };

  const isMulti = items.length > 1;
  const allTicked = selected.size === items.length;

  return (
    <div className="space-y-2 rounded border border-brass-deep/40 bg-brass/5 p-2.5">
      <div className="flex items-center gap-1.5">
        <FolderPlus size={12} className="text-brass-deep" />
        <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
          Add to campaign
        </span>
        {isMulti && (
          <>
            <span className="ml-1 text-[10px] italic text-ink-mute">
              {selected.size}/{items.length} selected
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={allTicked ? selectNone : selectAll}
                className="font-display text-[10px] uppercase tracking-wider text-brass-deep hover:text-crimson"
              >
                {allTicked ? 'None' : 'All'}
              </button>
            </div>
          </>
        )}
      </div>

      {isMulti && (
        <ul className="max-h-44 space-y-0.5 overflow-auto pr-1">
          {items.map((item) => (
            <li key={item.id}>
              <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 font-serif text-xs text-ink hover:bg-parchment-soft/60">
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={() => toggle(item.id)}
                  className="mt-0.5 accent-crimson"
                />
                <span className="flex-1 leading-snug">{item.label}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <label className="font-display text-[10px] uppercase tracking-wider text-ink-mute">To</label>
        <select
          value={dest ?? ''}
          onChange={(e) => {
            setDest(e.target.value as CampaignDestKey);
            setJustAdded(null);
          }}
          className="rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-xs text-ink focus:border-crimson focus:outline-none"
        >
          {allowed.map((d) => (
            <option key={d} value={d} disabled={isDisabled(d)} title={isDisabled(d) ? DISABLED_TITLE[d] : undefined}>
              {DEST_LABEL[d]}{isDisabled(d) ? ' — start a session first' : ''}
            </option>
          ))}
        </select>
        <button
          onClick={handleAdd}
          disabled={!dest || isDisabled(dest) || selected.size === 0}
          className="flex items-center gap-1.5 rounded border border-brass-deep/60 bg-brass/10 px-2.5 py-1 font-display text-[11px] uppercase tracking-wider text-brass-deep transition-colors hover:border-brass hover:bg-brass hover:text-parchment disabled:cursor-not-allowed disabled:opacity-40"
          title={
            !dest
              ? 'Choose a destination'
              : isDisabled(dest)
                ? DISABLED_TITLE[dest] ?? 'Destination unavailable'
                : selected.size === 0
                  ? 'Select at least one item'
                  : `Add ${selected.size} to ${DEST_LABEL[dest]}`
          }
        >
          <Plus size={11} /> Add{isMulti && selected.size > 0 ? ` ${selected.size}` : ''}
        </button>
        {justAdded && (
          <span className="flex items-center gap-1 font-serif text-[10px] italic text-brass-deep">
            <Check size={11} /> Added {justAdded.count} to {DEST_LABEL[justAdded.dest]}
          </span>
        )}
      </div>
    </div>
  );
}
