'use client';

import { useEffect, useState } from 'react';
import { X, Wand2, Sparkles, Plus, Check, Loader2 } from 'lucide-react';
import TavernGenerator from './generators/TavernGenerator';
import DungeonGenerator from './generators/DungeonGenerator';
import SettlementGenerator from './generators/SettlementGenerator';
import MundaneShopGenerator from './generators/MundaneShopGenerator';
import MagicShopGenerator from './generators/MagicShopGenerator';
import TreasureHoardGenerator from './generators/TreasureHoardGenerator';
import TrinketGenerator from './generators/TrinketGenerator';
import { LockedInline } from './LockedFeature';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { CULTURE_GROUPS, ALL_CULTURES } from '@/lib/cultures';
import { LOCATION_TYPE_GROUPS, ALL_LOCATION_TYPES } from '@/lib/locations';
import type { GeneratorLogs, LogEntry, LogKind } from '@/lib/generators/log';
import type {
  CampaignContext,
  DungeonResult,
  GeneratorResult,
  MagicShopResult,
  MundaneShopResult,
  SettlementResult,
  TavernResult,
  TreasureHoardResult,
  TrinketResult,
} from '@/lib/generators/types';
import type {
  GeneratorMeta,
  PrepSection,
  SummonableKind,
} from '@/lib/generators/sectionMap';
import type {
  GeneratedLocationPayload,
  GeneratedNamePayload,
  ScaledMonsterPayload,
  SummonSaveAction,
} from '@/lib/generators/summon-actions';

type Props = {
  section: PrepSection;
  generator: GeneratorMeta;
  isPro: boolean;
  onClose: () => void;
  onSave: (action: SummonSaveAction) => void;
  campaignContext?: CampaignContext;
  logs: GeneratorLogs;
  setLogEntries: (kind: LogKind) => (next: LogEntry[]) => void;
};

const SECTION_LABEL: Record<PrepSection, string> = {
  locations: 'Fantastic Locations',
  npcs: 'Important NPCs',
  magicItems: 'Magic Item Rewards',
  monsters: 'Relevant Monsters',
};

