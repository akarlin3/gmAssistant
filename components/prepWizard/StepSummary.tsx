'use client';

import { Check, Circle, Swords, ArrowLeft, Save, AlertTriangle } from 'lucide-react';
import type { SessionLogEntry } from '@/lib/sessionLog';
import { nextSessionNumber } from '@/lib/sessionLog';
import { unrevealedSecrets } from '@/lib/prepWizard';
import {
  PHASE_GROUPS, TARGETS, getTarget, countFilled, isFilled,
  type PrepTargetKey, type PrepTargetOverrides,
} from '@/lib/prepTargets';

type Get = (k: string, fb: any) => any;

type Props = {
  get: Get;
  soloMode: boolean;
  overrides: PrepTargetOverrides;
  onBack: () => void;
  onSaveAndClose: () => void;
  onStartSession: () => void;
};

type Row = {
  key: PrepTargetKey;
  label: string;
  current: number;
  target: number;
  detail?: string;
};

// "Secrets" counts *unrevealed and non-blank* against the target — already-
// revealed secrets no longer count as fresh prep — while still surfacing the
// raw total for context. Every other key counts only items with authored
// content (blank rows / freshly-added empty cards don't satisfy the target).
function countFor(key: PrepTargetKey, get: Get, logs: SessionLogEntry[]): { current: number; detail?: string } {
  if (key === 'secrets') {
    const all = (get('secrets', []) as string[]) || [];
    const allFilled = all.filter(s => isFilled('secrets', s));
    const unrevealedFilled = unrevealedSecrets(allFilled, logs);
    return { current: unrevealedFilled.length, detail: `${allFilled.length} written` };
  }
  return { current: countFilled(key, get(key, [])) };
}

function CountLine({ label, current, target, detail }: { label: string; current: number; target: number; detail?: string }) {
  const atTarget = current >= target;
  return (
    <li className="flex items-center gap-2 rounded border border-rule bg-parchment-soft px-2 py-1.5">
      {atTarget
        ? <Check size={14} className="flex-shrink-0 text-moss" />
        : <Circle size={12} className="flex-shrink-0 text-crimson" />}
      <span className="flex-1 font-serif text-sm text-ink">{label}</span>
      <span className={`font-display text-xs tabular-nums ${atTarget ? 'text-moss' : 'text-crimson'}`}>
        {current} / {target}
      </span>
      {detail && <span className="font-serif text-[11px] italic text-ink-mute">{detail}</span>}
    </li>
  );
}

