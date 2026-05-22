'use client';

import { Plus, Trash2 } from 'lucide-react';

type Props = {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  rows?: number;
  addLabel?: string;
};

export default function StringListEditor({
  items, onChange, placeholder, rows = 1, addLabel = 'Add',
}: Props) {
  const update = (i: number, v: string) => {
    const next = [...items];
    next[i] = v;
    onChange(next);
  };
  const remove = (i: number) => onChange(items.filter((_, j) => j !== i));
  const add = () => onChange([...items, '']);

  return (
    <div className="space-y-1.5">
      {items.length === 0 && (
        <p className="font-serif text-xs italic text-ink-mute">Nothing yet.</p>
      )}
      {items.map((it, i) => (
        <div key={i} className="flex items-start gap-2">
          <textarea
            value={it}
            onChange={(e) => update(i, e.target.value)}
            placeholder={placeholder}
            rows={rows}
            className="flex-1 resize-y rounded border border-rule bg-parchment px-2 py-1 font-serif text-sm text-ink"
          />
          <button
            onClick={() => remove(i)}
            className="mt-0.5 p-1 text-ink-mute hover:text-crimson"
            title="Remove"
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
      <button
        onClick={add}
        className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:text-crimson"
      >
        <Plus size={12} /> {addLabel}
      </button>
    </div>
  );
}
