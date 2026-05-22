'use client';

import { useState } from 'react';
import { Sparkles, Shuffle, Copy, Check, Save } from 'lucide-react';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { CULTURE_GROUPS, ALL_CULTURES } from '@/lib/cultures';
import GeneratorLog from './generators/GeneratorLog';
import AddToCampaignPicker from './generators/AddToCampaignPicker';
import { appendToLog, makeLogEntry, type LogEntry } from '@/lib/generators/log';
import type { CampaignDestKey, SelectableItem } from '@/lib/generators/addToCampaign';

const GENDERS = ['Any', 'Masculine', 'Feminine', 'Androgynous'] as const;

type GeneratedName = {
  first: string;
  last: string;
  firstCulture: string;
  lastCulture: string;
};

type NameLogPayload = {
  firstCulture: string;
  lastCulture: string;
  gender: typeof GENDERS[number];
  names: GeneratedName[];
};

function namesCopyText(p: NameLogPayload): string {
  return p.names
    .map((n) => {
      const full = [n.first, n.last].filter(Boolean).join(' ');
      const tag = n.firstCulture === n.lastCulture
        ? n.firstCulture
        : [n.firstCulture, n.lastCulture].filter(Boolean).join(' · ');
      return tag ? `${full}  (${tag})` : full;
    })
    .join('\n');
}

const CultureSelect = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) => (
  <div>
    <label className="mb-0.5 block font-display text-xs uppercase tracking-wider text-brass-deep">
      {label}
    </label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-sm text-ink focus:border-crimson focus:outline-none"
    >
      <option value="Random">Random</option>
      {CULTURE_GROUPS.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.cultures.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </optgroup>
      ))}
    </select>
  </div>
);

