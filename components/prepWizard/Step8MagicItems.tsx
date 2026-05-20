'use client';

import type { SessionLogEntry } from '@/lib/sessionLog';
import { getLastSessionLog, eventsOfKind } from '@/lib/prepWizard';
import StepShell from './StepShell';
import StringListEditor from './StringListEditor';

type Get = (k: string, fb: any) => any;
type SetVal = (k: string, v: any) => void;

type Goal = { text?: string; status?: string };

type Props = {
  get: Get;
  setVal: SetVal;
  soloTarget: number;
  standardTarget: number;
  soloMode: boolean;
};

export default function Step8MagicItems({ get, setVal, soloTarget, standardTarget, soloMode }: Props) {
  const logs = (get('sessionLogV2', []) as SessionLogEntry[]) || [];
  const last = getLastSessionLog(logs);

  const items = (get('items', []) as string[]) || [];
  const setItems = (next: string[]) => setVal('items', next);

  const pcGoals = (get('pcGoals', []) as Goal[]) || [];
  const activeGoals = pcGoals.filter(g => !g.status || g.status === 'Active' || g.status === 'Progressed');

  const notes = ((get('__prepWizardStepNotes', {}) as Record<string, string>)[8]) || '';
  const setNotes = (v: string) => {
    const all = (get('__prepWizardStepNotes', {}) as Record<string, string>) || {};
    setVal('__prepWizardStepNotes', { ...all, 8: v });
  };

  const itemEvents = eventsOfKind(last, ['magic_item_given']);
  const target = soloMode ? soloTarget : standardTarget;

  const hasContext = itemEvents.length > 0 || activeGoals.length > 0;
  const context = hasContext ? (
    <div className="space-y-2">
      {itemEvents.length > 0 && (
        <div>
          <div className="text-[10px] text-brass-deep font-display uppercase tracking-wider">
            Given Last Session — Skip Back-to-Back Rewards
          </div>
          <ul className="list-disc ml-5 text-sm font-serif text-ink-soft">
            {itemEvents.map((e, i) => <li key={i}>{e.summary}</li>)}
          </ul>
        </div>
      )}
      {activeGoals.length > 0 && (
        <div>
          <div className="text-[10px] text-brass-deep font-display uppercase tracking-wider">
            Active PC Goals — Items That Resonate Matter Most
          </div>
          <ul className="list-disc ml-5 text-sm font-serif text-ink-soft">
            {activeGoals.slice(0, 5).map((g, i) => (
              <li key={i}>{g.text || 'Unnamed goal'}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  ) : null;

  return (
    <StepShell
      stepNumber={8}
      title="Select Magic Item Rewards"
      purpose="1–2 rewards aligned to a PC's interests or goals. Skip when nothing feels right — better none than generic."
      methodology="shea"
      contextFromLastSession={context}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-display tracking-wide text-sm text-ink">Magic Item Rewards</h3>
        <span className="text-[11px] text-ink-mute font-serif">
          {items.filter(s => s.trim().length > 0).length} / {target} target
        </span>
      </div>
      <StringListEditor
        items={items}
        onChange={setItems}
        placeholder="Item · what +1 hook it delivers (PR-style: actionable, not a stat bump)"
        rows={2}
        addLabel="Add Item"
      />

      <label className="block space-y-1">
        <span className="text-[10px] text-brass-deep font-display uppercase tracking-wider">
          Notes for this session
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Who gets what, how it surfaces in the fiction."
          className="w-full bg-parchment border border-rule rounded px-2 py-1.5 text-sm text-ink font-serif resize-y"
        />
      </label>
    </StepShell>
  );
}
