'use client';

import { useState } from 'react';
import { Sparkles, Shuffle, Copy, Check, MapPin, Save } from 'lucide-react';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { CULTURE_GROUPS, ALL_CULTURES } from '@/lib/cultures';
import { LOCATION_TYPE_GROUPS, ALL_LOCATION_TYPES } from '@/lib/locations';
import GeneratorLog from './generators/GeneratorLog';
import { appendToLog, makeLogEntry, type LogEntry } from '@/lib/generators/log';

type GeneratedLocation = {
  name: string;
  type: string;
  culture: string;
  blurb: string;
};

type LocationLogPayload = {
  locationType: string;
  culture: string;
  locations: GeneratedLocation[];
};

function locationsCopyText(p: LocationLogPayload): string {
  return p.locations
    .map((loc) => {
      const tag = [loc.type, loc.culture].filter(Boolean).join(' · ');
      const head = tag ? `${loc.name}  (${tag})` : loc.name;
      return loc.blurb ? `${head}\n  ${loc.blurb}` : head;
    })
    .join('\n');
}

const TypeSelect = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) => (
  <div>
    <label className="text-xs text-brass-deep font-display uppercase tracking-wider mb-0.5 block">
      Location Type
    </label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-parchment-soft border border-rule rounded px-2 py-1 text-sm text-ink font-serif focus:border-crimson focus:outline-none"
    >
      <option value="Random">Random</option>
      {LOCATION_TYPE_GROUPS.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.types.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </optgroup>
      ))}
    </select>
  </div>
);

const CultureSelect = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) => (
  <div>
    <label className="text-xs text-brass-deep font-display uppercase tracking-wider mb-0.5 block">
      Cultural Tradition
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

export default function LocationsTab({
  logEntries,
  onLogEntriesChange,
}: {
  logEntries: LogEntry[];
  onLogEntriesChange: (next: LogEntry[]) => void;
}) {
  const [locationType, setLocationType] = useState('Random');
  const [culture, setCulture] = useState('Random');
  const [count, setCount] = useState(8);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [locations, setLocations] = useState<GeneratedLocation[]>([]);
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
      const res = await fetch('/api/generate-locations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ locationType, culture, count }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Generate failed (${res.status})`);
      setLocations(Array.isArray(body.locations) ? body.locations : []);
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

  const shuffle = () => {
    setLocationType(ALL_LOCATION_TYPES[Math.floor(Math.random() * ALL_LOCATION_TYPES.length)]);
    setCulture(ALL_CULTURES[Math.floor(Math.random() * ALL_CULTURES.length)]);
  };

  const saveToLog = () => {
    if (locations.length === 0) return;
    const payload: LocationLogPayload = { locationType, culture, locations };
    const title = `${locations.length} location${locations.length === 1 ? '' : 's'} · ${locationType}${culture !== 'Random' ? ` · ${culture}` : ''}`;
    onLogEntriesChange(appendToLog(logEntries, makeLogEntry('locations', title, payload)));
    setSaved(true);
  };

  const renderPayload = (entry: LogEntry) => {
    const p = entry.payload as LocationLogPayload;
    return (
      <ul className="space-y-1.5 font-serif text-sm">
        {p.locations.map((loc, i) => {
          const tag = [loc.type, loc.culture].filter(Boolean).join(' · ');
          return (
            <li key={i} className="space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-ink">{loc.name}</span>
                {tag && <span className="text-[10px] text-ink-mute italic">{tag}</span>}
              </div>
              {loc.blurb && <div className="text-xs text-ink-soft italic">{loc.blurb}</div>}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="space-y-3 text-sm">
      <div className="rounded border border-rule bg-parchment p-3 shadow-card space-y-3">
        <div className="flex items-center gap-2">
          <MapPin size={14} className="text-crimson" />
          <h3 className="font-display tracking-wide text-ink">Location Generator</h3>
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-sm border border-crimson/60 bg-crimson/10 text-crimson font-display uppercase tracking-wider">
            Pro
          </span>
        </div>
        <p className="text-xs text-ink-soft italic font-serif">
          Generate evocative location names — settlements, wilderness, sites, and planar
          spaces — from any cultural tradition. Each entry comes with a one-line hook to
          drop straight onto the map.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <TypeSelect value={locationType} onChange={setLocationType} />
          <CultureSelect value={culture} onChange={setCulture} />
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
            onClick={shuffle}
            disabled={generating}
            className="text-xs px-3 py-1.5 rounded border border-brass-deep/50 text-brass-deep font-display uppercase tracking-wider flex items-center gap-1.5 hover:bg-brass hover:text-parchment hover:border-brass disabled:opacity-50 transition-colors"
            title="Pick a random specific type and culture"
          >
            <Shuffle size={12} /> Shuffle
          </button>
        </div>

        {error && (
          <p className="text-xs text-crimson italic" title={error}>{error}</p>
        )}
      </div>

      {locations.length > 0 && (
        <div className="rounded border border-rule bg-parchment p-3 shadow-card space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] text-ink-mute italic font-serif">
              Click a name to copy it.
            </p>
            <button
              onClick={saveToLog}
              disabled={saved}
              className="text-xs px-3 py-1.5 rounded border border-brass-deep/60 bg-brass/10 text-brass-deep font-display uppercase tracking-wider flex items-center gap-1.5 hover:bg-brass hover:text-parchment hover:border-brass disabled:opacity-50 transition-colors"
            >
              {saved ? <Check size={12} /> : <Save size={12} />}
              {saved ? 'Saved to log' : 'Save to log'}
            </button>
          </div>
          <div className="space-y-1.5">
            {locations.map((loc, i) => {
              const tag = [loc.type, loc.culture].filter(Boolean).join(' · ');
              return (
                <button
                  key={i}
                  onClick={() => copyName(loc.name)}
                  className="w-full flex flex-col items-stretch gap-1 px-2.5 py-1.5 rounded border border-rule bg-parchment-soft hover:bg-parchment-deep/40 transition-colors text-left"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-serif text-ink">{loc.name}</span>
                    <span className="flex items-center gap-2 flex-shrink-0">
                      {tag && (
                        <span className="text-[10px] text-ink-mute italic">{tag}</span>
                      )}
                      {copied === loc.name ? (
                        <Check size={12} className="text-brass-deep" />
                      ) : (
                        <Copy size={12} className="text-ink-mute" />
                      )}
                    </span>
                  </span>
                  {loc.blurb && (
                    <span className="text-xs text-ink-soft italic font-serif leading-snug">
                      {loc.blurb}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <GeneratorLog
        kind="locations"
        entries={logEntries}
        onChange={onLogEntriesChange}
        renderPayload={renderPayload}
        copyText={(e) => locationsCopyText(e.payload as LocationLogPayload)}
        emptyHint="Generate locations, then click 'Save to log' to keep a batch here."
      />
    </div>
  );
}
