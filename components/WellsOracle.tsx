'use client';

import { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Dices, Zap, Wand2 } from 'lucide-react';
import {
  rollOracle,
  rollComplication,
  isYesResult,
  ODDS_OPTIONS,
  type OracleOdds,
  type OracleRoll,
} from '@/lib/oracle/wells';

// The Wells Oracle — a free-tier, globally-available answer engine. Rendered
// as a floating button that opens a modal. Oracle answers persist to
// data.oracleLog; scene complications are ephemeral (shown until the next
// action) so they stay out of the typed answer log.

type Props = {
  log: OracleRoll[];
  onLog: (next: OracleRoll[]) => void;
  chaos: number;
  onChaosChange: (chaos: number) => void;
  // Position offset so the button doesn't collide with other floating UI
  // (e.g. the initiative button while a session is running).
  raised?: boolean;
  inline?: boolean;
};

const YES_TONE = 'text-moss border-moss/50 bg-moss/10';
const NO_TONE = 'text-crimson border-crimson/50 bg-crimson/10';

function resultTone(result: OracleRoll['result']): string {
  return isYesResult(result) ? YES_TONE : NO_TONE;
}

export default function WellsOracle({ log, onLog, chaos, onChaosChange, raised, inline }: Props) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [odds, setOdds] = useState<OracleOdds>('FiftyFifty');
  const [complication, setComplication] = useState<{ roll: number; text: string } | null>(null);
  const questionRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  useEffect(() => {
    if (open || inline) questionRef.current?.focus();
  }, [open, inline]);

  // Newest first for display.
  const recent = [...log].sort((a, b) => b.timestamp - a.timestamp).slice(0, 12);

  function ask() {
    const entry = rollOracle({ question: question.trim(), odds, chaosFactor: chaos });
    onLog([...log, entry]);
    setComplication(null);
    setQuestion('');
    questionRef.current?.focus();
  }

  function complicate() {
    const { roll, complication: text } = rollComplication();
    setComplication({ roll, text });
  }

  if (inline) {
    return (
      <div className="space-y-4">
        {/* Header */}
        <header className="flex items-center gap-2 rounded border border-rule bg-parchment p-3 shadow-card">
          <Sparkles size={16} className="text-wine animate-pulse" />
          <h2 className="font-display text-lg uppercase tracking-wider text-wine font-semibold">The Wells Oracle</h2>
          <span className="ml-1 text-[10px] italic text-ink-mute">Ask the world a question or complicate a scene</span>
        </header>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
          {/* Left Column: Ask the Oracle */}
          <div className="space-y-4">
            <div className="rounded border border-rule bg-parchment p-4 shadow-card space-y-4">
              {/* Question */}
              <div>
                <label className="mb-1.5 block font-display text-[11px] uppercase tracking-wider text-ink-mute font-semibold">
                  Ask the Oracle
                </label>
                <div className="flex gap-2">
                  <input
                    ref={questionRef}
                    type="text"
                    value={question}
                    data-oracle-question
                    onChange={(e) => setQuestion(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') ask();
                    }}
                    placeholder="Is the door barred from the other side?"
                    className="flex-1 rounded border border-rule bg-parchment-soft px-2.5 py-2 font-serif text-sm text-ink placeholder:text-ink-faint focus:border-wine focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={ask}
                    className="flex items-center gap-1.5 rounded bg-wine px-4 py-2 font-display text-xs uppercase tracking-wider text-parchment hover:bg-crimson transition-colors"
                  >
                    <Dices size={14} /> Ask
                  </button>
                </div>
              </div>

              {/* Odds + Chaos */}
              <div className="flex flex-col gap-4 sm:flex-row">
                <div className="flex-1">
                  <label className="mb-1 block font-display text-[11px] uppercase tracking-wider text-ink-mute font-semibold">
                    Odds
                  </label>
                  <select
                    value={odds}
                    data-oracle-odds
                    onChange={(e) => setOdds(e.target.value as OracleOdds)}
                    className="w-full rounded border border-rule bg-parchment-soft px-2.5 py-2 font-serif text-sm text-ink focus:border-wine focus:outline-none"
                  >
                    {ODDS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="mb-1 flex items-center justify-between font-display text-[11px] uppercase tracking-wider text-ink-mute font-semibold">
                    <span>Chaos Factor</span>
                    <span className="text-wine font-bold">{chaos}</span>
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={9}
                    step={1}
                    value={chaos}
                    data-oracle-chaos
                    onChange={(e) => onChaosChange(Number(e.target.value))}
                    className="mt-2 w-full accent-wine cursor-pointer"
                  />
                  <div className="flex justify-between font-serif text-[10px] text-ink-faint">
                    <span>Calm</span>
                    <span>Chaotic</span>
                  </div>
                </div>
              </div>

              {/* Complicate Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={complicate}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 rounded border border-wine/50 px-3.5 py-2 font-display text-xs uppercase tracking-wider text-wine hover:bg-wine/10 transition-colors"
                >
                  <Zap size={14} /> Complicate Scene
                </button>
              </div>
            </div>

            {/* Complication (ephemeral) */}
            {complication && (
              <div className="flex items-start gap-2.5 rounded border border-wine/40 bg-wine/5 p-3.5 text-sm shadow-card animate-fadeIn">
                <Wand2 size={16} className="mt-0.5 flex-shrink-0 text-wine animate-pulse" />
                <div className="font-serif text-ink-soft">
                  <span className="font-display text-xs uppercase tracking-wider text-wine font-semibold">
                    Complication (d100: {complication.roll}) ·{' '}
                  </span>
                  {complication.text}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Recent Answers */}
          <div className="rounded border border-rule bg-parchment p-4 shadow-card flex flex-col h-[calc(100vh-240px)] min-h-[450px] lg:h-[580px]">
            <div className="font-display text-[11px] uppercase tracking-wider text-ink-mute font-semibold border-b border-rule pb-2 mb-3">
              Recent Answers
            </div>
            <div className="flex-1 overflow-y-auto pr-1 hide-scrollbar">
              {recent.length === 0 ? (
                <p className="py-8 text-center font-serif text-sm italic text-ink-faint">
                  Ask the world a question to begin.
                </p>
              ) : (
                <ul className="space-y-3">
                  {recent.map((entry, i) => (
                    <li
                      key={entry.id}
                      data-oracle-result
                      data-oracle-result-index={i}
                      className="rounded border border-rule bg-parchment-soft p-3 space-y-2 hover:border-wine/30 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`rounded-sm border px-2 py-0.5 font-display text-[10px] uppercase tracking-wider font-semibold ${resultTone(
                            entry.result,
                          )}`}
                        >
                          {entry.result}
                        </span>
                        <span className="font-serif text-[10px] text-ink-faint">
                          d100: {entry.roll} / {entry.threshold} · CF {entry.chaosFactor}
                        </span>
                      </div>
                      {entry.question && (
                        <p className="font-serif text-sm italic text-ink">
                          &ldquo;{entry.question}&rdquo;
                        </p>
                      )}
                      {entry.randomEvent && (
                        <div className="flex items-start gap-1.5 rounded border border-wine/30 bg-wine/5 px-2 py-1.5">
                          <Sparkles size={12} className="mt-0.5 flex-shrink-0 text-wine" />
                          <p className="font-serif text-xs text-ink-soft">
                            <span className="font-display text-[10px] uppercase tracking-wider text-wine font-semibold">
                              Random Event ·{' '}
                            </span>
                            {entry.randomEvent.focus}: {entry.randomEvent.action} /{' '}
                            {entry.randomEvent.subject}
                          </p>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open the Wells Oracle"
        title="Wells Oracle — ask the world a question"
        data-oracle-open
        className={`fixed right-4 z-30 flex items-center gap-1.5 rounded-full border border-wine/70 bg-wine px-3 py-2 font-display text-xs uppercase tracking-wider text-parchment shadow-page transition-all hover:bg-crimson ${
          raised ? 'bottom-[140px]' : 'bottom-4'
        }`}
      >
        <Sparkles size={14} /> Oracle
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/40 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Wells Oracle"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="my-auto w-full max-w-lg rounded-lg border border-wine/40 bg-parchment shadow-page">
            <header className="flex items-center justify-between border-b border-rule px-4 py-3">
              <div className="flex items-center gap-2 text-wine">
                <Sparkles size={16} />
                <h2 className="font-display text-lg uppercase tracking-wider">The Wells Oracle</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded p-1 text-ink-mute hover:bg-parchment-deep hover:text-ink"
              >
                <X size={18} />
              </button>
            </header>

            <div className="space-y-4 p-4">
              {/* Question */}
              <div>
                <label className="mb-1 block font-display text-[11px] uppercase tracking-wider text-ink-mute">
                  Question
                </label>
                <input
                  ref={questionRef}
                  type="text"
                  value={question}
                  data-oracle-question
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') ask();
                  }}
                  placeholder="Is the door barred from the other side?"
                  className="w-full rounded border border-rule bg-parchment-soft px-2.5 py-2 font-serif text-sm text-ink placeholder:text-ink-faint focus:border-wine focus:outline-none"
                />
              </div>

              {/* Odds + Chaos */}
              <div className="flex flex-col gap-3 sm:flex-row">
                <div className="flex-1">
                  <label className="mb-1 block font-display text-[11px] uppercase tracking-wider text-ink-mute">
                    Odds
                  </label>
                  <select
                    value={odds}
                    data-oracle-odds
                    onChange={(e) => setOdds(e.target.value as OracleOdds)}
                    className="w-full rounded border border-rule bg-parchment-soft px-2.5 py-2 font-serif text-sm text-ink focus:border-wine focus:outline-none"
                  >
                    {ODDS_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="mb-1 flex items-center justify-between font-display text-[11px] uppercase tracking-wider text-ink-mute">
                    <span>Chaos Factor</span>
                    <span className="text-wine">{chaos}</span>
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={9}
                    step={1}
                    value={chaos}
                    data-oracle-chaos
                    onChange={(e) => onChaosChange(Number(e.target.value))}
                    className="mt-2 w-full accent-wine"
                  />
                  <div className="flex justify-between font-serif text-[10px] text-ink-faint">
                    <span>Calm</span>
                    <span>Chaotic</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={ask}
                  className="flex items-center gap-1.5 rounded bg-wine px-4 py-2 font-display text-xs uppercase tracking-wider text-parchment hover:bg-crimson"
                >
                  <Dices size={14} /> Ask
                </button>
                <button
                  type="button"
                  onClick={complicate}
                  className="flex items-center gap-1.5 rounded border border-wine/50 px-3 py-2 font-display text-xs uppercase tracking-wider text-wine hover:bg-wine/10"
                >
                  <Zap size={14} /> Complicate Scene
                </button>
              </div>

              {/* Complication (ephemeral) */}
              {complication && (
                <div className="flex items-start gap-2 rounded border border-wine/40 bg-wine/5 p-2.5 text-sm">
                  <Wand2 size={14} className="mt-0.5 flex-shrink-0 text-wine" />
                  <div className="font-serif text-ink-soft">
                    <span className="font-display text-xs uppercase tracking-wider text-wine">
                      Complication (d100: {complication.roll}) ·{' '}
                    </span>
                    {complication.text}
                  </div>
                </div>
              )}

              {/* Recent answers */}
              <div data-oracle-log className="space-y-2">
                {recent.length === 0 ? (
                  <p className="py-2 text-center font-serif text-sm italic text-ink-faint">
                    Ask the world a question to begin.
                  </p>
                ) : (
                  <>
                    <div className="font-display text-[11px] uppercase tracking-wider text-ink-mute">
                      Recent Answers
                    </div>
                    <ul className="max-h-64 space-y-2 overflow-y-auto pr-1">
                      {recent.map((entry, i) => (
                        <li
                          key={entry.id}
                          data-oracle-result
                          data-oracle-result-index={i}
                          className="rounded border border-rule bg-parchment-soft p-2.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span
                              className={`rounded-sm border px-1.5 py-0.5 font-display text-[11px] uppercase tracking-wider ${resultTone(
                                entry.result,
                              )}`}
                            >
                              {entry.result}
                            </span>
                            <span className="font-serif text-[10px] text-ink-faint">
                              d100: {entry.roll} / {entry.threshold} · CF {entry.chaosFactor}
                            </span>
                          </div>
                          {entry.question && (
                            <p className="mt-1 font-serif text-sm italic text-ink-soft">
                              {entry.question}
                            </p>
                          )}
                          {entry.randomEvent && (
                            <div className="mt-1.5 flex items-start gap-1.5 rounded border border-wine/30 bg-wine/5 px-2 py-1">
                              <Sparkles size={11} className="mt-0.5 flex-shrink-0 text-wine" />
                              <p className="font-serif text-xs text-ink-soft">
                                <span className="font-display uppercase tracking-wider text-wine">
                                  Random Event ·{' '}
                                </span>
                                {entry.randomEvent.focus}: {entry.randomEvent.action} /{' '}
                                {entry.randomEvent.subject}
                              </p>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
