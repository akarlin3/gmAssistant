'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Dice5,
  RefreshCw,
  Loader2,
  ShieldAlert,
  Wand2,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Save,
  Check,
} from 'lucide-react';
import { CR_TO_XP } from '@/lib/encounterMath';
import { useAuth } from '@/lib/firebase/auth-context';
import { LockedPanel } from './LockedFeature';
import MonsterScaler from './MonsterScaler';
import EncounterBuilder from './EncounterBuilder';
import GeneratorLog from './generators/GeneratorLog';
import { appendToLog, makeLogEntry, type LogEntry } from '@/lib/generators/log';
import type { CampaignDestKey, SelectableItem } from '@/lib/generators/addToCampaign';
import AddToCampaignPicker from './generators/AddToCampaignPicker';
import type { Character } from '@/lib/character-schema';

type Mode = 'roll' | 'scale' | 'build' | 'homebrew';

type Action = {
  name: string;
  desc: string;
  attack_bonus?: number;
  damage_dice?: string;
};

type Monster = {
  slug: string;
  name: string;
  size: string;
  type: string;
  subtype: string;
  alignment: string;
  armor_class: number | null;
  armor_desc: string;
  hit_points: number | null;
  hit_dice: string;
  speed: Record<string, number | boolean>;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  strength_save: number | null;
  dexterity_save: number | null;
  constitution_save: number | null;
  intelligence_save: number | null;
  wisdom_save: number | null;
  charisma_save: number | null;
  skills: Record<string, number>;
  damage_vulnerabilities: string;
  damage_resistances: string;
  damage_immunities: string;
  condition_immunities: string;
  senses: string;
  languages: string;
  challenge_rating: string;
  cr: number;
  actions: Action[];
  bonus_actions: Action[];
  reactions: Action[];
  legendary_desc: string;
  legendary_actions: Action[];
  special_abilities: Action[];
  desc: string;
  source: string;
  homebrew?: boolean;
};

export type HomebrewMonster = Monster;

const SIZES = ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan'] as const;

const TYPES = [
  'Aberration', 'Beast', 'Celestial', 'Construct', 'Dragon', 'Elemental',
  'Fey', 'Fiend', 'Giant', 'Humanoid', 'Monstrosity', 'Ooze', 'Plant', 'Swarm', 'Undead',
] as const;

const CR_OPTIONS: { label: string; value: number }[] = [
  { label: '0', value: 0 },
  { label: '1/8', value: 0.125 },
  { label: '1/4', value: 0.25 },
  { label: '1/2', value: 0.5 },
  { label: '1', value: 1 },
  { label: '2', value: 2 },
  { label: '3', value: 3 },
  { label: '4', value: 4 },
  { label: '5', value: 5 },
  { label: '6', value: 6 },
  { label: '7', value: 7 },
  { label: '8', value: 8 },
  { label: '10', value: 10 },
  { label: '12', value: 12 },
  { label: '15', value: 15 },
  { label: '18', value: 18 },
  { label: '20', value: 20 },
  { label: '25', value: 25 },
  { label: '30', value: 30 },
];

const CR_LABEL_TO_VALUE: Record<string, number> = Object.fromEntries(
  CR_OPTIONS.map((o) => [o.label, o.value]),
);

function makeHomebrewSlug(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `hb-${crypto.randomUUID()}`;
  }
  return `hb-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function blankHomebrewMonster(): HomebrewMonster {
  return {
    slug: makeHomebrewSlug(),
    name: '',
    size: 'Medium',
    type: 'Humanoid',
    subtype: '',
    alignment: 'unaligned',
    armor_class: 10,
    armor_desc: '',
    hit_points: 10,
    hit_dice: '',
    speed: { walk: 30 },
    strength: 10,
    dexterity: 10,
    constitution: 10,
    intelligence: 10,
    wisdom: 10,
    charisma: 10,
    strength_save: null,
    dexterity_save: null,
    constitution_save: null,
    intelligence_save: null,
    wisdom_save: null,
    charisma_save: null,
    skills: {},
    damage_vulnerabilities: '',
    damage_resistances: '',
    damage_immunities: '',
    condition_immunities: '',
    senses: '',
    languages: '',
    challenge_rating: '1',
    cr: 1,
    actions: [],
    bonus_actions: [],
    reactions: [],
    legendary_desc: '',
    legendary_actions: [],
    special_abilities: [],
    desc: '',
    source: 'Homebrew',
    homebrew: true,
  };
}

function mod(score: number): string {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}

function fmtSave(score: number, save: number | null): string {
  return save != null ? (save >= 0 ? `+${save}` : `${save}`) : mod(score);
}

function fmtSpeed(speed: Record<string, number | boolean>): string {
  if (!speed) return '—';
  const parts: string[] = [];
  const walk = speed.walk;
  if (typeof walk === 'number' && walk > 0) parts.push(`${walk} ft.`);
  const order = ['burrow', 'climb', 'fly', 'swim'];
  for (const k of order) {
    const v = speed[k];
    if (typeof v === 'number' && v > 0) {
      parts.push(`${k} ${v} ft.${k === 'fly' && speed.hover ? ' (hover)' : ''}`);
    }
  }
  return parts.join(', ') || '—';
}

function fmtSkills(skills: Record<string, number>): string {
  return Object.entries(skills)
    .map(([k, v]) => {
      const name = k.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
      return `${name} ${v >= 0 ? '+' : ''}${v}`;
    })
    .join(', ');
}

function fmtSaves(m: Monster): string {
  const entries: string[] = [];
  const push = (label: string, score: number, save: number | null) => {
    if (save != null) entries.push(`${label} ${save >= 0 ? '+' : ''}${save}`);
  };
  push('Str', m.strength, m.strength_save);
  push('Dex', m.dexterity, m.dexterity_save);
  push('Con', m.constitution, m.constitution_save);
  push('Int', m.intelligence, m.intelligence_save);
  push('Wis', m.wisdom, m.wisdom_save);
  push('Cha', m.charisma, m.charisma_save);
  return entries.join(', ');
}

function fmtCR(cr: string): string {
  const xp = CR_TO_XP[cr];
  return xp != null ? `${cr} (${xp.toLocaleString()} XP)` : cr;
}

function fmtTypeLine(m: Monster): string {
  const size = m.size || '';
  const type = m.type || '';
  const sub = m.subtype ? ` (${m.subtype})` : '';
  const align = m.alignment || 'unaligned';
  return `${size} ${type.toLowerCase()}${sub}, ${align}`;
}

const Chip = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-sm border px-2 py-0.5 font-display uppercase tracking-wider transition-colors ${
      active
        ? 'border-crimson bg-crimson text-parchment'
        : 'border-rule text-ink-soft hover:bg-parchment-deep'
    }`}
  >
    {children}
  </button>
);

