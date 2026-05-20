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
      <div className="text-[10px] text-brass-deep font-display uppercase tracking-wider">Added Last Session</div>
      <ul className="list-disc ml-5 text-sm font-serif text-ink-soft">
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
        <div className="rounded border border-wine/40 bg-wine/5 p-2.5 text-xs font-serif text-ink-soft">
          <span className="text-wine font-display uppercase tracking-wider text-[10px]">Solo · </span>
          Encounters use adjusted XP. Open the Monsters tab to check budgets against the Solo Encounter Helper.
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display tracking-wide text-sm text-ink">Monsters</h3>
        <span className="text-[11px] text-ink-mute font-serif">
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
        <span className="text-[10px] text-brass-deep font-display uppercase tracking-wider">
          Notes for this session
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Tactics, terrain interplay, escape routes."
          className="w-full bg-parchment border border-rule rounded px-2 py-1.5 text-sm text-ink font-serif resize-y"
        />
      </label>
    </StepShell>
  );
}