export default function StepSummary({ get, soloMode, overrides, onBack, onSaveAndClose, onStartSession }: Props) {
  const logs = (get('sessionLogV2', []) as SessionLogEntry[]) || [];
  const sessionNumber = nextSessionNumber(logs);

  const strongStart = ((get('strongStart', '') as string) || '').trim();
  const pcGoals = (get('pcGoals', []) as Array<{ text?: string; status?: string }>) || [];
  const filledGoals = pcGoals.filter(g => isFilled('pcGoals', g));
  const goalsActive = filledGoals.filter(g => !g.status || g.status === 'Active' || g.status === 'Progressed').length;

  const phaseRows = PHASE_GROUPS.map(group => ({
    phase: group.phase,
    title: group.title,
    rows: group.keys.map<Row>(key => {
      const target = getTarget(key, soloMode, overrides);
      const { current, detail } = countFor(key, get, logs);
      return { key, label: TARGETS[key].label, current, target, detail };
    }),
  }));
  const allRows = phaseRows.flatMap(p => p.rows);
  const missing = allRows.filter(r => r.target > 0 && r.current < r.target);
  const missingCount = missing.length;
  const strongStartMissing = !strongStart;
  const gateBlocked = missingCount > 0 || strongStartMissing;

  const notes = (get('__prepWizardStepNotes', {}) as Record<string, string>) || {};
  const stepNoteLabels: Record<number, string> = {
    1: 'Review the Characters',
    2: 'Create a Strong Start',
    3: 'Outline Potential Scenes',
    4: 'Define Secrets & Clues',
    5: 'Develop Fantastic Locations',
    6: 'Outline Important NPCs',
    7: 'Choose Relevant Monsters',
    8: 'Select Magic Item Rewards',
  };
  const nonEmptyNotes = ([1, 2, 3, 4, 5, 6, 7, 8] as const)
    .map(n => ({ n, label: stepNoteLabels[n], text: (notes[n] || '').trim() }))
    .filter(x => x.text.length > 0);

  const startWithGate = () => {
    if (gateBlocked) {
      const parts: string[] = [];
      if (strongStartMissing) parts.push('• No Strong Start written');
      if (missingCount > 0) parts.push(`• ${missingCount} prep target${missingCount === 1 ? '' : 's'} below recommended count`);
      const ok = confirm(
        `Targets unmet — start session anyway?\n\n${parts.join('\n')}\n\nYou can keep prepping and start later from the Summary screen.`,
      );
      if (!ok) return;
    }
    onStartSession();
  };

  return (
    <section className="space-y-4">
      <header className="space-y-2">
        <span className="rounded-sm border border-moss/40 bg-moss/5 px-1.5 py-0.5 font-display text-[10px] uppercase tracking-wider text-moss">
          Lazy DM + CCD + PR
        </span>
        <h2 className="font-display text-2xl tracking-wide text-ink">Ready for Session {sessionNumber}</h2>
        <p className="font-serif text-sm italic text-ink-soft">
          Every Phase 0-4 prep target should be met before you run. Missing targets are flagged below — you can still start with a warning.
        </p>
      </header>

      {gateBlocked && (
        <div className="flex items-start gap-2 rounded border border-crimson/40 bg-crimson/5 p-2.5 text-sm">
          <AlertTriangle size={14} className="mt-0.5 flex-shrink-0 text-crimson" />
          <div className="font-serif text-ink-soft">
            <span className="font-display text-xs uppercase tracking-wider text-crimson">Targets Unmet · </span>
            {strongStartMissing && <>Strong Start not written. </>}
            {missingCount > 0 && <>{missingCount} prep section{missingCount === 1 ? ' is' : 's are'} below recommended count.</>}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="font-display text-sm tracking-wide text-ink">Strong Start</h3>
        <ul className="space-y-1">
          <li className="flex items-start gap-2 rounded border border-rule bg-parchment-soft px-2 py-1.5">
            {strongStart
              ? <Check size={14} className="mt-0.5 flex-shrink-0 text-moss" />
              : <Circle size={12} className="mt-0.5 flex-shrink-0 text-crimson" />}
            <div className="flex-1 space-y-0.5">
              {strongStart
                ? <p className="font-serif text-xs italic text-ink-soft">
                    &ldquo;{strongStart.slice(0, 200)}{strongStart.length > 200 ? '…' : ''}&rdquo;
                  </p>
                : <p className="font-serif text-xs italic text-crimson">Not yet written.</p>}
            </div>
          </li>
          <li className="flex items-center gap-2 rounded border border-rule bg-parchment-soft px-2 py-1.5">
            {goalsActive > 0
              ? <Check size={14} className="flex-shrink-0 text-moss" />
              : <Circle size={12} className="flex-shrink-0 text-brass" />}
            <span className="flex-1 font-serif text-sm text-ink">PC Goals tracked (active)</span>
            <span className="font-display text-xs tabular-nums text-brass-deep">
              {goalsActive} active / {filledGoals.length} written
            </span>
          </li>
        </ul>
      </div>

      {phaseRows.map(group => {
        const groupMisses = group.rows.filter(r => r.target > 0 && r.current < r.target).length;
        return (
          <div key={group.phase} className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h3 className="font-display text-sm tracking-wide text-ink">{group.title}</h3>
              {groupMisses > 0 && (
                <span className="font-display text-[10px] uppercase tracking-wider text-crimson">
                  {groupMisses} unmet
                </span>
              )}
            </div>
            <ul className="space-y-1">
              {group.rows.map(r => (
                <CountLine
                  key={r.key}
                  label={r.label}
                  current={r.current}
                  target={r.target}
                  detail={r.detail}
                />
              ))}
            </ul>
          </div>
        );
      })}

      <div className="space-y-2">
        <h3 className="font-display text-sm tracking-wide text-ink">Prep Notes</h3>
        {nonEmptyNotes.length === 0 ? (
          <p className="font-serif text-xs italic text-ink-mute">No per-step notes captured.</p>
        ) : (
          <ul className="space-y-2">
            {nonEmptyNotes.map(({ n, label, text }) => (
              <li key={n} className="rounded border border-rule bg-parchment-soft p-3">
                <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
                  {n} · {label}
                </div>
                <p className="mt-1 whitespace-pre-wrap font-serif text-sm text-ink-soft">{text}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 rounded border border-rule px-3 py-1.5 font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep"
        >
          <ArrowLeft size={12} /> Back to Editing
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={onSaveAndClose}
            className="flex items-center gap-1.5 rounded border border-rule px-3 py-1.5 font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep"
          >
            <Save size={12} /> Save and Close
          </button>
          <button
            onClick={startWithGate}
            className="flex items-center gap-1.5 rounded border border-crimson/60 bg-crimson/10 px-3 py-1.5 font-display text-xs uppercase tracking-wider text-crimson hover:bg-crimson hover:text-parchment"
            title={gateBlocked ? 'Targets unmet — will warn before starting' : 'Start the session'}
          >
            <Swords size={12} /> {gateBlocked ? 'Start Anyway' : 'Start Session Now'}
          </button>
        </div>
      </footer>
    </section>
  );
}