function AbilityCell({ label, score }: { label: string; score: number }) {
  return (
    <div className="rounded-sm border border-rule bg-parchment-soft px-1 py-1.5 text-center">
      <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">{label}</div>
      <div className="font-serif text-sm leading-tight">
        {score} <span className="text-ink-mute">({mod(score)})</span>
      </div>
    </div>
  );
}

function StatLine({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value == null || value === '') return null;
  return (
    <div className="text-xs leading-snug">
      <span className="font-display uppercase tracking-wider text-brass-deep">{label}</span>{' '}
      <span className="font-serif text-ink">{value}</span>
    </div>
  );
}

function ActionBlock({ entries, heading }: { entries: Action[]; heading?: string }) {
  if (!entries || entries.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {heading && (
        <div className="border-b border-rule pb-0.5 font-display text-xs uppercase tracking-wider text-brass-deep">
          {heading}
        </div>
      )}
      {entries.map((a, i) => (
        <div key={i} className="text-xs leading-snug">
          <span className="font-display font-semibold italic text-ink">{a.name}.</span>{' '}
          <span className="whitespace-pre-wrap font-serif text-ink">{a.desc}</span>
        </div>
      ))}
    </div>
  );
}

function StatBlock({ m }: { m: Monster }) {
  return (
    <div className="space-y-3 rounded border-2 border-brass-deep/60 bg-parchment p-4 shadow-sm">
      <div>
        <div className="flex items-start gap-2">
          <h3 className="flex-1 font-display text-xl uppercase tracking-wider text-crimson">
            {m.name || (m.homebrew ? 'Untitled Homebrew' : '')}
          </h3>
          {m.homebrew && (
            <span
              className="mt-1 inline-flex items-center gap-0.5 rounded-sm border border-wine/60 px-1.5 py-0.5 font-display text-[10px] tracking-wider text-wine"
              title="Homebrew"
            >
              <Wand2 size={10} /> HB
            </span>
          )}
        </div>
        <div className="font-serif text-sm italic text-ink-soft">{fmtTypeLine(m)}</div>
      </div>

      <div className="space-y-1 border-y border-rule py-2">
        <StatLine
          label="Armor Class"
          value={m.armor_class != null ? `${m.armor_class}${m.armor_desc ? ` (${m.armor_desc})` : ''}` : '—'}
        />
        <StatLine
          label="Hit Points"
          value={m.hit_points != null ? `${m.hit_points}${m.hit_dice ? ` (${m.hit_dice})` : ''}` : '—'}
        />
        <StatLine label="Speed" value={fmtSpeed(m.speed)} />
      </div>

      <div className="grid grid-cols-6 gap-1">
        <AbilityCell label="Str" score={m.strength} />
        <AbilityCell label="Dex" score={m.dexterity} />
        <AbilityCell label="Con" score={m.constitution} />
        <AbilityCell label="Int" score={m.intelligence} />
        <AbilityCell label="Wis" score={m.wisdom} />
        <AbilityCell label="Cha" score={m.charisma} />
      </div>

      <div className="space-y-1 border-t border-rule pt-2">
        <StatLine label="Saving Throws" value={fmtSaves(m) || undefined} />
        <StatLine label="Skills" value={fmtSkills(m.skills) || undefined} />
        <StatLine label="Damage Vulnerabilities" value={m.damage_vulnerabilities} />
        <StatLine label="Damage Resistances" value={m.damage_resistances} />
        <StatLine label="Damage Immunities" value={m.damage_immunities} />
        <StatLine label="Condition Immunities" value={m.condition_immunities} />
        <StatLine label="Senses" value={m.senses} />
        <StatLine label="Languages" value={m.languages || '—'} />
        <StatLine label="Challenge" value={fmtCR(m.challenge_rating)} />
      </div>

      {m.special_abilities.length > 0 && (
        <div className="border-t border-rule pt-2">
          <ActionBlock entries={m.special_abilities} />
        </div>
      )}

      {m.actions.length > 0 && (
        <div className="border-t border-rule pt-2">
          <ActionBlock entries={m.actions} heading="Actions" />
        </div>
      )}

      {m.bonus_actions.length > 0 && (
        <div className="border-t border-rule pt-2">
          <ActionBlock entries={m.bonus_actions} heading="Bonus Actions" />
        </div>
      )}

      {m.reactions.length > 0 && (
        <div className="border-t border-rule pt-2">
          <ActionBlock entries={m.reactions} heading="Reactions" />
        </div>
      )}

      {m.legendary_actions.length > 0 && (
        <div className="space-y-1.5 border-t border-rule pt-2">
          <div className="border-b border-rule pb-0.5 font-display text-xs uppercase tracking-wider text-brass-deep">
            Legendary Actions
          </div>
          {m.legendary_desc && (
            <div className="whitespace-pre-wrap font-serif text-xs italic text-ink-soft">{m.legendary_desc}</div>
          )}
          <ActionBlock entries={m.legendary_actions} />
        </div>
      )}

      {m.desc && (
        <div className="border-t border-rule pt-2">
          <details className="text-xs">
            <summary className="cursor-pointer font-display uppercase tracking-wider text-brass-deep">
              Lore
            </summary>
            <div className="mt-1 whitespace-pre-wrap font-serif text-ink">{m.desc}</div>
          </details>
        </div>
      )}

      <div className="pt-1 font-display text-[10px] uppercase tracking-wider text-ink-mute">
        Source: {m.source || 'Unknown'}
        {m.homebrew && ' · Homebrew'}
      </div>
    </div>
  );
}

