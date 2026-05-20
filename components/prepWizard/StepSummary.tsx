'use client';

import { Check, Circle, Swords, ArrowLeft, Save } from 'lucide-react';
import type { SessionLogEntry } from '@/lib/sessionLog';
import { nextSessionNumber } from '@/lib/sessionLog';
import { unrevealedSecrets } from '@/lib/prepWizard';

type Get = (k: string, fb: any) => any;

type Props = {
  get: Get;
  onBack: () => void;
  onSaveAndClose: () => void;
  onStartSession: () => void;
};

type LineProps = {
  label: string;
  current: number;
  target: number;
  detail?: string;
};

function CountLine({ label, current, target, detail }: LineProps) {
  const atTarget = current >= target;
  return (
    <li className="flex items-center gap-2 py-1.5 px-2 rounded border border-rule bg-parchment-soft">
      {atTarget
        ? <Check size={14} className="text-moss flex-shrink-0" />
        : <Circle size={12} className="text-brass flex-shrink-0" />}
      <span className="text-sm font-serif text-ink flex-1">{label}</span>
      <span className={`text-xs font-display tabular-nums ${atTarget ? 'text-moss' : 'text-brass-deep'}`}>
        {current} / {target}
      </span>
      {detail && <span className="text-[11px] text-ink-mute font-serif italic">{detail}</span>}
    </li>
  );
}

export default function StepSummary({ get, onBack, onSaveAndClose, onStartSession }: Props) {
  const logs = (get('sessionLogV2', []) as SessionLogEntry[]) || [];
  const sessionNumber = nextSessionNumber(logs);
  const soloMode = get('soloMode', false) as boolean;

  const pcGoals = (get('pcGoals', []) as Array<{ text?: string; status?: string }>) || [];
  const strongStart = (get('strongStart', '') as string) || '';
  const scenes = (get('scenes', []) as string[]) || [];
  const secrets = (get('secrets', []) as string[]) || [];
  const unrevealed = unrevealedSecrets(secrets, logs);
  const locations = (get('locations', []) as any[]) || [];
  const npcs = (get('npcs', []) as any[]) || [];
  const monsters = (get('monsters', []) as string[]) || [];
  const items = (get('items', []) as string[]) || [];

  const goalsActive = pcGoals.filter(g => !g.status || g.status === 'Active' || g.status === 'Progressed').length;

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

  const tg = (key: 'scenes' | 'secrets' | 'locations' | 'npcs' | 'monsters' | 'items') => {
    const t: Record<string, { standard: number; solo: number }> = {
      scenes:    { standard: 5,  solo: 4 },
      secrets:   { standard: 10, solo: 8 },
      locations: { standard: 4,  solo: 3 },
      npcs:      { standard: 4,  solo: 3 },
      monsters:  { standard: 4,  solo: 3 },
      items:     { standard: 2,  solo: 2 },
    };
    return soloMode ? t[key].solo : t[key].standard;
  };

  const strongStartPreview = strongStart.trim();

  return (
    <section className="space-y-4">
      <header className="space-y-2">
        <span className="text-[10px] px-1.5 py-0.5 rounded-sm border font-display uppercase tracking-wider border-moss/40 bg-moss/5 text-moss">
          Lazy DM
        </span>
        <h2 className="font-display text-2xl tracking-wide text-ink">Ready for Session {sessionNumber}</h2>
        <p className="text-sm font-serif italic text-ink-soft">
          Everything below is what you've prepped. Anything under target is shown for your awareness, not as a problem.
        </p>
      </header>

      <div className="space-y-2">
        <h3 className="font-display tracking-wide text-sm text-ink">Prep Snapshot</h3>
        <ul className="space-y-1">
          <li className="flex items-center gap-2 py-1.5 px-2 rounded border border-rule bg-parchment-soft">
            {goalsActive > 0
              ? <Check size={14} className="text-moss flex-shrink-0" />
              : <Circle size={12} className="text-brass flex-shrink-0" />}
            <span className="text-sm font-serif text-ink flex-1">PC Goals tracked</span>
            <span className="text-xs font-display tabular-nums text-brass-deep">
              {goalsActive} active / {pcGoals.length} total
            </span>
          </li>
          <li className="flex items-start gap-2 py-1.5 px-2 rounded border border-rule bg-parchment-soft">
            {strongStartPreview
              ? <Check size={14} className="text-moss flex-shrink-0 mt-0.5" />
              : <Circle size={12} className="text-brass flex-shrink-0 mt-0.5" />}
            <div className="flex-1 space-y-0.5">
              <div className="text-sm font-serif text-ink">Strong Start</div>
              {strongStartPreview
                ? <p className="text-xs font-serif italic text-ink-soft">
                    "{strongStartPreview.slice(0, 200)}{strongStartPreview.length > 200 ? '…' : ''}"
                  </p>
                : <p className="text-xs font-serif italic text-ink-mute">Not yet written.</p>}
            </div>
          </li>
          <CountLine label="Potential Scenes" current={scenes.length} target={tg('scenes')} />
          <CountLine
            label="Unrevealed Secrets"
            current={unrevealed.length}
            target={tg('secrets')}
            detail={`${secrets.length} total`}
          />
          <CountLine label="Fantastic Locations" current={locations.length} target={tg('locations')} />
          <CountLine label="Important NPCs" current={npcs.length} target={tg('npcs')} />
          <CountLine label="Relevant Monsters" current={monsters.length} target={tg('monsters')} />
          <CountLine label="Magic Item Rewards" current={items.length} target={tg('items')} />
        </ul>
      </div>

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
            onClick={onStartSession}
            className="text-xs px-3 py-1.5 rounded border border-crimson/60 bg-crimson/10 text-crimson hover:bg-crimson hover:text-parchment font-display uppercase tracking-wider flex items-center gap-1.5"
          >
            <Swords size={12} /> Start Session Now
          </button>
        </div>
      </footer>
    </section>
  );
}
