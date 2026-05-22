'use client';

import type { ReactNode } from 'react';

const METHOD = {
  shea: { label: 'Lazy DM', color: 'border-moss/40 bg-moss/5 text-moss' },
  ccd:  { label: 'CCD',     color: 'border-brass/40 bg-brass/5 text-brass-deep' },
  pr:   { label: 'Proactive', color: 'border-wine/40 bg-wine/5 text-wine' },
} as const;

type Props = {
  stepNumber: number;
  title: string;
  purpose: string;
  methodology: keyof typeof METHOD;
  contextFromLastSession?: ReactNode;
  children: ReactNode;
};

export default function StepShell({
  stepNumber, title, purpose, methodology, contextFromLastSession, children,
}: Props) {
  const m = METHOD[methodology];
  return (
    <section className="space-y-4">
      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <span className={`rounded-sm border px-1.5 py-0.5 font-display text-[10px] uppercase tracking-wider ${m.color}`}>
            {m.label}
          </span>
          <span className="font-display text-[11px] uppercase tracking-wider text-brass-deep">
            Step {stepNumber} of 8
          </span>
        </div>
        <h2 className="font-display text-2xl tracking-wide text-ink">{title}</h2>
        <p className="font-serif text-sm italic leading-relaxed text-ink-soft">{purpose}</p>
      </header>

      {contextFromLastSession && (
        <div className="space-y-1.5 rounded border border-brass-deep/40 bg-brass/5 p-3">
          <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
            From Last Session
          </div>
          <div className="font-serif text-sm text-ink-soft">
            {contextFromLastSession}
          </div>
        </div>
      )}

      <div className="space-y-3">{children}</div>
    </section>
  );
}
