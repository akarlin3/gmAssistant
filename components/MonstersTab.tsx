'use client';

import { useState, useEffect, useMemo } from 'react';
import { Dice5, RefreshCw, Loader2, ShieldAlert } from 'lucide-react';
import { CR_TO_XP } from '@/lib/encounterMath';
import { useAuth } from '@/lib/firebase/auth-context';
import { LockedPanel } from './LockedFeature';
import MonsterScaler from './MonsterScaler';

type Mode = 'roll' | 'scale';

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
  is_srd: boolean;
};

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
    className={`px-2 py-0.5 rounded-sm border font-display uppercase tracking-wider transition-colors ${
      active
        ? 'bg-crimson border-crimson text-parchment'
        : 'border-rule text-ink-soft hover:bg-parchment-deep'
    }`}
  >
    {children}
  </button>
);

function AbilityCell({ label, score }: { label: string; score: number }) {
  return (
    <div className="text-center border border-rule bg-parchment-soft rounded-sm py-1.5 px-1">
      <div className="font-display uppercase tracking-wider text-[10px] text-brass-deep">{label}</div>
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
        <div className="font-display uppercase tracking-wider text-xs text-brass-deep border-b border-rule pb-0.5">
          {heading}
        </div>
      )}
      {entries.map((a, i) => (
        <div key={i} className="text-xs leading-snug">
          <span className="font-display italic text-ink font-semibold">{a.name}.</span>{' '}
          <span className="font-serif text-ink whitespace-pre-wrap">{a.desc}</span>
        </div>
      ))}
    </div>
  );
}

function StatBlock({ m }: { m: Monster }) {
  return (
    <div className="border-2 border-brass-deep/60 bg-parchment rounded p-4 space-y-3 shadow-sm">
      <div>
        <h3 className="font-display uppercase tracking-wider text-xl text-crimson">{m.name}</h3>
        <div className="font-serif italic text-ink-soft text-sm">{fmtTypeLine(m)}</div>
      </div>

      <div className="border-t border-b border-rule py-2 space-y-1">
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

      <div className="border-t border-rule pt-2 space-y-1">
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
        <div className="border-t border-rule pt-2 space-y-1.5">
          <div className="font-display uppercase tracking-wider text-xs text-brass-deep border-b border-rule pb-0.5">
            Legendary Actions
          </div>
          {m.legendary_desc && (
            <div className="font-serif text-xs text-ink-soft italic whitespace-pre-wrap">{m.legendary_desc}</div>
          )}
          <ActionBlock entries={m.legendary_actions} />
        </div>
      )}

      {m.desc && (
        <div className="border-t border-rule pt-2">
          <details className="text-xs">
            <summary className="font-display uppercase tracking-wider text-brass-deep cursor-pointer">
              Lore
            </summary>
            <div className="font-serif text-ink mt-1 whitespace-pre-wrap">{m.desc}</div>
          </details>
        </div>
      )}

      <div className="text-[10px] text-ink-mute font-display uppercase tracking-wider pt-1">
        Source: {m.source || 'Unknown'}
        {m.is_srd && ' · SRD'}
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

