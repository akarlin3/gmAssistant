'use client';

import { useState, useRef, useEffect } from 'react';
import { Sparkles, Save, Trash2, Copy, ChevronDown, ChevronRight, X, Send } from 'lucide-react';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { TEMPLATES, buildSystemPrompt, type Template } from '@/lib/vivifyContext';

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

      const systemPrompt = buildSystemPrompt(template, data);
      const res = await fetch('/api/vivify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ systemPrompt, userMessage: input }),
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
      <p className="text-xs italic font-serif text-ink-soft">
        Vivify generates vivid prose informed by your campaign data. Pick a template, describe what you want, and Claude writes it.
      </p>

      <div>
        <div className="text-xs text-brass-deep font-display uppercase tracking-wider mb-1.5">Template</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {TEMPLATES.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedTemplateId(t.id)}
              className={`text-xs px-2 py-1.5 rounded border text-left font-serif transition-colors ${
                t.id === selectedTemplateId
                  ? 'bg-crimson/10 border-crimson text-crimson'
                  : 'border-rule text-ink-soft bg-parchment hover:bg-parchment-deep hover:text-ink'
              }`}
              title={t.hint}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs text-ink-soft italic font-serif mb-1">{template.hint}</div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={template.inputPlaceholder}
          rows={3}
          className="w-full bg-parchment border border-rule rounded px-2 py-1.5 text-sm text-ink font-serif placeholder:text-ink-faint placeholder:italic focus:border-crimson focus:outline-none resize-y"
        />
        <div className="flex items-center gap-2 mt-1.5">
          <button
            type="button"
            onClick={streaming ? cancel : generate}
            disabled={!streaming && !input.trim()}
            className={`text-xs px-3 py-1.5 rounded border font-display uppercase tracking-wider flex items-center gap-1.5 transition-colors ${
              streaming
                ? 'border-crimson bg-crimson/10 text-crimson hover:bg-crimson hover:text-parchment'
                : 'border-brass-deep/60 bg-brass/15 text-brass-deep hover:bg-brass hover:text-parchment disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-brass/15 disabled:hover:text-brass-deep'
            }`}
          >
            {streaming ? <><X size={12} /> Cancel</> : <><Send size={12} /> Generate</>}
          </button>
          <span className="text-[10px] text-ink-mute italic font-serif">⌘/Ctrl + Enter</span>
        </div>
      </div>

      {(output || error || streaming) && (
        <div className="rounded border border-rule bg-parchment p-3 space-y-2 shadow-card">
          <div className="flex items-center justify-between">
            <span className="text-xs text-brass-deep font-display uppercase tracking-wider flex items-center gap-1.5">
              <Sparkles size={12} className="text-crimson" />
              {streaming ? 'Generating…' : error ? 'Error' : 'Output'}
            </span>
            {output && !streaming && (
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={copyOutput}
                  className="text-[10px] px-2 py-0.5 rounded border border-rule text-ink-soft hover:bg-parchment-deep flex items-center gap-1 font-display uppercase tracking-wider"
                >
                  <Copy size={10} /> Copy
                </button>
                <button
                  type="button"
                  onClick={saveToHistory}
                  className="text-[10px] px-2 py-0.5 rounded border border-rule text-ink-soft hover:bg-parchment-deep flex items-center gap-1 font-display uppercase tracking-wider"
                >
                  <Save size={10} /> Save
                </button>
              </div>
            )}
          </div>
          {error && (
            <div className="text-xs text-crimson font-serif leading-relaxed">
              {error}
              {apiKeyMissing && (
                <div className="text-ink-mute italic mt-1.5">
                  Add ANTHROPIC_API_KEY to the server environment, then redeploy. Get a key at console.anthropic.com.
                </div>
              )}
            </div>
          )}
          {output && (
            <div className="text-sm text-ink font-serif leading-relaxed whitespace-pre-wrap">
              {output}
              {streaming && <span className="inline-block w-1.5 h-3 bg-crimson ml-0.5 animate-pulse align-middle" />}
            </div>
          )}
        </div>
      )}

      <div className="rounded border border-rule bg-parchment-soft shadow-card">
        <button
          type="button"
          onClick={() => setHistoryOpen(o => !o)}
          className="w-full flex items-center gap-2 p-2.5 text-left hover:bg-parchment-deep/50 transition-colors"
        >
          {historyOpen ? <ChevronDown size={14} className="text-brass-deep" /> : <ChevronRight size={14} className="text-brass-deep" />}
          <span className="font-display text-sm tracking-wide text-ink">History</span>
          <span className="text-xs text-ink-mute font-serif">({history.length})</span>
          {historyOpen && history.length > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); clearAllHistory(); }}
              className="ml-auto text-[10px] text-crimson hover:text-wine flex items-center gap-1 font-display uppercase tracking-wider"
            >
              <Trash2 size={10} /> Clear all
            </button>
          )}
        </button>
        {historyOpen && (
          <div className="px-3 pb-3 space-y-2 border-t border-rule pt-3">
            {history.length === 0 ? (
              <p className="text-xs text-ink-mute italic font-serif">No saved generations yet. Click Save on any output to keep it here.</p>
            ) : (
              history.map(entry => (
                <div key={entry.id} className="rounded border border-rule bg-parchment p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-brass-deep font-display uppercase tracking-wider">
                      {entry.templateLabel} <span className="text-ink-mute normal-case">· {new Date(entry.timestamp).toLocaleString()}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => removeHistoryEntry(entry.id)}
                      className="text-ink-mute hover:text-crimson"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                  <div className="text-xs text-ink-soft italic font-serif">{entry.input}</div>
                  <div className="text-sm text-ink font-serif leading-relaxed whitespace-pre-wrap">{entry.output}</div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
