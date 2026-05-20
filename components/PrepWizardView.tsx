'use client';

import { useMemo } from 'react';
import { X, ArrowLeft, ArrowRight, SkipForward, Check, Flag } from 'lucide-react';
import type { SessionLogEntry } from '@/lib/sessionLog';
import { nextSessionNumber } from '@/lib/sessionLog';
import {
  type PrepWizardRun,
  unrevealedSecrets,
  makePrepWizardRunId,
} from '@/lib/prepWizard';
import { TARGETS } from '@/lib/prepTargets';
import Step1ReviewCharacters from './prepWizard/Step1ReviewCharacters';
import Step2StrongStart from './prepWizard/Step2StrongStart';
import Step3Scenes from './prepWizard/Step3Scenes';
import Step4Secrets from './prepWizard/Step4Secrets';
import Step5Locations from './prepWizard/Step5Locations';
import Step6NPCs from './prepWizard/Step6NPCs';
import Step7Monsters from './prepWizard/Step7Monsters';
import Step8MagicItems from './prepWizard/Step8MagicItems';
import StepSummary from './prepWizard/StepSummary';

type Get = (k: string, fb: any) => any;
type SetVal = (k: string, v: any) => void;

type Props = {
  get: Get;
  setVal: SetVal;
  soloMode: boolean;
  onExit: () => void;
  onClose: () => void;
  onStartSession: () => void;
};

const TOTAL_STEPS = 8;
const SUMMARY_STEP = 9;
const RUN_CAP = 20;

const SCENE_TARGETS    = TARGETS.scenes;
const SECRET_TARGETS   = TARGETS.secrets;
const LOCATION_TARGETS = TARGETS.locations;
const NPC_TARGETS      = TARGETS.npcs;
const MONSTER_TARGETS  = TARGETS.monsters;
const ITEM_TARGETS     = TARGETS.items;

export default function PrepWizardView({
  get, setVal, soloMode, onExit, onClose, onStartSession,
}: Props) {
  const step = (get('__prepWizardStep', 1) as number) || 1;
  const completed = (get('__prepWizardCompleted', []) as number[]) || [];
  const notes = (get('__prepWizardStepNotes', {}) as Record<string, string>) || {};

  const logs = (get('sessionLogV2', []) as SessionLogEntry[]) || [];
  const sessionNumber = useMemo(() => nextSessionNumber(logs), [logs]);

  const setStep = (n: number) => setVal('__prepWizardStep', Math.max(1, Math.min(SUMMARY_STEP, n)));
  const markCompleted = (n: number) => {
    if (completed.includes(n)) return;
    setVal('__prepWizardCompleted', [...completed, n].sort((a, b) => a - b));
  };

  const hasEdits = Object.values(notes).some(v => v && v.trim().length > 0) || completed.length > 0;

  const tryExit = () => {
    if (hasEdits && !confirm('Exit without finishing? Your prep edits are already saved, but the wizard\'s step-by-step notes will be lost.')) return;
    onExit();
  };

  const persistRun = () => {
    const secretsList = (get('secrets', []) as string[]) || [];
    const snapshot: PrepWizardRun['prepSnapshot'] = {
      pcGoals: ((get('pcGoals', []) as any[]) || []).length,
      scenes: ((get('scenes', []) as string[]) || []).length,
      unrevealedSecrets: unrevealedSecrets(secretsList, logs).length,
      locations: ((get('locations', []) as any[]) || []).length,
      npcs: ((get('npcs', []) as any[]) || []).length,
      monsters: ((get('monsters', []) as string[]) || []).length,
      magicItems: ((get('items', []) as string[]) || []).length,
    };
    const run: PrepWizardRun = {
      id: makePrepWizardRunId(),
      forSessionNumber: sessionNumber,
      completedAt: Date.now(),
      stepNotes: Object.fromEntries(
        Object.entries(notes)
          .map(([k, v]) => [Number(k), v])
          .filter(([_, v]) => typeof v === 'string' && (v as string).trim().length > 0),
      ) as Record<number, string>,
      stepsCompleted: completed,
      prepSnapshot: snapshot,
    };
    const prior = (get('prepWizardRuns', []) as PrepWizardRun[]) || [];
    const next = [...prior, run].slice(-RUN_CAP);
    setVal('prepWizardRuns', next);
  };

  const finishToSummary = () => {
    markCompleted(TOTAL_STEPS);
    setStep(SUMMARY_STEP);
  };
  const handleSaveAndClose = () => {
    persistRun();
    onClose();
  };
  const handleStartSession = () => {
    persistRun();
    onStartSession();
  };

  const onNext = () => {
    if (step === TOTAL_STEPS) {
      finishToSummary();
      return;
    }
    if (step === SUMMARY_STEP) {
      handleSaveAndClose();
      return;
    }
    markCompleted(step);
    setStep(step + 1);
  };

  const onSkip = () => {
    if (step === TOTAL_STEPS) {
      finishToSummary();
      return;
    }
    if (step === SUMMARY_STEP) return;
    setStep(step + 1);
  };

  const onBack = () => {
    if (step === SUMMARY_STEP) {
      setStep(TOTAL_STEPS);
      return;
    }
    setStep(step - 1);
  };

  const isSummary = step === SUMMARY_STEP;
  const isLastChecklist = step === TOTAL_STEPS;

  return (
    <main className="min-h-screen p-3 sm:p-5 md:p-6">
      <div className="max-w-3xl mx-auto space-y-4">
        <header className="space-y-3 pb-3 border-b border-rule">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <h1 className="font-display text-lg sm:text-xl tracking-wide text-ink">
                Prep Session {sessionNumber}
              </h1>
              <span className="text-xs text-ink-mute font-serif italic">
                {isSummary ? 'Summary' : `Step ${step} of ${TOTAL_STEPS}`}
              </span>
            </div>
            <button
              onClick={tryExit}
              className="text-ink-mute hover:text-crimson p-1"
              title="Exit wizard"
            >
              <X size={18} />
            </button>
          </div>
          <ProgressStrip step={step} completed={completed} onJump={setStep} />
        </header>

        <div className="bg-parchment-soft border border-rule rounded-lg shadow-page p-4 sm:p-6">
          <StepBody
            step={step}
            get={get}
            setVal={setVal}
            soloMode={soloMode}
            onBackToStep8={() => setStep(TOTAL_STEPS)}
            onSaveAndClose={handleSaveAndClose}
            onStartSession={handleStartSession}
          />
        </div>

        {!isSummary && (
          <footer className="flex items-center justify-between gap-2 pt-2">
            <button
              onClick={onBack}
              disabled={step === 1}
              className="text-xs px-3 py-1.5 rounded border border-rule text-ink-soft hover:bg-parchment-deep font-display uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ArrowLeft size={12} /> Back
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={onSkip}
                className="text-xs px-3 py-1.5 rounded border border-rule text-ink-mute hover:text-ink hover:bg-parchment-deep font-display uppercase tracking-wider flex items-center gap-1.5"
                title="Skip without marking completed"
              >
                <SkipForward size={12} /> Skip
              </button>
              <button
                onClick={onNext}
                className="text-xs px-3 py-1.5 rounded border border-crimson/60 bg-crimson/10 text-crimson hover:bg-crimson hover:text-parchment font-display uppercase tracking-wider flex items-center gap-1.5"
              >
                {isLastChecklist ? <><Flag size={12} /> Finish Prep</> : <>Next <ArrowRight size={12} /></>}
              </button>
            </div>
          </footer>
        )}
      </div>
    </main>
  );
}

