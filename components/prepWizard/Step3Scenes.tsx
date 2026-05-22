'use client';

import type { SessionLogEntry } from '@/lib/sessionLog';
import { getLastSessionLog, carryForwardScenes } from '@/lib/prepWizard';
import StepShell from './StepShell';
import StringListEditor from './StringListEditor';

type Get = (k: string, fb: any) => any;
type SetVal = (k: string, v: any) => void;

type Props = {
  get: Get;
  setVal: SetVal;
  soloTarget: number;
  standardTarget: number;
  soloMode: boolean;
};

export default function Step3Scenes({ get, setVal, soloTarget, standardTarget, soloMode }: Props) {
  const logs = (get('sessionLogV2', []) as SessionLogEntry[]) || [];
  const last = getLastSessionLog(logs);

  const scenes = (get('scenes', []) as string[]) || [];
  const setScenes = (next: string[]) => setVal('scenes', next);

  const notes = ((get('__prepWizardStepNotes', {}) as Record<string, string>)[3]) || '';
  const setNotes = (v: string) => {
    const all = (get('__prepWizardStepNotes', {}) as Record<string, string>) || {};
    setVal('__prepWizardStepNotes', { ...all, 3: v });
  };

  const lastScenesUsed = last?.scenesUsed || [];
  const carryForward = carryForwardScenes(scenes, last);
  const target = soloMode ? soloTarget : standardTarget;

  const hasContext = lastScenesUsed.length > 0 || carryForward.length > 0;
  const context = hasContext ? (
    <div className="space-y-2">
      {lastScenesUsed.length > 0 && (
        <div>
          <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Used Last Session</div>
          <ul className="ml-5 list-disc font-serif text-sm text-ink-soft">
            {lastScenesUsed.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}
      {carryForward.length > 0 && (
        <div>
          <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
            Prepped but Not Used (Can Carry Forward)
          </div>
          <ul className="ml-5 list-disc font-serif text-sm text-ink-soft">
            {carryForward.slice(0, 6).map((s, i) => <li key={i}>{s}</li>)}
            {carryForward.length > 6 && (
              <li className="italic text-ink-mute">… and {carryForward.length - 6} more</li>
            )}
          </ul>
        </div>
      )}
    </div>
  ) : null;

  return (
    <StepShell
      stepNumber={3}
      title="Outline Potential Scenes"
      purpose="List 1–2 scenes per hour of expected play. These are possibilities, not a railroad."
      methodology="shea"
      contextFromLastSession={context}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-sm tracking-wide text-ink">Scenes</h3>
        <span className="font-serif text-[11px] text-ink-mute">
          {scenes.filter(s => s.trim().length > 0).length} / {target} target
        </span>
      </div>
      <StringListEditor
        items={scenes}
        onChange={setScenes}
        placeholder="A scene — a moment, encounter, or beat that could happen"
        rows={2}
        addLabel="Add Scene"
      />

      <label className="block space-y-1">
        <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
          Notes for this session
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Pacing, expected play time, scene priorities."
          className="w-full resize-y rounded border border-rule bg-parchment px-2 py-1.5 font-serif text-sm text-ink"
        />
      </label>
    </StepShell>
  );
}
