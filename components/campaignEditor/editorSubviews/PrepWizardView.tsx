'use client';

import React from 'react';
import { ClipboardList } from 'lucide-react';
import type { PrepWizardRun } from '@/lib/prepWizard';
import type { CampaignEditorModel } from '../useCampaignEditor';

export function PrepWizardView({ ed }: { ed: CampaignEditorModel }) {
  const { get, setVal } = ed;

  const runs = (get('prepWizardRuns', []) as PrepWizardRun[]) || [];
  const sortedRuns = [...runs].sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  const launch = () => {
    setVal('__prepWizardOpen', true);
    setVal('__prepWizardStep', 1);
  };
  const sessionOpen = !!get('__activeSessionId', '');

  return (
    <div className="space-y-3">
      <div className="rounded border border-rule bg-parchment p-4 shadow-card">
        <h2 className="mb-1 font-display text-lg tracking-wide text-ink">Prep Wizard</h2>
        <p className="mb-3 font-serif text-sm text-ink-soft">
          An 8-step guided walkthrough of Lazy DM&apos;s per-session prep — Review, Strong
          Start, Scenes, Secrets, Locations, NPCs, Monsters, Magic Items.
        </p>
        <button
          type="button"
          onClick={launch}
          disabled={sessionOpen}
          title={sessionOpen ? 'Finish your current session first' : 'Walk through the 8-step prep'}
          className="flex items-center gap-1.5 rounded border border-moss/60 bg-moss/10 px-3 py-1.5 font-display text-xs uppercase tracking-wider text-moss hover:bg-moss hover:text-parchment disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ClipboardList size={12} /> Start Wizard
        </button>
      </div>
      <div className="rounded border border-rule bg-parchment p-4 shadow-card">
        <h3 className="mb-2 font-display text-sm tracking-wide text-ink">Past Runs</h3>
        {sortedRuns.length === 0 ? (
          <p className="font-serif text-xs italic text-ink-mute">No wizard runs yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {sortedRuns.slice(0, 8).map(r => (
              <li key={r.id} className="flex items-center gap-2 font-serif text-xs text-ink-soft">
                <span className="w-16 font-display text-[10px] uppercase tracking-wider text-brass-deep">
                  {(r.stepsCompleted || []).length}/8
                </span>
                <span className="flex-1">
                  Session {r.forSessionNumber}
                  {r.completedAt && <span className="ml-2 italic text-ink-mute">{new Date(r.completedAt).toLocaleDateString()}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