function ProgressStrip({ step, completed, onJump }: { step: number; completed: number[]; onJump: (n: number) => void }) {
  return (
    <ol className="flex items-center gap-1.5">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
        const n = i + 1;
        const isCurrent = n === step;
        const isDone = completed.includes(n);
        return (
          <li key={n} className="flex-1">
            <button
              type="button"
              onClick={() => onJump(n)}
              className={`w-full h-2 rounded-full transition-colors ${
                isCurrent
                  ? 'bg-crimson'
                  : isDone
                    ? 'bg-moss'
                    : 'bg-parchment-deep hover:bg-rule'
              }`}
              title={`Step ${n}${isDone ? ' (completed)' : ''}`}
            />
          </li>
        );
      })}
    </ol>
  );
}

function StepBody({
  step, get, setVal, soloMode, onBackToStep8, onSaveAndClose, onStartSession,
}: {
  step: number;
  get: Get;
  setVal: SetVal;
  soloMode: boolean;
  onBackToStep8: () => void;
  onSaveAndClose: () => void;
  onStartSession: () => void;
}) {
  switch (step) {
    case 1: return <Step1ReviewCharacters get={get} setVal={setVal} />;
    case 2: return <Step2StrongStart get={get} setVal={setVal} />;
    case 3: return (
      <Step3Scenes
        get={get} setVal={setVal} soloMode={soloMode}
        standardTarget={SCENE_TARGETS.standard} soloTarget={SCENE_TARGETS.solo}
      />
    );
    case 4: return (
      <Step4Secrets
        get={get} setVal={setVal} soloMode={soloMode}
        standardTarget={SECRET_TARGETS.standard} soloTarget={SECRET_TARGETS.solo}
      />
    );
    case 5: return (
      <Step5Locations
        get={get} setVal={setVal} soloMode={soloMode}
        standardTarget={LOCATION_TARGETS.standard} soloTarget={LOCATION_TARGETS.solo}
      />
    );
    case 6: return (
      <Step6NPCs
        get={get} setVal={setVal} soloMode={soloMode}
        standardTarget={NPC_TARGETS.standard} soloTarget={NPC_TARGETS.solo}
      />
    );
    case 7: return (
      <Step7Monsters
        get={get} setVal={setVal} soloMode={soloMode}
        standardTarget={MONSTER_TARGETS.standard} soloTarget={MONSTER_TARGETS.solo}
      />
    );
    case 8: return (
      <Step8MagicItems
        get={get} setVal={setVal} soloMode={soloMode}
        standardTarget={ITEM_TARGETS.standard} soloTarget={ITEM_TARGETS.solo}
      />
    );
    case SUMMARY_STEP: return (
      <StepSummary
        get={get}
        onBack={onBackToStep8}
        onSaveAndClose={onSaveAndClose}
        onStartSession={onStartSession}
      />
    );
    default:
      return (
        <div className="text-center py-12 space-y-2">
          <Check size={32} className="mx-auto text-brass-deep" />
          <p className="font-serif text-ink-soft italic">Unknown step.</p>
        </div>
      );
  }
}
