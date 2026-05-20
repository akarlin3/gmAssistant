'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { SessionLogEntry } from '@/lib/sessionLog';
import { getLastSessionLog, recentlyUsedScenes } from '@/lib/prepWizard';
import StepShell from './StepShell';
import { countFilled } from '@/lib/prepTargets';

type Get = (k: string, fb: any) => any;
type SetVal = (k: string, v: any) => void;

type Location = {
  name?: string;
  type?: string;
  aspects?: string[];
  factions?: string;
};

type Props = {
  get: Get;
  setVal: SetVal;
  soloTarget: number;
  standardTarget: number;
  soloMode: boolean;
};

export default function Step5Locations({ get, setVal, soloTarget, standardTarget, soloMode }: Props) {
  const logs = (get('sessionLogV2', []) as SessionLogEntry[]) || [];

  const locations = (get('locations', []) as Location[]) || [];
  const setLocations = (next: Location[]) => setVal('locations', next);

  const clocks = (get('clocks', []) as Array<{ text?: string; faction?: string; notes?: string }>) || [];

  const notes = ((get('__prepWizardStepNotes', {}) as Record<string, string>)[5]) || '';
  const setNotes = (v: string) => {
    const all = (get('__prepWizardStepNotes', {}) as Record<string, string>) || {};
    setVal('__prepWizardStepNotes', { ...all, 5: v });
  };

  const recentScenes = recentlyUsedScenes(logs, 3);
  const clocksWithNotes = clocks.filter(c => (c.notes || '').trim().length > 0);
  const target = soloMode ? soloTarget : standardTarget;

  const hasContext = recentScenes.length > 0 || clocksWithNotes.length > 0;
  const context = hasContext ? (
    <div className="space-y-2">
      {recentScenes.length > 0 && (
        <div>
          <div className="text-[10px] text-brass-deep font-display uppercase tracking-wider">
            Recent Scene Reuse — Watch for Stale Locations
          </div>
          <ul className="list-disc ml-5 text-sm font-serif text-ink-soft">
            {recentScenes.slice(0, 6).map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}
      {clocksWithNotes.length > 0 && (
        <div>
          <div className="text-[10px] text-brass-deep font-display uppercase tracking-wider">Clock Notes (Possible Location Hints)</div>
          <ul className="list-disc ml-5 text-sm font-serif text-ink-soft">
            {clocksWithNotes.slice(0, 5).map((c, i) => (
              <li key={i}>
                <span className="text-brass-deep">{c.faction || 'Clock'}: </span>
                {c.notes}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  ) : null;

  const updateLoc = (i: number, patch: Partial<Location>) => {
    const next = [...locations];
    next[i] = { ...next[i], ...patch };
    setLocations(next);
  };
  const removeLoc = (i: number) => setLocations(locations.filter((_, j) => j !== i));
  const addLoc = () => setLocations([...locations, { name: '', type: '', aspects: ['', '', ''], factions: '' }]);

  return (
    <StepShell
      stepNumber={5}
      title="Develop Fantastic Locations"
      purpose="1–2 evocative locations per session. Three concrete sensory details each beats a full map."
      methodology="shea"
      contextFromLastSession={context}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display tracking-wide text-sm text-ink">Locations</h3>
        <span className="text-[11px] text-ink-mute font-serif">
          {countFilled('locations', locations)} / {target} target
        </span>
      </div>

      <div className="space-y-2">
        {locations.length === 0 && (
          <p className="text-xs text-ink-mute italic font-serif">No locations yet.</p>
        )}
        {locations.map((loc, i) => {
          const aspects = loc.aspects || ['', '', ''];
          return (
            <div key={i} className="rounded border border-rule bg-parchment-soft p-3 space-y-2">
              <div className="flex items-start gap-2">
                <input
                  value={loc.name || ''}
                  onChange={(e) => updateLoc(i, { name: e.target.value })}
                  placeholder="Name"
                  className="flex-1 bg-parchment border border-rule rounded px-2 py-1 text-sm text-ink font-serif"
                />
                <input
                  value={loc.type || ''}
                  onChange={(e) => updateLoc(i, { type: e.target.value })}
                  placeholder="Type (e.g. Ruin)"
                  className="w-36 bg-parchment border border-rule rounded px-2 py-1 text-xs text-ink-soft font-serif"
                />
                <button
                  onClick={() => removeLoc(i)}
                  className="text-ink-mute hover:text-crimson p-1 mt-0.5"
                  title="Remove location"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="space-y-1">
                <div className="text-[10px] text-brass-deep font-display uppercase tracking-wider">Three Sensory Aspects</div>
                {aspects.map((a, j) => (
                  <input
                    key={j}
                    value={a}
                    onChange={(e) => {
                      const nextAspects = [...aspects];
                      nextAspects[j] = e.target.value;
                      updateLoc(i, { aspects: nextAspects });
                    }}
                    placeholder={`Aspect ${j + 1} — sight, sound, smell, feel`}
                    className="w-full bg-parchment border border-rule rounded px-2 py-1 text-xs text-ink-soft font-serif"
                  />
                ))}
              </div>
              <input
                value={loc.factions || ''}
                onChange={(e) => updateLoc(i, { factions: e.target.value })}
                placeholder="Factions tied here"
                className="w-full bg-parchment border border-rule rounded px-2 py-1 text-xs text-ink-soft font-serif"
              />
            </div>
          );
        })}
        <button
          onClick={addLoc}
          className="text-xs text-brass-deep hover:text-crimson flex items-center gap-1 font-display uppercase tracking-wider"
        >
          <Plus size={12} /> Add Location
        </button>
      </div>

      <label className="block space-y-1">
        <span className="text-[10px] text-brass-deep font-display uppercase tracking-wider">
          Notes for this session
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="What does the party most likely visit? Anything that needs a fresh sensory hook?"
          className="w-full bg-parchment border border-rule rounded px-2 py-1.5 text-sm text-ink font-serif resize-y"
        />
      </label>
    </StepShell>
  );
}
