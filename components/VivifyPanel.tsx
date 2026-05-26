'use client';

import { useState, useRef, useEffect } from 'react';
import { Sparkles, Save, Trash2, Copy, ChevronDown, ChevronRight, X, Send } from 'lucide-react';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { TEMPLATES, type Template } from '@/lib/vivifyContext';

export type VivifyHistoryEntry = {
  id: string;
  templateId: string;
  templateLabel: string;
  input: string;
  output: string;
  timestamp: number;
};

type Props = {
  data: Record<string, any>;
  history: VivifyHistoryEntry[];
  onHistoryChange: (history: VivifyHistoryEntry[]) => void;
};

const HISTORY_CAP = 50;

function makeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export default function VivifyPanel({ data, history, onHistoryChange }: Props) {
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(TEMPLATES[0].id);
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const template: Template = TEMPLATES.find(t => t.id === selectedTemplateId) ?? TEMPLATES[0];

  const generate = async () => {
    if (!input.trim() || streaming) return;
    setOutput('');
    setError(null);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('Not signed in');
      const idToken = await user.getIdToken();

      const res = await fetch('/api/vivify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ templateId: template.id, input, data }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: 'Unknown error' }));
        setError(errBody.error || `HTTP ${res.status}`);
        setStreaming(false);
        return;
      }

      const reader = res.body?.getReader();
      if (!reader) {
        setError('No response stream available.');
        setStreaming(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';

        for (const evt of events) {
          if (!evt.trim()) continue;
          let eventName = 'message';
          let dataLine = '';
          for (const line of evt.split('\n')) {
            if (line.startsWith('event: ')) eventName = line.slice(7).trim();
            else if (line.startsWith('data: ')) dataLine = line.slice(6).trim();
          }
          if (!dataLine) continue;
          try {
            const parsed = JSON.parse(dataLine);
            if (eventName === 'chunk' && typeof parsed.text === 'string') {
              accumulated += parsed.text;
              setOutput(accumulated);
            } else if (eventName === 'error') {
              setError(parsed.error || 'Stream error.');
            }
          } catch {
            // ignore partial-event parse failures
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name !== 'AbortError') {
        setError(err.message);
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
    setStreaming(false);
  };

  const saveToHistory = () => {
    if (!output.trim()) return;
    const entry: VivifyHistoryEntry = {
      id: makeId(),
      templateId: template.id,
      templateLabel: template.label,
      input,
      output,
      timestamp: Date.now(),
    };
    onHistoryChange([entry, ...history].slice(0, HISTORY_CAP));
  };

  const copyOutput = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
    } catch {
      // silent fail
    }
  };

  const removeHistoryEntry = (id: string) => {
    onHistoryChange(history.filter(h => h.id !== id));
  };

  const clearAllHistory = () => {
    if (!confirm('Clear all Vivify history? This cannot be undone.')) return;
    onHistoryChange([]);
  };

  const apiKeyMissing = error?.toLowerCase().includes('anthropic_api_key');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        generate();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, selectedTemplateId, streaming]);

  return (
    <div className="space-y-3 text-sm">
      <p className="font-serif text-xs italic text-ink-soft">
        Vivify generates vivid prose informed by your campaign data. Pick a template, describe what you want, and Claude writes it.
      </p>

      <div>
        <div className="mb-1.5 font-display text-xs uppercase tracking-wider text-brass-deep">Template</div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {TEMPLATES.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedTemplateId(t.id)}
              className={`rounded border px-2 py-1.5 text-left font-serif text-xs transition-colors ${
                t.id === selectedTemplateId
                  ? 'border-crimson bg-crimson/10 text-crimson'
                  : 'border-rule bg-parchment text-ink-soft hover:bg-parchment-deep hover:text-ink'
              }`}
              title={t.hint}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 font-serif text-xs italic text-ink-soft">{template.hint}</div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={template.inputPlaceholder}
          rows={3}
          className="w-full resize-y rounded border border-rule bg-parchment px-2 py-1.5 font-serif text-sm text-ink placeholder:italic placeholder:text-ink-faint focus:border-crimson focus:outline-none"
        />
        <div className="mt-1.5 flex items-center gap-2">
          <button
            type="button"
            onClick={streaming ? cancel : generate}
            disabled={!streaming && !input.trim()}
            className={`flex items-center gap-1.5 rounded border px-3 py-1.5 font-display text-xs uppercase tracking-wider transition-colors ${
              streaming
                ? 'border-crimson bg-crimson/10 text-crimson hover:bg-crimson hover:text-parchment'
                : 'border-brass-deep/60 bg-brass/15 text-brass-deep hover:bg-brass hover:text-parchment disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-brass/15 disabled:hover:text-brass-deep'
            }`}
          >
            {streaming ? <><X size={12} /> Cancel</> : <><Send size={12} /> Generate</>}
          </button>
          <span className="font-serif text-[10px] italic text-ink-mute">⌘/Ctrl + Enter</span>
        </div>
      </div>

      {(output || error || streaming) && (
        <div className="space-y-2 rounded border border-rule bg-parchment p-3 shadow-card">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 font-display text-xs uppercase tracking-wider text-brass-deep">
              <Sparkles size={12} className="text-crimson" />
              {streaming ? 'Generating…' : error ? 'Error' : 'Output'}
            </span>
            {output && !streaming && (
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={copyOutput}
                  className="flex items-center gap-1 rounded border border-rule px-2 py-0.5 font-display text-[10px] uppercase tracking-wider text-ink-soft hover:bg-parchment-deep"
                >
                  <Copy size={10} /> Copy
                </button>
                <button
                  type="button"
                  onClick={saveToHistory}
                  className="flex items-center gap-1 rounded border border-rule px-2 py-0.5 font-display text-[10px] uppercase tracking-wider text-ink-soft hover:bg-parchment-deep"
                >
                  <Save size={10} /> Save
                </button>
              </div>
            )}
          </div>
          {error && (
            <div className="font-serif text-xs leading-relaxed text-crimson">
              {error}
              {apiKeyMissing && (
                <div className="mt-1.5 italic text-ink-mute">
                  Add ANTHROPIC_API_KEY to the server environment, then redeploy. Get a key at console.anthropic.com.
                </div>
              )}
            </div>
          )}
          {output && (
            <div className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-ink">
              {output}
              {streaming && <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-crimson align-middle" />}
            </div>
          )}
        </div>
      )}

      <div className="rounded border border-rule bg-parchment-soft shadow-card">
        <button
          type="button"
          onClick={() => setHistoryOpen(o => !o)}
          className="flex w-full items-center gap-2 p-2.5 text-left transition-colors hover:bg-parchment-deep/50"
        >
          {historyOpen ? <ChevronDown size={14} className="text-brass-deep" /> : <ChevronRight size={14} className="text-brass-deep" />}
          <span className="font-display text-sm tracking-wide text-ink">History</span>
          <span className="font-serif text-xs text-ink-mute">({history.length})</span>
          {historyOpen && history.length > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); clearAllHistory(); }}
              className="ml-auto flex items-center gap-1 font-display text-[10px] uppercase tracking-wider text-crimson hover:text-wine"
            >
              <Trash2 size={10} /> Clear all
            </button>
          )}
        </button>
        {historyOpen && (
          <div className="space-y-2 border-t border-rule p-3">
            {history.length === 0 ? (
              <p className="font-serif text-xs italic text-ink-mute">No saved generations yet. Click Save on any output to keep it here.</p>
            ) : (
              history.map(entry => (
                <div key={entry.id} className="space-y-1.5 rounded border border-rule bg-parchment p-2.5">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="font-display uppercase tracking-wider text-brass-deep">
                      {entry.templateLabel} <span className="normal-case text-ink-mute">· {new Date(entry.timestamp).toLocaleString()}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeHistoryEntry(entry.id)}
                      className="text-ink-mute hover:text-crimson"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                  <div className="font-serif text-xs italic text-ink-soft">{entry.input}</div>
                  <div className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-ink">{entry.output}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