function pickRandom<T>(arr: T[], avoid?: T): T | null {
  if (arr.length === 0) return null;
  if (arr.length === 1) return arr[0];
  let idx = Math.floor(Math.random() * arr.length);
  if (avoid && arr[idx] === avoid) idx = (idx + 1) % arr.length;
  return arr[idx];
}

export default function MonstersTab({
  characters,
  homebrewMonsters,
  onHomebrewMonstersChange,
  rollLogEntries,
  onRollLogEntriesChange,
  scaleLogEntries,
  onScaleLogEntriesChange,
  onAddRollToCampaign,
  onAddScaleToCampaign,
}: {
  characters?: Character[];
  homebrewMonsters: HomebrewMonster[];
  onHomebrewMonstersChange: (next: HomebrewMonster[]) => void;
  rollLogEntries: LogEntry[];
  onRollLogEntriesChange: (next: LogEntry[]) => void;
  scaleLogEntries: LogEntry[];
  onScaleLogEntriesChange: (next: LogEntry[]) => void;
  onAddRollToCampaign?: (dest: CampaignDestKey, items: SelectableItem[]) => void;
  onAddScaleToCampaign?: (dest: CampaignDestKey, items: SelectableItem[]) => void;
}) {
  const { isPro } = useAuth();
  const [mode, setMode] = useState<Mode>('roll');
  const [srdMonsters, setSrdMonsters] = useState<Monster[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [crMinIdx, setCrMinIdx] = useState(0);
  const [crMaxIdx, setCrMaxIdx] = useState(CR_OPTIONS.length - 1);
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [hbOnly, setHbOnly] = useState(false);
  const [picked, setPicked] = useState<Monster | null>(null);
  const [savedRoll, setSavedRoll] = useState(false);

  const saveRollToLog = () => {
    if (!picked) return;
    const title = `${picked.name} · CR ${picked.challenge_rating}${picked.homebrew ? ' · HB' : ''}`;
    onRollLogEntriesChange(appendToLog(rollLogEntries, makeLogEntry('monster-roll', title, picked)));
    setSavedRoll(true);
  };

  useEffect(() => {
    let alive = true;
    fetch('/srd/monsters.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: Monster[]) => {
        if (alive) setSrdMonsters(data);
      })
      .catch((e) => {
        if (alive) setLoadError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      alive = false;
    };
  }, []);

  const crMin = CR_OPTIONS[crMinIdx].value;
  const crMax = CR_OPTIONS[crMaxIdx].value;

  const allMonsters = useMemo<Monster[] | null>(() => {
    if (!srdMonsters) return null;
    return [...homebrewMonsters, ...srdMonsters];
  }, [srdMonsters, homebrewMonsters]);

  const pool = useMemo(() => {
    if (!allMonsters) return [];
    return allMonsters.filter((m) => {
      if (hbOnly && !m.homebrew) return false;
      if (m.cr < crMin || m.cr > crMax) return false;
      if (types.size && !types.has(m.type)) return false;
      return true;
    });
  }, [allMonsters, hbOnly, crMin, crMax, types]);

  const roll = () => {
    const next = pickRandom(pool, picked ?? undefined);
    if (next) {
      setPicked(next);
      setSavedRoll(false);
    }
  };

  const toggleType = (t: string) => {
    setTypes((cur) => {
      const next = new Set(cur);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const clearFilters = () => {
    setCrMinIdx(0);
    setCrMaxIdx(CR_OPTIONS.length - 1);
    setTypes(new Set());
    setHbOnly(false);
  };

  const totalCount = allMonsters?.length ?? 0;
  const denominator = hbOnly ? homebrewMonsters.length : totalCount;

  const modeToggle = (
    <div
      role="tablist"
      aria-label="Monsters mode"
      className="inline-flex overflow-hidden rounded border border-rule font-display text-xs uppercase tracking-wider"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'roll'}
        onClick={() => setMode('roll')}
        className={`px-3 py-1.5 transition-colors ${
          mode === 'roll' ? 'bg-crimson text-parchment' : 'text-ink-soft hover:bg-parchment-deep'
        }`}
      >
        Random Roll
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'scale'}
        onClick={() => setMode('scale')}
        className={`flex items-center gap-1.5 border-l border-rule px-3 py-1.5 transition-colors ${
          mode === 'scale' ? 'bg-crimson text-parchment' : 'text-ink-soft hover:bg-parchment-deep'
        }`}
      >
        Scale to CR
        <span
          className={`rounded-sm border px-1 py-0.5 text-[9px] ${
            mode === 'scale'
              ? 'border-parchment/60 text-parchment/90'
              : 'border-crimson/60 bg-crimson/10 text-crimson'
          }`}
        >
          Pro
        </span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'homebrew'}
        onClick={() => setMode('homebrew')}
        className={`flex items-center gap-1.5 border-l border-rule px-3 py-1.5 transition-colors ${
          mode === 'homebrew' ? 'bg-crimson text-parchment' : 'text-ink-soft hover:bg-parchment-deep'
        }`}
      >
        <Wand2 size={12} />
        Homebrew
        {homebrewMonsters.length > 0 && (
          <span
            className={`rounded-sm px-1 py-0 text-[10px] ${
              mode === 'homebrew' ? 'bg-parchment/20' : 'bg-parchment-deep text-ink-mute'
            }`}
          >
            {homebrewMonsters.length}
          </span>
        )}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'build'}
        onClick={() => setMode('build')}
        className={`border-l border-rule px-3 py-1.5 transition-colors ${
          mode === 'build' ? 'bg-crimson text-parchment' : 'text-ink-soft hover:bg-parchment-deep'
        }`}
      >
        Build Encounter
      </button>
    </div>
  );

  if (mode === 'scale') {
    return (
      <div className="space-y-3">
        {modeToggle}
        {isPro ? (
          <MonsterScaler
            logEntries={scaleLogEntries}
            onLogEntriesChange={onScaleLogEntriesChange}
            onAddToCampaign={onAddScaleToCampaign}
          />
        ) : (
          <LockedPanel title="Scale a Monster to CR">
            Describe any monster — a coral-armored sea wraith, a hexblade lord, a clockwork hydra —
            pick a target CR, and Claude finds the closest bestiary entry and scales it into a full
            statblock ready to drop into your next encounter.
          </LockedPanel>
        )}
      </div>
    );
  }

  if (mode === 'homebrew') {
    return (
      <div className="space-y-3">
        {modeToggle}
        <HomebrewManager
          homebrewMonsters={homebrewMonsters}
          onChange={onHomebrewMonstersChange}
        />
      </div>
    );
  }

  if (mode === 'build') {
    return (
      <div className="space-y-3">
        {modeToggle}
        <EncounterBuilder characters={characters} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-3">
        {modeToggle}
        <div className="rounded border border-crimson/40 bg-parchment-soft p-4 text-sm text-ink">
          <div className="flex items-center gap-2 font-display uppercase tracking-wider text-crimson">
            <ShieldAlert size={16} /> Couldn&rsquo;t load monsters
          </div>
          <div className="mt-1 font-serif text-ink-soft">{loadError}</div>
        </div>
      </div>
    );
  }

  if (!srdMonsters) {
    return (
      <div className="space-y-3">
        {modeToggle}
        <div className="flex items-center gap-2 rounded border border-rule bg-parchment-soft p-6 font-serif text-sm text-ink-mute">
          <Loader2 size={16} className="animate-spin" /> Loading bestiary&hellip;
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {modeToggle}
      <div className="space-y-3 rounded border border-rule bg-parchment-soft p-3 text-xs">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="mb-1 font-display text-[10px] uppercase tracking-wider text-brass-deep">CR Min</div>
            <select
              value={crMinIdx}
              onChange={(e) => {
                const v = Number(e.target.value);
                setCrMinIdx(v);
                if (v > crMaxIdx) setCrMaxIdx(v);
              }}
              className="rounded-sm border border-rule bg-parchment px-2 py-1 font-serif text-sm text-ink focus:border-brass-deep focus:outline-none"
            >
              {CR_OPTIONS.map((o, i) => (
                <option key={o.label} value={i}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="mb-1 font-display text-[10px] uppercase tracking-wider text-brass-deep">CR Max</div>
            <select
              value={crMaxIdx}
              onChange={(e) => {
                const v = Number(e.target.value);
                setCrMaxIdx(v);
                if (v < crMinIdx) setCrMinIdx(v);
              }}
              className="rounded-sm border border-rule bg-parchment px-2 py-1 font-serif text-sm text-ink focus:border-brass-deep focus:outline-none"
            >
              {CR_OPTIONS.map((o, i) => (
                <option key={o.label} value={i}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <label className="flex cursor-pointer select-none items-center gap-1.5 font-display uppercase tracking-wider text-ink-soft">
            <input
              type="checkbox"
              checked={hbOnly}
              onChange={(e) => setHbOnly(e.target.checked)}
              className="accent-crimson"
              disabled={homebrewMonsters.length === 0}
            />
            <span className="inline-flex items-center gap-1">
              <Wand2 size={10} /> Homebrew only ({homebrewMonsters.length})
            </span>
          </label>
          <span className="ml-auto font-display tracking-wider text-ink-mute">
            {pool.length.toLocaleString()} / {denominator.toLocaleString()} in pool
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 font-display text-[10px] uppercase tracking-wider text-brass-deep">Type</span>
          {TYPES.map((t) => (
            <Chip key={t} active={types.has(t)} onClick={() => toggleType(t)}>
              {t}
            </Chip>
          ))}
          {(types.size > 0 || hbOnly || crMinIdx > 0 || crMaxIdx < CR_OPTIONS.length - 1) && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-1 px-1 font-display uppercase tracking-wider text-ink-mute hover:text-crimson"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={roll}
          disabled={pool.length === 0}
          className="flex items-center gap-2 rounded bg-crimson px-4 py-2 font-display text-sm uppercase tracking-wider text-parchment transition-colors hover:bg-crimson/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Dice5 size={16} />
          {picked ? 'Roll Again' : 'Roll Random Monster'}
        </button>
        {picked && (
          <button
            type="button"
            onClick={roll}
            disabled={pool.length === 0}
            title="Reroll within current filters"
            className="flex items-center gap-1.5 rounded border border-rule px-3 py-2 font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep"
          >
            <RefreshCw size={14} /> Reroll
          </button>
        )}
        {picked && (
          <button
            type="button"
            onClick={saveRollToLog}
            disabled={savedRoll}
            className="flex items-center gap-1.5 rounded border border-brass-deep/60 bg-brass/10 px-3 py-2 font-display text-xs uppercase tracking-wider text-brass-deep transition-colors hover:border-brass hover:bg-brass hover:text-parchment disabled:opacity-50"
          >
            {savedRoll ? <Check size={14} /> : <Save size={14} />}
            {savedRoll ? 'Saved to log' : 'Save to log'}
          </button>
        )}
        {pool.length === 0 && (
          <span className="font-serif text-xs italic text-crimson">No monsters match these filters.</span>
        )}
      </div>

      {picked ? (
        <StatBlock m={picked} />
      ) : (
        <div className="rounded border border-dashed border-rule bg-parchment-soft p-6 text-center font-serif text-sm italic text-ink-mute">
          Set your filters and roll a monster.
        </div>
      )}

      {picked && onAddRollToCampaign && (
        <AddToCampaignPicker
          kind="monster-roll"
          payload={picked}
          onAdd={onAddRollToCampaign}
        />
      )}

      <GeneratorLog
        kind="monster-roll"
        entries={rollLogEntries}
        onChange={onRollLogEntriesChange}
        renderPayload={(entry) => <StatBlock m={entry.payload as Monster} />}
        copyText={(e) => monsterPlainText(e.payload as Monster)}
        emptyHint="Roll a monster, then click 'Save to log' to keep it here."
        onAddToCampaign={onAddRollToCampaign}
      />
    </div>
  );
}

function monsterPlainText(m: Monster): string {
  const lines: string[] = [
    m.name,
    fmtTypeLine(m),
    '',
    `AC ${m.armor_class ?? '—'}${m.armor_desc ? ` (${m.armor_desc})` : ''}`,
    `HP ${m.hit_points ?? '—'}${m.hit_dice ? ` (${m.hit_dice})` : ''}`,
    `Speed ${fmtSpeed(m.speed)}`,
    '',
    `STR ${m.strength} (${mod(m.strength)})  DEX ${m.dexterity} (${mod(m.dexterity)})  CON ${m.constitution} (${mod(m.constitution)})  INT ${m.intelligence} (${mod(m.intelligence)})  WIS ${m.wisdom} (${mod(m.wisdom)})  CHA ${m.charisma} (${mod(m.charisma)})`,
  ];
  if (fmtSaves(m)) lines.push(`Saving Throws ${fmtSaves(m)}`);
  if (fmtSkills(m.skills)) lines.push(`Skills ${fmtSkills(m.skills)}`);
  if (m.damage_resistances) lines.push(`Damage Resistances ${m.damage_resistances}`);
  if (m.damage_immunities) lines.push(`Damage Immunities ${m.damage_immunities}`);
  if (m.condition_immunities) lines.push(`Condition Immunities ${m.condition_immunities}`);
  if (m.senses) lines.push(`Senses ${m.senses}`);
  if (m.languages) lines.push(`Languages ${m.languages}`);
  lines.push(`Challenge ${fmtCR(m.challenge_rating)}`);
  const blocks: { title: string | null; entries: Action[] }[] = [
    { title: null, entries: m.special_abilities },
    { title: 'ACTIONS', entries: m.actions },
    { title: 'BONUS ACTIONS', entries: m.bonus_actions },
    { title: 'REACTIONS', entries: m.reactions },
    { title: 'LEGENDARY ACTIONS', entries: m.legendary_actions },
  ];
  for (const block of blocks) {
    if (!block.entries.length) continue;
    lines.push('');
    if (block.title) lines.push(block.title);
    for (const a of block.entries) lines.push(`${a.name}. ${a.desc}`);
  }
  return lines.join('\n');
}

function HomebrewManager({
  homebrewMonsters,
  onChange,
}: {
  homebrewMonsters: HomebrewMonster[];
  onChange: (next: HomebrewMonster[]) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const add = () => {
    const next = blankHomebrewMonster();
    onChange([next, ...homebrewMonsters]);
    setExpanded((s) => {
      const n = new Set(s);
      n.add(next.slug);
      return n;
    });
  };

  const update = (slug: string, patch: Partial<HomebrewMonster>) => {
    onChange(homebrewMonsters.map((m) => (m.slug === slug ? { ...m, ...patch } : m)));
  };

  const remove = (slug: string) => {
    const m = homebrewMonsters.find((x) => x.slug === slug);
    if (!m) return;
    const hasContent = (m.name || '').trim().length > 0;
    if (hasContent && !confirm(`Delete "${m.name}"? This cannot be undone.`)) return;
    onChange(homebrewMonsters.filter((x) => x.slug !== slug));
    setExpanded((cur) => {
      const n = new Set(cur);
      n.delete(slug);
      return n;
    });
  };

  const toggleExpand = (slug: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(slug)) n.delete(slug);
      else n.add(slug);
      return n;
    });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-serif text-xs italic text-ink-soft">
          Build custom monsters for this campaign. They join the random roller pool and render with the
          same statblock as SRD creatures.
        </p>
        <button
          type="button"
          onClick={add}
          className="flex flex-shrink-0 items-center gap-1.5 rounded border border-wine/60 px-3 py-1 font-display text-xs uppercase tracking-wider text-wine transition-colors hover:border-wine hover:bg-wine hover:text-parchment"
        >
          <Plus size={12} /> Add Monster
        </button>
      </div>

      {homebrewMonsters.length === 0 ? (
        <div className="rounded border border-dashed border-rule bg-parchment-soft p-6 text-center font-serif text-sm italic text-ink-mute">
          No homebrew monsters yet. Click <span className="font-display not-italic tracking-wider text-wine">Add Monster</span>{' '}
          to create one.
        </div>
      ) : (
        <div className="space-y-1">
          {homebrewMonsters.map((m) => {
            const isOpen = expanded.has(m.slug);
            return (
              <div key={m.slug} className="rounded-sm border border-wine/60 bg-wine/5">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => toggleExpand(m.slug)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <Wand2 size={12} className="flex-shrink-0 text-wine" />
                    <span
                      className={`flex-1 truncate font-display text-sm tracking-wide ${
                        m.name ? 'text-ink' : 'italic text-ink-faint'
                      }`}
                    >
                      {m.name || 'Untitled Homebrew'}
                    </span>
                    <span className="hidden font-serif text-[10px] italic text-ink-mute sm:inline">
                      CR {m.challenge_rating} · {m.type}
                    </span>
                    {isOpen ? (
                      <ChevronDown size={12} className="flex-shrink-0 text-ink-faint" />
                    ) : (
                      <ChevronRight size={12} className="flex-shrink-0 text-ink-faint" />
                    )}
                  </button>
                </div>
                {isOpen && (
                  <HomebrewEditor
                    monster={m}
                    onChange={(patch) => update(m.slug, patch)}
                    onDelete={() => remove(m.slug)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center font-serif text-[10px] italic text-ink-mute">
        Homebrew monsters are saved with this campaign.
      </p>
    </div>
  );
}

const fieldLabelClass = 'text-brass-deep font-display tracking-wider uppercase text-[10px] mb-1';
const inputClass =
  'w-full bg-parchment border border-rule rounded-sm px-2 py-1.5 text-sm text-ink placeholder-ink-faint font-serif focus:border-brass-deep focus:outline-none';

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className={fieldLabelClass}>{children}</div>;
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  placeholder,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type="number"
        value={value ?? ''}
        min={min}
        max={max}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') onChange(null);
          else {
            const n = Number(raw);
            onChange(Number.isFinite(n) ? n : null);
          }
        }}
        className={inputClass}
      />
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClass}
      />
    </div>
  );
}

function ActionListEditor({
  label,
  entries,
  onChange,
}: {
  label: string;
  entries: Action[];
  onChange: (next: Action[]) => void;
}) {
  const addEntry = () => onChange([...entries, { name: '', desc: '' }]);
  const updateEntry = (i: number, patch: Partial<Action>) =>
    onChange(entries.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const removeEntry = (i: number) => onChange(entries.filter((_, j) => j !== i));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <FieldLabel>{label}</FieldLabel>
        <button
          type="button"
          onClick={addEntry}
          className="flex items-center gap-1 font-display text-[10px] uppercase tracking-wider text-wine hover:text-crimson"
        >
          <Plus size={10} /> Add
        </button>
      </div>
      {entries.length === 0 ? (
        <div className="font-serif text-[11px] italic text-ink-mute">None.</div>
      ) : (
        <div className="space-y-2">
          {entries.map((a, i) => (
            <div key={i} className="space-y-1.5 rounded-sm border border-rule bg-parchment-soft/50 p-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={a.name}
                  onChange={(e) => updateEntry(i, { name: e.target.value })}
                  placeholder="Action name"
                  className={`${inputClass} font-display text-sm`}
                />
                <button
                  type="button"
                  onClick={() => removeEntry(i)}
                  className="flex-shrink-0 text-ink-mute hover:text-crimson"
                  title="Remove"
                  aria-label="Remove action"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <textarea
                value={a.desc}
                onChange={(e) => updateEntry(i, { desc: e.target.value })}
                placeholder="Description (e.g. Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 8 (1d10+3) slashing damage.)"
                rows={3}
                className={`${inputClass} resize-y leading-relaxed`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SpeedEditor({
  speed,
  onChange,
}: {
  speed: Record<string, number | boolean>;
  onChange: (next: Record<string, number | boolean>) => void;
}) {
  const get = (k: string): number => {
    const v = speed[k];
    return typeof v === 'number' ? v : 0;
  };
  const setNum = (k: string, v: number) => {
    const next = { ...speed };
    if (v > 0) next[k] = v;
    else delete next[k];
    onChange(next);
  };
  const hover = speed.hover === true;
  return (
    <div>
      <FieldLabel>Speed (ft.)</FieldLabel>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {(['walk', 'fly', 'swim', 'climb', 'burrow'] as const).map((k) => (
          <div key={k}>
            <div className="mb-0.5 font-display text-[10px] uppercase tracking-wider text-ink-mute">{k}</div>
            <input
              type="number"
              min={0}
              value={get(k) || ''}
              onChange={(e) => setNum(k, Number(e.target.value) || 0)}
              className={inputClass}
              placeholder="0"
            />
          </div>
        ))}
      </div>
      <label className="mt-2 flex cursor-pointer select-none items-center gap-1.5 font-display text-[10px] uppercase tracking-wider text-ink-soft">
        <input
          type="checkbox"
          checked={hover}
          onChange={(e) => {
            const next = { ...speed };
            if (e.target.checked) next.hover = true;
            else delete next.hover;
            onChange(next);
          }}
          className="accent-crimson"
        />
        Fly speed hovers
      </label>
    </div>
  );
}

function SkillsEditor({
  skills,
  onChange,
}: {
  skills: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
}) {
  const text = Object.entries(skills)
    .map(([k, v]) => `${k.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')} ${v >= 0 ? '+' : ''}${v}`)
    .join(', ');
  const [draft, setDraft] = useState(text);

  useEffect(() => {
    setDraft(text);
  }, [text]);

  const commit = (raw: string) => {
    const next: Record<string, number> = {};
    raw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((entry) => {
        const m = entry.match(/^([A-Za-z][A-Za-z ]*?)\s*([+-]?\d+)$/);
        if (!m) return;
        const name = m[1].trim().toLowerCase().replace(/\s+/g, '_');
        const bonus = Number(m[2]);
        if (Number.isFinite(bonus)) next[name] = bonus;
      });
    onChange(next);
  };

  return (
    <div>
      <FieldLabel>Skills</FieldLabel>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        placeholder="Perception +5, Stealth +6"
        className={inputClass}
      />
      <p className="mt-0.5 font-serif text-[10px] italic text-ink-mute">
        Comma-separated, e.g. <span className="not-italic">Perception +5, Stealth +6</span>.
      </p>
    </div>
  );
}

function HomebrewEditor({
  monster,
  onChange,
  onDelete,
}: {
  monster: HomebrewMonster;
  onChange: (patch: Partial<HomebrewMonster>) => void;
  onDelete: () => void;
}) {
  const setCr = (label: string) => {
    const value = CR_LABEL_TO_VALUE[label];
    if (value == null) return;
    onChange({ challenge_rating: label, cr: value });
  };

  const setSave = (key: keyof HomebrewMonster, raw: string) => {
    if (raw === '') onChange({ [key]: null } as Partial<HomebrewMonster>);
    else {
      const n = Number(raw);
      onChange({ [key]: Number.isFinite(n) ? n : null } as Partial<HomebrewMonster>);
    }
  };

  return (
    <div className="space-y-3 border-t border-wine/40 bg-wine/[0.03] p-3 text-xs">
      <TextField
        label="Name"
        value={monster.name}
        onChange={(v) => onChange({ name: v })}
        placeholder="Awakened Mossback"
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <FieldLabel>Size</FieldLabel>
          <select
            value={monster.size}
            onChange={(e) => onChange({ size: e.target.value })}
            className={inputClass}
          >
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>Type</FieldLabel>
          <select
            value={monster.type}
            onChange={(e) => onChange({ type: e.target.value })}
            className={inputClass}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <TextField
          label="Subtype"
          value={monster.subtype}
          onChange={(v) => onChange({ subtype: v })}
          placeholder="optional"
        />
        <TextField
          label="Alignment"
          value={monster.alignment}
          onChange={(v) => onChange({ alignment: v })}
          placeholder="lawful good"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <NumberField
          label="Armor Class"
          value={monster.armor_class}
          onChange={(v) => onChange({ armor_class: v })}
          min={0}
        />
        <TextField
          label="AC Note"
          value={monster.armor_desc}
          onChange={(v) => onChange({ armor_desc: v })}
          placeholder="natural armor"
        />
        <NumberField
          label="Hit Points"
          value={monster.hit_points}
          onChange={(v) => onChange({ hit_points: v })}
          min={0}
        />
        <TextField
          label="Hit Dice"
          value={monster.hit_dice}
          onChange={(v) => onChange({ hit_dice: v })}
          placeholder="3d8+6"
        />
      </div>

      <SpeedEditor speed={monster.speed} onChange={(v) => onChange({ speed: v })} />

      <div>
        <FieldLabel>Ability Scores</FieldLabel>
        <div className="grid grid-cols-6 gap-1">
          {([
            ['Str', 'strength'],
            ['Dex', 'dexterity'],
            ['Con', 'constitution'],
            ['Int', 'intelligence'],
            ['Wis', 'wisdom'],
            ['Cha', 'charisma'],
          ] as const).map(([label, key]) => (
            <div key={key} className="text-center">
              <div className="mb-0.5 font-display text-[10px] uppercase tracking-wider text-ink-mute">
                {label}
              </div>
              <input
                type="number"
                min={1}
                max={30}
                value={monster[key]}
                onChange={(e) => onChange({ [key]: Number(e.target.value) || 10 } as Partial<HomebrewMonster>)}
                className={`${inputClass} text-center`}
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <FieldLabel>Saving Throws (optional)</FieldLabel>
        <div className="grid grid-cols-6 gap-1">
          {([
            ['Str', 'strength_save'],
            ['Dex', 'dexterity_save'],
            ['Con', 'constitution_save'],
            ['Int', 'intelligence_save'],
            ['Wis', 'wisdom_save'],
            ['Cha', 'charisma_save'],
          ] as const).map(([label, key]) => (
            <div key={key} className="text-center">
              <div className="mb-0.5 font-display text-[10px] uppercase tracking-wider text-ink-mute">
                {label}
              </div>
              <input
                type="number"
                value={monster[key] ?? ''}
                onChange={(e) => setSave(key, e.target.value)}
                placeholder="—"
                className={`${inputClass} text-center`}
              />
            </div>
          ))}
        </div>
      </div>

      <SkillsEditor skills={monster.skills} onChange={(v) => onChange({ skills: v })} />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <TextField
          label="Damage Vulnerabilities"
          value={monster.damage_vulnerabilities}
          onChange={(v) => onChange({ damage_vulnerabilities: v })}
          placeholder="fire"
        />
        <TextField
          label="Damage Resistances"
          value={monster.damage_resistances}
          onChange={(v) => onChange({ damage_resistances: v })}
          placeholder="cold; bludgeoning from nonmagical attacks"
        />
        <TextField
          label="Damage Immunities"
          value={monster.damage_immunities}
          onChange={(v) => onChange({ damage_immunities: v })}
          placeholder="poison"
        />
        <TextField
          label="Condition Immunities"
          value={monster.condition_immunities}
          onChange={(v) => onChange({ condition_immunities: v })}
          placeholder="charmed, frightened"
        />
        <TextField
          label="Senses"
          value={monster.senses}
          onChange={(v) => onChange({ senses: v })}
          placeholder="darkvision 60 ft., passive Perception 12"
        />
        <TextField
          label="Languages"
          value={monster.languages}
          onChange={(v) => onChange({ languages: v })}
          placeholder="Common, Sylvan"
        />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <FieldLabel>Challenge Rating</FieldLabel>
          <select
            value={monster.challenge_rating}
            onChange={(e) => setCr(e.target.value)}
            className={inputClass}
          >
            {CR_OPTIONS.map((o) => (
              <option key={o.label} value={o.label}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <TextField
          label="Source / Note"
          value={monster.source}
          onChange={(v) => onChange({ source: v })}
          placeholder="Homebrew"
        />
      </div>

      <ActionListEditor
        label="Special Abilities"
        entries={monster.special_abilities}
        onChange={(v) => onChange({ special_abilities: v })}
      />
      <ActionListEditor
        label="Actions"
        entries={monster.actions}
        onChange={(v) => onChange({ actions: v })}
      />
      <ActionListEditor
        label="Bonus Actions"
        entries={monster.bonus_actions}
        onChange={(v) => onChange({ bonus_actions: v })}
      />
      <ActionListEditor
        label="Reactions"
        entries={monster.reactions}
        onChange={(v) => onChange({ reactions: v })}
      />

      <div className="space-y-2">
        <TextField
          label="Legendary Description"
          value={monster.legendary_desc}
          onChange={(v) => onChange({ legendary_desc: v })}
          placeholder="The dragon can take 3 legendary actions…"
        />
        <ActionListEditor
          label="Legendary Actions"
          entries={monster.legendary_actions}
          onChange={(v) => onChange({ legendary_actions: v })}
        />
      </div>

      <div>
        <FieldLabel>Lore (optional)</FieldLabel>
        <textarea
          value={monster.desc}
          onChange={(e) => onChange({ desc: e.target.value })}
          placeholder="Flavor text shown under Lore in the statblock."
          rows={3}
          className={`${inputClass} resize-y leading-relaxed`}
        />
      </div>

      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-crimson hover:text-crimson/70"
        >
          <Trash2 size={12} /> Delete Monster
        </button>
      </div>
    </div>
  );
}
