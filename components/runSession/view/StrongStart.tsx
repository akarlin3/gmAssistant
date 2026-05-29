'use client';

import { Zap, Eye, Check } from 'lucide-react';
import { makeEvent, type ChangeEvent } from '@/lib/sessionEvents';
import type { PlayerLogEntry } from '@/lib/playerMode/sessionLog';
import type { Get, SetVal } from '../types';

type Props = {
  strongStart: string;
  strongStartDone: boolean;
  playerLog: PlayerLogEntry[];
  get: Get;
  setVal: SetVal;
  pushEvent: (e: ChangeEvent) => void;
  onShare: (text: string) => void;
};

export function StrongStart({
  strongStart,
  strongStartDone,
  playerLog,
  get,
  setVal,
  pushEvent,
  onShare,
}: Props) {
  if (!strongStart) return null;

  const isShared = playerLog.some(e => e.text.includes(strongStart));

  return (
    <section className="rounded border-2 border-crimson/50 bg-crimson/5 p-3 shadow-card sm:p-4">
      <div className="mb-1.5 flex items-start gap-2">
        <Zap size={16} className="mt-0.5 flex-shrink-0 text-crimson" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-sm uppercase tracking-wide text-crimson sm:text-base">
              Strong Start
            </h2>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (isShared) return;
                  onShare(`Story Intro: ${strongStart}`);
                }}
                disabled={isShared}
                className={`flex items-center gap-1 rounded-sm border px-2 py-0.5 font-display text-[10px] uppercase tracking-wider transition-colors ${
                  isShared
                    ? 'cursor-default border-moss bg-moss/10 text-moss'
                    : 'border-brass-deep/60 text-brass-deep hover:bg-brass/10'
                }`}
                title={isShared ? 'Shared with Players' : 'Share with Players'}
              >
                <Eye size={10} />
                {isShared ? 'Shared' : 'Share'}
              </button>
              <button
                onClick={() => {
                  const next = !strongStartDone;
                  setVal('__sessionStrongStartDelivered', next);
                  if (next) {
                    pushEvent(makeEvent('other', 'Strong start delivered'));
                  } else {
                    const currentEvents = (get('__sessionChangeEvents', []) as ChangeEvent[]) || [];
                    setVal('__sessionChangeEvents', currentEvents.filter(e => !(e.kind === 'other' && e.summary === 'Strong start delivered')));
                  }
                }}
                className={`flex items-center gap-1 rounded-sm border px-2 py-0.5 font-display text-[10px] uppercase tracking-wider ${
                  strongStartDone
                    ? 'border-brass-deep bg-brass text-parchment'
                    : 'border-brass-deep/60 text-brass-deep hover:bg-brass/10'
                }`}
              >
                {strongStartDone && <Check size={10} strokeWidth={3} />}
                {strongStartDone ? 'Delivered' : 'Mark Delivered'}
              </button>
            </div>
          </div>
          <p className={`mt-1 whitespace-pre-wrap font-serif text-sm text-ink-soft sm:text-base ${strongStartDone ? 'italic opacity-60' : ''}`}>
            {strongStart}
          </p>
        </div>
      </div>
    </section>
  );
}