export default function MonstersTab() {
  const { isPro } = useAuth();
  const [mode, setMode] = useState<Mode>('roll');
  const [monsters, setMonsters] = useState<Monster[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [crMinIdx, setCrMinIdx] = useState(0);
  const [crMaxIdx, setCrMaxIdx] = useState(CR_OPTIONS.length - 1);
  const [types, setTypes] = useState<Set<string>>(new Set());
  const [srdOnly, setSrdOnly] = useState(false);
  const [picked, setPicked] = useState<Monster | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/srd/monsters.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data: Monster[]) => {
        if (alive) setMonsters(data);
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

  const pool = useMemo(() => {
    if (!monsters) return [];
    return monsters.filter((m) => {
      if (srdOnly && !m.is_srd) return false;
      if (m.cr < crMin || m.cr > crMax) return false;
      if (types.size && !types.has(m.type)) return false;
      return true;
    });
  }, [monsters, srdOnly, crMin, crMax, types]);

  const roll = () => {
    const next = pickRandom(pool, picked ?? undefined);
    if (next) setPicked(next);
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
    setSrdOnly(false);
  };

  const totalCount = monsters?.length ?? 0;
  const srdCount = monsters ? monsters.filter((m) => m.is_srd).length : 0;

  const modeToggle = (
    <div
      role="tablist"
      aria-label="Monsters mode"
      className="inline-flex border border-rule rounded overflow-hidden font-display uppercase tracking-wider text-xs"
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
        className={`px-3 py-1.5 border-l border-rule transition-colors flex items-center gap-1.5 ${
          mode === 'scale' ? 'bg-crimson text-parchment' : 'text-ink-soft hover:bg-parchment-deep'
        }`}
      >
        Scale to CR
        <span
          className={`text-[9px] px-1 py-0.5 rounded-sm border ${
            mode === 'scale'
              ? 'border-parchment/60 text-parchment/90'
              : 'border-crimson/60 bg-crimson/10 text-crimson'
          }`}
        >
          Pro
        </span>
      </button>
    </div>
  );

  if (mode === 'scale') {
    return (
      <div className="space-y-3">
        {modeToggle}
        {isPro ? (
          <MonsterScaler />
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

  if (loadError) {
    return (
      <div className="space-y-3">
        {modeToggle}
        <div className="rounded border border-crimson/40 bg-parchment-soft p-4 text-sm text-ink">
          <div className="flex items-center gap-2 text-crimson font-display uppercase tracking-wider">
            <ShieldAlert size={16} /> Couldn&rsquo;t load monsters
          </div>
          <div className="mt-1 font-serif text-ink-soft">{loadError}</div>
        </div>
      </div>
    );
  }

  if (!monsters) {
    return (
      <div className="space-y-3">
        {modeToggle}
        <div className="rounded border border-rule bg-parchment-soft p-6 flex items-center gap-2 text-ink-mute text-sm font-serif">
          <Loader2 size={16} className="animate-spin" /> Loading bestiary&hellip;
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {modeToggle}
      <div className="rounded border border-rule bg-parchment-soft p-3 space-y-3 text-xs">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="font-display uppercase tracking-wider text-[10px] text-brass-deep mb-1">CR Min</div>
            <select
              value={crMinIdx}
              onChange={(e) => {
                const v = Number(e.target.value);
                setCrMinIdx(v);
                if (v > crMaxIdx) setCrMaxIdx(v);
              }}
              className="bg-parchment border border-rule rounded-sm px-2 py-1 text-sm text-ink font-serif focus:border-brass-deep focus:outline-none"
            >
              {CR_OPTIONS.map((o, i) => (
                <option key={o.label} value={i}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div className="font-display uppercase tracking-wider text-[10px] text-brass-deep mb-1">CR Max</div>
            <select
              value={crMaxIdx}
              onChange={(e) => {
                const v = Number(e.target.value);
                setCrMaxIdx(v);
                if (v < crMinIdx) setCrMinIdx(v);
              }}
              className="bg-parchment border border-rule rounded-sm px-2 py-1 text-sm text-ink font-serif focus:border-brass-deep focus:outline-none"
            >
              {CR_OPTIONS.map((o, i) => (
                <option key={o.label} value={i}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer select-none font-display uppercase tracking-wider text-ink-soft">
            <input
              type="checkbox"
              checked={srdOnly}
              onChange={(e) => setSrdOnly(e.target.checked)}
              className="accent-crimson"
            />
            SRD only
          </label>
          <span className="text-ink-mute font-display tracking-wider ml-auto">
            {pool.length.toLocaleString()} / {(srdOnly ? srdCount : totalCount).toLocaleString()} in pool
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="font-display uppercase tracking-wider text-[10px] text-brass-deep mr-1">Type</span>
          {TYPES.map((t) => (
            <Chip key={t} active={types.has(t)} onClick={() => toggleType(t)}>
              {t}
            </Chip>
          ))}
          {(types.size > 0 || srdOnly || crMinIdx > 0 || crMaxIdx < CR_OPTIONS.length - 1) && (
            <button
              type="button"
              onClick={clearFilters}
              className="ml-1 text-ink-mute hover:text-crimson font-display uppercase tracking-wider px-1"
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
          className="px-4 py-2 rounded bg-crimson text-parchment font-display uppercase tracking-wider text-sm flex items-center gap-2 hover:bg-crimson/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
            className="px-3 py-2 rounded border border-rule text-ink-soft hover:bg-parchment-deep font-display uppercase tracking-wider text-xs flex items-center gap-1.5"
          >
            <RefreshCw size={14} /> Reroll
          </button>
        )}
        {pool.length === 0 && (
          <span className="text-xs text-crimson font-serif italic">No monsters match these filters.</span>
        )}
      </div>

      {picked ? (
        <StatBlock m={picked} />
      ) : (
        <div className="rounded border border-dashed border-rule bg-parchment-soft p-6 text-center text-ink-mute text-sm font-serif italic">
          Set your filters and roll a monster.
        </div>
      )}
    </div>
  );
}
