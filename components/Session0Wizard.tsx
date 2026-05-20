'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, X, Sparkles } from 'lucide-react';
import { emptyCharacter, makeCharacterId, type Character } from '@/lib/character-schema';

const TRUTH_PLACEHOLDERS = [
  'A terrible power lurks beneath the village.',
  'The lands grow ever wilder.',
  'Borders to the outer planes are stretched thin.',
  'Magic is rare and feared.',
  'An ancient empire is reawakening.',
  'The gods have been silent for a generation.',
];

const PITCH_EXAMPLES = [
  'Stop the demon prince\'s return.',
  'Find the lost city beneath the salt.',
  'Magic is dying — what\'s left is dangerous.',
];

type WizardPatch = {
  name?: string;
  pitch?: string;
  truths?: string[];
  pc?: { name: string; concept: string; goal: string };
  front?: { name: string; goal: string; firstSign: string };
};

export type Session0WizardProps = {
  initialName: string;
  initialSoloMode: boolean;
  onClose: () => void;
  onFinish: (patch: WizardPatch & { markDone: boolean }) => void;
};

type Step = 1 | 2 | 3 | 4 | 5 | 6;

const TOTAL_STEPS = 5;

export default function Session0Wizard({
  initialName,
  initialSoloMode,
  onClose,
  onFinish,
}: Session0WizardProps) {
  const [step, setStep] = useState<Step>(1);

  // Screen 1
  const [name, setName] = useState(initialName || 'New Campaign');

  // Screen 2
  const [pitch, setPitch] = useState('');

  // Screen 3
  const [truthsMode, setTruthsMode] = useState<'three' | 'six'>(
    initialSoloMode ? 'three' : 'six',
  );
  const [truths, setTruths] = useState<string[]>(['', '', '', '', '', '']);

  // Screen 4
  const [pcName, setPcName] = useState('');
  const [pcConcept, setPcConcept] = useState('');
  const [pcGoal, setPcGoal] = useState('');

  // Screen 5
  const [frontName, setFrontName] = useState('');
  const [frontGoal, setFrontGoal] = useState('');
  const [frontFirstSign, setFrontFirstSign] = useState('');

  // Tracks which screens were skipped vs filled — used by the finish patch
  // and the summary screen.
  const [skipped, setSkipped] = useState<Record<Step, boolean>>({
    1: false, 2: false, 3: false, 4: false, 5: false, 6: false,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const advance = (skipping = false) => {
    setSkipped((s) => ({ ...s, [step]: skipping }));
    setStep((s) => Math.min(6, (s + 1) as Step) as Step);
  };
  const back = () => setStep((s) => Math.max(1, (s - 1) as Step) as Step);

  const truthsCount = truthsMode === 'three' ? 3 : 6;
  const filledTruths = useMemo(
    () => truths.slice(0, truthsCount).filter((t) => t.trim()),
    [truths, truthsCount],
  );

  const buildPatch = (): WizardPatch => {
    const patch: WizardPatch = {};
    if (!skipped[1] && name.trim()) patch.name = name.trim();
    if (!skipped[2] && pitch.trim()) patch.pitch = pitch.trim();
    if (!skipped[3] && filledTruths.length > 0) patch.truths = filledTruths;
    if (!skipped[4] && pcName.trim()) {
      patch.pc = { name: pcName.trim(), concept: pcConcept.trim(), goal: pcGoal.trim() };
    }
    if (!skipped[5] && frontName.trim()) {
      patch.front = { name: frontName.trim(), goal: frontGoal.trim(), firstSign: frontFirstSign.trim() };
    }
    return patch;
  };

  const finalize = () => {
    onFinish({ ...buildPatch(), markDone: true });
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-parchment-soft overflow-y-auto">
      {/* Top bar */}
      <header className="border-b border-rule bg-parchment-soft sticky top-0 px-4 sm:px-8 py-3 flex items-center justify-between gap-3 z-10">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles size={14} className="text-brass-deep flex-shrink-0" />
          <span className="text-xs font-display uppercase tracking-wider text-brass-deep">
            Setup
            {step <= TOTAL_STEPS && <span className="text-ink-mute"> — Step {step} of {TOTAL_STEPS}</span>}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Step dots */}
          <div className="hidden sm:flex items-center gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <span
                key={n}
                className={`w-2 h-2 rounded-full ${
                  n < step ? 'bg-brass-deep' :
                  n === step ? 'bg-crimson' :
                  'bg-rule'
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close setup"
            className="p-1.5 rounded text-ink-mute hover:text-crimson hover:bg-parchment-deep"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="flex-1 px-4 sm:px-8 py-6 sm:py-10">
        <div className="max-w-xl mx-auto">
          {step === 1 && (
            <Screen
              title="Name the campaign"
              subtitle="Give your campaign a working title. You can change it later."
            >
              <textarea
                value={name}
                onChange={(e) => setName(e.target.value)}
                rows={1}
                autoFocus
                placeholder="e.g. The Last Wells"
                className="w-full bg-parchment border border-rule rounded px-3 py-2 text-ink font-serif placeholder:text-ink-faint placeholder:italic focus:border-crimson focus:outline-none resize-none [field-sizing:content]"
              />
            </Screen>
          )}

          {step === 2 && (
            <Screen
              title="Pitch"
              subtitle="What's this campaign about, in a sentence? Lazy DM calls this the campaign hook — three words can carry an entire arc."
            >
              <textarea
                value={pitch}
                onChange={(e) => setPitch(e.target.value)}
                rows={2}
                autoFocus
                placeholder="One sentence about the campaign"
                className="w-full bg-parchment border border-rule rounded px-3 py-2 text-ink font-serif placeholder:text-ink-faint placeholder:italic focus:border-crimson focus:outline-none resize-none [field-sizing:content]"
              />
              <div className="pt-2 space-y-1">
                <div className="text-[10px] font-display uppercase tracking-wider text-brass-deep">Examples</div>
                {PITCH_EXAMPLES.map((ex) => (
                  <div key={ex} className="text-sm font-serif italic text-ink-soft">{ex}</div>
                ))}
              </div>
            </Screen>
          )}

          {step === 3 && (
            <Screen
              title="Truths of Your World"
              subtitle="Things that are non-negotiably true. Solo play often does well with three."
            >
              <div className="flex items-center gap-1 p-1 rounded border border-rule bg-parchment-deep/30 w-fit">
                <button
                  type="button"
                  onClick={() => setTruthsMode('three')}
                  className={`text-xs px-2.5 py-1 rounded font-display uppercase tracking-wider ${
                    truthsMode === 'three' ? 'bg-wine/15 text-wine' : 'text-ink-soft hover:bg-parchment'
                  }`}
                >
                  Three (solo)
                </button>
                <button
                  type="button"
                  onClick={() => setTruthsMode('six')}
                  className={`text-xs px-2.5 py-1 rounded font-display uppercase tracking-wider ${
                    truthsMode === 'six' ? 'bg-brass-deep/15 text-brass-deep' : 'text-ink-soft hover:bg-parchment'
                  }`}
                >
                  Six (group)
                </button>
              </div>
              <div className="space-y-2 pt-1">
                {Array.from({ length: truthsCount }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-brass-deep font-display text-xs w-5 text-right">{i + 1}.</span>
                    <textarea
                      value={truths[i] || ''}
                      onChange={(e) => {
                        const next = [...truths]; next[i] = e.target.value; setTruths(next);
                      }}
                      rows={1}
                      placeholder={TRUTH_PLACEHOLDERS[i % TRUTH_PLACEHOLDERS.length]}
                      className="flex-1 bg-parchment border border-rule rounded px-3 py-2 text-ink font-serif text-sm placeholder:text-ink-faint placeholder:italic focus:border-crimson focus:outline-none resize-none [field-sizing:content]"
                    />
                  </div>
                ))}
              </div>
            </Screen>
          )}

          {step === 4 && (
            <Screen
              title="Your Character"
              subtitle="Just enough to start. You can flesh them out from the Reference tab later."
            >
              <LabeledField label="Name" value={pcName} onChange={setPcName} placeholder="e.g. Wren of the Salt Roads" autoFocus />
              <LabeledField label="Concept (one line)" value={pcConcept} onChange={setPcConcept} placeholder="e.g. Disgraced sky-knight seeking redemption" />
              <LabeledField label="Goal (one line)" value={pcGoal} onChange={setPcGoal} placeholder="e.g. Find who betrayed my order" />
            </Screen>
          )}

          {step === 5 && (
            <Screen
              title="Your First Front"
              subtitle="Who or what is the big mover of this campaign? Pick one. You can add more later."
            >
              <LabeledField label="Front name" value={frontName} onChange={setFrontName} placeholder="e.g. Volixus the Hobgoblin Half-Dragon" autoFocus />
              <LabeledField label="Goal" value={frontGoal} onChange={setFrontGoal} placeholder="e.g. Construct the infernal war machine" />
              <LabeledField label="First sign" value={frontFirstSign} onChange={setFrontFirstSign} placeholder="e.g. Servants are recovering ancient knowledge from a lost library" />
            </Screen>
          )}

          {step === 6 && (
            <FinishScreen
              name={name}
              pitch={pitch}
              truthsCount={filledTruths.length}
              pcName={pcName}
              frontName={frontName}
              skipped={skipped}
              onOpen={finalize}
            />
          )}
        </div>
      </div>

      {step <= TOTAL_STEPS && (
        <footer className="border-t border-rule bg-parchment-soft sticky bottom-0 px-4 sm:px-8 py-3 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={back}
            disabled={step === 1}
            className="text-xs px-3 py-1.5 rounded border border-rule text-ink-soft hover:bg-parchment-deep font-display uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-40"
          >
            <ArrowLeft size={12} /> Back
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => advance(true)}
              className="text-xs px-3 py-1.5 rounded border border-rule text-ink-mute hover:bg-parchment-deep font-display uppercase tracking-wider"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={() => advance(false)}
              className="text-xs px-4 py-1.5 rounded border border-crimson/70 bg-crimson/10 text-crimson hover:bg-crimson hover:text-parchment font-display uppercase tracking-wider flex items-center gap-1.5"
            >
              Next <ArrowRight size={12} />
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}

function Screen({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h2 className="font-display text-2xl sm:text-3xl text-crimson tracking-wide">{title}</h2>
        <p className="font-serif italic text-ink-soft">{subtitle}</p>
      </div>
      <div className="space-y-3 pt-2">{children}</div>
    </div>
  );
}

function LabeledField({
  label, value, onChange, placeholder, autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <div className="text-xs font-display uppercase tracking-wider text-brass-deep mb-1">{label}</div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={1}
        autoFocus={autoFocus}
        className="w-full bg-parchment border border-rule rounded px-3 py-2 text-ink font-serif text-sm placeholder:text-ink-faint placeholder:italic focus:border-crimson focus:outline-none resize-none [field-sizing:content]"
      />
    </div>
  );
}

function FinishScreen({
  name, pitch, truthsCount, pcName, frontName, skipped, onOpen,
}: {
  name: string;
  pitch: string;
  truthsCount: number;
  pcName: string;
  frontName: string;
  skipped: Record<Step, boolean>;
  onOpen: () => void;
}) {
  const summary: Array<{ label: string; value: string; ok: boolean }> = [
    { label: 'Campaign', value: name || '—', ok: !skipped[1] && !!name.trim() },
    { label: 'Pitch', value: pitch ? (pitch.length > 60 ? pitch.slice(0, 60) + '…' : pitch) : '—', ok: !skipped[2] && !!pitch.trim() },
    { label: 'Truths', value: truthsCount > 0 ? String(truthsCount) : '—', ok: !skipped[3] && truthsCount > 0 },
    { label: 'PC', value: pcName || '—', ok: !skipped[4] && !!pcName.trim() },
    { label: 'Front', value: frontName || '—', ok: !skipped[5] && !!frontName.trim() },
  ];

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="font-display text-2xl sm:text-3xl text-crimson tracking-wide">Ready to Begin</h2>
        <p className="font-serif italic text-ink-soft">Here&apos;s what we put in place. You can change any of it from the editor.</p>
      </div>
      <ul className="space-y-1.5">
        {summary.map((row) => (
          <li key={row.label} className="flex items-baseline gap-2 text-sm font-serif">
            <span className={`w-4 ${row.ok ? 'text-moss' : 'text-ink-mute'}`}>{row.ok ? <Check size={14} className="inline" /> : '—'}</span>
            <span className="font-display uppercase tracking-wider text-[10px] text-brass-deep w-20 flex-shrink-0">{row.label}</span>
            <span className="text-ink-soft min-w-0 break-words">{row.value}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onOpen}
        className="w-full text-sm px-4 py-2.5 rounded border border-crimson/70 bg-crimson/10 text-crimson hover:bg-crimson hover:text-parchment font-display uppercase tracking-wider"
      >
        Open Campaign Editor
      </button>
    </div>
  );
}

// Helper used by the parent to materialize a Character object for the PC patch.
export function makeWizardPC(name: string, concept: string): Character {
  const base = emptyCharacter();
  return {
    ...base,
    id: makeCharacterId(),
    name,
    notes: concept || '',
  };
}
