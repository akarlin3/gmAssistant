'use client';

import { useEffect, useState } from 'react';
import { X, Sparkles, User, Users, Info } from 'lucide-react';

type Props = {
  open: boolean;
  currentMode: 'solo' | 'duet' | 'standard';
  onClose: () => void;
  onSave: (mode: 'solo' | 'duet' | 'standard') => void;
};

export default function ModeSwitcherModal({ open, currentMode, onClose, onSave }: Props) {
  const [selectedMode, setSelectedMode] = useState<'solo' | 'duet' | 'standard'>(currentMode);

  useEffect(() => {
    if (open) {
      setSelectedMode(currentMode);
    }
  }, [open, currentMode]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const handleSave = () => {
    onSave(selectedMode);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-[2px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Campaign play mode settings"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg border border-rule bg-parchment shadow-page"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-rule px-4 py-3">
          <div>
            <h2 className="font-display text-lg tracking-wide text-ink">Campaign Play Mode</h2>
            <p className="mt-0.5 font-serif text-[11px] italic text-ink-mute">
              Configure target scales and active tools for this session.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="text-ink-mute transition-colors hover:text-crimson"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="flex items-start gap-2.5 rounded border border-brass-deep/20 bg-brass/5 p-3 text-xs leading-relaxed text-brass-deep">
            <Info size={16} className="mt-0.5 flex-shrink-0" />
            <p>
              Changing the campaign's play mode adjusts the visual layout, prep target scales, and active tools (such as Player Mode or the Wells Oracle). <strong>No data will be deleted or altered</strong> in your database.
            </p>
          </div>

          <div className="space-y-3">
            {/* Solo Card */}
            <button
              type="button"
              onClick={() => setSelectedMode('solo')}
              className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-all ${
                selectedMode === 'solo'
                  ? 'border-pink-500 bg-pink-950/5 text-ink'
                  : 'border-rule bg-transparent text-ink-soft hover:border-pink-500/50'
              }`}
            >
              <div
                className={`rounded-md p-2 ${
                  selectedMode === 'solo' ? 'bg-pink-500/15 text-pink-500' : 'bg-parchment-deep text-ink-soft'
                }`}
              >
                <Sparkles size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-display text-sm font-semibold tracking-wide">Solo Mode</span>
                  {selectedMode === 'solo' && (
                    <span className="py-0.2 rounded border border-pink-500/30 bg-pink-500/15 px-1.5 font-display text-[10px] font-semibold uppercase tracking-wider text-pink-500">
                      Selected
                    </span>
                  )}
                </div>
                <p className="mt-0.5 font-serif text-[11px] leading-relaxed text-ink-mute">
                  Zero players (GM-less). Driven entirely by oracle dice rolls and local scene generation. Pink visual accents.
                </p>
              </div>
            </button>

            {/* Duet Card */}
            <button
              type="button"
              onClick={() => setSelectedMode('duet')}
              className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-all ${
                selectedMode === 'duet'
                  ? 'border-teal-500 bg-teal-950/5 text-ink'
                  : 'border-rule bg-transparent text-ink-soft hover:border-teal-500/50'
              }`}
            >
              <div
                className={`rounded-md p-2 ${
                  selectedMode === 'duet' ? 'bg-teal-500/15 text-teal-500' : 'bg-parchment-deep text-ink-soft'
                }`}
              >
                <User size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-display text-sm font-semibold tracking-wide">Duet Mode</span>
                  {selectedMode === 'duet' && (
                    <span className="py-0.2 rounded border border-teal-500/30 bg-teal-500/15 px-1.5 font-display text-[10px] font-semibold uppercase tracking-wider text-teal-500">
                      Selected
                    </span>
                  )}
                </div>
                <p className="mt-0.5 font-serif text-[11px] leading-relaxed text-ink-mute">
                  1 GM + exactly 1 player. Streamlined prep requirements and real-time player character write-backs. Teal visual accents.
                </p>
              </div>
            </button>

            {/* Standard Card */}
            <button
              type="button"
              onClick={() => setSelectedMode('standard')}
              className={`flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-all ${
                selectedMode === 'standard'
                  ? 'border-amber-500 bg-amber-950/5 text-ink'
                  : 'border-rule bg-transparent text-ink-soft hover:border-amber-500/50'
              }`}
            >
              <div
                className={`rounded-md p-2 ${
                  selectedMode === 'standard' ? 'bg-amber-500/15 text-amber-500' : 'bg-parchment-deep text-ink-soft'
                }`}
              >
                <Users size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <span className="font-display text-sm font-semibold tracking-wide">Standard Mode</span>
                  {selectedMode === 'standard' && (
                    <span className="py-0.2 rounded border border-amber-500/30 bg-amber-500/15 px-1.5 font-display text-[10px] font-semibold uppercase tracking-wider text-amber-500">
                      Selected
                    </span>
                  )}
                </div>
                <p className="mt-0.5 font-serif text-[11px] leading-relaxed text-ink-mute">
                  1 GM + multiple players. Traditional group campaign play, comprehensive checklists, and multi-PC management. Amber visual accents.
                </p>
              </div>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-rule bg-parchment-deep px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-rule px-3 py-1.5 font-display text-xs uppercase tracking-wider text-ink transition-colors hover:bg-parchment"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="rounded bg-brass-deep px-4 py-1.5 font-display text-xs uppercase tracking-wider text-parchment shadow-sm transition-colors hover:bg-crimson"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
