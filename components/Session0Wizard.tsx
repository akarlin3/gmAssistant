'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, X, Sparkles, User, Users, Plus, Trash2 } from 'lucide-react';
import type { WizardPatch } from '@/lib/session0';

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

  // Screen 1: Name and Mode
  const [name, setName] = useState(initialName || 'New Campaign');
  const [wizardSoloMode, setWizardSoloMode] = useState<boolean>(initialSoloMode);

  // Screen 2: Pitch
  const [pitch, setPitch] = useState('');

  // Screen 3: World Truths
  const [truthsMode, setTruthsMode] = useState<'three' | 'six'>(
    initialSoloMode ? 'three' : 'six',
  );
  const [truths, setTruths] = useState<string[]>(['', '', '', '', '', '']);

  // Sync truthsMode when wizardSoloMode changes
  useEffect(() => {
    setTruthsMode(wizardSoloMode ? 'three' : 'six');
  }, [wizardSoloMode]);

  // Screen 4: Solo Character
  const [pcName, setPcName] = useState('');
  const [pcConcept, setPcConcept] = useState('');
  const [pcGoal, setPcGoal] = useState('');

  // Screen 4: Group Characters roster
  const [groupPcs, setGroupPcs] = useState<Array<{ name: string; player: string; concept: string; goal: string }>>([
    { name: '', player: '', concept: '', goal: '' }
  ]);

  // Screen 5: Front
  const [frontName, setFrontName] = useState('');
  const [frontGoal, setFrontGoal] = useState('');
  const [frontFirstSign, setFrontFirstSign] = useState('');

  // Tracks which screens were skipped vs filled
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
    const patch: WizardPatch = {
      soloMode: wizardSoloMode,
    };
    if (!skipped[1] && name.trim()) patch.name = name.trim();
    if (!skipped[2] && pitch.trim()) patch.pitch = pitch.trim();
    if (!skipped[3] && filledTruths.length > 0) patch.truths = filledTruths;
    
    if (wizardSoloMode) {
      if (!skipped[4] && pcName.trim()) {
        patch.pc = { name: pcName.trim(), concept: pcConcept.trim(), goal: pcGoal.trim() };
      }
    } else {
      const filledPcs = groupPcs.filter(p => p.name.trim());
      if (!skipped[4] && filledPcs.length > 0) {
        patch.pcs = filledPcs.map(p => ({
          name: p.name.trim(),
          player: p.player.trim(),
          concept: p.concept.trim(),
          goal: p.goal.trim(),
        }));
      }
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
    <div className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-parchment-soft">
      {/* Top bar */}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-rule bg-parchment-soft px-4 py-3 sm:px-8">
        <div className="flex min-w-0 items-center gap-2">
          <Sparkles size={14} className="flex-shrink-0 text-brass-deep" />
          <span className="font-display text-xs uppercase tracking-wider text-brass-deep">
            Setup
            {step <= TOTAL_STEPS && <span className="text-ink-mute"> — Step {step} of {TOTAL_STEPS}</span>}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {/* Step dots */}
          <div className="hidden items-center gap-1.5 sm:flex">
            {[1, 2, 3, 4, 5].map((n) => (
              <span
                key={n}
                className={`size-2 rounded-full ${
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
            className="rounded p-1.5 text-ink-mute hover:bg-parchment-deep hover:text-crimson"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <div className="flex-1 px-4 py-6 sm:px-8 sm:py-10">
        <div className="mx-auto max-w-2xl">
          {step === 1 && (
            <Screen
              title="Welcome to your new campaign"
              subtitle="Let's lay down the foundation. You can adjust all of this later in the campaign editor."
            >
              <div className="space-y-5">
                <div>
                  <div className="mb-1 font-display text-xs uppercase tracking-wider text-brass-deep">Campaign Title</div>
                  <textarea
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    rows={1}
                    autoFocus
                    placeholder="e.g. The Last Wells"
                    className="w-full resize-none rounded border border-rule bg-parchment px-3 py-2 font-serif text-ink [field-sizing:content] placeholder:italic placeholder:text-ink-faint focus:border-crimson focus:outline-none"
                  />
                </div>

                <div className="space-y-2">
                  <div className="font-display text-xs uppercase tracking-wider text-brass-deep">Choose Campaign Type</div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {/* Solo Card */}
                    <button
                      type="button"
                      onClick={() => setWizardSoloMode(true)}
                      className={`flex flex-col justify-between rounded border p-4 text-left transition-all duration-200 hover:shadow-md ${
                        wizardSoloMode
                          ? 'border-crimson bg-crimson/5 shadow-sm ring-1 ring-crimson/30'
                          : 'border-rule bg-parchment hover:border-brass/60'
                      }`}
                    >
                      <div>
                        <div className="mb-2 flex items-center gap-2">
                          <div className={`rounded p-1.5 ${wizardSoloMode ? 'bg-crimson/15 text-crimson' : 'bg-parchment-deep text-ink-soft'}`}>
                            <User size={18} />
                          </div>
                          <span className="font-display font-semibold tracking-wide text-ink">Solo Campaign</span>
                        </div>
                        <p className="mb-3 font-serif text-xs italic leading-relaxed text-ink-soft">
                          Designed for 1 player (either GM-less or with 1 GM). Streamlined requirements and tailored guidelines for lone survival.
                        </p>
                        <ul className="list-inside list-disc space-y-1 pl-1 font-sans text-[11px] text-ink-soft">
                          <li><strong>3</strong> World Truths recommended</li>
                          <li><strong>1</strong> Central Player Character focus</li>
                          <li>Sidekick companions enabled</li>
                          <li>Lighter, faster preparation targets</li>
                        </ul>
                      </div>
                      <div className="mt-4 flex items-center gap-1.5 self-end">
                        <span className={`rounded border px-2 py-0.5 font-display text-[10px] uppercase tracking-wider ${
                          wizardSoloMode ? 'border-crimson bg-crimson/10 text-crimson' : 'border-rule text-ink-mute'
                        }`}>
                          {wizardSoloMode ? 'Selected' : 'Select'}
                        </span>
                      </div>
                    </button>

                    {/* Group Card */}
                    <button
                      type="button"
                      onClick={() => setWizardSoloMode(false)}
                      className={`flex flex-col justify-between rounded border p-4 text-left transition-all duration-200 hover:shadow-md ${
                        !wizardSoloMode
                          ? 'border-crimson bg-crimson/5 shadow-sm ring-1 ring-crimson/30'
                          : 'border-rule bg-parchment hover:border-brass/60'
                      }`}
                    >
                      <div>
                        <div className="mb-2 flex items-center gap-2">
                          <div className={`rounded p-1.5 ${!wizardSoloMode ? 'bg-crimson/15 text-crimson' : 'bg-parchment-deep text-ink-soft'}`}>
                            <Users size={18} />
                          </div>
                          <span className="font-display font-semibold tracking-wide text-ink">Group Campaign</span>
                        </div>
                        <p className="mb-3 font-serif text-xs italic leading-relaxed text-ink-soft">
                          The classic experience for 2-6 players plus 1 GM. Full collaborative worldbuilding and party dynamics tracking.
                        </p>
                        <ul className="list-inside list-disc space-y-1 pl-1 font-sans text-[11px] text-ink-soft">
                          <li><strong>6</strong> World Truths recommended</li>
                          <li>Full Player Character roster</li>
                          <li>Traditional Session 0 safety tools</li>
                          <li>Standard scale preparation targets</li>
                        </ul>
                      </div>
                      <div className="mt-4 flex items-center gap-1.5 self-end">
                        <span className={`rounded border px-2 py-0.5 font-display text-[10px] uppercase tracking-wider ${
                          !wizardSoloMode ? 'border-crimson bg-crimson/10 text-crimson' : 'border-rule text-ink-mute'
                        }`}>
                          {!wizardSoloMode ? 'Selected' : 'Select'}
                        </span>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
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
                className="w-full resize-none rounded border border-rule bg-parchment px-3 py-2 font-serif text-ink [field-sizing:content] placeholder:italic placeholder:text-ink-faint focus:border-crimson focus:outline-none"
              />
              <div className="space-y-1 pt-2">
                <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Examples</div>
                {PITCH_EXAMPLES.map((ex) => (
                  <div key={ex} className="font-serif text-sm italic text-ink-soft">{ex}</div>
                ))}
              </div>
            </Screen>
          )}

          {step === 3 && (
            <Screen
              title={truthsMode === 'three' ? "World Truths (Solo)" : "World Truths (Group)"}
              subtitle={truthsMode === 'three' ? "Things that are non-negotiably true. Solo campaigns thrive on 3 highly focused truths." : "Things that are non-negotiably true. Group campaigns use 6 truths to detail the active landscape."}
            >
              <div className="flex w-fit items-center gap-1 rounded border border-rule bg-parchment-deep/30 p-1">
                <button
                  type="button"
                  onClick={() => setTruthsMode('three')}
                  className={`rounded px-2.5 py-1 font-display text-xs uppercase tracking-wider ${
                    truthsMode === 'three' ? 'bg-wine/15 text-wine' : 'text-ink-soft hover:bg-parchment'
                  }`}
                >
                  Three (solo)
                </button>
                <button
                  type="button"
                  onClick={() => setTruthsMode('six')}
                  className={`rounded px-2.5 py-1 font-display text-xs uppercase tracking-wider ${
                    truthsMode === 'six' ? 'bg-brass-deep/15 text-brass-deep' : 'text-ink-soft hover:bg-parchment'
                  }`}
                >
                  Six (group)
                </button>
              </div>
              <div className="space-y-2 pt-1">
                {Array.from({ length: truthsCount }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-5 text-right font-display text-xs text-brass-deep">{i + 1}.</span>
                    <textarea
                      value={truths[i] || ''}
                      onChange={(e) => {
                        const next = [...truths]; next[i] = e.target.value; setTruths(next);
                      }}
                      rows={1}
                      placeholder={TRUTH_PLACEHOLDERS[i % TRUTH_PLACEHOLDERS.length]}
                      className="flex-1 resize-none rounded border border-rule bg-parchment px-3 py-2 font-serif text-sm text-ink [field-sizing:content] placeholder:italic placeholder:text-ink-faint focus:border-crimson focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            </Screen>
          )}

          {step === 4 && wizardSoloMode && (
            <Screen
              title="Your Character"
              subtitle="Just enough to start. Since this is a solo campaign, you will focus on one central protagonist."
            >
              <LabeledField label="Name" value={pcName} onChange={setPcName} placeholder="e.g. Wren of the Salt Roads" autoFocus />
              <LabeledField label="Concept (one line)" value={pcConcept} onChange={setPcConcept} placeholder="e.g. Disgraced sky-knight seeking redemption" />
              <LabeledField label="Goal (one line)" value={pcGoal} onChange={setPcGoal} placeholder="e.g. Find who betrayed my order" />
              <div className="mt-3 rounded border border-wine/10 bg-wine/5 p-3 font-serif text-xs italic text-ink-soft">
                <span className="mr-1 block font-display text-[10px] font-semibold uppercase not-italic tracking-wider text-wine sm:inline">Solo Note:</span>
                Solo level-1 characters are vulnerable. You can add a Tasha's-style Sidekick companion to level with you in the editor later.
              </div>
            </Screen>
          )}

          {step === 4 && !wizardSoloMode && (
            <Screen
              title="Initial Player Roster"
              subtitle="Add the players and characters in your group (optional). You can leave this blank and collaboratively fill it out in your Session 0."
            >
              <div className="space-y-3 pt-2">
                <div className="hidden grid-cols-12 gap-2 px-1 font-display text-[10px] uppercase tracking-wider text-brass-deep sm:grid">
                  <div className="col-span-3">Player</div>
                  <div className="col-span-3">Character Name</div>
                  <div className="col-span-3">Concept</div>
                  <div className="col-span-2">Goal</div>
                  <div className="col-span-1 text-center">Delete</div>
                </div>

                <div className="space-y-2">
                  {groupPcs.map((pc, idx) => (
                    <div key={idx} className="flex flex-col gap-2 rounded border border-rule bg-parchment-deep/30 p-2 sm:grid sm:grid-cols-12 sm:border-0 sm:bg-transparent sm:p-2.5">
                      <div className="col-span-3">
                        <span className="mb-0.5 block font-display text-[9px] uppercase tracking-wider text-brass-deep sm:hidden">Player</span>
                        <input
                          type="text"
                          value={pc.player}
                          onChange={(e) => {
                            const next = [...groupPcs];
                            next[idx].player = e.target.value;
                            setGroupPcs(next);
                          }}
                          placeholder="e.g. Alex"
                          className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-sm text-ink focus:border-crimson focus:outline-none"
                        />
                      </div>
                      <div className="col-span-3">
                        <span className="mb-0.5 block font-display text-[9px] uppercase tracking-wider text-brass-deep sm:hidden">Character Name</span>
                        <input
                          type="text"
                          value={pc.name}
                          onChange={(e) => {
                            const next = [...groupPcs];
                            next[idx].name = e.target.value;
                            setGroupPcs(next);
                          }}
                          placeholder="e.g. Brog the Stout"
                          className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-sm text-ink focus:border-crimson focus:outline-none"
                        />
                      </div>
                      <div className="col-span-3">
                        <span className="mb-0.5 block font-display text-[9px] uppercase tracking-wider text-brass-deep sm:hidden">Concept</span>
                        <input
                          type="text"
                          value={pc.concept}
                          onChange={(e) => {
                            const next = [...groupPcs];
                            next[idx].concept = e.target.value;
                            setGroupPcs(next);
                          }}
                          placeholder="e.g. Jolly cleric of light"
                          className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-sm text-ink focus:border-crimson focus:outline-none"
                        />
                      </div>
                      <div className="col-span-2">
                        <span className="mb-0.5 block font-display text-[9px] uppercase tracking-wider text-brass-deep sm:hidden">Goal</span>
                        <input
                          type="text"
                          value={pc.goal}
                          onChange={(e) => {
                            const next = [...groupPcs];
                            next[idx].goal = e.target.value;
                            setGroupPcs(next);
                          }}
                          placeholder="e.g. Rebuild temple"
                          className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-sm text-ink focus:border-crimson focus:outline-none"
                        />
                      </div>
                      <div className="col-span-1 flex items-center justify-center pt-2 sm:pt-0">
                        <button
                          type="button"
                          onClick={() => {
                            setGroupPcs(groupPcs.filter((_, i) => i !== idx));
                          }}
                          className="rounded p-1 text-ink-mute transition-colors hover:bg-parchment-deep hover:text-crimson"
                          title="Remove player"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setGroupPcs([...groupPcs, { name: '', player: '', concept: '', goal: '' }]);
                    }}
                    className="flex items-center gap-1 rounded border border-brass-deep px-2.5 py-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-parchment-deep"
                  >
                    <Plus size={12} /> Add PC
                  </button>
                  <span className="font-serif text-[10px] italic text-ink-mute">
                    You can also generate characters collaboratively inside the campaign editor later.
                  </span>
                </div>

                <div className="mt-2 rounded border border-brass-deep/10 bg-brass-deep/5 p-3 font-serif text-xs italic text-ink-soft">
                  <span className="mr-1 block font-display text-[10px] font-semibold uppercase not-italic tracking-wider text-brass-deep sm:inline">Collaborative Session 0:</span>
                  Traditional group play is most successful when players craft characters together. Hook their backgrounds into the world truths you set in Step 3!
                </div>
              </div>
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
              pcsCount={groupPcs.filter(p => p.name.trim()).length}
              soloMode={wizardSoloMode}
              frontName={frontName}
              skipped={skipped}
              onOpen={finalize}
            />
          )}
        </div>
      </div>

      {step <= TOTAL_STEPS && (
        <footer className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-rule bg-parchment-soft px-4 py-3 sm:px-8">
          <button
            type="button"
            onClick={back}
            disabled={step === 1}
            className="flex items-center gap-1.5 rounded border border-rule px-3 py-1.5 font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep disabled:opacity-40"
          >
            <ArrowLeft size={12} /> Back
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => advance(true)}
              className="rounded border border-rule px-3 py-1.5 font-display text-xs uppercase tracking-wider text-ink-mute hover:bg-parchment-deep"
            >
              Skip
            </button>
            <button
              type="button"
              onClick={() => advance(false)}
              className="flex items-center gap-1.5 rounded border border-crimson/70 bg-crimson/10 px-4 py-1.5 font-display text-xs uppercase tracking-wider text-crimson hover:bg-crimson hover:text-parchment"
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
        <h2 className="font-display text-2xl tracking-wide text-crimson sm:text-3xl">{title}</h2>
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
      <div className="mb-1 font-display text-xs uppercase tracking-wider text-brass-deep">{label}</div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={1}
        autoFocus={autoFocus}
        className="w-full resize-none rounded border border-rule bg-parchment px-3 py-2 font-serif text-sm text-ink [field-sizing:content] placeholder:italic placeholder:text-ink-faint focus:border-crimson focus:outline-none"
      />
    </div>
  );
}

function FinishScreen({
  name, pitch, truthsCount, pcName, pcsCount, soloMode, frontName, skipped, onOpen,
}: {
  name: string;
  pitch: string;
  truthsCount: number;
  pcName: string;
  pcsCount: number;
  soloMode: boolean;
  frontName: string;
  skipped: Record<Step, boolean>;
  onOpen: () => void;
}) {
  const pcSummaryValue = soloMode 
    ? (pcName || '—') 
    : (pcsCount > 0 ? `${pcsCount} Player character${pcsCount === 1 ? '' : 's'}` : '—');

  const summary: Array<{ label: string; value: string; ok: boolean }> = [
    { label: 'Campaign', value: name || '—', ok: !skipped[1] && !!name.trim() },
    { label: 'Mode', value: soloMode ? 'Solo Play' : 'Group Play', ok: true },
    { label: 'Pitch', value: pitch ? (pitch.length > 60 ? pitch.slice(0, 60) + '…' : pitch) : '—', ok: !skipped[2] && !!pitch.trim() },
    { label: 'Truths', value: truthsCount > 0 ? String(truthsCount) : '—', ok: !skipped[3] && truthsCount > 0 },
    { label: 'PC Roster', value: pcSummaryValue, ok: !skipped[4] && (soloMode ? !!pcName.trim() : pcsCount > 0) },
    { label: 'Front', value: frontName || '—', ok: !skipped[5] && !!frontName.trim() },
  ];

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h2 className="font-display text-2xl tracking-wide text-crimson sm:text-3xl">Ready to Begin</h2>
        <p className="font-serif italic text-ink-soft">Here&apos;s what we put in place. You can change any of it from the editor.</p>
      </div>
      <ul className="space-y-1.5">
        {summary.map((row) => (
          <li key={row.label} className="flex items-baseline gap-2 font-serif text-sm">
            <span className={`w-4 ${row.ok ? 'text-moss' : 'text-ink-mute'}`}>{row.ok ? <Check size={14} className="inline" /> : '—'}</span>
            <span className="w-20 flex-shrink-0 font-display text-[10px] uppercase tracking-wider text-brass-deep">{row.label}</span>
            <span className="min-w-0 break-words text-ink-soft">{row.value}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onOpen}
        className="w-full rounded border border-crimson/70 bg-crimson/10 px-4 py-2.5 font-display text-sm uppercase tracking-wider text-crimson hover:bg-crimson hover:text-parchment"
      >
        Open Campaign Editor
      </button>
    </div>
  );
}
