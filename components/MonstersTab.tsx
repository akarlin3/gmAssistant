'use client';

import { useState } from 'react';
import {
  Dice5,
  RefreshCw,
  Loader2,
  ShieldAlert,
  Wand2,
  Save,
  Check,
} from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { LockedPanel } from './LockedFeature';
import MonsterScaler from './MonsterScaler';
import EncounterBuilder from './EncounterBuilder';
import GeneratorLog from './generators/GeneratorLog';
import { appendToLog, makeLogEntry, type LogEntry } from '@/lib/generators/log';
import type { CampaignDestKey, SelectableItem } from '@/lib/generators/addToCampaign';
import AddToCampaignPicker from './generators/AddToCampaignPicker';
import type { Character } from '@/lib/character-schema';

import type { Mode, Monster, HomebrewMonster } from './monsters/types';
import { TYPES, CR_OPTIONS } from './monsters/constants';
import { monsterPlainText } from './monsters/format';
import { Chip, StatBlock } from './monsters/StatBlock';
import { HomebrewManager } from './monsters/HomebrewManager';
import { useMonsterSearch } from './monsters/useMonsterSearch';

export type { HomebrewMonster } from './monsters/types';

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
  const [savedRoll, setSavedRoll] = useState(false);

  const search = useMonsterSearch(homebrewMonsters);
  const {
    srdMonsters,
    loadError,
    allMonsters,
    pool,
    crMinIdx,
    crMaxIdx,
    types,
    hbOnly,
    picked,
    setCrMinIdx,
    setCrMaxIdx,
    setHbOnly,
    toggleType,
    clearFilters,
  } = search;

  const roll = () => {
    search.roll();
    setSavedRoll(false);
  };

  const saveRollToLog = () => {
    if (!picked) return;
    const title = `${picked.name} · CR ${picked.challenge_rating}${picked.homebrew ? ' · HB' : ''}`;
    onRollLogEntriesChange(appendToLog(rollLogEntries, makeLogEntry('monster-roll', title, picked)));
    setSavedRoll(true);
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
