'use client';

import type { SessionLogEntry } from '@/lib/sessionLog';
import { getLastSessionLog } from '@/lib/prepWizard';
import StepShell from './StepShell';
import StrongStartPicker from '../StrongStartPicker';

type Get = (k: string, fb: any) => any;
type SetVal = (k: string, v: any) => void;

export default function Step2StrongStart({ get, setVal }: { get: Get; setVal: SetVal }) {
  const logs = (get('sessionLogV2', []) as SessionLogEntry[]) || [];
  const last = getLastSessionLog(logs);

  const strongStart = (get('strongStart', '') as string) || '';
  const setStrongStart = (v: string) => setVal('strongStart', v);

  const dropped = (get('dropped', []) as string[]) || [];

  const notes = ((get('__prepWizardStepNotes', {}) as Record<string, string>)[2]) || '';
  const setNotes = (v: string) => {
    const all = (get('__prepWizardStepNotes', {}) as Record<string, string>) || {};
    setVal('__prepWizardStepNotes', { ...all, 2: v });
  };

  const recapExcerpt = last?.recap ? last.recap.trim().slice(0, 200) : '';
  const hasContext = recapExcerpt.length > 0 || dropped.length > 0;
  const context = hasContext ? (
    <div className="space-y-2">
      {recapExcerpt && (
        <div>
          <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Last Recap</div>
          <p className="font-serif text-sm italic text-ink-soft">
            "{recapExcerpt}{(last?.recap?.length || 0) > 200 ? '…' : ''}"
          </p>
        </div>
      )}
      {dropped.length > 0 && (
        <div>
          <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Dropped Threads</div>
          <ul className="ml-5 list-disc font-serif text-sm text-ink-soft">
            {dropped.map((d, i) => <li key={i}>{d}</li>)}
          </ul>
        </div>
      )}
    </div>
  ) : null;

  return (
    <StepShell
      stepNumber={2}
      title="Create a Strong Start"
      purpose="Open the session in the middle of action, tension, or revelation. The first five minutes set the tone."
      methodology="shea"
      contextFromLastSession={context}
    >
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-sm tracking-wide text-ink">Strong Start</h3>
          <StrongStartPicker
            onUse={(body) => {
              const cur = strongStart.trim();
              if (cur && !confirm('Replace the current strong start?')) return;
              setStrongStart(body);
            }}
          />
        </div>
        <textarea
          value={strongStart}
          onChange={(e) => setStrongStart(e.target.value)}
          rows={6}
          placeholder="One sentence or paragraph — drop the party into the middle of something."
          className="w-full resize-y rounded border border-rule bg-parchment px-2 py-1.5 font-serif text-sm text-ink"
        />
      </div>

      <label className="block space-y-1">
        <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
          Notes for this session
        </span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Tone, pacing, what should land in the first five minutes."
          className="w-full resize-y rounded border border-rule bg-parchment px-2 py-1.5 font-serif text-sm text-ink"
        />
      </label>
    </StepShell>
  );
}
