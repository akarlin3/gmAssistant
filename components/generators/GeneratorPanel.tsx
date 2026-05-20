'use client';

// Shared generator panel used by all seven Generators Suite generators.
//
// Hosts the typed-input controls, the deterministic Generate button (free),
// the per-result Save / Reroll / Enhance-with-AI actions, and the result
// rendering slot. Enhance-with-AI is Pro-gated via <LockedInline>; the base
// deterministic Generate path always works.
//
// Inputs are declared via a config array; the panel renders them, holds
// their state, and passes the typed values into `generate`.

import { useCallback, useMemo, useRef, useState } from 'react';
import { Sparkles, Save, Shuffle, RefreshCw, Wand2, Check } from 'lucide-react';
import { LockedInline } from '@/components/LockedFeature';
import { useAuth } from '@/lib/firebase/auth-context';
import { makeRng, type SeededRng } from '@/lib/generators/rng';
import { hasCampaignContext, type CampaignContext, type GeneratorResult } from '@/lib/generators/types';
import GeneratorLog from './GeneratorLog';
import {
  appendToLog,
  makeLogEntry,
  type LogEntry,
  type LogKind,
} from '@/lib/generators/log';

export type InputSpec<T extends string | number = string | number> =
  | { kind: 'select'; key: string; label: string; options: readonly { label: string; value: string }[]; default: string }
  | { kind: 'number'; key: string; label: string; min: number; max: number; default: number }
  | { kind: 'text'; key: string; label: string; default: string; placeholder?: string };

export type GeneratorPanelProps<Inputs extends Record<string, string | number>, R extends GeneratorResult> = {
  title: string;
  description?: string;
  inputs: InputSpec[];
  generate: (inputs: Inputs, rng: SeededRng) => R;
  enhance?: { kind: R['kind'] };
  renderResult: (
    result: R,
    ctx: {
      enhancing: boolean;
      enhanced: boolean;
      onReroll: () => void;
      onEnhance?: () => Promise<void>;
      isPro: boolean;
      // Mutate the active result in place — used by interactive generators
      // (e.g. dungeon map click-to-grow). Undefined when the renderer is
      // rendering a saved log entry, where mutation is not allowed.
      onUpdate?: (next: R) => void;
    },
  ) => React.ReactNode;
  onEnhanced?: (next: R) => void;
  // Per-generator log wiring. When provided, a "Save to log" button appears
  // on each result and a <GeneratorLog/> renders directly below the panel.
  log?: {
    kind: LogKind;
    entries: LogEntry[];
    onEntriesChange: (next: LogEntry[]) => void;
    titleFor: (result: R) => string;
    copyText?: (result: R) => string;
  };
  // Optional snapshot of the campaign premise/theme. When present and the user
  // is Pro, a "Use campaign context" checkbox appears next to Enhance with AI
  // and is passed through to the enhance endpoint.
  campaignContext?: CampaignContext;
};

function deriveInputs<I extends Record<string, string | number>>(specs: InputSpec[], state: Record<string, string | number>): I {
  const out: Record<string, string | number> = {};
  for (const spec of specs) {
    const v = state[spec.key];
    if (spec.kind === 'number') {
      const num = Number(v);
      out[spec.key] = Number.isFinite(num) ? num : spec.default;
    } else {
      out[spec.key] = typeof v === 'string' ? v : spec.default;
    }
  }
  return out as I;
}

