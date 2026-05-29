'use client';

import React from 'react';
import { ListField } from '../prepPrimitives';
import type { CampaignEditorModel } from '../useCampaignEditor';

export function PrepArcView({ ed }: { ed: CampaignEditorModel }) {
  const { get, setVal, trackEvent } = ed;

  return (
    <div className="space-y-3 text-sm">
      <div className="rounded border border-rule bg-parchment p-3 shadow-card">
        <h3 className="mb-2 font-display tracking-wide text-ink">Revealed Secrets</h3>
        <div className="space-y-1">
          {(get('secrets', []) as string[]).map((s: string, i: number) => (
            <label key={i} className="flex cursor-pointer items-start gap-2 font-serif text-sm">
              <input type="checkbox" checked={(get('revSec', {}) as Record<number, boolean>)[i] || false} onChange={(e) => {
                const wasRevealed = !!(get('revSec', {}) as Record<number, boolean>)[i];
                const r = { ...(get('revSec', {}) as Record<number, boolean>) }; r[i] = e.target.checked; setVal('revSec', r);
                if (!wasRevealed && e.target.checked) trackEvent('secret_revealed', s);
              }} className="mt-1 accent-crimson" />
              <span className={((get('revSec', {}) as Record<number, boolean>)[i]) ? 'text-ink-mute line-through' : 'text-ink-soft'}>{s}</span>
            </label>
          ))}
          {(get('secrets', []) as string[]).length === 0 && <p className="font-serif text-sm italic text-ink-mute">Add secrets in Phase 3 step 4.</p>}
        </div>
      </div>
      <div className="rounded border border-rule bg-parchment p-3 shadow-card">
        <h3 className="mb-2 font-display tracking-wide text-ink">Goal Progress</h3>
        <div className="space-y-2">
          {(get('pcGoals', []) as any[]).map((g: any, i: number) => (
            <div key={i} className="rounded border border-rule bg-parchment-soft p-2.5 font-serif text-sm">
              <p className="text-ink-soft">{g.text}</p>
              <div className="mt-1.5 flex gap-1">
                {['Active', 'Progressed', 'Completed', 'Failed'].map(s => (
                  <button key={s} onClick={() => {
                    const from = g.status || 'Active';
                    if (from === s) return;
                    const next = [...(get('pcGoals', []) as any[])];
                    next[i] = { ...g, status: s };
                    setVal('pcGoals', next);
                    trackEvent('goal_status', `${g.text || `Goal ${i + 1}`}: ${from} → ${s}`, from, s);
                  }} className={`rounded-sm border px-2 py-0.5 font-display text-[10px] uppercase tracking-wider ${g.status === s ? 'border-crimson bg-crimson text-parchment' : 'border-rule text-ink-mute'}`}>{s}</button>
                ))}
              </div>
            </div>
          ))}
          {(get('pcGoals', []) as any[]).length === 0 && <p className="font-serif text-sm italic text-ink-mute">Add goals in Phase 2.</p>}
        </div>
      </div>
    </div>
  );
}

export function PrepEndingView({ ed }: { ed: CampaignEditorModel }) {
  const { get, setVal } = ed;

  return (
    <div className="space-y-3 text-sm">
      <div className="rounded border border-rule bg-parchment p-3 shadow-card">
        <h3 className="mb-2 font-display tracking-wide text-ink">Dropped Threads</h3>
        <ListField items={get('dropped', [])} onChange={(v) => setVal('dropped', v)} placeholder="A thread to follow up" />
      </div>
    </div>
  );
}
