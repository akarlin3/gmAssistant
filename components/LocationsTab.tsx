'use client';

import { useState } from 'react';
import { Sparkles, Shuffle, Copy, Check, MapPin, Save } from 'lucide-react';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { CULTURE_GROUPS, ALL_CULTURES } from '@/lib/cultures';
import { LOCATION_TYPE_GROUPS, ALL_LOCATION_TYPES } from '@/lib/locations';
import GeneratorLog from './generators/GeneratorLog';
import AddToCampaignPicker from './generators/AddToCampaignPicker';
import { appendToLog, makeLogEntry, type LogEntry } from '@/lib/generators/log';
import type { CampaignDestKey, SelectableItem } from '@/lib/generators/addToCampaign';

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
    <label className="mb-0.5 block font-display text-xs uppercase tracking-wider text-brass-deep">
      Location Type
    </label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-sm text-ink focus:border-crimson focus:outline-none"
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
    <label className="mb-0.5 block font-display text-xs uppercase tracking-wider text-brass-deep">
      Cultural Tradition
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

export default function LocationsTab({
  logEntries,
  onLogEntriesChange,
  onAddToCampaign,
}: {
  logEntries: LogEntry[];
  onLogEntriesChange: (next: LogEntry[]) => void;
  onAddToCampaign?: (dest: CampaignDestKey, items: SelectableItem[]) => void;
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
                {tag && <span className="text-[10px] italic text-ink-mute">{tag}</span>}
              </div>
              {loc.blurb && <div className="text-xs italic text-ink-soft">{loc.blurb}</div>}
            </li>
          );
        })}
      </ul>
    );
  };

  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-3 rounded border border-rule bg-parchment p-3 shadow-card">
        <div className="flex items-center gap-2">
          <MapPin size={14} className="text-crimson" />
          <h3 className="font-display tracking-wide text-ink">Location Generator</h3>
          <span className="ml-auto rounded-sm border border-crimson/60 bg-crimson/10 px-1.5 py-0.5 font-display text-[10px] uppercase tracking-wider text-crimson">
            Pro
          </span>
        </div>
        <p className="font-serif text-xs italic text-ink-soft">
          Generate evocative location names — settlements, wilderness, sites, and planar
          spaces — from any cultural tradition. Each entry comes with a one-line hook to
          drop straight onto the map.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <TypeSelect value={locationType} onChange={setLocationType} />
          <CultureSelect value={culture} onChange={setCulture} />
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
            onClick={shuffle}
            disabled={generating}
            className="flex items-center gap-1.5 rounded border border-brass-deep/50 px-3 py-1.5 font-display text-xs uppercase tracking-wider text-brass-deep transition-colors hover:border-brass hover:bg-brass hover:text-parchment disabled:opacity-50"
            title="Pick a random specific type and culture"
          >
            <Shuffle size={12} /> Shuffle
          </button>
        </div>

        {error && (
          <p className="text-xs italic text-crimson" title={error}>{error}</p>
        )}
      </div>

      {locations.length > 0 && (
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
            {locations.map((loc, i) => {
              const tag = [loc.type, loc.culture].filter(Boolean).join(' · ');
              return (
                <button
                  key={i}
                  onClick={() => copyName(loc.name)}
                  className="flex w-full flex-col items-stretch gap-1 rounded border border-rule bg-parchment-soft px-2.5 py-1.5 text-left transition-colors hover:bg-parchment-deep/40"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-serif text-ink">{loc.name}</span>
                    <span className="flex flex-shrink-0 items-center gap-2">
                      {tag && (
                        <span className="text-[10px] italic text-ink-mute">{tag}</span>
                      )}
                      {copied === loc.name ? (
                        <Check size={12} className="text-brass-deep" />
                      ) : (
                        <Copy size={12} className="text-ink-mute" />
                      )}
                    </span>
                  </span>
                  {loc.blurb && (
                    <span className="font-serif text-xs italic leading-snug text-ink-soft">
                      {loc.blurb}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {onAddToCampaign && (
            <AddToCampaignPicker
              kind="locations"
              payload={{ locationType, culture, locations } satisfies LocationLogPayload}
              onAdd={onAddToCampaign}
            />
          )}
        </div>
      )}

      <GeneratorLog
        kind="locations"
        entries={logEntries}
        onChange={onLogEntriesChange}
        renderPayload={renderPayload}
        copyText={(e) => locationsCopyText(e.payload as LocationLogPayload)}
        emptyHint="Generate locations, then click 'Save to log' to keep a batch here."
        onAddToCampaign={onAddToCampaign}
      />
    </div>
  );
}
