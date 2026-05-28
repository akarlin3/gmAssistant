// Tiny presentational primitives shared by several prep sub-components
// (the run-session inline view and the lookup view). Extracted verbatim from
// CampaignEditor.tsx.
import React from 'react';

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-ink-mute italic font-serif">{children}</p>;
}

export function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-brass-deep font-display uppercase tracking-wider text-[10px]">{label} · </span>
      {children}
    </div>
  );
}
