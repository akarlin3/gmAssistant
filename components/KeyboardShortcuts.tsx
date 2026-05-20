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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
    >
      <div
        className="w-full max-w-md bg-parchment border border-rule rounded-lg shadow-page overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-rule">
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
        <div className="px-4 py-3 max-h-[60vh] overflow-y-auto space-y-4">
          {contexts.map((ctx) => (
            <div key={ctx}>
              <div className="text-[10px] font-display uppercase tracking-wider text-brass-deep mb-1.5">
                {CONTEXT_LABEL[ctx]}
              </div>
              <div className="space-y-1">
                {grouped[ctx].map((s) => (
                  <div key={`${ctx}-${s.keys}`} className="flex items-center justify-between gap-3">
                    <kbd className="font-display text-xs px-2 py-0.5 rounded border border-rule bg-parchment-soft text-ink-soft min-w-[5rem] text-center">
                      {s.keys}
                    </kbd>
                    <span className="flex-1 text-sm font-serif text-ink-soft">{s.description}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-rule bg-parchment-soft text-[10px] font-display uppercase tracking-wider text-ink-mute text-center">
          esc to close
        </div>
      </div>
    </div>
  );
}