export default function NamesTab({
  logEntries,
  onLogEntriesChange,
  onAddToCampaign,
}: {
  logEntries: LogEntry[];
  onLogEntriesChange: (next: LogEntry[]) => void;
  onAddToCampaign?: (dest: CampaignDestKey, items: SelectableItem[]) => void;
}) {
  const [firstCulture, setFirstCulture] = useState('Random');
  const [lastCulture, setLastCulture] = useState('Random');
  const [gender, setGender] = useState<typeof GENDERS[number]>('Any');
  const [count, setCount] = useState(8);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [names, setNames] = useState<GeneratedName[]>([]);
  const [copied, setCopied] = useState<string>('');
  const [saved, setSaved] = useState(false);

  const generate = async () => {
    setGenerating(true);
    setError('');
    setSaved(false);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('Not signed in');
      const idToken = await user.getIdToken();
      const res = await fetch('/api/generate-names', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ firstCulture, lastCulture, gender, count }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Generate failed (${res.status})`);
      setNames(Array.isArray(body.names) ? body.names : []);
    } catch (err: any) {
      setError(err?.message || 'Generate failed');
    } finally {
      setGenerating(false);
    }
  };

  const saveToLog = () => {
    if (names.length === 0) return;
    const payload: NameLogPayload = { firstCulture, lastCulture, gender, names };
    const title = `${names.length} name${names.length === 1 ? '' : 's'} · ${firstCulture === lastCulture ? firstCulture : `${firstCulture} / ${lastCulture}`}${gender !== 'Any' ? ` · ${gender}` : ''}`;
    onLogEntriesChange(appendToLog(logEntries, makeLogEntry('names', title, payload)));
    setSaved(true);
  };

  const renderPayload = (entry: LogEntry) => {
    const p = entry.payload as NameLogPayload;
    return (
      <ul className="space-y-1 font-serif text-sm">
        {p.names.map((n, i) => {
          const full = [n.first, n.last].filter(Boolean).join(' ');
          const tag = n.firstCulture === n.lastCulture
            ? n.firstCulture
            : [n.firstCulture, n.lastCulture].filter(Boolean).join(' · ');
          return (
            <li key={i} className="flex items-center justify-between gap-2">
              <span className="text-ink">{full}</span>
              {tag && <span className="text-[10px] italic text-ink-mute">{tag}</span>}
            </li>
          );
        })}
      </ul>
    );
  };

  const copyName = async (name: string) => {
    try {
      await navigator.clipboard.writeText(name);
      setCopied(name);
      setTimeout(() => setCopied((c) => (c === name ? '' : c)), 1200);
    } catch {
      // clipboard unavailable — silently skip
    }
  };

  const shuffleCultures = () => {
    const pick = () => ALL_CULTURES[Math.floor(Math.random() * ALL_CULTURES.length)];
    setFirstCulture(pick());
    setLastCulture(pick());
  };

  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-3 rounded border border-rule bg-parchment p-3 shadow-card">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-crimson" />
          <h3 className="font-display tracking-wide text-ink">Name Generator</h3>
          <span className="ml-auto rounded-sm border border-crimson/60 bg-crimson/10 px-1.5 py-0.5 font-display text-[10px] uppercase tracking-wider text-crimson">
            Pro
          </span>
        </div>
        <p className="font-serif text-xs italic text-ink-soft">
          Generate first / surname pairs from any culture — real-world or fantasy. Choose the
          tradition for each part independently, or let the dice decide.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CultureSelect
            label="First Name Culture"
            value={firstCulture}
            onChange={setFirstCulture}
          />
          <CultureSelect
            label="Surname Culture"
            value={lastCulture}
            onChange={setLastCulture}
          />
          <div>
            <label className="mb-0.5 block font-display text-xs uppercase tracking-wider text-brass-deep">
              Gender
            </label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value as typeof GENDERS[number])}
              className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-sm text-ink focus:border-crimson focus:outline-none"
            >
              {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-0.5 block font-display text-xs uppercase tracking-wider text-brass-deep">
              How Many
            </label>
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-sm text-ink focus:border-crimson focus:outline-none"
            >
              {[4, 6, 8, 12, 16, 20].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={generate}
            disabled={generating}
            className="flex items-center gap-1.5 rounded border border-crimson bg-crimson px-3 py-1.5 font-display text-xs uppercase tracking-wider text-parchment transition-colors hover:border-wine hover:bg-wine disabled:cursor-wait disabled:opacity-50"
          >
            <Sparkles size={12} /> {generating ? 'Generating…' : 'Generate'}
          </button>
          <button
            onClick={shuffleCultures}
            disabled={generating}
            className="flex items-center gap-1.5 rounded border border-brass-deep/50 px-3 py-1.5 font-display text-xs uppercase tracking-wider text-brass-deep transition-colors hover:border-brass hover:bg-brass hover:text-parchment disabled:opacity-50"
            title="Pick a random specific culture for each part"
          >
            <Shuffle size={12} /> Shuffle Cultures
          </button>
        </div>

        {error && (
          <p className="text-xs italic text-crimson" title={error}>{error}</p>
        )}
      </div>

      {names.length > 0 && (
        <div className="space-y-2 rounded border border-rule bg-parchment p-3 shadow-card">
          <div className="flex items-center justify-between gap-2">
            <p className="font-serif text-[11px] italic text-ink-mute">
              Click a name to copy it.
            </p>
            <button
              onClick={saveToLog}
              disabled={saved}
              className="flex items-center gap-1.5 rounded border border-brass-deep/60 bg-brass/10 px-3 py-1.5 font-display text-xs uppercase tracking-wider text-brass-deep transition-colors hover:border-brass hover:bg-brass hover:text-parchment disabled:opacity-50"
            >
              {saved ? <Check size={12} /> : <Save size={12} />}
              {saved ? 'Saved to log' : 'Save to log'}
            </button>
          </div>
          <div className="space-y-1.5">
            {names.map((n, i) => {
              const full = [n.first, n.last].filter(Boolean).join(' ');
              const sameCulture = n.firstCulture && n.firstCulture === n.lastCulture;
              const tag = sameCulture
                ? n.firstCulture
                : [n.firstCulture, n.lastCulture].filter(Boolean).join(' · ');
              return (
                <button
                  key={i}
                  onClick={() => copyName(full)}
                  className="flex w-full items-center justify-between gap-2 rounded border border-rule bg-parchment-soft px-2.5 py-1.5 text-left transition-colors hover:bg-parchment-deep/40"
                >
                  <span className="font-serif text-ink">{full}</span>
                  <span className="flex flex-shrink-0 items-center gap-2">
                    {tag && (
                      <span className="text-[10px] italic text-ink-mute">{tag}</span>
                    )}
                    {copied === full ? (
                      <Check size={12} className="text-brass-deep" />
                    ) : (
                      <Copy size={12} className="text-ink-mute" />
                    )}
                  </span>
                </button>
              );
            })}
          </div>
          {onAddToCampaign && (
            <AddToCampaignPicker
              kind="names"
              payload={{ firstCulture, lastCulture, gender, names } satisfies NameLogPayload}
              onAdd={onAddToCampaign}
            />
          )}
        </div>
      )}

      <GeneratorLog
        kind="names"
        entries={logEntries}
        onChange={onLogEntriesChange}
        renderPayload={renderPayload}
        copyText={(e) => namesCopyText(e.payload as NameLogPayload)}
        emptyHint="Generate names, then click 'Save to log' to keep a batch here."
        onAddToCampaign={onAddToCampaign}
      />
    </div>
  );
}
