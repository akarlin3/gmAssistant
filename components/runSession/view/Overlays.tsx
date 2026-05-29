'use client';

import { Check, Clock } from 'lucide-react';
import MonsterStatBlock from '../../MonsterStatBlock';
import type { HomebrewMonster } from '../../MonstersTab';

type Props = {
  toast: string | null;
  longSessionPrompt: boolean;
  sessionDurationHours: number;
  statBlockMonster: HomebrewMonster | null;
  onDismissLongSession: () => void;
  onEndSession: () => void;
  onCloseStatBlock: () => void;
};

export function Overlays({
  toast,
  longSessionPrompt,
  sessionDurationHours,
  statBlockMonster,
  onDismissLongSession,
  onEndSession,
  onCloseStatBlock,
}: Props) {
  return (
    <>
      {statBlockMonster && (
        <MonsterStatBlock monster={statBlockMonster} onClose={onCloseStatBlock} />
      )}

      {longSessionPrompt && (
        <div className="animate-in fade-in fixed left-1/2 top-16 z-50 -translate-x-1/2 duration-300">
          <div className="flex w-[90vw] max-w-sm items-start gap-3 rounded border-2 border-brass-deep/60 bg-parchment-soft px-4 py-3 shadow-lg">
            <Clock size={16} className="mt-0.5 flex-shrink-0 text-brass-deep" />
            <div className="flex-1">
              <div className="mb-1 font-display text-xs uppercase tracking-wider text-brass-deep">Long Session</div>
              <p className="mb-2 font-serif text-sm text-ink-soft">
                {sessionDurationHours > 12
                  ? "You've been in Run Session mode for over 12 hours! You definitely forgot to end the session."
                  : "You've been in Run Session mode for over 4 hours. Did you forget to end the previous session?"}
              </p>
              <div className="flex justify-end gap-2">
                <button onClick={onDismissLongSession} className="rounded px-2 py-1 text-xs text-ink-mute hover:bg-parchment-deep">Dismiss</button>
                <button onClick={() => { onDismissLongSession(); onEndSession(); }} className="rounded border border-crimson/30 px-2 py-1 font-display text-xs uppercase tracking-wider text-crimson hover:bg-crimson/10">End Session</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="animate-in slide-in-from-bottom-2 fade-in fixed bottom-20 left-1/2 z-50 -translate-x-1/2 duration-200">
          <div className="flex items-center gap-2 rounded bg-ink px-4 py-2 font-serif text-sm text-parchment shadow-lg">
            <Check size={14} className="text-emerald-400" />
            {toast}
          </div>
        </div>
      )}
    </>
  );
}