export default function SummonModal({
  section,
  generator,
  isPro,
  onClose,
  onSave,
  campaignContext,
  logs,
  setLogEntries,
}: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const entriesFor = (k: LogKind): LogEntry[] => logs[k] ?? [];

  // For deterministic generators, save-to-campaign also closes the modal.
  // For per-item AI generators (names/locations), the modal stays open so the
  // user can pick more entries from the same batch.
  const closingSave = <R extends GeneratorResult>(r: R) => {
    onSave({ type: 'generator-result', result: r });
    onClose();
  };

  const stayingSaveNpc = (n: GeneratedNamePayload) => {
    onSave({ type: 'add-npc-from-name', name: n });
  };
  const stayingSaveLoc = (l: GeneratedLocationPayload) => {
    onSave({ type: 'add-location-from-ai', loc: l });
  };
  const closingSaveMonster = (m: ScaledMonsterPayload) => {
    onSave({ type: 'add-monster-scaled', scaled: m });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Summon ${generator.label}`}
    >
      <div
        className="flex max-h-full w-full flex-col rounded-none border border-rule bg-parchment shadow-page sm:max-h-[90vh] sm:max-w-2xl sm:rounded"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between gap-2 border-b border-rule bg-parchment-deep/40 p-3">
          <div className="flex min-w-0 items-center gap-2">
            <Wand2 size={14} className="flex-shrink-0 text-crimson" />
            <h2 className="truncate font-display text-sm tracking-wide text-ink">
              Summon — {generator.label}
            </h2>
            <span className="hidden truncate font-serif text-[10px] italic text-ink-mute sm:inline">
              into {SECTION_LABEL[section]}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 text-ink-mute hover:text-crimson"
          >
            <X size={16} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-3">
          {renderBody({
            kind: generator.kind,
            isPro,
            campaignContext,
            entriesFor,
            setLogEntries,
            closingSave,
            stayingSaveNpc,
            stayingSaveLoc,
            closingSaveMonster,
          })}
        </div>
      </div>
    </div>
  );
}

type BodyArgs = {
  kind: SummonableKind;
  isPro: boolean;
  campaignContext: CampaignContext | undefined;
  entriesFor: (k: LogKind) => LogEntry[];
  setLogEntries: (k: LogKind) => (next: LogEntry[]) => void;
  closingSave: <R extends GeneratorResult>(r: R) => void;
  stayingSaveNpc: (n: GeneratedNamePayload) => void;
  stayingSaveLoc: (l: GeneratedLocationPayload) => void;
  closingSaveMonster: (m: ScaledMonsterPayload) => void;
};

function renderBody(args: BodyArgs): React.ReactNode {
  const {
    kind,
    isPro,
    campaignContext,
    entriesFor,
    setLogEntries,
    closingSave,
    stayingSaveNpc,
    stayingSaveLoc,
    closingSaveMonster,
  } = args;
  switch (kind) {
    case 'tavern':
      return (
        <TavernGenerator
          entries={entriesFor('tavern')}
          onEntriesChange={setLogEntries('tavern')}
          campaignContext={campaignContext}
          saveToCampaign={{ onSave: (r: TavernResult) => closingSave(r) }}
        />
      );
    case 'dungeon':
      return (
        <DungeonGenerator
          entries={entriesFor('dungeon')}
          onEntriesChange={setLogEntries('dungeon')}
          campaignContext={campaignContext}
          saveToCampaign={{ onSave: (r: DungeonResult) => closingSave(r) }}
        />
      );
    case 'settlement':
      return (
        <SettlementGenerator
          entries={entriesFor('settlement')}
          onEntriesChange={setLogEntries('settlement')}
          campaignContext={campaignContext}
          saveToCampaign={{ onSave: (r: SettlementResult) => closingSave(r) }}
        />
      );
    case 'mundane-shop':
      return (
        <MundaneShopGenerator
          entries={entriesFor('mundane-shop')}
          onEntriesChange={setLogEntries('mundane-shop')}
          campaignContext={campaignContext}
          saveToCampaign={{ onSave: (r: MundaneShopResult) => closingSave(r) }}
        />
      );
    case 'magic-shop':
      return (
        <MagicShopGenerator
          entries={entriesFor('magic-shop')}
          onEntriesChange={setLogEntries('magic-shop')}
          campaignContext={campaignContext}
          saveToCampaign={{ onSave: (r: MagicShopResult) => closingSave(r) }}
        />
      );
    case 'treasure-hoard':
      return (
        <TreasureHoardGenerator
          entries={entriesFor('treasure-hoard')}
          onEntriesChange={setLogEntries('treasure-hoard')}
          campaignContext={campaignContext}
          saveToCampaign={{ onSave: (r: TreasureHoardResult) => closingSave(r) }}
        />
      );
    case 'trinket':
      return (
        <TrinketGenerator
          entries={entriesFor('trinket')}
          onEntriesChange={setLogEntries('trinket')}
          campaignContext={campaignContext}
          saveToCampaign={{ onSave: (r: TrinketResult) => closingSave(r) }}
        />
      );
    case 'tavern-name':
      // tavern-name doesn't have a "save to entity" path — only logs.
      return (
        <div className="font-serif text-sm italic text-ink-soft">
          Tavern names are saved to the generator log only; use Tavern to summon a full tavern.
        </div>
      );
    case 'names-ai':
      return isPro ? (
        <NamesAiPanel onAdd={stayingSaveNpc} />
      ) : (
        <ProGate label="AI Name Generator" />
      );
    case 'locations-ai':
      return isPro ? (
        <LocationsAiPanel onAdd={stayingSaveLoc} />
      ) : (
        <ProGate label="AI Location Generator" />
      );
    case 'monster-ai':
      return isPro ? (
        <MonsterScalerPanel onSave={closingSaveMonster} />
      ) : (
        <ProGate label="AI Monster Scaler" />
      );
  }
}

function ProGate({ label }: { label: string }) {
  return (
    <div className="space-y-2 rounded border border-rule bg-parchment-soft/40 p-4 font-serif text-sm text-ink-soft">
      <p>
        <span className="font-display tracking-wide text-ink">{label}</span> is a Pro feature.
      </p>
      <p className="text-xs italic">
        Join the Pro waitlist on{' '}
        <a href="/account" className="text-crimson underline hover:no-underline">
          your account page
        </a>{' '}
        to use AI generation.
      </p>
      <LockedInline label={label} />
    </div>
  );
}

// ── AI Names panel ──────────────────────────────────────────────────────────

const GENDERS = ['Any', 'Masculine', 'Feminine', 'Androgynous'] as const;

function NamesAiPanel({ onAdd }: { onAdd: (n: GeneratedNamePayload) => void }) {
  const [firstCulture, setFirstCulture] = useState('Random');
  const [lastCulture, setLastCulture] = useState('Random');
  const [gender, setGender] = useState<(typeof GENDERS)[number]>('Any');
  const [count, setCount] = useState(8);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [names, setNames] = useState<GeneratedNamePayload[]>([]);
  const [added, setAdded] = useState<Record<number, boolean>>({});

  const generate = async () => {
    setGenerating(true);
    setError('');
    setAdded({});
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('Not signed in');
      const idToken = await user.getIdToken();
      const res = await fetch('/api/generate-names', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ firstCulture, lastCulture, gender, count }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Generate failed (${res.status})`);
      setNames(Array.isArray(body.names) ? body.names : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Generate failed');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-3 rounded border border-rule bg-parchment p-3 shadow-card">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-crimson" />
          <h3 className="font-display tracking-wide text-ink">AI Name Generator</h3>
        </div>
        <p className="font-serif text-xs italic text-ink-soft">
          Generate first / surname pairs from any culture, then add the ones you like as NPCs.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <CultureSelect label="First Name Culture" value={firstCulture} onChange={setFirstCulture} />
          <CultureSelect label="Surname Culture" value={lastCulture} onChange={setLastCulture} />
          <SelectField label="Gender" value={gender} onChange={(v) => setGender(v as (typeof GENDERS)[number])}>
            {GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
          </SelectField>
          <SelectField label="How Many" value={String(count)} onChange={(v) => setCount(Number(v))}>
            {[4, 6, 8, 12, 16].map((n) => <option key={n} value={n}>{n}</option>)}
          </SelectField>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={generate}
            disabled={generating}
            className="flex items-center gap-1.5 rounded border border-crimson bg-crimson px-3 py-1.5 font-display text-xs uppercase tracking-wider text-parchment transition-colors hover:border-wine hover:bg-wine disabled:cursor-wait disabled:opacity-50"
          >
            {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {generating ? 'Generating…' : 'Generate'}
          </button>
          <button
            onClick={() => {
              const pick = () => ALL_CULTURES[Math.floor(Math.random() * ALL_CULTURES.length)];
              setFirstCulture(pick());
              setLastCulture(pick());
            }}
            disabled={generating}
            className="flex items-center gap-1.5 rounded border border-brass-deep/50 px-3 py-1.5 font-display text-xs uppercase tracking-wider text-brass-deep transition-colors hover:border-brass hover:bg-brass hover:text-parchment disabled:opacity-50"
          >
            Shuffle Cultures
          </button>
        </div>
        {error && <p className="text-xs italic text-crimson" title={error}>{error}</p>}
      </div>

      {names.length > 0 && (
        <div className="space-y-2 rounded border border-rule bg-parchment p-3 shadow-card">
          <p className="font-serif text-[11px] italic text-ink-mute">
            Click <span className="font-display uppercase tracking-wider text-crimson">+ Add</span> next to each name to add it as an NPC.
          </p>
          <div className="space-y-1.5">
            {names.map((n, i) => {
              const full = [n.first, n.last].filter(Boolean).join(' ');
              const sameCulture = n.firstCulture && n.firstCulture === n.lastCulture;
              const tag = sameCulture
                ? n.firstCulture
                : [n.firstCulture, n.lastCulture].filter(Boolean).join(' · ');
              const isAdded = !!added[i];
              return (
                <div key={i} className="flex items-center justify-between gap-2 rounded border border-rule bg-parchment-soft px-2.5 py-1.5">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-serif text-ink">{full}</span>
                    {tag && <span className="text-[10px] italic text-ink-mute">{tag}</span>}
                  </div>
                  <button
                    onClick={() => {
                      onAdd(n);
                      setAdded((a) => ({ ...a, [i]: true }));
                    }}
                    disabled={isAdded}
                    className="flex flex-shrink-0 items-center gap-1 rounded border border-crimson/60 bg-crimson/10 px-2 py-1 font-display text-[11px] uppercase tracking-wider text-crimson hover:border-crimson hover:bg-crimson hover:text-parchment disabled:opacity-50"
                  >
                    {isAdded ? <Check size={11} /> : <Plus size={11} />}
                    {isAdded ? 'Added' : 'Add as NPC'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── AI Locations panel ──────────────────────────────────────────────────────

function LocationsAiPanel({ onAdd }: { onAdd: (l: GeneratedLocationPayload) => void }) {
  const [locationType, setLocationType] = useState('Random');
  const [culture, setCulture] = useState('Random');
  const [count, setCount] = useState(6);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [locations, setLocations] = useState<GeneratedLocationPayload[]>([]);
  const [added, setAdded] = useState<Record<number, boolean>>({});

  const generate = async () => {
    setGenerating(true);
    setError('');
    setAdded({});
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('Not signed in');
      const idToken = await user.getIdToken();
      const res = await fetch('/api/generate-locations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ locationType, culture, count }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Generate failed (${res.status})`);
      setLocations(Array.isArray(body.locations) ? body.locations : []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Generate failed');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-3 rounded border border-rule bg-parchment p-3 shadow-card">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-crimson" />
          <h3 className="font-display tracking-wide text-ink">AI Location Generator</h3>
        </div>
        <p className="font-serif text-xs italic text-ink-soft">
          Generate evocative location names, then add the ones you like to your Fantastic Locations.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SelectField label="Location Type" value={locationType} onChange={setLocationType}>
            <option value="Random">Random</option>
            {LOCATION_TYPE_GROUPS.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.types.map((t) => <option key={t} value={t}>{t}</option>)}
              </optgroup>
            ))}
          </SelectField>
          <CultureSelect label="Cultural Tradition" value={culture} onChange={setCulture} />
          <SelectField label="How Many" value={String(count)} onChange={(v) => setCount(Number(v))}>
            {[4, 6, 8, 12].map((n) => <option key={n} value={n}>{n}</option>)}
          </SelectField>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={generate}
            disabled={generating}
            className="flex items-center gap-1.5 rounded border border-crimson bg-crimson px-3 py-1.5 font-display text-xs uppercase tracking-wider text-parchment transition-colors hover:border-wine hover:bg-wine disabled:cursor-wait disabled:opacity-50"
          >
            {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {generating ? 'Generating…' : 'Generate'}
          </button>
          <button
            onClick={() => {
              setLocationType(ALL_LOCATION_TYPES[Math.floor(Math.random() * ALL_LOCATION_TYPES.length)]);
              setCulture(ALL_CULTURES[Math.floor(Math.random() * ALL_CULTURES.length)]);
            }}
            disabled={generating}
            className="flex items-center gap-1.5 rounded border border-brass-deep/50 px-3 py-1.5 font-display text-xs uppercase tracking-wider text-brass-deep transition-colors hover:border-brass hover:bg-brass hover:text-parchment disabled:opacity-50"
          >
            Shuffle
          </button>
        </div>
        {error && <p className="text-xs italic text-crimson" title={error}>{error}</p>}
      </div>

      {locations.length > 0 && (
        <div className="space-y-2 rounded border border-rule bg-parchment p-3 shadow-card">
          <p className="font-serif text-[11px] italic text-ink-mute">
            Click <span className="font-display uppercase tracking-wider text-crimson">+ Add</span> next to a location to drop it into your Fantastic Locations list.
          </p>
          <div className="space-y-1.5">
            {locations.map((l, i) => {
              const tag = [l.type, l.culture].filter(Boolean).join(' · ');
              const isAdded = !!added[i];
              return (
                <div key={i} className="flex items-start justify-between gap-2 rounded border border-rule bg-parchment-soft px-2.5 py-2">
                  <div className="flex min-w-0 flex-col">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-serif text-ink">{l.name}</span>
                      {tag && <span className="flex-shrink-0 text-[10px] italic text-ink-mute">{tag}</span>}
                    </div>
                    {l.blurb && <span className="font-serif text-xs italic leading-snug text-ink-soft">{l.blurb}</span>}
                  </div>
                  <button
                    onClick={() => {
                      onAdd(l);
                      setAdded((a) => ({ ...a, [i]: true }));
                    }}
                    disabled={isAdded}
                    className="flex flex-shrink-0 items-center gap-1 rounded border border-crimson/60 bg-crimson/10 px-2 py-1 font-display text-[11px] uppercase tracking-wider text-crimson hover:border-crimson hover:bg-crimson hover:text-parchment disabled:opacity-50"
                  >
                    {isAdded ? <Check size={11} /> : <Plus size={11} />}
                    {isAdded ? 'Added' : 'Add'}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── AI Monster Scaler panel ────────────────────────────────────────────────

const CR_OPTIONS = [
  '0', '1/8', '1/4', '1/2', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10',
  '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
];

function MonsterScalerPanel({ onSave }: { onSave: (m: ScaledMonsterPayload) => void }) {
  const [description, setDescription] = useState('');
  const [cr, setCr] = useState('5');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [monster, setMonster] = useState<ScaledMonsterPayload | null>(null);

  const generate = async () => {
    const desc = description.trim();
    if (!desc) {
      setError('Describe the monster you want.');
      return;
    }
    setGenerating(true);
    setError('');
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('Not signed in');
      const idToken = await user.getIdToken();
      const res = await fetch('/api/generate-monster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ description: desc, cr }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Generate failed (${res.status})`);
      if (!body?.monster) throw new Error('Empty response');
      setMonster(body.monster as ScaledMonsterPayload);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Generate failed');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-3 text-sm">
      <div className="space-y-3 rounded border border-rule bg-parchment p-3 shadow-card">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-crimson" />
          <h3 className="font-display tracking-wide text-ink">Scale a Monster</h3>
        </div>
        <p className="font-serif text-xs italic text-ink-soft">
          Describe a creature and pick a target CR. Claude finds the closest existing bestiary
          entry and scales it into a full statblock at the CR you asked for. Saving adds it to
          your Relevant Monsters list and your Homebrew Monsters bestiary.
        </p>
        <div className="space-y-2">
          <label className="block font-display text-xs uppercase tracking-wider text-brass-deep">
            Monster Concept
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. A coral-armored sea wraith that drowns sailors in their dreams."
            rows={3}
            maxLength={600}
            className="w-full resize-y rounded border border-rule bg-parchment-soft px-2 py-1.5 font-serif text-sm text-ink placeholder-ink-faint focus:border-crimson focus:outline-none"
          />
        </div>
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
          <SelectField label="Target CR" value={cr} onChange={setCr}>
            {CR_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </SelectField>
          <button
            onClick={generate}
            disabled={generating || !description.trim()}
            className="flex items-center justify-center gap-1.5 rounded border border-crimson bg-crimson px-3 py-1.5 font-display text-xs uppercase tracking-wider text-parchment transition-colors hover:border-wine hover:bg-wine disabled:cursor-wait disabled:opacity-50"
          >
            {generating ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {generating ? 'Generating…' : 'Scale Monster'}
          </button>
        </div>
        {error && <p className="font-serif text-xs italic text-crimson" title={error}>{error}</p>}
      </div>

      {monster && (
        <div className="space-y-2 rounded border border-rule bg-parchment p-3 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="font-display text-base tracking-wide">{monster.name}</div>
              <div className="font-serif text-[11px] italic text-ink-mute">
                CR {monster.cr} · scaled from {monster.sourceMonster}
              </div>
            </div>
            <button
              onClick={() => onSave(monster)}
              className="flex items-center gap-1.5 rounded border border-crimson bg-crimson px-3 py-1.5 font-display text-xs uppercase tracking-wider text-parchment transition-colors hover:border-wine hover:bg-wine"
            >
              <Plus size={12} /> Save to Campaign
            </button>
          </div>
          <div className="border-l-2 border-rule pl-2 font-serif text-xs italic text-ink-soft">
            {monster.scalingNote}
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-serif text-xs sm:grid-cols-3">
            <div><span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">AC</span> {monster.ac}</div>
            <div><span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">HP</span> {monster.hp}</div>
            <div><span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Speed</span> {monster.speed}</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── shared mini-inputs ─────────────────────────────────────────────────────

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-0.5 block font-display text-xs uppercase tracking-wider text-brass-deep">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-sm text-ink focus:border-crimson focus:outline-none"
      >
        {children}
      </select>
    </div>
  );
}

function CultureSelect({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <SelectField label={label} value={value} onChange={onChange}>
      <option value="Random">Random</option>
      {CULTURE_GROUPS.map((group) => (
        <optgroup key={group.label} label={group.label}>
          {group.cultures.map((c) => <option key={c} value={c}>{c}</option>)}
        </optgroup>
      ))}
    </SelectField>
  );
}
