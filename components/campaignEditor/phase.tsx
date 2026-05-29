// Phase header chrome extracted verbatim from CampaignEditor.tsx. AudienceBadge
// surfaces whether a phase is run collaboratively or as DM homework; Phase wraps
// each prep phase section. Both are purely presentational.
'use client';

import React from 'react';
import { User, Users } from 'lucide-react';
import { Tag } from './prepPrimitives';

// "DM Solo" vs "With Players" — surfaces whether a phase is run at the table
// collaboratively (Session −1, Session 0) or is DM homework (givens,
// per-session prep, faction-clock updates, mid-campaign audits, ending).
// Mirrors the audience grouping in ModeNav so the signal repeats inside each
// phase header. Avoids the word "Solo" alone, which `PrepTargetsModal` and
// `SoloNote` already use to mean "solo play mode" (one-player campaign).
const AudienceBadge = ({ audience }: { audience: 'solo' | 'together' }) => {
  if (audience === 'together') {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-sm border border-moss/50 bg-moss/10 px-1.5 py-0.5 font-display text-[10px] uppercase tracking-wider text-moss"
        title="Done collaboratively with the players at the table"
      >
        <Users size={9} /> With Players
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-sm border border-wine/50 bg-wine/10 px-1.5 py-0.5 font-display text-[10px] uppercase tracking-wider text-wine"
      title="DM-only homework — done without the players"
    >
      <User size={9} /> DM Solo
    </span>
  );
};

export const Phase = ({ n, title, sub, methods, audience, children, icon: Icon }: any) => (
  <div className="overflow-hidden rounded-lg border border-rule bg-parchment-soft shadow-page">
    <div className="flex w-full items-center gap-2.5 border-b border-rule bg-parchment-deep/20 p-3 text-left sm:gap-4 sm:p-4">
      <div className="w-8 flex-shrink-0 font-display text-3xl leading-none text-crimson sm:w-12 sm:text-4xl">{n}</div>
      {Icon && <Icon size={20} className="hidden flex-shrink-0 text-brass-deep sm:block" />}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display text-base tracking-wide text-ink sm:text-lg">{title}</span>
          {audience && <AudienceBadge audience={audience} />}
          <span className="flex flex-wrap gap-1">{methods?.map((m: any) => <Tag key={m} m={m} />)}</span>
        </div>
        <div className="mt-0.5 font-serif text-xs italic text-ink-soft sm:text-sm">{sub}</div>
      </div>
    </div>
    <div className="space-y-4 bg-parchment/40 p-3">{children}</div>
  </div>
);