export function GeneratorPanel<I extends Record<string, string | number>, R extends GeneratorResult>(
  props: GeneratorPanelProps<I, R>,
) {
  const { title, description, inputs, generate, enhance, renderResult, onEnhanced, log, campaignContext } = props;
  const { isPro } = useAuth();
  const hasContext = hasCampaignContext(campaignContext);

  const [state, setState] = useState<Record<string, string | number>>(() => {
    const s: Record<string, string | number> = {};
    for (const spec of inputs) s[spec.key] = spec.default;
    return s;
  });
  const [result, setResult] = useState<R | null>(null);
  const [saved, setSaved] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [useCampaign, setUseCampaign] = useState(true);
  const [error, setError] = useState('');
  const lastSeedRef = useRef<number | null>(null);

  const runGenerate = useCallback((seed?: number) => {
    setError('');
    setSaved(false);
    const rng = makeRng(seed);
    lastSeedRef.current = rng.seed;
    try {
      const r = generate(deriveInputs<I>(inputs, state), rng);
      setResult(r);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Generate failed');
    }
  }, [generate, inputs, state]);

  const onReroll = useCallback(() => runGenerate(undefined), [runGenerate]);

  const onSaveToLogClick = useCallback(() => {
    if (!result || !log) return;
    const entry = makeLogEntry(log.kind, log.titleFor(result), result);
    log.onEntriesChange(appendToLog(log.entries, entry));
    setSaved(true);
  }, [result, log]);

  const onEnhanceClick = useCallback(async () => {
    if (!result || !enhance || !isPro) return;
    setEnhancing(true);
    setError('');
    try {
      const user = (await import('@/lib/firebase/client')).getFirebaseAuth().currentUser;
      if (!user) throw new Error('Not signed in');
      const idToken = await user.getIdToken();
      const res = await fetch('/api/generators/enhance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          kind: enhance.kind,
          result,
          campaignContext: useCampaign && hasContext ? campaignContext : undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Enhance failed (${res.status})`);
      const enhanced = body.result as R;
      setResult(enhanced);
      onEnhanced?.(enhanced);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Enhance failed');
    } finally {
      setEnhancing(false);
    }
  }, [result, enhance, isPro, onEnhanced, useCampaign, hasContext, campaignContext]);

  const inputControls = useMemo(() => inputs.map((spec) => {
    if (spec.kind === 'select') {
      return (
        <div key={spec.key}>
          <label className="text-xs text-brass-deep font-display uppercase tracking-wider mb-0.5 block">{spec.label}</label>
          <select
            value={String(state[spec.key])}
            onChange={(e) => setState((s) => ({ ...s, [spec.key]: e.target.value }))}
            className="w-full bg-parchment-soft border border-rule rounded px-2 py-1 text-sm text-ink font-serif focus:border-crimson focus:outline-none"
          >
            {spec.options.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      );
    }
    if (spec.kind === 'number') {
      return (
        <div key={spec.key}>
          <label className="text-xs text-brass-deep font-display uppercase tracking-wider mb-0.5 block">{spec.label}</label>
          <input
            type="number"
            min={spec.min}
            max={spec.max}
            value={Number(state[spec.key])}
            onChange={(e) => setState((s) => ({ ...s, [spec.key]: Number(e.target.value) }))}
            className="w-full bg-parchment-soft border border-rule rounded px-2 py-1 text-sm text-ink font-serif focus:border-crimson focus:outline-none"
          />
        </div>
      );
    }
    return (
      <div key={spec.key}>
        <label className="text-xs text-brass-deep font-display uppercase tracking-wider mb-0.5 block">{spec.label}</label>
        <input
          type="text"
          value={String(state[spec.key])}
          placeholder={spec.placeholder}
          onChange={(e) => setState((s) => ({ ...s, [spec.key]: e.target.value }))}
          className="w-full bg-parchment-soft border border-rule rounded px-2 py-1 text-sm text-ink font-serif focus:border-crimson focus:outline-none"
        />
      </div>
    );
  }), [inputs, state]);

  return (
    <div className="space-y-3 text-sm">
      <div className="rounded border border-rule bg-parchment p-3 shadow-card space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-crimson" />
          <h3 className="font-display tracking-wide text-ink">{title}</h3>
        </div>
        {description && (
          <p className="text-xs text-ink-soft italic font-serif">{description}</p>
        )}
        {inputControls.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{inputControls}</div>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => runGenerate()}
            className="text-xs px-3 py-1.5 rounded border border-crimson bg-crimson text-parchment font-display uppercase tracking-wider flex items-center gap-1.5 hover:bg-wine hover:border-wine transition-colors"
          >
            <Shuffle size={12} /> {result ? 'Reroll' : 'Generate'}
          </button>
          {lastSeedRef.current !== null && (
            <span className="text-[10px] text-ink-mute italic self-center" title="Same seed = same result">
              seed: {lastSeedRef.current.toString(16)}
            </span>
          )}
        </div>
        {error && <p className="text-xs text-crimson italic" title={error}>{error}</p>}
      </div>

      {result && (
        <div className="rounded border border-rule bg-parchment p-3 shadow-card space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            {log && (
              <button
                onClick={onSaveToLogClick}
                disabled={saved}
                className="text-xs px-3 py-1.5 rounded border border-brass-deep/60 bg-brass/10 text-brass-deep font-display uppercase tracking-wider flex items-center gap-1.5 hover:bg-brass hover:text-parchment hover:border-brass disabled:opacity-50 transition-colors"
              >
                {saved ? <Check size={12} /> : <Save size={12} />}
                {saved ? 'Saved to log' : 'Save to log'}
              </button>
            )}
            <button
              onClick={onReroll}
              className="text-xs px-3 py-1.5 rounded border border-ink-mute/50 text-ink-soft font-display uppercase tracking-wider flex items-center gap-1.5 hover:bg-parchment-deep transition-colors"
            >
              <RefreshCw size={12} /> Reroll
            </button>
            {enhance && (
              isPro ? (
                <>
                  <button
                    onClick={onEnhanceClick}
                    disabled={enhancing}
                    className="text-xs px-3 py-1.5 rounded border border-crimson/60 bg-crimson/10 text-crimson font-display uppercase tracking-wider flex items-center gap-1.5 hover:bg-crimson hover:text-parchment hover:border-crimson disabled:opacity-50 transition-colors"
                  >
                    <Wand2 size={12} /> {enhancing ? 'Enhancing…' : 'Enhance with AI'}
                  </button>
                  {hasContext && (
                    <label
                      className="text-[11px] text-ink-soft font-serif flex items-center gap-1.5 select-none cursor-pointer"
                      title="Pass your campaign's genre, tone, pitch, and world/setting facts to the AI so its prose fits your premise."
                    >
                      <input
                        type="checkbox"
                        checked={useCampaign}
                        onChange={(e) => setUseCampaign(e.target.checked)}
                        className="accent-crimson"
                      />
                      Use campaign context
                    </label>
                  )}
                </>
              ) : (
                <LockedInline label="Enhance with AI" />
              )
            )}
          </div>
          <div className="border-t border-rule pt-3">
            {renderResult(result, {
              enhancing,
              enhanced: result.enhanced,
              onReroll,
              onEnhance: enhance && isPro ? onEnhanceClick : undefined,
              isPro,
              onUpdate: setResult,
            })}
          </div>
        </div>
      )}

      {log && (
        <GeneratorLog
          kind={log.kind}
          entries={log.entries}
          onChange={log.onEntriesChange}
          renderPayload={(entry) => (
            <div className="text-sm text-ink">
              {renderResult(entry.payload as R, {
                enhancing: false,
                enhanced: (entry.payload as R).enhanced,
                onReroll: () => {},
                onEnhance: undefined,
                isPro,
              })}
            </div>
          )}
          copyText={log.copyText ? (e) => log.copyText!(e.payload as R) : undefined}
        />
      )}
    </div>
  );
}
