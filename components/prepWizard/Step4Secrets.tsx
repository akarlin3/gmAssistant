'use client';

import type { SessionLogEntry } from '@/lib/sessionLog';
import { getLastSessionLog, eventsOfKind, unrevealedSecrets } from '@/lib/prepWizard';
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

export default function Step4Secrets({ get, setVal, soloTarget, standardTarget, soloMode }: Props) {
  const logs = (get('sessionLogV2', []) as SessionLogEntry[]) || [];
  const last = getLastSessionLog(logs);

  const secrets = (get('secrets', []) as string[]) || [];
  const setSecrets = (next: string[]) => setVal('secrets', next);

  const notes = ((get('__prepWizardStepNotes', {}) as Record<string, string>)[4]) || '';
  const setNotes = (v: string) => {
    const all = (get('__prepWizardStepNotes', {}) as Record<string, string>) || {};
    setVal('__prepWizardStepNotes', { ...all, 4: v });
  };

  const lastRevealed = last?.secretsRevealed || [];
  const clockTicks = eventsOfKind(last, ['faction_clock_ticked']);
  const carrying = unrevealedSecrets(secrets, logs);
  const target = soloMode ? soloTarget : standardTarget;

  const hasContext = lastRevealed.length > 0 || clockTicks.length > 0;
  const context = hasContext ? (
    <div className="space-y-2">
      {lastRevealed.length > 0 && (
        <div>
          <div className="text-[10px] text-brass-deep font-display uppercase tracking-wider">Revealed Last Session</div>
          <ul className="list-disc ml-5 text-sm font-serif text-ink-soft">
            {lastRevealed.map((s, i) => <li key={i}>{s}</li>)}
          </ul>
        </div>
      )}
      {clockTicks.length > 0 && (
        <div>
          <div className="text-[10px] text-brass-deep font-display uppercase tracking-wider">
            Faction Clocks Advanced — Consider New Clues
          </div>
          <ul className="list-disc ml-5 text-sm font-serif text-ink-soft">
            {clockTicks.map((e, i) => <li key={i}>{e.summary}</li>)}
          </ul>
        </div>
      )}
    </div>
  ) : null;

  return (
    <StepShell
      stepNumber={4}
      title="Define Secrets and Clues"
      purpose="Aim for 10 small revelations. Drop them whenever the moment fits — they don't need a specific scene."
      methodology="shea"
      contextFromLastSession={context}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display tracking-wide text-sm text-ink">Secrets & Clues</h3>
        <span className="text-[11px] text-ink-mute font-serif">
          {secrets.filter(s => s.trim().length > 0).length} / {target} target
        </span>
      </div>
      {carrying.length > 0 && (
        <p className="text-[11px] text-moss font-serif italic">
          {carrying.length} unrevealed secret{carrying.length === 1 ? '' : 's'} carrying over from previous sessions.
        </p>
      )}
      <StringListEditor
        items={secrets}
        onChange={setSecrets}
        placeholder="A single-sentence secret or clue"
        rows={2}
        addLabel="Add Secret"
      />

      <label className="block space-y-1">
        <span className="text-[10px] text-brass-deep font-display uppercase tracking-wider">
          Notes for this session
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Which secrets matter most this session? Any earmarked for specific scenes?"
          className="w-full bg-parchment border border-rule rounded px-2 py-1.5 text-sm text-ink font-serif resize-y"
        />
      </label>
    </StepShell>
  );
}
