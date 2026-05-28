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
        className="text-[10px] px-1.5 py-0.5 rounded-sm border font-display uppercase tracking-wider border-moss/50 bg-moss/10 text-moss inline-flex items-center gap-1"
        title="Done collaboratively with the players at the table"
      >
        <Users size={9} /> With Players
      </span>
    );
  }
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded-sm border font-display uppercase tracking-wider border-wine/50 bg-wine/10 text-wine inline-flex items-center gap-1"
      title="DM-only homework — done without the players"
    >
      <User size={9} /> DM Solo
    </span>
  );
};

export const Phase = ({ n, title, sub, methods, audience, children, icon: Icon }: any) => (
  <div className="border border-rule rounded-lg overflow-hidden bg-parchment-soft shadow-page">
    <div className="w-full flex items-center gap-2.5 sm:gap-4 p-3 sm:p-4 text-left border-b border-rule bg-parchment-deep/20">
      <div className="font-display text-3xl sm:text-4xl text-crimson w-8 sm:w-12 leading-none flex-shrink-0">{n}</div>
      {Icon && <Icon size={20} className="text-brass-deep flex-shrink-0 hidden sm:block" />}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-display text-base sm:text-lg tracking-wide text-ink">{title}</span>
          {audience && <AudienceBadge audience={audience} />}
          <span className="flex flex-wrap gap-1">{methods?.map((m: any) => <Tag key={m} m={m} />)}</span>
        </div>
        <div className="text-xs sm:text-sm text-ink-soft italic font-serif mt-0.5">{sub}</div>
      </div>
    </div>
    <div className="p-3 pt-3 space-y-4 bg-parchment/40">{children}</div>
  </div>
);
