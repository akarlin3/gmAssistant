'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { SHORTCUTS, CONTEXT_LABEL, type ShortcutContext } from '@/lib/keyboardShortcuts';

export default function KeyboardShortcuts({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const grouped = SHORTCUTS.reduce<Record<ShortcutContext, typeof SHORTCUTS>>((acc, s) => {
    (acc[s.context] ||= []).push(s);
    return acc;
  }, {} as Record<ShortcutContext, typeof SHORTCUTS>);
  const contexts = Object.keys(grouped) as ShortcutContext[];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-lg border border-rule bg-parchment shadow-page"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-rule px-4 py-3">
          <h2 className="font-display text-lg tracking-wide text-ink">Keyboard Shortcuts</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-mute hover:text-crimson"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </div>
        <div className="max-h-[60vh] space-y-4 overflow-y-auto px-4 py-3">
          {contexts.map((ctx) => (
            <div key={ctx}>
              <div className="mb-1.5 font-display text-[10px] uppercase tracking-wider text-brass-deep">
                {CONTEXT_LABEL[ctx]}
              </div>
              <div className="space-y-1">
                {grouped[ctx].map((s) => (
                  <div key={`${ctx}-${s.keys}`} className="flex items-center justify-between gap-3">
                    <kbd className="min-w-20 rounded border border-rule bg-parchment-soft px-2 py-0.5 text-center font-display text-xs text-ink-soft">
                      {s.keys}
                    </kbd>
                    <span className="flex-1 font-serif text-sm text-ink-soft">{s.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-rule bg-parchment-soft px-4 py-2 text-center font-display text-[10px] uppercase tracking-wider text-ink-mute">
          esc to close
        </div>
      </div>
    </div>
  );
}
