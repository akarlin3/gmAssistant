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
    <li className="flex items-center gap-2 py-1.5 px-2 rounded border border-rule bg-parchment-soft">
      {atTarget
        ? <Check size={14} className="text-moss flex-shrink-0" />
        : <Circle size={12} className="text-crimson flex-shrink-0" />}
      <span className="text-sm font-serif text-ink flex-1">{label}</span>
      <span className={`text-xs font-display tabular-nums ${atTarget ? 'text-moss' : 'text-crimson'}`}>
        {current} / {target}
      </span>
      {detail && <span className="text-[11px] text-ink-mute font-serif italic">{detail}</span>}
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
        <span className="text-[10px] px-1.5 py-0.5 rounded-sm border font-display uppercase tracking-wider border-moss/40 bg-moss/5 text-moss">
          Lazy DM + CCD + PR
        </span>
        <h2 className="font-display text-2xl tracking-wide text-ink">Ready for Session {sessionNumber}</h2>
        <p className="text-sm font-serif italic text-ink-soft">
          Every Phase 0-4 prep target should be met before you run. Missing targets are flagged below — you can still start with a warning.
        </p>
      </header>

      {gateBlocked && (
        <div className="flex items-start gap-2 rounded border border-crimson/40 bg-crimson/5 p-2.5 text-sm">
          <AlertTriangle size={14} className="text-crimson flex-shrink-0 mt-0.5" />
          <div className="text-ink-soft font-serif">
            <span className="font-display uppercase tracking-wider text-xs text-crimson">Targets Unmet · </span>
            {strongStartMissing && <>Strong Start not written. </>}
            {missingCount > 0 && <>{missingCount} prep section{missingCount === 1 ? ' is' : 's are'} below recommended count.</>}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="font-display tracking-wide text-sm text-ink">Strong Start</h3>
        <ul className="space-y-1">
          <li className="flex items-start gap-2 py-1.5 px-2 rounded border border-rule bg-parchment-soft">
            {strongStart
              ? <Check size={14} className="text-moss flex-shrink-0 mt-0.5" />
              : <Circle size={12} className="text-crimson flex-shrink-0 mt-0.5" />}
            <div className="flex-1 space-y-0.5">
              {strongStart
                ? <p className="text-xs font-serif italic text-ink-soft">
                    &ldquo;{strongStart.slice(0, 200)}{strongStart.length > 200 ? '…' : ''}&rdquo;
                  </p>
                : <p className="text-xs font-serif italic text-crimson">Not yet written.</p>}
            </div>
          </li>
          <li className="flex items-center gap-2 py-1.5 px-2 rounded border border-rule bg-parchment-soft">
            {goalsActive > 0
              ? <Check size={14} className="text-moss flex-shrink-0" />
              : <Circle size={12} className="text-brass flex-shrink-0" />}
            <span className="text-sm font-serif text-ink flex-1">PC Goals tracked (active)</span>
            <span className="text-xs font-display tabular-nums text-brass-deep">
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
              <h3 className="font-display tracking-wide text-sm text-ink">{group.title}</h3>
              {groupMisses > 0 && (
                <span className="text-[10px] font-display uppercase tracking-wider text-crimson">
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
        <h3 className="font-display tracking-wide text-sm text-ink">Prep Notes</h3>
        {nonEmptyNotes.length === 0 ? (
          <p className="text-xs text-ink-mute italic font-serif">No per-step notes captured.</p>
        ) : (
          <ul className="space-y-2">
            {nonEmptyNotes.map(({ n, label, text }) => (
              <li key={n} className="rounded border border-rule bg-parchment-soft p-3">
                <div className="text-[10px] text-brass-deep font-display uppercase tracking-wider">
                  {n} · {label}
                </div>
                <p className="text-sm font-serif text-ink-soft whitespace-pre-wrap mt-1">{text}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-rule">
        <button
          onClick={onBack}
          className="text-xs px-3 py-1.5 rounded border border-rule text-ink-soft hover:bg-parchment-deep font-display uppercase tracking-wider flex items-center gap-1.5"
        >
          <ArrowLeft size={12} /> Back to Editing
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={onSaveAndClose}
            className="text-xs px-3 py-1.5 rounded border border-rule text-ink-soft hover:bg-parchment-deep font-display uppercase tracking-wider flex items-center gap-1.5"
          >
            <Save size={12} /> Save and Close
          </button>
          <button
            onClick={startWithGate}
            className="text-xs px-3 py-1.5 rounded border border-crimson/60 bg-crimson/10 text-crimson hover:bg-crimson hover:text-parchment font-display uppercase tracking-wider flex items-center gap-1.5"
            title={gateBlocked ? 'Targets unmet — will warn before starting' : 'Start the session'}
          >
            <Swords size={12} /> {gateBlocked ? 'Start Anyway' : 'Start Session Now'}
          </button>
        </div>
      </footer>
    </section>
  );
}
