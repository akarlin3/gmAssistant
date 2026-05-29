// Tiny presentational primitives shared by several prep sub-components
// (the run-session inline view and the lookup view). Extracted verbatim from
// CampaignEditor.tsx.
import React from 'react';

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="font-serif text-xs italic text-ink-mute">{children}</p>;
}

export function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">{label} · </span>
      {children}
    </div>
  );
}
