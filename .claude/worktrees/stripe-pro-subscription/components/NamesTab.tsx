'use client';

import { useState } from 'react';
import { Sparkles, Shuffle, Copy, Check } from 'lucide-react';
import { getFirebaseAuth } from '@/lib/firebase/client';

const CULTURE_GROUPS: Array<{ label: string; cultures: string[] }> = [
  {
    label: 'Western European',
    cultures: ['English', 'Celtic / Irish', 'Scottish', 'Welsh', 'Norse / Viking', 'French', 'Germanic', 'Dutch / Flemish'],
  },
  {
    label: 'Mediterranean & Classical',
    cultures: ['Italian', 'Spanish', 'Portuguese', 'Greek', 'Roman / Latin', 'Byzantine'],
  },
  {
    label: 'Eastern European',
    cultures: ['Slavic / Russian', 'Polish', 'Hungarian', 'Romanian'],
  },
  {
    label: 'Middle Eastern & North African',
    cultures: ['Arabic', 'Persian', 'Hebrew', 'Egyptian', 'Turkish / Ottoman', 'Berber'],
  },
  {
    label: 'Asian',
    cultures: ['Indian', 'Chinese', 'Japanese', 'Korean', 'Mongolian', 'Tibetan', 'Thai / Southeast Asian'],
  },
  {
    label: 'African',
    cultures: ['West African', 'Ethiopian / Horn of Africa', 'Swahili / East African', 'Zulu / Southern African'],
  },
  {
    label: 'Americas & Pacific',
    cultures: ['Polynesian', 'Native American (Plains)', 'Native American (Pueblo)', 'Mesoamerican / Aztec', 'Inca / Andean', 'Inuit'],
  },
  {
    label: 'Fantasy Races',
    cultures: ['Elven (High)', 'Elven (Wood)', 'Drow', 'Dwarven', 'Halfling', 'Gnomish', 'Orcish', 'Half-Orc', 'Goblin', 'Tiefling (Virtue)', 'Dragonborn', 'Genasi'],
  },
];

const ALL_CULTURES = CULTURE_GROUPS.flatMap((g) => g.cultures);

const GENDERS = ['Any', 'Masculine', 'Feminine', 'Androgynous'] as const;

type GeneratedName = {
  first: string;
  last: string;
  firstCulture: string;
  lastCulture: string;
};

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
    <label className="text-xs text-brass-deep font-display uppercase tracking-wider mb-0.5 block">
      {label}
    </label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-parchment-soft border border-rule rounded px-2 py-1 text-sm text-ink font-serif focus:border-crimson focus:outline-none"
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

export default function NamesTab() {
  const [firstCulture, setFirstCulture] = useState('Random');
  const [lastCulture, setLastCulture] = useState('Random');
  const [gender, setGender] = useState<typeof GENDERS[number]>('Any');
  const [count, setCount] = useState(8);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [names, setNames] = useState<GeneratedName[]>([]);
  const [copied, setCopied] = useState<string>('');

  const generate = async () => {
    setGenerating(true);
    setError('');
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
      <div className="rounded border border-rule bg-parchment p-3 shadow-card space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-crimson" />
          <h3 className="font-display tracking-wide text-ink">Name Generator</h3>
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-sm border border-crimson/60 bg-crimson/10 text-crimson font-display uppercase tracking-wider">
            Pro
          </span>
        </div>
        <p className="text-xs text-ink-soft italic font-serif">
          Generate first / surname pairs from any culture — real-world or fantasy. Choose the
          tradition for each part independently, or let the dice decide.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <label className="text-xs text-brass-deep font-display uppercase tracking-wider mb-0.5 block">
              Gender
            </label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value as typeof GENDERS[number])}
              className="w-full bg-parchment-soft border border-rule rounded px-2 py-1 text-sm text-ink font-serif focus:border-crimson focus:outline-none"
            >
              {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-brass-deep font-display uppercase tracking-wider mb-0.5 block">
              How Many
            </label>
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="w-full bg-parchment-soft border border-rule rounded px-2 py-1 text-sm text-ink font-serif focus:border-crimson focus:outline-none"
            >
              {[4, 6, 8, 12, 16, 20].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={generate}
            disabled={generating}
            className="text-xs px-3 py-1.5 rounded border border-crimson bg-crimson text-parchment font-display uppercase tracking-wider flex items-center gap-1.5 hover:bg-wine hover:border-wine disabled:opacity-50 disabled:cursor-wait transition-colors"
          >
            <Sparkles size={12} /> {generating ? 'Generating…' : 'Generate'}
          </button>
          <button
            onClick={shuffleCultures}
            disabled={generating}
            className="text-xs px-3 py-1.5 rounded border border-brass-deep/50 text-brass-deep font-display uppercase tracking-wider flex items-center gap-1.5 hover:bg-brass hover:text-parchment hover:border-brass disabled:opacity-50 transition-colors"
            title="Pick a random specific culture for each part"
          >
            <Shuffle size={12} /> Shuffle Cultures
          </button>
        </div>

        {error && (
          <p className="text-xs text-crimson italic" title={error}>{error}</p>
        )}
      </div>

      {names.length > 0 && (
        <div className="rounded border border-rule bg-parchment p-3 shadow-card space-y-2">
          <p className="text-[11px] text-ink-mute italic font-serif">
            Click a name to copy it.
          </p>
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
                  className="w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded border border-rule bg-parchment-soft hover:bg-parchment-deep/40 transition-colors text-left"
                >
                  <span className="font-serif text-ink">{full}</span>
                  <span className="flex items-center gap-2 flex-shrink-0">
                    {tag && (
                      <span className="text-[10px] text-ink-mute italic">{tag}</span>
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
        </div>
      )}
    </div>
  );
}
