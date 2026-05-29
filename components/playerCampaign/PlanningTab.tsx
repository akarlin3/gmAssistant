'use client';

// "Premise" tab: redacted premise & worldbuilding sections. Extracted verbatim
// from PlayerCampaignView.

import React from 'react';
import type { SlotProjection } from '@/lib/playerMode/types';

export default function PlanningTab({ planning }: { planning: SlotProjection['planning'] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {planning?.pitch && (
        <div className="col-span-full space-y-2 rounded border border-rule bg-parchment p-4 font-serif text-sm shadow-card">
          <div className="border-b border-rule pb-1 font-display text-xs uppercase tracking-wider text-brass-deep">Quick Pitch</div>
          <p className="whitespace-pre-wrap leading-relaxed text-ink-soft">{planning.pitch}</p>
        </div>
      )}
      {planning?.genre && (
        <div className="col-span-full space-y-2 rounded border border-rule bg-parchment p-4 font-serif text-sm shadow-card">
          <div className="border-b border-rule pb-1 font-display text-xs uppercase tracking-wider text-brass-deep">Genre Statement</div>
          <p className="whitespace-pre-wrap leading-relaxed text-ink-soft">{planning.genre}</p>
        </div>
      )}
      {planning?.gWorld && planning.gWorld.length > 0 && (
        <div className="space-y-2 rounded border border-rule bg-parchment p-4 font-serif text-sm shadow-card">
          <div className="border-b border-rule pb-1 font-display text-xs uppercase tracking-wider text-brass-deep">World Facts</div>
          <ul className="list-disc space-y-1 pl-4 text-ink-soft">
            {planning.gWorld.map((w, idx) => <li key={idx}>{w}</li>)}
          </ul>
        </div>
      )}
      {planning?.gFNL && planning.gFNL.length > 0 && (
        <div className="space-y-2 rounded border border-rule bg-parchment p-4 font-serif text-sm shadow-card">
          <div className="border-b border-rule pb-1 font-display text-xs uppercase tracking-wider text-brass-deep">Required Entities</div>
          <ul className="list-disc space-y-1 pl-4 text-ink-soft">
            {planning.gFNL.map((w, idx) => <li key={idx}>{w}</li>)}
          </ul>
        </div>
      )}
      {planning?.tone && planning.tone.length > 0 && (
        <div className="space-y-2 rounded border border-rule bg-parchment p-4 font-serif text-sm shadow-card">
          <div className="border-b border-rule pb-1 font-display text-xs uppercase tracking-wider text-brass-deep">Tone Keywords</div>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {planning.tone.map((w, idx) => (
              <span key={idx} className="rounded bg-brass/10 px-2 py-0.5 font-display text-xs uppercase tracking-wider text-brass-deep">{w}</span>
            ))}
          </div>
        </div>
      )}
      {planning?.lines && planning.lines.length > 0 && (
        <div className="space-y-2 rounded border border-rule bg-parchment p-4 font-serif text-sm shadow-card">
          <div className="border-b border-rule pb-1 font-display text-xs uppercase tracking-wider text-brass-deep">Content Lines (Hard Nos)</div>
          <ul className="list-disc space-y-1 pl-4 text-ink-soft">
            {planning.lines.map((w, idx) => <li key={idx}>{w}</li>)}
          </ul>
        </div>
      )}
      {planning?.facts && planning.facts.length > 0 && (
        <div className="space-y-2 rounded border border-rule bg-parchment p-4 font-serif text-sm shadow-card">
          <div className="border-b border-rule pb-1 font-display text-xs uppercase tracking-wider text-brass-deep">Setting Facts</div>
          <ul className="list-disc space-y-1 pl-4 text-ink-soft">
            {planning.facts.map((w, idx) => <li key={idx}>{w}</li>)}
          </ul>
        </div>
      )}
      {planning?.secrets && planning.secrets.length > 0 && (
        <div className="space-y-2 rounded border border-rule bg-parchment p-4 font-serif text-sm shadow-card">
          <div className="border-b border-rule pb-1 font-display text-xs uppercase tracking-wider text-brass-deep">Secrets & Clues</div>
          <ul className="list-disc space-y-1 pl-4 text-ink-soft">
            {planning.secrets.map((w, idx) => <li key={idx}>{w}</li>)}
          </ul>
        </div>
      )}
      {planning?.conflicts && planning.conflicts.length > 0 && (
        <div className="col-span-full space-y-2 rounded border border-rule bg-parchment p-4 font-serif text-sm shadow-card">
          <div className="border-b border-rule pb-1 font-display text-xs uppercase tracking-wider text-brass-deep">Active Conflicts</div>
          <ul className="list-disc space-y-1 pl-4 text-ink-soft">
            {planning.conflicts.map((w, idx) => <li key={idx}>{w}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}
