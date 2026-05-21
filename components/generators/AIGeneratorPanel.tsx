'use client';

// Pure-AI generator shell. Sibling of GeneratorPanel — same visual
// vocabulary (inputs grid → result card → save-to-log + Add-to-Campaign
// picker → log below), but the Generate button is itself Pro-gated and async.
// No rng, no seed, no Enhance step. Currently consumed by PlotSegueGenerator
// and intended for any future generator that has no deterministic shape.

import { useCallback, useMemo, useState } from 'react';
import { Sparkles, Save, Shuffle, RefreshCw, Check } from 'lucide-react';
import { LockedInline } from '@/components/LockedFeature';
import { useAuth } from '@/lib/firebase/auth-context';
import type { CampaignContext, GeneratorResult } from '@/lib/generators/types';
import GeneratorLog from './GeneratorLog';
import AddToCampaignPicker from './AddToCampaignPicker';
import type { CampaignDestKey, SelectableItem } from '@/lib/generators/addToCampaign';
import {
  appendToLog,
  makeLogEntry,
  type LogEntry,
  type LogKind,
} from '@/lib/generators/log';
import type { InputSpec } from './GeneratorPanel';

export type AIGeneratorPanelProps<Inputs extends Record<string, string | number>, R extends GeneratorResult> = {
  title: string;
  description?: string;
  inputs: InputSpec[];
  // Build the typed inputs from the panel's state and call the server.
  // Receives the user's auth token; returns the generated result.
  generate: (inputs: Inputs, idToken: string, campaignContext?: CampaignContext) => Promise<R>;
  renderResult: (result: R) => React.ReactNode;
  campaignContext?: CampaignContext;
  log?: {
    kind: LogKind;
    entries: LogEntry[];
    onEntriesChange: (next: LogEntry[]) => void;
    titleFor: (result: R) => string;
    copyText?: (result: R) => string;
  };
  onAddToCampaign?: (dest: CampaignDestKey, items: SelectableItem[]) => void;
  // Forwarded into the AddToCampaignPicker (both the live result and the log).
  disabledDests?: readonly CampaignDestKey[];
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

export function AIGeneratorPanel<I extends Record<string, string | number>, R extends GeneratorResult>(
  props: AIGeneratorPanelProps<I, R>,
) {
  const { title, description, inputs, generate, renderResult, campaignContext, log, onAddToCampaign, disabledDests } = props;
  const { isPro } = useAuth();

  const [state, setState] = useState<Record<string, string | number>>(() => {
    const s: Record<string, string | number> = {};
    for (const spec of inputs) s[spec.key] = spec.default;
    return s;
  });
  const [result, setResult] = useState<R | null>(null);
  const [saved, setSaved] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const runGenerate = useCallback(async () => {
    if (!isPro) return;
    setError('');
    setSaved(false);
    setGenerating(true);
    try {
      const user = (await import('@/lib/firebase/client')).getFirebaseAuth().currentUser;
      if (!user) throw new Error('Not signed in');
      const idToken = await user.getIdToken();
      const r = await generate(deriveInputs<I>(inputs, state), idToken, campaignContext);
      setResult(r);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Generate failed');
    } finally {
      setGenerating(false);
    }
  }, [generate, inputs, state, campaignContext, isPro]);

  const onSaveToLogClick = useCallback(() => {
    if (!result || !log) return;
    const entry = makeLogEntry(log.kind, log.titleFor(result), result);
    log.onEntriesChange(appendToLog(log.entries, entry));
    setSaved(true);
  }, [result, log]);

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
          <span className="text-[9px] uppercase tracking-wider opacity-70 ml-auto">Pro · AI</span>
        </div>
        {description && (
          <p className="text-xs text-ink-soft italic font-serif">{description}</p>
        )}
        {inputControls.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{inputControls}</div>
        )}
        <div className="flex flex-wrap gap-2 items-center">
          {isPro ? (
            <button
              onClick={runGenerate}
              disabled={generating}
              className="text-xs px-3 py-1.5 rounded border border-crimson bg-crimson text-parchment font-display uppercase tracking-wider flex items-center gap-1.5 hover:bg-wine hover:border-wine disabled:opacity-50 transition-colors"
            >
              <Shuffle size={12} /> {generating ? 'Generating…' : result ? 'Reroll' : 'Generate'}
            </button>
          ) : (
            <LockedInline label={result ? 'Reroll (Pro)' : 'Generate (Pro)'} />
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
            {isPro && (
              <button
                onClick={runGenerate}
                disabled={generating}
                className="text-xs px-3 py-1.5 rounded border border-ink-mute/50 text-ink-soft font-display uppercase tracking-wider flex items-center gap-1.5 hover:bg-parchment-deep disabled:opacity-50 transition-colors"
              >
                <RefreshCw size={12} /> Reroll
              </button>
            )}
          </div>
          <div className="border-t border-rule pt-3">
            {renderResult(result)}
          </div>
          {onAddToCampaign && log && (
            <AddToCampaignPicker
              kind={log.kind}
              payload={result}
              onAdd={onAddToCampaign}
              disabledDests={disabledDests}
            />
          )}
        </div>
      )}

      {log && (
        <GeneratorLog
          kind={log.kind}
          entries={log.entries}
          onChange={log.onEntriesChange}
          renderPayload={(entry) => (
            <div className="text-sm text-ink">
              {renderResult(entry.payload as R)}
            </div>
          )}
          copyText={log.copyText ? (e) => log.copyText!(e.payload as R) : undefined}
          onAddToCampaign={onAddToCampaign}
          disabledDests={disabledDests}
        />
      )}
    </div>
  );
}
