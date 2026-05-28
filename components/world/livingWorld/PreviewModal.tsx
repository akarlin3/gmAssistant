import React from 'react';
import { X } from 'lucide-react';
import { formatChange } from '@/lib/world/format';
import type { PreviewState } from './types';

export function PreviewModal({
  preview,
  currentDay,
  onChangeDay,
  onApply,
  onClose,
}: {
  preview: NonNullable<PreviewState>;
  currentDay: number;
  onChangeDay: (toDay: number) => void;
  onApply: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-rule bg-parchment-soft p-5 shadow-page"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-base uppercase tracking-wider text-ink">
            {preview.label}
          </h3>
          <button onClick={onClose} className="text-ink-mute hover:text-crimson">
            <X size={16} />
          </button>
        </div>

        <label className="mb-3 flex items-center gap-2 text-sm">
          <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
            Advance To Day
          </span>
          <input
            name="targetDay"
            type="number"
            min={currentDay + 1}
            value={preview.toDay}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v > currentDay) onChangeDay(v);
            }}
            className="w-24 rounded border border-rule bg-parchment px-2 py-1 text-ink"
          />
          <span className="text-xs text-ink-mute">(from Day {currentDay})</span>
        </label>

        <p className="mb-2 font-serif text-xs italic text-ink-mute">
          Dry run — nothing is saved until you apply. {preview.changes.length} planned change
          {preview.changes.length === 1 ? '' : 's'}.
        </p>

        {preview.changes.length === 0 ? (
          <p className="rounded border border-dashed border-rule p-3 text-sm italic text-ink-mute">
            No rules or agendas fire over this span.
          </p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {preview.changes.map((c, i) => (
              <li key={`${c.entityId}-${i}`} data-preview-change className="flex gap-2">
                <span className="text-brass">·</span>
                <span className="text-ink">
                  <strong>{c.entityName}</strong> — {formatChange(c)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded border border-rule px-3 py-1.5 font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep"
          >
            Cancel
          </button>
          <button
            onClick={onApply}
            className="rounded bg-crimson px-4 py-1.5 font-display text-xs uppercase tracking-wider text-parchment hover:bg-wine"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
