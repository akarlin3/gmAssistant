'use client';

import type { SessionLogEntry } from '@/lib/sessionLog';
import { getLastSessionLog, eventsOfKind } from '@/lib/prepWizard';
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

export default function Step7Monsters({ get, setVal, soloTarget, standardTarget, soloMode }: Props) {
  const logs = (get('sessionLogV2', []) as SessionLogEntry[]) || [];
  const last = getLastSessionLog(logs);

  const monsters = (get('monsters', []) as string[]) || [];
  const setMonsters = (next: string[]) => setVal('monsters', next);

  const notes = ((get('__prepWizardStepNotes', {}) as Record<string, string>)[7]) || '';
  const setNotes = (v: string) => {
    const all = (get('__prepWizardStepNotes', {}) as Record<string, string>) || {};
    setVal('__prepWizardStepNotes', { ...all, 7: v });
  };

  const monsterEvents = eventsOfKind(last, ['monster_added']);
  const target = soloMode ? soloTarget : standardTarget;

  const hasContext = monsterEvents.length > 0;
  const context = hasContext ? (
    <div>
      <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Added Last Session</div>
      <ul className="ml-5 list-disc font-serif text-sm text-ink-soft">
        {monsterEvents.slice(0, 6).map((e, i) => <li key={i}>{e.summary}</li>)}
      </ul>
    </div>
  ) : null;

  return (
    <StepShell
      stepNumber={7}
      title="Choose Relevant Monsters"
      purpose="Pick monsters tied to the locations, NPCs, or factions the party is likely to engage. Skip generic encounters."
      methodology="shea"
      contextFromLastSession={context}
    >
      {soloMode && (
        <div className="rounded border border-wine/40 bg-wine/5 p-2.5 font-serif text-xs text-ink-soft">
          <span className="font-display text-[10px] uppercase tracking-wider text-wine">Solo · </span>
          Encounters use adjusted XP. Open the Monsters tab to check budgets against the Solo Encounter Helper.
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display text-sm tracking-wide text-ink">Monsters</h3>
        <span className="font-serif text-[11px] text-ink-mute">
          {monsters.filter(s => s.trim().length > 0).length} / {target} target
        </span>
      </div>
      <StringListEditor
        items={monsters}
        onChange={setMonsters}
        placeholder="Monster — CR — use case (e.g., Bandit Captain, CR 2, ambush at the ford)"
        rows={1}
        addLabel="Add Monster"
      />

      <label className="block space-y-1">
        <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
          Notes for this session
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Tactics, terrain interplay, escape routes."
          className="w-full resize-y rounded border border-rule bg-parchment px-2 py-1.5 font-serif text-sm text-ink"
        />
      </label>
    </StepShell>
  );
}
