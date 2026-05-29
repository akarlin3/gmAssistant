'use client';

import { Plus, Wand2, Sparkles } from 'lucide-react';

export function EmptyState({ onStart, onPrep }: { onStart: () => void; onPrep: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <Sparkles size={28} className="text-wine" />
      <h3 className="font-display text-base">Campaign Assistant</h3>
      <p className="max-w-md text-sm text-ink-soft">
        A persistent agent that reads your whole campaign — NPCs, factions, secrets, sessions — and
        proposes content you approve before it&apos;s saved. Plan sessions, surface forgotten
        threads, and answer &quot;what happens next?&quot;
      </p>
      <div className="flex gap-2">
        <button
          onClick={onStart}
          className="flex items-center gap-1.5 rounded-md bg-wine px-3 py-2 font-display text-sm uppercase tracking-wider text-parchment hover:bg-wine/90"
        >
          <Plus size={14} /> New Conversation
        </button>
        <button
          onClick={onPrep}
          className="flex items-center gap-1.5 rounded-md border border-parchment-deep px-3 py-2 font-display text-sm uppercase tracking-wider text-brass-deep hover:bg-parchment-deep/40"
        >
          <Wand2 size={14} /> Prep My Next Session
        </button>
      </div>
    </div>
  );
}
