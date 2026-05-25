'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { updateCampaign, deleteCampaign as deleteCampaignDoc, archiveCampaign, unarchiveCampaign, copyCampaign, type Campaign } from '@/lib/firebase/campaigns';
import { updateWorld, createWorld, type World } from '@/lib/firebase/worlds';
import { WORLD_KEYS } from '@/lib/worldData';
import { getFirebaseAuth } from '@/lib/firebase/client';
import {
  ChevronDown, ChevronRight, Check, Plus, X, Quote,
  User, Users, Map, Swords, Gift, Layers, Calendar, Target, Trophy,
  Download, Upload, ScrollText, ArrowLeft, ArrowRight, Cloud, CloudOff,
  FileUp, Sparkles, Play, Search, BookOpen, Dice5, Wand2, Skull, Footprints, Hash, ClipboardList, Wrench, SlidersHorizontal, Copy,
  Compass, NotebookPen, Zap, Gem, Globe, Music,
} from 'lucide-react';
import { TABLES, sampleTable } from '@/lib/inspirationTables';
import { CR_TO_XP, encounterMultiplier, difficultyForSolo, parseLevelFromClassLevel } from '@/lib/encounterMath';
import dynamic from 'next/dynamic';
import DiceRoller, { type Macro } from './DiceRoller';
import type { Spell } from './SpellsTab';
import StrongStartPicker from './StrongStartPicker';
import CharacterCard from './CharacterCard';
import SidekickAddPanel from './SidekickAddPanel';
import type { HomebrewMonster } from './MonstersTab';
import SummonButton from './SummonButton';
import SummonModal from './SummonModal';
import { normalizeItem } from '@/lib/playerMode/types';

const SpellsTab = dynamic(() => import('./SpellsTab'));
const DMRefTab = dynamic(() => import('./DMRefTab'));
const NamesTab = dynamic(() => import('./NamesTab'));
const LocationsTab = dynamic(() => import('./LocationsTab'));
const MonstersTab = dynamic(() => import('./MonstersTab'));
const GeneratorsTab = dynamic(() => import('./generators/GeneratorsTab'));
import {
  SECTION_GENERATORS,
  getLastUsed,
  pickPrimaryRef,
  setLastUsed,
  type GeneratorMeta,
  type PrepSection,
} from '@/lib/generators/sectionMap';
import type { EntityRef } from '@/lib/generators/types';
import { applySummonAction, type SummonSaveAction } from '@/lib/generators/summon-actions';
import VivifyPanel, { type VivifyHistoryEntry } from './VivifyPanel';
import ChaseTracker from './ChaseTracker';
import type { Chase } from '@/lib/chaseTables';
import TrapBuilder from './TrapBuilder';
import type { Trap } from '@/lib/trapTables';
import InitiativePanel from './InitiativePanel';
import type { InitiativeState } from '@/lib/initiative';
import { QuickDice, QuickInspire, PanelShell, SectionShell, MusicPlayer } from './RunSessionView';
import { applySession0Patch } from '@/lib/session0';
import SessionLogFinalizer from './SessionLogFinalizer';
import { type ChangeEvent, type ChangeEventKind, makeEvent } from '@/lib/sessionEvents';
import { markOpened, markSessionPlayed } from '@/lib/lastPlayed';

const ToolsTab = dynamic(() => import('./ToolsTab'));
const RunSessionView = dynamic(() => import('./RunSessionView'));
const PrepWizardView = dynamic(() => import('./PrepWizardView'));
const Session0Wizard = dynamic(() => import('./Session0Wizard'));
const SessionLogTab = dynamic(() => import('./SessionLogTab'));
const HazardCalculator = dynamic(() => import('./HazardCalculator'));
const LogisticsTab = dynamic(() => import('./LogisticsTab'));
const NPCRelationshipWeb = dynamic(() => import('./NPCRelationshipWeb'));
const FactionEngineTab = dynamic(() => import('./FactionEngineTab'));
import { emptyLogistics, type LogisticsState } from './LogisticsTab';
import { emptyGraph, type RelationshipGraphState } from './NPCRelationshipWeb';
import { emptyWorld, type FactionWorld } from '@/lib/factionEngine';
import type { SessionLogEntry } from '@/lib/sessionLog';
import { nextSessionNumber } from '@/lib/sessionLog';
import type { PrepWizardRun } from '@/lib/prepWizard';
import type { GeneratorLogs, LogEntry, LogKind } from '@/lib/generators/log';
import { buildPatch as buildCampaignPatch, type CampaignDestKey, type SelectableItem } from '@/lib/generators/addToCampaign';
import { AccountMenu } from './AccountMenu';
import PlayersManager from './PlayersManager';
import { LockedInline, LockedPanel } from './LockedFeature';
import { useConfirm } from '@/components/ConfirmDialog';
import PlayerModePanel from './PlayerModePanel';
import { initPlayerMode } from '@/lib/playerMode/migration';
import type { PlayerConfig } from '@/lib/playerMode/types';
import type { PlayerLogEntry } from '@/lib/playerMode/sessionLog';
import CommandPalette, { type CommandItem } from './CommandPalette';
import KeyboardShortcuts from './KeyboardShortcuts';
import {
  type Character,
  emptyCharacter,
  makeCharacterId,
  normalizeCharacter,
} from '@/lib/character-schema';
import { pushSnapshot, popSnapshot, type Snapshot } from '@/lib/undoStack';
import {
  TARGETS,
  getTarget,
  countFilled,
  SECTION_ID_BY_KEY,
  PHASE_ID_BY_KEY,
  OVERRIDES_STATE_KEY,
  type PrepTargetKey,
  type PrepTargetOverrides,
} from '@/lib/prepTargets';
import PrepTargetsModal from './PrepTargetsModal';
import ModeNav from './ModeNav';
import {
  type Mode,
  MODES,
  ALL_SUBVIEWS,
  defaultSubview,
  isValidSubview,
  resolveInitialMode,
} from '@/lib/modes';

const M = {
  shea: { label: 'Lazy DM', color: 'border-moss/40 bg-moss/5 text-moss' },
  ccd: { label: 'CCD', color: 'border-brass/40 bg-brass/5 text-brass-deep' },
  pr: { label: 'Proactive', color: 'border-wine/40 bg-wine/5 text-wine' },
};

// Mode + subview navigation. The shape of MODES, the legacy migration map,
// and the helpers all live in lib/modes.ts so other surfaces (palette,
// future deep-links) share a single source of truth.

// Prep item targets — see lib/prepTargets.ts for the single source of truth
// (shared with the pre-session PrepWizard).

const Tag = ({ m }: { m: keyof typeof M }) => (
  <span className={`text-[10px] px-1.5 py-0.5 rounded-sm border font-display uppercase tracking-wider ${M[m].color}`}>{M[m].label}</span>
);

const BookQuote = ({ source, children }: { source: string; children: React.ReactNode }) => (
  <blockquote className="pl-3 border-l-2 border-crimson/70 bg-parchment-soft/60 py-2 pr-3 text-sm rounded-r">
    <div className="font-serif italic text-ink-soft leading-relaxed">{children}</div>
    <div className="text-brass-deep mt-1 text-xs uppercase tracking-wider font-display">— {source}</div>
  </blockquote>
);

const SoloNote = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-start gap-2 rounded border border-wine/40 bg-wine/5 p-2.5 text-sm">
    <User size={13} className="text-wine flex-shrink-0 mt-0.5" />
    <div className="text-ink-soft font-serif"><span className="font-display uppercase tracking-wider text-xs text-wine">Solo Adaptation · </span>{children}</div>
  </div>
);

const Pitfall = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-start gap-2 rounded border border-crimson/40 bg-crimson/5 p-2.5 text-sm">
    <X size={13} className="text-crimson flex-shrink-0 mt-0.5" />
    <div className="text-ink-soft font-serif"><span className="font-display uppercase tracking-wider text-xs text-crimson">Common Pitfall · </span>{children}</div>
  </div>
);

const Inspire = ({
  tableId,
  onPick,
  count = 5,
  label = 'Inspire',
  compact = false,
  align = 'right',
}: {
  tableId: string;
  onPick: (entry: string) => void;
  count?: number;
  label?: string;
  compact?: boolean;
  align?: 'left' | 'right';
}) => {
  const [open, setOpen] = useState(false);
  const [picks, setPicks] = useState<string[]>([]);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const table = TABLES[tableId];

  const POPUP_WIDTH = 320; // matches w-80
  const VIEWPORT_MARGIN = 8;

  const updateCoords = useCallback(() => {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const width = Math.min(POPUP_WIDTH, vw - VIEWPORT_MARGIN * 2);
    const preferredLeft = align === 'left' ? r.left : r.right - width;
    const left = Math.max(VIEWPORT_MARGIN, Math.min(preferredLeft, vw - width - VIEWPORT_MARGIN));
    setCoords({ top: r.bottom + 4, left, width });
  }, [align]);

  useEffect(() => {
    if (!open) return;
    updateCoords();
    const onScroll = () => updateCoords();
    const onResize = () => updateCoords();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, updateCoords]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (btnRef.current?.contains(target) || popupRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open]);

  if (!table) return null;

  const reroll = () => setPicks(sampleTable(tableId, count));

  const toggle = () => {
    if (!open) {
      reroll();
      updateCoords();
    }
    setOpen(o => !o);
  };

  const triggerClass = compact
    ? "text-[10px] px-1.5 py-0.5 rounded border border-crimson/50 bg-crimson/10 text-crimson hover:bg-crimson hover:text-parchment flex items-center gap-1 font-display uppercase tracking-wider"
    : "text-[11px] px-2 py-0.5 rounded border border-brass-deep/60 bg-brass/15 text-brass-deep hover:bg-brass hover:text-parchment hover:border-brass-deep flex items-center gap-1 font-display uppercase tracking-wider";

  return (
    <div className="inline-block">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className={triggerClass}
        title={`Inspire from ${table.title}`}
      >
        <Sparkles size={11} /> {label}
      </button>
      {open && coords && (
        <div
          ref={popupRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width, zIndex: 50 }}
          className="rounded border border-brass-deep/70 bg-parchment shadow-xl p-2 space-y-1.5"
        >
          <div className="flex items-center justify-between text-[10px] text-ink-mute px-1 pb-1 border-b border-rule">
            <span className="font-display uppercase tracking-wider text-brass-deep">{table.title}</span>
            <div className="flex gap-2">
              <button onClick={reroll} className="text-crimson hover:text-wine font-display uppercase tracking-wider">Reroll</button>
              <button onClick={() => setOpen(false)} className="text-ink-mute hover:text-ink font-display uppercase tracking-wider">Close</button>
            </div>
          </div>
          {picks.map((entry, i) => (
            <button
              key={i}
              onClick={() => { onPick(entry); setOpen(false); }}
              className="block w-full text-left text-xs px-2 py-1.5 rounded text-ink-soft hover:bg-parchment-deep hover:text-ink font-serif"
            >
              {entry}
            </button>
          ))}
          <div className="text-[9px] text-ink-mute px-1 pt-1 italic">{table.attribution}</div>
        </div>
      )}
    </div>
  );
};

const InspireGroup = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-wrap gap-1.5 items-center">{children}</div>
);

const TargetBar = ({ current, target, source }: { current: number; target: number; source?: string }) => {
  if (target === 0) return null;
  const pct = Math.min(100, (current / target) * 100);
  const complete = current >= target;
  return (
    <div className="space-y-1" title={source}>
      <div className="flex items-center justify-between text-xs font-serif">
        <span className={complete ? 'text-brass-deep font-semibold' : 'text-ink-soft'}>
          {current} of {target}
        </span>
        {source && <span className="text-ink-mute italic">{source}</span>}
      </div>
      <div className="h-1.5 bg-parchment-deep rounded-sm overflow-hidden border border-rule">
        <div
          className={`h-full transition-all ${complete ? 'bg-brass' : 'bg-brass/50'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

const Example = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded border border-rule bg-parchment-deep/40 p-2.5 text-sm">
    <p className="text-brass-deep mb-1 text-xs font-display uppercase tracking-wider">Example — {title}</p>
    <div className="text-ink-soft font-serif italic leading-relaxed">{children}</div>
  </div>
);

const Field = ({ value, onChange, placeholder, rows = 1 }: { value: string; onChange: (v: string) => void; placeholder: string; rows?: number }) => (
  <textarea value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows}
    className="w-full bg-transparent border-b border-rule text-ink font-serif placeholder:text-ink-faint placeholder:italic focus:border-crimson focus:outline-none resize-none px-1 py-1 text-sm whitespace-pre-wrap break-words [field-sizing:content]" />
);

const ListField = ({
  items = [],
  onChange,
  placeholder,
  rows = 1,
  target = 0,
  rowIdFor,
  highlightId,
}: {
  items: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  rows?: number;
  target?: number;
  rowIdFor?: (i: number) => string;
  highlightId?: string | null;
}) => {
  const update = (i: number, v: string) => { const next = [...items]; next[i] = v; onChange(next); };
  const add = () => onChange([...items, '']);
  const remove = (i: number) => onChange(items.filter((_, j) => j !== i));
  // Count only authored rows toward the target — empty rows are scaffolding,
  // not progress.
  const filled = items.filter(s => s.trim().length > 0).length;
  const remaining = Math.max(0, target - filled);

  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const rid = rowIdFor ? rowIdFor(i) : undefined;
        const highlighted = !!rid && highlightId === rid;
        return (
          <div
            key={i}
            id={rid ? `entity-${rid}` : undefined}
            className={`flex gap-2 items-center transition-shadow rounded ${highlighted ? 'ring-2 ring-crimson ring-offset-2 ring-offset-parchment-soft' : ''}`}
          >
            <span className="text-brass-deep font-display text-xs w-5 text-right">{i + 1}.</span>
            <div className="flex-1"><Field value={item} onChange={(v) => update(i, v)} placeholder={placeholder} rows={rows} /></div>
            <button onClick={() => remove(i)} className="text-ink-mute hover:text-crimson px-1"><X size={14} /></button>
          </div>
        );
      })}
      {target > 0 && filled < target && (
        <div className="ml-7 text-[11px] text-ink-mute italic font-serif">
          {remaining} more to reach target
          {filled === 0 && (
            <span className="text-ink-faint"> (target: {target})</span>
          )}
        </div>
      )}
      <button onClick={add} className="ml-7 text-xs text-brass-deep hover:text-crimson flex items-center gap-1 font-display uppercase tracking-wider">
        <Plus size={12} /> Add
      </button>
    </div>
  );
};

const Section = ({ id, title, methods, children, done, onToggle, open, onToggleOpen, icon: Icon }: any) => (
  <div id={`section-${id}`} data-cp-anchor={`section:${id}`} className={`rounded border ${done ? 'border-brass/60 bg-brass/5' : 'border-rule bg-parchment-soft'} shadow-card`}>
    <div className="flex items-center gap-2 p-2.5 sm:p-3">
      <button onClick={() => onToggle(id)} className={`w-4 h-4 rounded-sm border flex-shrink-0 flex items-center justify-center ${done ? 'bg-brass border-brass-deep text-parchment' : 'border-ink-mute bg-parchment'}`}>
        {done && <Check size={10} strokeWidth={3} />}
      </button>
      <button onClick={() => onToggleOpen(id)} className="flex-1 min-w-0 flex items-center gap-2 text-left">
        {Icon && <Icon size={14} className="text-brass-deep flex-shrink-0" />}
        <span className="font-display text-sm tracking-wide text-ink flex-1 min-w-0">{title}</span>
        <span className="hidden sm:flex gap-1 flex-shrink-0">{methods?.map((m: any) => <Tag key={m} m={m} />)}</span>
        <span className="text-ink-mute flex-shrink-0">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
      </button>
    </div>
    <div className={`gm-collapse ${open ? 'gm-collapse-open' : ''}`}>
      <div className="gm-collapse-content">
        <div className="px-2.5 sm:px-3 pb-3 border-t border-rule pt-3 space-y-3">
          {children}
        </div>
      </div>
    </div>
  </div>
);

const CardLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-xs text-brass-deep font-display uppercase tracking-wider mb-0.5">{children}</div>
);

const FactionCard = ({ data, onChange, onRemove }: any) => {
  const renown = typeof data.renown === 'number' ? data.renown : 0;
  const rank = renownRank(renown, data.rankLabels);
  return (
    <div className="rounded border border-rule bg-parchment p-3 space-y-2.5 shadow-card">
      <div className="flex justify-between items-center gap-2">
        <Field value={data.name} onChange={(v) => onChange({ ...data, name: v })} placeholder="Faction Name" />
        <button onClick={onRemove} className="text-ink-mute hover:text-crimson"><X size={14} /></button>
      </div>
      <div><CardLabel>Archetype</CardLabel>
        <select value={data.archetype || ''} onChange={(e) => onChange({ ...data, archetype: e.target.value })} className="w-full bg-parchment-soft border border-rule rounded px-2 py-1 text-sm text-ink font-serif">
          <option value="">— Choose —</option>
          <option>Government (preserves order/stability)</option>
          <option>Religious</option><option>Criminal / underground</option><option>Mercantile</option>
          <option>Military</option><option>Cult</option><option>Scholarly</option>
          <option>Revolutionary</option><option>Other</option>
        </select></div>
      <div><CardLabel>Identity</CardLabel>
        <Field value={data.identity} onChange={(v) => onChange({ ...data, identity: v })} placeholder="One sentence" rows={2} /></div>
      <div><CardLabel>Area of Operation</CardLabel>
        <Field value={data.area} onChange={(v) => onChange({ ...data, area: v })} placeholder="Where active" /></div>
      <div><CardLabel>Power Level</CardLabel>
        <Field value={data.power} onChange={(v) => onChange({ ...data, power: v })} placeholder="Resources" /></div>
      <div><CardLabel>Ideology</CardLabel>
        <Field value={data.ideology} onChange={(v) => onChange({ ...data, ideology: v })} placeholder="Why they do it" rows={2} /></div>
      <div><CardLabel>Short-Term Goals</CardLabel>
        <ListField items={data.shortGoals || []} onChange={(v) => onChange({ ...data, shortGoals: v })} placeholder="A short-term goal" /></div>
      <div><CardLabel>Mid-Term Goals</CardLabel>
        <ListField items={data.midGoals || []} onChange={(v) => onChange({ ...data, midGoals: v })} placeholder="A mid-term goal" /></div>
      <div><CardLabel>Long-Term Goal</CardLabel>
        <Field value={data.longGoal} onChange={(v) => onChange({ ...data, longGoal: v })} placeholder="The one big thing" /></div>
      <div>
        <CardLabel>Renown</CardLabel>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => onChange({ ...data, renown: renown - 1 })}
            className="w-7 h-7 rounded border border-rule text-ink-soft hover:bg-parchment-deep font-display"
            title="Decrease renown"
          >
            −
          </button>
          <input
            type="number"
            value={renown}
            onChange={(e) => {
              const v = parseInt(e.target.value || '0', 10);
              onChange({ ...data, renown: isNaN(v) ? 0 : v });
            }}
            className="w-16 bg-parchment-soft border border-rule rounded px-2 py-1 text-sm text-ink font-serif text-center"
          />
          <button
            onClick={() => onChange({ ...data, renown: renown + 1 })}
            className="w-7 h-7 rounded border border-rule text-ink-soft hover:bg-parchment-deep font-display"
            title="Increase renown"
          >
            +
          </button>
          <span className="text-xs px-2 py-0.5 rounded-sm border border-wine/40 bg-wine/5 text-wine font-display uppercase tracking-wider">
            {rank}
          </span>
        </div>
      </div>
    </div>
  );
};

const GoalCard = ({ data, onChange, onRemove }: any) => (
  <div className="rounded border border-rule bg-parchment p-3 space-y-2.5 shadow-card">
    <div className="flex justify-between gap-2">
      <Field value={data.text} onChange={(v) => onChange({ ...data, text: v })} placeholder="Goal Statement" rows={2} />
      <button onClick={onRemove} className="text-ink-mute hover:text-crimson"><X size={14} /></button>
    </div>
    <div className="grid grid-cols-3 gap-1.5">
      {[['short', 'Short-Term'], ['mid', 'Mid-Term'], ['long', 'Long-Term']].map(([t, label]) => (
        <button key={t} onClick={() => onChange({ ...data, timeframe: t })} className={`text-xs py-1 rounded border font-display uppercase tracking-wider ${data.timeframe === t ? 'bg-wine/10 border-wine text-wine' : 'border-rule text-ink-mute'}`}>{label}</button>
      ))}
    </div>
    <div><CardLabel>Rule 3 — Success State</CardLabel>
      <Field value={data.success} onChange={(v) => onChange({ ...data, success: v })} placeholder="What signals completion?" /></div>
    <div><CardLabel>Rule 4 — Failure Consequence</CardLabel>
      <Field value={data.failure} onChange={(v) => onChange({ ...data, failure: v })} placeholder="What changes if it fails?" /></div>
    <div><CardLabel>Linked Factions / Conflicts</CardLabel>
      <Field value={data.linked} onChange={(v) => onChange({ ...data, linked: v })} placeholder="..." /></div>
  </div>
);

const NPCFieldRow = ({
  label,
  value,
  onChange,
  placeholder,
  rows,
  tableId,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rows?: number;
  tableId?: string;
}) => (
  <div>
    <div className="flex items-center justify-between gap-2 mb-0.5">
      <CardLabel>{label}</CardLabel>
      {tableId && (
        <Inspire
          tableId={tableId}
          compact
          label=""
          onPick={(e) => {
            if (value && value.trim() && !confirm(`Replace current ${label.toLowerCase()}?`)) return;
            onChange(e);
          }}
        />
      )}
    </div>
    <Field value={value} onChange={onChange} placeholder={placeholder} rows={rows} />
  </div>
);

const NPCCard = ({ data, onChange, onRemove, defaultDetailsOpen = false }: any) => {
  const [showDetails, setShowDetails] = useState<boolean>(
    defaultDetailsOpen ||
    !!(data.appearance || data.abilities || data.talent || data.mannerism ||
       data.interactions || data.knowledge || data.ideal || data.bond || data.flaw)
  );
  const archetypeInspire = (tableId: string) => (e: string) => {
    if (data.archetype && data.archetype.trim() && !confirm('Replace current archetype?')) return;
    onChange({ ...data, archetype: e });
  };
  return (
    <div className="rounded border border-rule bg-parchment p-3 space-y-2.5 shadow-card">
      <div className="flex justify-between gap-2">
        <Field value={data.name} onChange={(v) => onChange({ ...data, name: v })} placeholder="NPC Name" />
        <div className="flex items-center gap-2 flex-shrink-0">
          <label className="flex items-center gap-1 text-[10px] text-ink-soft uppercase font-display tracking-wider cursor-pointer select-none">
            <input type="checkbox" checked={!!data.isPublic} onChange={(e) => onChange({ ...data, isPublic: e.target.checked })} className="accent-wine" />
            Public
          </label>
          <button onClick={onRemove} className="text-ink-mute hover:text-crimson"><X size={14} /></button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><CardLabel>Type</CardLabel>
          <select value={data.type || ''} onChange={(e) => onChange({ ...data, type: e.target.value })} className="w-full bg-parchment-soft border border-rule rounded px-2 py-1 text-sm text-ink font-serif">
            <option value="">— Choose —</option>
            <option>Ally</option><option>Villain</option><option>Patron</option><option>Rival</option><option>Neutral / Colour</option>
          </select></div>
        <div><CardLabel>Faction</CardLabel>
          <Field value={data.faction} onChange={(v) => onChange({ ...data, faction: v })} placeholder="..." /></div>
      </div>
      <div>
        <div className="flex items-center justify-between gap-2 mb-0.5 flex-wrap">
          <CardLabel>Archetype</CardLabel>
          <div className="flex gap-1 flex-wrap">
            <Inspire tableId="villainArchetypes" compact label="Villain" onPick={archetypeInspire('villainArchetypes')} />
            <Inspire tableId="npcBackgroundConcepts" compact label="Background" onPick={archetypeInspire('npcBackgroundConcepts')} />
            <Inspire tableId="raceCharacterNotes" compact label="Species" onPick={archetypeInspire('raceCharacterNotes')} />
          </div>
        </div>
        <Field value={data.archetype} onChange={(v) => onChange({ ...data, archetype: v })} placeholder='e.g. "Han Solo"' />
      </div>
      <div><CardLabel>Active Goal</CardLabel>
        <Field value={data.goal} onChange={(v) => onChange({ ...data, goal: v })} placeholder="What are they pursuing?" rows={2} /></div>
      <div><CardLabel>Method of Pursuit</CardLabel>
        <Field value={data.method} onChange={(v) => onChange({ ...data, method: v })} placeholder="Violence? Charm?" /></div>
      <button
        onClick={() => setShowDetails(s => !s)}
        className="text-xs text-brass-deep hover:text-crimson flex items-center gap-1 font-display uppercase tracking-wider"
      >
        {showDetails ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {showDetails ? 'Hide Details' : 'Show Details'}
      </button>
      {showDetails && (
        <div className="space-y-2 pt-1 border-t border-rule">
          <NPCFieldRow label="Appearance" value={data.appearance || ''} onChange={(v) => onChange({ ...data, appearance: v })} placeholder="Distinctive physical detail or two" />
          <NPCFieldRow label="Abilities" value={data.abilities || ''} onChange={(v) => onChange({ ...data, abilities: v })} placeholder="High/low ability — strong, slow, perceptive..." />
          <NPCFieldRow label="Talent" value={data.talent || ''} onChange={(v) => onChange({ ...data, talent: v })} placeholder="Something they can do that's distinctive" tableId="npcTalents" />
          <NPCFieldRow label="Mannerism" value={data.mannerism || ''} onChange={(v) => onChange({ ...data, mannerism: v })} placeholder="Small habit that makes them memorable" tableId="npcMannerisms" />
          <NPCFieldRow label="Interactions" value={data.interactions || ''} onChange={(v) => onChange({ ...data, interactions: v })} placeholder="Default conversational stance — curious, suspicious..." tableId="npcInteractionTraits" />
          <NPCFieldRow label="Knowledge" value={data.knowledge || ''} onChange={(v) => onChange({ ...data, knowledge: v })} placeholder="Something useful they know" rows={2} />
          <NPCFieldRow label="Ideal" value={data.ideal || ''} onChange={(v) => onChange({ ...data, ideal: v })} placeholder="What drives them" tableId="npcIdeals" />
          <NPCFieldRow label="Bond" value={data.bond || ''} onChange={(v) => onChange({ ...data, bond: v })} placeholder="Who or what they're tied to" tableId="npcBonds" />
          <NPCFieldRow label="Flaw / Secret" value={data.flaw || ''} onChange={(v) => onChange({ ...data, flaw: v })} placeholder="Flaw or secret that could undermine them" tableId="npcFlawsSecrets" />
        </div>
      )}
    </div>
  );
};

const LocationCard = ({ data, onChange, onRemove }: any) => (
  <div className="rounded border border-rule bg-parchment p-3 space-y-2.5 shadow-card">
    <div className="flex justify-between gap-2">
      <Field value={data.name} onChange={(v) => onChange({ ...data, name: v })} placeholder="Evocative Name" />
      <div className="flex items-center gap-2 flex-shrink-0">
        <label className="flex items-center gap-1 text-[10px] text-ink-soft uppercase font-display tracking-wider cursor-pointer select-none">
          <input type="checkbox" checked={!!data.isPublic} onChange={(e) => onChange({ ...data, isPublic: e.target.checked })} className="accent-wine" />
          Public
        </label>
        <button onClick={onRemove} className="text-ink-mute hover:text-crimson"><X size={14} /></button>
      </div>
    </div>
    <div><CardLabel>Type</CardLabel>
      <select value={data.type || ''} onChange={(e) => onChange({ ...data, type: e.target.value })} className="w-full bg-parchment-soft border border-rule rounded px-2 py-1 text-sm text-ink font-serif">
        <option value="">— Choose —</option>
        <option>Player Base</option><option>Faction Stronghold</option><option>Wilderness Landmark</option>
        <option>Dungeon Room / Area</option><option>Settlement</option><option>Travel Waypoint</option><option>Other</option>
      </select></div>
    <div><CardLabel>3 Aspects</CardLabel>
      <div className="space-y-1">
        {[0, 1, 2].map(i => (
          <Field key={i} value={(data.aspects || [])[i] || ''} onChange={(v) => {
            const aspects = [...(data.aspects || ['', '', ''])]; aspects[i] = v; onChange({ ...data, aspects });
          }} placeholder={`Aspect ${i + 1}`} />
        ))}
      </div></div>
    <div><CardLabel>Factions Present</CardLabel>
      <Field value={data.factions} onChange={(v) => onChange({ ...data, factions: v })} placeholder="..." /></div>
  </div>
);

type SessionLog = { id: string; title: string; date: string; body: string };

function makeLogId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// One-way migration: pcName/pcClass/pcBg/pcWant/pcFear/pcLove/pcFactions → characters[0].
// Legacy keys are dropped after migration; data is preserved inside the new character.
function migrateCharacters(data: Record<string, any>): Record<string, any> {
  if (Array.isArray(data.characters)) {
    return { ...data, characters: (data.characters as unknown[]).map(normalizeCharacter) };
  }
  const { pcName, pcClass, pcBg, pcWant, pcFear, pcLove, pcFactions, ...rest } = data;
  const hasLegacy =
    pcName || pcClass || pcBg || pcWant || pcFear || pcLove ||
    (Array.isArray(pcFactions) && pcFactions.length > 0);
  if (!hasLegacy) return { ...rest, characters: [] };

  const seed = emptyCharacter();
  const factionTies = Array.isArray(pcFactions)
    ? (pcFactions as unknown[]).filter((s) => typeof s === 'string' && s).join(', ')
    : '';
  const migrated: Character = {
    ...seed,
    name: pcName || '',
    classLevel: pcClass || '',
    backstory: pcBg || '',
    ideals: pcWant || '',
    flaws: pcFear || '',
    bonds: pcLove || '',
    notes: factionTies ? `Faction Ties: ${factionTies}` : '',
  };
  return { ...rest, characters: [migrated] };
}

function migrateSessionLogs(data: Record<string, any>): { initialState: Record<string, any>; initialOpenId: string | null } {
  const { logCurrent, ...rest } = data;

  if (Array.isArray(data.sessionLogs)) {
    const logs = data.sessionLogs as SessionLog[];
    if (logs.length === 0) return { initialState: rest, initialOpenId: null };
    const newest = [...logs].sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
    return { initialState: rest, initialOpenId: newest?.id ?? null };
  }

  const existing = typeof logCurrent === 'string' ? logCurrent.trim() : '';
  if (!existing) return { initialState: rest, initialOpenId: null };
  const id = makeLogId();
  const migrated: SessionLog = { id, title: 'Session 1', date: todayISO(), body: logCurrent };
  return { initialState: { ...rest, sessionLogs: [migrated] }, initialOpenId: id };
}

const SessionLogCard = ({ data, open, onToggleOpen, onChange, onRemove }: {
  data: SessionLog;
  open: boolean;
  onToggleOpen: () => void;
  onChange: (v: SessionLog) => void;
  onRemove: () => void;
}) => (
  <div className="rounded border border-rule bg-parchment shadow-card">
    <div className="flex items-center flex-wrap gap-1.5 p-2">
      <button onClick={onToggleOpen} className="text-brass-deep hover:text-crimson flex-shrink-0">
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      <textarea
        rows={1}
        value={data.title || ''}
        onChange={(e) => onChange({ ...data, title: e.target.value })}
        placeholder="Session title"
        className="flex-1 min-w-[8rem] bg-transparent font-display tracking-wide text-sm text-ink placeholder:text-ink-faint placeholder:italic placeholder:font-serif focus:outline-none border-b border-transparent focus:border-crimson pb-0.5 resize-none whitespace-pre-wrap break-words [field-sizing:content]"
      />
      <input
        type="date"
        value={data.date || ''}
        onChange={(e) => onChange({ ...data, date: e.target.value })}
        className="bg-parchment-soft border border-rule rounded px-1 py-0.5 text-[11px] sm:text-xs text-ink-soft font-serif focus:border-crimson focus:outline-none flex-shrink-0"
      />
      <button onClick={onRemove} className="text-ink-mute hover:text-crimson px-1 flex-shrink-0">
        <X size={14} />
      </button>
    </div>
    {open && (
      <div className="px-2.5 pb-2.5 pt-2 border-t border-rule">
        <textarea
          value={data.body || ''}
          onChange={(e) => onChange({ ...data, body: e.target.value })}
          placeholder="What happened. Open threads."
          rows={6}
          className="w-full bg-transparent border-b border-rule text-ink font-serif placeholder:text-ink-faint placeholder:italic focus:border-crimson focus:outline-none resize-y px-1 py-1 text-sm"
        />
      </div>
    )}
  </div>
);

const ClockCard = ({ data, onChange, onRemove }: any) => {
  const max = data.max || 6;
  const filled = data.filled || 0;
  const notes: string = data.notes || '';
  const [notesOpen, setNotesOpen] = useState(notes.trim().length > 0);
  return (
    <div className="rounded border border-rule bg-parchment p-3 space-y-2.5 shadow-card">
      <div className="flex justify-between gap-2">
        <Field value={data.text} onChange={(v) => onChange({ ...data, text: v })} placeholder="What is this faction trying to do?" />
        <button onClick={onRemove} className="text-ink-mute hover:text-crimson"><X size={14} /></button>
      </div>
      <Field value={data.faction} onChange={(v) => onChange({ ...data, faction: v })} placeholder="Faction" />
      <div className="flex flex-wrap items-center gap-2">
        <select value={max} onChange={(e) => onChange({ ...data, max: Number(e.target.value) })} className="bg-parchment-soft border border-rule rounded px-2 py-1 text-xs text-ink font-serif flex-shrink-0">
          {[4, 6, 8, 12, 16].map(n => <option key={n} value={n}>{n} segments</option>)}
        </select>
        <div className="flex gap-0.5 flex-1 min-w-[8rem] border border-brass-deep rounded-sm p-0.5 bg-parchment-deep">
          {Array.from({ length: max }).map((_, i) => (
            <button key={i} onClick={() => onChange({ ...data, filled: i + 1 === filled ? i : i + 1 })} className={`flex-1 min-w-[14px] h-5 rounded-sm transition-colors ${i < filled ? 'bg-crimson' : 'bg-parchment hover:bg-parchment-deep'}`} />
          ))}
        </div>
        <span className="text-xs text-brass-deep font-display flex-shrink-0">{filled}/{max}</span>
      </div>
      <div className="pt-1 border-t border-rule/60">
        <button
          type="button"
          onClick={() => setNotesOpen(o => !o)}
          className="flex items-center gap-1 text-[10px] text-brass-deep hover:text-crimson font-display uppercase tracking-wider"
        >
          {notesOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Notes{notes.trim() ? '' : ' (empty)'}
        </button>
        {notesOpen && (
          <textarea
            value={notes}
            onChange={(e) => onChange({ ...data, notes: e.target.value })}
            placeholder="Front notes — what this faction is doing, why it matters, what advances it"
            rows={3}
            className="mt-1.5 w-full bg-parchment-soft border border-rule rounded px-2 py-1.5 text-sm text-ink font-serif placeholder:text-ink-faint placeholder:italic focus:border-crimson focus:outline-none resize-y [field-sizing:content]"
          />
        )}
      </div>
    </div>
  );
};

type EncounterMonster = { cr: string; count: number };
type EncounterCalcState = { pcLevel: number; monsters: EncounterMonster[]; gestalt?: boolean };

type DowntimeEntry = {
  id: string;
  type: string;
  fields: Record<string, string>;
  createdAt: string;
  archived?: boolean;
};

const DOWNTIME_TYPES: Array<{
  id: string;
  label: string;
  fields: Array<{ key: string; label: string; placeholder: string; rows?: number }>;
  reference?: string;
}> = [
  {
    id: 'stronghold',
    label: 'Building a Stronghold',
    fields: [
      { key: 'propertyType', label: 'Property Type', placeholder: 'Tower, keep, manor...' },
      { key: 'location', label: 'Location', placeholder: 'Where is it being built?' },
      { key: 'dailyCost', label: 'Daily Cost (gp)', placeholder: 'e.g. 125' },
      { key: 'daysRemaining', label: 'Days Remaining', placeholder: 'e.g. 60' },
    ],
    reference:
      'Abbey/Temple/Keep ~50,000gp over ~400 days · Tower/Outpost ~15,000gp over ~100 days · ' +
      'Trading post/Guildhall ~5,000gp over ~60 days · Palace ~500,000gp over ~1,200 days · ' +
      'Noble manor ~25,000gp over ~150 days.',
  },
  {
    id: 'carousing',
    label: 'Carousing',
    fields: [
      { key: 'lifestyle', label: 'Lifestyle', placeholder: 'Modest / Comfortable / Wealthy / Aristocratic' },
      { key: 'daysSpent', label: 'Days Spent', placeholder: 'e.g. 5' },
      { key: 'outcome', label: 'Outcome Notes', placeholder: 'What happened — contacts, complications, rumors', rows: 3 },
    ],
  },
  {
    id: 'crafting',
    label: 'Crafting a Magic Item',
    fields: [
      { key: 'itemName', label: 'Item Name', placeholder: 'What is being crafted' },
      { key: 'rarity', label: 'Rarity', placeholder: 'Common / Uncommon / Rare / Very Rare / Legendary' },
      { key: 'daysRemaining', label: 'Days Remaining', placeholder: 'Working days left' },
      { key: 'gpCommitted', label: 'GP Committed', placeholder: 'Total invested so far' },
    ],
    reference:
      'Common 100gp / min lvl 3 · Uncommon 500gp / min lvl 3 · Rare 5,000gp / min lvl 6 · ' +
      'Very Rare 50,000gp / min lvl 11 · Legendary 500,000gp / min lvl 17.',
  },
  {
    id: 'renown',
    label: 'Gaining Renown',
    fields: [
      { key: 'factionName', label: 'Faction', placeholder: 'Which faction' },
      { key: 'currentRenown', label: 'Current Renown', placeholder: 'e.g. 3' },
      { key: 'targetRenown', label: 'Target Renown', placeholder: 'e.g. 10' },
      { key: 'narrative', label: 'Narrative', placeholder: 'What is the character doing to earn it?', rows: 3 },
    ],
  },
  {
    id: 'sacredRites',
    label: 'Performing Sacred Rites',
    fields: [
      { key: 'faith', label: 'Faith / Temple', placeholder: 'Which faith or temple' },
      { key: 'daysSpent', label: 'Days Spent', placeholder: 'e.g. 10' },
      { key: 'intent', label: 'Intent', placeholder: 'What the rite is for', rows: 3 },
    ],
  },
  {
    id: 'business',
    label: 'Running a Business',
    fields: [
      { key: 'businessType', label: 'Business Type', placeholder: 'Tavern, smithy, ship...' },
      { key: 'daysManaged', label: 'Days Managed', placeholder: 'e.g. 30' },
      { key: 'profitLoss', label: 'Profit / Loss (gp)', placeholder: 'Positive or negative' },
      { key: 'narrative', label: 'Narrative', placeholder: 'How is it going?', rows: 3 },
    ],
  },
  {
    id: 'sellingMagic',
    label: 'Selling Magic Items',
    fields: [
      { key: 'item', label: 'Item', placeholder: 'What is being sold' },
      { key: 'askingPrice', label: 'Asking Price', placeholder: 'In gp' },
      { key: 'buyer', label: 'Buyer', placeholder: 'Named buyer or "looking for buyer"' },
    ],
  },
  {
    id: 'training',
    label: 'Training',
    fields: [
      { key: 'skillOrFeat', label: 'Skill or Feat', placeholder: 'What is being learned' },
      { key: 'totalDays', label: 'Total Days Needed', placeholder: 'e.g. 250' },
      { key: 'daysCompleted', label: 'Days Completed', placeholder: 'e.g. 47' },
    ],
  },
];

function makeDowntimeId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const DowntimeCard = ({
  entry,
  onChange,
  onArchive,
  onUnarchive,
  onRemove,
}: {
  entry: DowntimeEntry;
  onChange: (e: DowntimeEntry) => void;
  onArchive: () => void;
  onUnarchive: () => void;
  onRemove: () => void;
}) => {
  const type = DOWNTIME_TYPES.find(t => t.id === entry.type);
  if (!type) return null;
  return (
    <div className={`rounded border p-3 space-y-2 shadow-card ${entry.archived ? 'border-rule/60 bg-parchment-deep/40 opacity-80' : 'border-rule bg-parchment'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-display text-sm tracking-wide text-ink">{type.label}</span>
        <div className="flex gap-1.5">
          {entry.archived ? (
            <button onClick={onUnarchive} className="text-[10px] px-2 py-0.5 rounded border border-rule text-ink-soft hover:bg-parchment-deep font-display uppercase tracking-wider">Unarchive</button>
          ) : (
            <button onClick={onArchive} className="text-[10px] px-2 py-0.5 rounded border border-rule text-ink-soft hover:bg-parchment-deep font-display uppercase tracking-wider">Archive</button>
          )}
          <button onClick={onRemove} className="text-ink-mute hover:text-crimson"><X size={14} /></button>
        </div>
      </div>
      <div className="space-y-2">
        {type.fields.map(f => (
          <div key={f.key}>
            <CardLabel>{f.label}</CardLabel>
            <Field
              value={entry.fields[f.key] || ''}
              onChange={(v) => onChange({ ...entry, fields: { ...entry.fields, [f.key]: v } })}
              placeholder={f.placeholder}
              rows={f.rows}
            />
          </div>
        ))}
      </div>
      {type.reference && (
        <div className="text-[10px] text-ink-mute italic font-serif border-t border-rule pt-1.5">
          {type.reference}
        </div>
      )}
    </div>
  );
};

const CR_OPTIONS = ["0", "1/8", "1/4", "1/2", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
  "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
  "21", "22", "23", "24", "25", "26", "27", "28", "29", "30"];

const RATING_COLORS: Record<string, string> = {
  Trivial: 'text-emerald-700 bg-emerald-100/40 border-emerald-700/40',
  Easy:    'text-emerald-700 bg-emerald-100/40 border-emerald-700/40',
  Medium:  'text-yellow-700 bg-yellow-100/50 border-yellow-700/40',
  Hard:    'text-orange-700 bg-orange-100/50 border-orange-700/40',
  Deadly:  'text-red-700 bg-red-100/50 border-red-700/50',
  Lethal:  'text-red-900 bg-red-200/60 border-red-900/60',
};

const EncounterHelper = ({
  state,
  onChange,
}: {
  state: EncounterCalcState;
  onChange: (s: EncounterCalcState) => void;
}) => {
  const monsters = state.monsters || [];
  const totalCount = monsters.reduce((sum, m) => sum + (m.count || 0), 0);
  const baseXP = monsters.reduce((sum, m) => sum + (CR_TO_XP[m.cr] || 0) * (m.count || 0), 0);
  const mult = encounterMultiplier(totalCount);
  const adjustedXP = Math.round(baseXP * mult);
  const { rating, rationale } = difficultyForSolo(adjustedXP, state.pcLevel || 1, !!state.gestalt);
  const ratingClass = RATING_COLORS[rating] || RATING_COLORS.Medium;

  const updateMonster = (i: number, patch: Partial<EncounterMonster>) => {
    const next = monsters.map((m, j) => j === i ? { ...m, ...patch } : m);
    onChange({ ...state, monsters: next });
  };
  const addMonster = () => {
    if (monsters.length >= 6) return;
    onChange({ ...state, monsters: [...monsters, { cr: '1/4', count: 1 }] });
  };
  const removeMonster = (i: number) => {
    onChange({ ...state, monsters: monsters.filter((_, j) => j !== i) });
  };

  return (
    <div className="rounded border border-amber-900/30 bg-amber-950/10 p-3 space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="font-display text-xs uppercase tracking-wider text-amber-900">Solo Encounter Helper</span>
        <span className="text-[10px] text-ink-mute italic font-serif">5e SRD thresholds · solo-adjusted</span>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-ink-soft font-serif">PC Level</label>
          <input
            type="number"
            min={1}
            max={20}
            value={state.pcLevel || 1}
            onChange={(e) => {
              const v = parseInt(e.target.value || '1', 10);
              onChange({ ...state, pcLevel: Math.min(20, Math.max(1, isNaN(v) ? 1 : v)) });
            }}
            className="w-16 bg-parchment-soft border border-rule rounded px-2 py-1 text-sm text-ink font-serif"
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-ink-soft font-serif cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!!state.gestalt}
            onChange={(e) => onChange({ ...state, gestalt: e.target.checked })}
            className="accent-wine"
          />
          Gestalt PC
          <span className="text-[10px] italic text-ink-mute">(uses full standard thresholds)</span>
        </label>
      </div>
      <div className="space-y-1.5">
        {monsters.map((m, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="text-xs text-ink-mute w-4">{i + 1}.</span>
            <label className="text-[10px] text-ink-mute font-display uppercase tracking-wider">CR</label>
            <select
              value={m.cr}
              onChange={(e) => updateMonster(i, { cr: e.target.value })}
              className="bg-parchment-soft border border-rule rounded px-2 py-1 text-xs text-ink font-serif"
            >
              {CR_OPTIONS.map(cr => <option key={cr} value={cr}>{cr}</option>)}
            </select>
            <span className="text-[10px] text-ink-mute font-serif">×</span>
            <input
              type="number"
              min={1}
              max={99}
              value={m.count || 1}
              onChange={(e) => {
                const v = parseInt(e.target.value || '1', 10);
                updateMonster(i, { count: Math.max(1, isNaN(v) ? 1 : v) });
              }}
              className="w-14 bg-parchment-soft border border-rule rounded px-2 py-1 text-xs text-ink font-serif"
            />
            <span className="text-[10px] text-ink-mute font-serif flex-1">
              = {(CR_TO_XP[m.cr] || 0) * (m.count || 0)} XP
            </span>
            <button onClick={() => removeMonster(i)} className="text-ink-mute hover:text-crimson"><X size={12} /></button>
          </div>
        ))}
        {monsters.length < 6 && (
          <button onClick={addMonster} className="text-xs text-brass-deep hover:text-crimson flex items-center gap-1 font-display uppercase tracking-wider">
            <Plus size={12} /> Add Monster
          </button>
        )}
      </div>
      {monsters.length > 0 && (
        <div className="border-t border-amber-900/20 pt-2 space-y-1 text-xs font-serif">
          <div className="flex justify-between text-ink-soft">
            <span>Base XP</span><span>{baseXP}</span>
          </div>
          <div className="flex justify-between text-ink-soft">
            <span>Group multiplier ({totalCount} creature{totalCount === 1 ? '' : 's'})</span>
            <span>× {mult}</span>
          </div>
          <div className="flex justify-between text-ink font-semibold">
            <span>Adjusted XP</span><span>{adjustedXP}</span>
          </div>
          <div className={`mt-1.5 rounded border px-2 py-1.5 flex items-center justify-between ${ratingClass}`}>
            <span className="font-display uppercase tracking-wider text-xs">{rating}</span>
            <span className="text-[10px] italic">{rationale}</span>
          </div>
        </div>
      )}
    </div>
  );
};

const RENOWN_RANKS: Array<{ min: number; label: string }> = [
  { min: 50,  label: 'Legend' },
  { min: 25,  label: 'Honored' },
  { min: 10,  label: 'Established' },
  { min: 3,   label: 'Trusted' },
  { min: 1,   label: 'Initiate' },
  { min: 0,   label: 'Unknown' },
  { min: -2,  label: 'Distrusted' },
  { min: -9,  label: 'Disliked' },
  { min: -24, label: 'Hostile' },
  { min: -49, label: 'Despised' },
];

function renownRank(value: number, custom?: string[]): string {
  if (custom && custom.length === 6 && value >= 0) {
    if (value >= 50) return custom[5];
    if (value >= 25) return custom[4];
    if (value >= 10) return custom[3];
    if (value >= 3)  return custom[2];
    if (value >= 1)  return custom[1];
    return custom[0];
  }
  for (const r of RENOWN_RANKS) {
    if (value >= r.min) return r.label;
  }
  return 'Enemy';
}

// Run/Session inline view — same intent as the full-screen RunSessionView
// overlay, but rendered inside the sub-view container so the rest of the
// app chrome (mode nav, header) stays visible. The overlay is still
// available via the header "Run Session" button.
function RunSessionInline({
  get, setVal, setState, characters, campaignContext,
  nextUp, jumpToNextUp, trackEvent, navigateTo, onEndSession,
}: {
  get: (k: string, fb: any) => any;
  setVal: (k: string, v: any) => void;
  setState: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  characters: Character[];
  campaignContext: any;
  nextUp: { id: string; label: string; current: number; target: number; sectionId: string; phaseId: string } | null;
  jumpToNextUp: () => void;
  trackEvent: (kind: ChangeEventKind, summary: string, before?: unknown, after?: unknown) => void;
  navigateTo: (target: { mode: Mode; subview?: string; sessionId?: string; anchor?: string }) => void;
  onEndSession: () => void;
}) {
  const activeId = (get('__activeSessionId', '') as string) || '';
  const isActive = !!activeId;
  const startedAt = (get('__sessionStartedAt', 0) as number) || 0;

  if (!isActive) {
    return <RunSessionInlineIdle
      get={get} setVal={setVal} setState={setState}
      nextUp={nextUp} jumpToNextUp={jumpToNextUp} navigateTo={navigateTo}
    />;
  }

  return <RunSessionInlineActive
    get={get} setVal={setVal} characters={characters} campaignContext={campaignContext}
    startedAt={startedAt} trackEvent={trackEvent} onEndSession={onEndSession}
  />;
}

function RunSessionInlineIdle({
  get, setVal, setState, nextUp, jumpToNextUp, navigateTo,
}: {
  get: (k: string, fb: any) => any;
  setVal: (k: string, v: any) => void;
  setState: React.Dispatch<React.SetStateAction<Record<string, any>>>;
  nextUp: { id: string; label: string; current: number; target: number; sectionId: string; phaseId: string } | null;
  jumpToNextUp: () => void;
  navigateTo: (target: { mode: Mode; subview?: string }) => void;
}) {
  const sessionV2 = (get('sessionLogV2', []) as SessionLogEntry[]) || [];
  const recent = [...sessionV2].sort((a, b) => (b.endedAt || 0) - (a.endedAt || 0)).slice(0, 3);

  const npcsCount = (get('npcs', []) as any[]).length;
  const locationsCount = (get('locations', []) as any[]).length;
  const secretsTotal = (get('secrets', []) as string[]).length;
  const revealedMap = get('revSec', {}) as Record<number, boolean>;
  const secretsRemaining = (get('secrets', []) as string[]).filter((_, i) => !revealedMap[i]).length;
  const scenesCount = (get('scenes', []) as string[]).length;

  const startNewSession = (openOverlay: boolean) => {
    const sid = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setState(s => markSessionPlayed({
      ...s,
      __activeSessionId: sid,
      __sessionStartedAt: Date.now(),
      __sessionChangeEvents: [],
      __sessionUsedScenes: [],
      __runSessionOpen: openOverlay,
    }));
  };

  return (
    <div className="space-y-3">
      <div className="rounded border-2 border-crimson/50 bg-crimson/5 p-5 shadow-card">
        <h2 className="font-display text-xl tracking-wide text-crimson mb-1 flex items-center gap-2">
          <Swords size={20} /> Start a Session
        </h2>
        <p className="text-sm text-ink-soft font-serif mb-3">
          Track prep items used, capture events, and seed the session log. Start in-tab to keep
          the app chrome visible, or open the full-screen run-session overlay.
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => startNewSession(false)}
            className="text-sm px-4 py-2 rounded border border-crimson/60 bg-crimson text-parchment hover:bg-wine font-display uppercase tracking-wider flex items-center gap-2"
          >
            <Play size={14} /> Start In-Tab
          </button>
          <button
            type="button"
            onClick={() => startNewSession(true)}
            className="text-sm px-4 py-2 rounded border border-crimson/60 bg-crimson/10 text-crimson hover:bg-crimson hover:text-parchment font-display uppercase tracking-wider flex items-center gap-2"
          >
            Start Full-Screen
          </button>
        </div>
      </div>

      <div className="rounded border border-rule bg-parchment p-4 shadow-card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-display tracking-wide text-ink text-sm">Recent Sessions</h3>
          {recent.length > 0 && (
            <button
              type="button"
              onClick={() => navigateTo({ mode: 'run', subview: 'log' })}
              className="text-xs text-brass-deep hover:text-crimson font-display uppercase tracking-wider"
            >
              View All →
            </button>
          )}
        </div>
        {recent.length === 0 ? (
          <p className="text-xs text-ink-mute italic font-serif">No session logs yet.</p>
        ) : (
          <ul className="space-y-2">
            {recent.map(entry => (
              <li key={entry.id} className="rounded border border-rule bg-parchment-soft p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] text-brass-deep font-display uppercase tracking-wider">
                      Session {entry.number}
                      {entry.endedAt && <span className="ml-2 text-ink-mute">{new Date(entry.endedAt).toLocaleDateString()}</span>}
                    </div>
                    {entry.title && <div className="font-display text-sm text-ink truncate">{entry.title}</div>}
                    {entry.recap && (
                      <p className="text-xs text-ink-soft font-serif italic line-clamp-2 mt-0.5">{entry.recap}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => navigateTo({ mode: 'run', subview: 'log' })}
                    className="text-[10px] px-2 py-0.5 rounded-sm border border-brass-deep/60 text-brass-deep hover:bg-brass hover:text-parchment font-display uppercase tracking-wider flex-shrink-0"
                  >
                    View
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded border border-rule bg-parchment p-4 shadow-card">
        <h3 className="font-display tracking-wide text-ink text-sm mb-2">Prep Status</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          <PrepStat label="NPCs" value={npcsCount} />
          <PrepStat label="Locations" value={locationsCount} />
          <PrepStat label="Secrets" value={`${secretsRemaining}/${secretsTotal}`} sub="unrevealed" />
          <PrepStat label="Scenes" value={scenesCount} />
        </div>
        {nextUp ? (
          <div className="flex items-center gap-2 rounded border border-brass/40 bg-brass/5 p-2">
            <span className="text-[10px] font-display uppercase tracking-wider text-brass-deep flex-shrink-0">Lowest Progress</span>
            <span className="flex-1 text-xs font-serif text-ink-soft">
              <span className="text-ink font-display">{nextUp.label}</span>
              <span className="text-ink-mute italic ml-1">— {nextUp.current} of {nextUp.target}</span>
            </span>
            <button
              type="button"
              onClick={jumpToNextUp}
              className="text-[10px] px-2 py-0.5 rounded-sm border border-brass-deep/60 text-brass-deep hover:bg-brass hover:text-parchment font-display uppercase tracking-wider flex-shrink-0"
            >
              Jump
            </button>
          </div>
        ) : (
          <p className="text-xs text-moss italic font-serif">All prep targets met. Ready to run.</p>
        )}
      </div>
    </div>
  );
}

function PrepStat({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded border border-rule bg-parchment-soft p-2 text-center">
      <div className="font-display text-xl text-ink tabular-nums">{value}</div>
      <div className="text-[10px] font-display uppercase tracking-wider text-brass-deep">{label}</div>
      {sub && <div className="text-[9px] text-ink-mute italic">{sub}</div>}
    </div>
  );
}

function RunSessionInlineActive({
  get, setVal, characters, campaignContext, startedAt, trackEvent, onEndSession,
}: {
  get: (k: string, fb: any) => any;
  setVal: (k: string, v: any) => void;
  characters: Character[];
  campaignContext: any;
  startedAt: number;
  trackEvent: (kind: ChangeEventKind, summary: string, before?: unknown, after?: unknown) => void;
  onEndSession: () => void;
}) {
  const sessionV2 = (get('sessionLogV2', []) as SessionLogEntry[]) || [];
  const sessionNumber = nextSessionNumber(sessionV2);
  const [initiativeOpen, setInitiativeOpen] = useState(false);
  const musicOpen = !!get('__musicOpen', false);
  const setMusicOpen = (v: boolean) => setVal('__musicOpen', v);

  const scenes = (get('scenes', []) as string[]) || [];
  const secrets = (get('secrets', []) as string[]) || [];
  const npcs = (get('npcs', []) as any[]) || [];
  const locations = (get('locations', []) as any[]) || [];
  const usedScenes = (get('__sessionUsedScenes', []) as string[]) || [];
  const revSec = (get('revSec', {}) as Record<number, boolean>) || {};
  const scratchpad = (get('__sessionScratchpad', '') as string) || '';

  const monstersList = (get('monsters', []) as string[]) || [];
  const magicItemsList = (get('items', []) as any[]) || [];
  const normalizedItems = magicItemsList.map((it, i) => normalizeItem(it, i));
  const playerConfig = (get('player', {}) as any) || {};
  const roster = playerConfig.roster || [];
  const givenItems = (get('__sessionItemsGiven', []) as string[]) || [];
  const pcGoals = (get('pcGoals', []) as any[]) || [];
  const clocks = (get('clocks', []) as any[]) || [];
  const factions = (get('factions', []) as any[]) || [];
  const strongStart = ((get('strongStart', '') as string) || '').trim();
  const [strongStartDone, setStrongStartDone] = useState(false);

  const elapsed = formatElapsed(Date.now() - startedAt);
  const [, forceTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => forceTick(n => n + 1), 30000);
    return () => clearInterval(id);
  }, []);

  const toggleSceneUsed = (text: string) => {
    if (usedScenes.includes(text)) {
      setVal('__sessionUsedScenes', usedScenes.filter(s => s !== text));
      return;
    }
    setVal('__sessionUsedScenes', [...usedScenes, text]);
    trackEvent('scene_used', `Used scene: ${text}`);
  };

  const setRevealed = (i: number, value: boolean, text: string) => {
    const next = { ...revSec, [i]: value };
    setVal('revSec', next);
    if (value && !revSec[i]) trackEvent('secret_revealed', text);
  };

  const toggleItemGiven = (text: string) => {
    if (givenItems.includes(text)) {
      setVal('__sessionItemsGiven', givenItems.filter(s => s !== text));
      return;
    }
    setVal('__sessionItemsGiven', [...givenItems, text]);
    trackEvent('magic_item_given', `Magic item given: ${text}`);
  };

  const updateGoalStatus = (i: number, status: string) => {
    const goal = pcGoals[i];
    const fromStatus = goal?.status || 'Active';
    if (fromStatus === status) return;
    const next = [...pcGoals];
    next[i] = { ...goal, status };
    setVal('pcGoals', next);
    trackEvent(
      'goal_status',
      `${goal?.text || `Goal ${i + 1}`}: ${fromStatus} → ${status}`,
      fromStatus, status,
    );
  };

  const tickClock = (i: number, delta: number) => {
    const c = clocks[i];
    if (!c) return;
    const max = c.max || 6;
    const filledNew = Math.max(0, Math.min(max, (c.filled || 0) + delta));
    if (filledNew === c.filled) return;
    const next = [...clocks];
    next[i] = { ...c, filled: filledNew };
    setVal('clocks', next);
    trackEvent(
      'faction_clock_ticked',
      `${c.faction || 'Faction'}: ${c.text || 'clock'} ${c.filled || 0} → ${filledNew} / ${max}`,
      c.filled || 0, filledNew,
    );
  };

  const adjustRenown = (i: number, delta: number) => {
    const f = factions[i];
    if (!f) return;
    const fromV = typeof f.renown === 'number' ? f.renown : 0;
    const toV = fromV + delta;
    const next = [...factions];
    next[i] = { ...f, renown: toV };
    setVal('factions', next);
    trackEvent(
      'renown_changed',
      `${f.name || `Faction ${i + 1}`} renown: ${fromV} → ${toV}`,
      fromV, toV,
    );
  };

  const unrevealedSecrets = secrets
    .map((s, i) => ({ s, i }))
    .filter(({ i }) => !revSec[i]);

  return (
    <div className="space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-2 rounded border-2 border-crimson/50 bg-crimson/5 p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Swords size={16} className="text-crimson" />
          <span className="font-display text-base tracking-wide text-crimson">
            Session {sessionNumber}
          </span>
          <span className="text-xs text-ink-soft font-serif italic">started {elapsed} ago</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setVal('__runSessionOpen', true)}
            className="text-xs px-3 py-1.5 rounded border border-brass-deep/60 text-brass-deep hover:bg-brass hover:text-parchment font-display uppercase tracking-wider flex items-center gap-1.5"
            title="Switch to the full-screen overlay"
          >
            Full-Screen
          </button>
          <button
            type="button"
            onClick={onEndSession}
            className="text-xs px-3 py-1.5 rounded border border-crimson/60 bg-crimson/10 text-crimson hover:bg-crimson hover:text-parchment font-display uppercase tracking-wider flex items-center gap-1.5"
          >
            End Session
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-3">
        <div className="space-y-3 min-w-0">
          {strongStart && (
            <section className="rounded border-2 border-crimson/50 bg-crimson/5 shadow-card p-3 sm:p-4">
              <div className="flex items-start gap-2 mb-1.5">
                <Zap size={16} className="text-crimson flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <h2 className="font-display tracking-wide text-sm sm:text-base text-crimson uppercase">
                      Strong Start
                    </h2>
                    <button
                      onClick={() => {
                        const next = !strongStartDone;
                        setStrongStartDone(next);
                        if (next) trackEvent('other', 'Strong start delivered');
                      }}
                      className={`text-[10px] px-2 py-0.5 rounded-sm border font-display uppercase tracking-wider flex items-center gap-1 ${
                        strongStartDone
                          ? 'bg-brass border-brass-deep text-parchment'
                          : 'border-brass-deep/60 text-brass-deep hover:bg-brass/10'
                      }`}
                    >
                      {strongStartDone && <Check size={10} strokeWidth={3} />}
                      {strongStartDone ? 'Delivered' : 'Mark Delivered'}
                    </button>
                  </div>
                  <p className={`mt-1 text-sm sm:text-base font-serif text-ink-soft whitespace-pre-wrap ${strongStartDone ? 'italic opacity-60' : ''}`}>
                    {strongStart}
                  </p>
                </div>
              </div>
            </section>
          )}

          <ActivePrepGroup title="Scenes" icon={NotebookPen} count={scenes.length}>
            {scenes.length === 0 ? <Empty>No scenes prepped.</Empty> : scenes.map((s, i) => {
              const used = usedScenes.includes(s);
              return (
                <CompactCard
                  key={i}
                  label={s}
                  status={used ? 'used' : undefined}
                  action={{
                    label: used ? 'Unmark' : 'Mark Used',
                    onClick: () => toggleSceneUsed(s),
                  }}
                />
              );
            })}
          </ActivePrepGroup>

          <ActivePrepGroup title="Secrets & Clues" icon={ScrollText} count={secrets.length}>
            {secrets.length === 0 ? <Empty>No secrets prepped.</Empty> : secrets.map((s, i) => {
              const revealed = !!revSec[i];
              return (
                <CompactCard
                  key={i}
                  label={s}
                  status={revealed ? 'used' : undefined}
                  action={{
                    label: revealed ? 'Unmark' : 'Mark Revealed',
                    onClick: () => setRevealed(i, !revealed, s),
                  }}
                />
              );
            })}
          </ActivePrepGroup>

          <ActivePrepGroup title="NPCs" icon={User} count={npcs.length}>
            {npcs.length === 0 ? <Empty>No NPCs prepped.</Empty> : npcs.map((n: any, i: number) => (
              <ExpandableCard
                key={i}
                label={(n.name || '').trim() || (n.archetype || '').trim() || `NPC ${i + 1}`}
                tag={[n.type, n.faction].filter(Boolean).join(' · ')}
              >
                {n.goal && <Detail label="Goal">{n.goal}</Detail>}
                {n.method && <Detail label="Method">{n.method}</Detail>}
                {n.archetype && <Detail label="Archetype">{n.archetype}</Detail>}
                {n.mannerism && <Detail label="Mannerism">{n.mannerism}</Detail>}
              </ExpandableCard>
            ))}
          </ActivePrepGroup>

          <ActivePrepGroup title="Locations" icon={Map} count={locations.length}>
            {locations.length === 0 ? <Empty>No locations prepped.</Empty> : locations.map((l: any, i: number) => (
              <ExpandableCard
                key={i}
                label={(l.name || '').trim() || `Location ${i + 1}`}
                tag={l.type || ''}
              >
                {Array.isArray(l.aspects) && l.aspects.filter(Boolean).length > 0 && (
                  <ul className="ml-3 list-disc text-[12px] text-ink-soft italic">
                    {l.aspects.filter(Boolean).map((a: string, j: number) => <li key={j}>{a}</li>)}
                  </ul>
                )}
                {l.factions && <Detail label="Factions">{l.factions}</Detail>}
              </ExpandableCard>
            ))}
          </ActivePrepGroup>

          <ActivePrepGroup title="Relevant Monsters" icon={Skull} count={monstersList.length}>
            {monstersList.length === 0 ? <Empty>No monsters prepped.</Empty> : (
              <ul className="space-y-1">
                {monstersList.map((m, i) => (
                  <li key={i} className="px-2 py-1.5 rounded border border-rule bg-parchment text-sm font-serif text-ink-soft">
                    {m}
                  </li>
                ))}
              </ul>
            )}
          </ActivePrepGroup>

          <ActivePrepGroup title="Magic Items" icon={Gem} count={magicItemsList.length}>
            {normalizedItems.length === 0 ? (
              <Empty>No magic items prepped.</Empty>
            ) : (
              <div className="space-y-2 w-full">
                {normalizedItems.map((item, i) => {
                  const isAssigned = !!item.assignedPlayerId;
                  return (
                    <div
                      key={item.id}
                      className={`p-3 rounded border font-serif text-sm transition-all duration-150 ${
                        isAssigned
                          ? 'border-brass/60 bg-brass/10 shadow-sm'
                          : 'border-rule bg-parchment hover:border-brass/45'
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1 space-y-1">
                          <div className={`font-semibold text-ink ${isAssigned ? 'text-ink-mute' : ''}`}>
                            {item.name || 'Unnamed Item'}
                          </div>
                          {item.description && (
                            <p className="text-xs text-ink-soft italic whitespace-pre-wrap">
                              {item.description}
                            </p>
                          )}

                          {/* GM Controls inside Session Running panel */}
                          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 items-center text-[11px] border-t border-rule/30 pt-2 font-sans">
                            <div className="flex items-center gap-1.5">
                              <span className="font-display text-[9px] uppercase tracking-wider text-brass-deep">
                                Assigned to:
                              </span>
                              <select
                                value={item.assignedPlayerId || ''}
                                onChange={(e) => {
                                  const slotId = e.target.value || undefined;
                                  const nextItems = [...magicItemsList];
                                  nextItems[i] = { ...item, assignedPlayerId: slotId };
                                  setVal('items', nextItems);

                                  if (slotId) {
                                    const player = roster.find((r: any) => r.slotId === slotId);
                                    const name = player ? player.displayName : 'Player';
                                    trackEvent('magic_item_given', `Magic item "${item.name}" assigned to ${name}`);
                                  } else {
                                    trackEvent('other', `Magic item "${item.name}" unassigned`);
                                  }
                                }}
                                className="rounded border border-rule bg-parchment px-1.5 py-0.5 text-ink-soft cursor-pointer focus:outline-none"
                              >
                                <option value="">Unassigned</option>
                                {roster.map((r: any) => (
                                  <option key={r.slotId} value={r.slotId}>{r.displayName}</option>
                                ))}
                              </select>
                            </div>

                            {isAssigned && (
                              <div className="flex items-center gap-1.5">
                                <span className="font-display text-[9px] uppercase tracking-wider text-brass-deep">
                                  Player sees:
                                </span>
                                <select
                                  value={item.playerVisibility || 'full'}
                                  onChange={(e) => {
                                    const vis = e.target.value as 'name-only' | 'full';
                                    const nextItems = [...magicItemsList];
                                    nextItems[i] = { ...item, playerVisibility: vis };
                                    setVal('items', nextItems);
                                  }}
                                  className="rounded border border-rule bg-parchment px-1.5 py-0.5 text-ink-soft cursor-pointer focus:outline-none"
                                >
                                  <option value="full">Name & Description</option>
                                  <option value="name-only">Name Only</option>
                                </select>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ActivePrepGroup>

          <ActivePrepGroup title="PC Goals" icon={Target} count={pcGoals.length}>
            {pcGoals.length === 0 ? <Empty>No PC goals prepped.</Empty> : (
              <ul className="space-y-1.5">
                {pcGoals.map((g: any, i: number) => (
                  <li key={i} className="px-2 py-1.5 rounded border border-rule bg-parchment text-sm font-serif">
                    <div className="text-ink-soft">{g.text || `Goal ${i + 1}`}</div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {['Active', 'Progressed', 'Completed', 'Failed'].map(s => (
                        <button
                          key={s}
                          onClick={() => updateGoalStatus(i, s)}
                          className={`text-[10px] px-2 py-0.5 rounded-sm border font-display uppercase tracking-wider ${g.status === s ? 'bg-crimson border-crimson text-parchment' : 'border-rule text-ink-mute hover:bg-parchment-deep'}`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </ActivePrepGroup>

          <ActivePrepGroup title="Faction Clocks" icon={ScrollText} count={clocks.length}>
            {clocks.length === 0 ? <Empty>No clocks prepped.</Empty> : (
              <ul className="space-y-1.5">
                {clocks.map((c: any, i: number) => {
                  const max = c.max || 6;
                  const filled = c.filled || 0;
                  return (
                    <li key={i} className="px-2 py-1.5 rounded border border-rule bg-parchment text-sm font-serif space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-ink">{c.text || `Clock ${i + 1}`}</span>
                        <span className="text-[11px] text-brass-deep font-display">{filled}/{max}</span>
                      </div>
                      {c.faction && <div className="text-[10px] text-ink-mute italic">{c.faction}</div>}
                      <div className="flex gap-0.5">
                        {Array.from({ length: max }).map((_, j) => (
                          <button
                            key={j}
                            onClick={() => tickClock(i, j + 1 === filled ? -filled : (j + 1) - filled)}
                            className={`flex-1 h-3 rounded-sm transition-colors ${j < filled ? 'bg-crimson' : 'bg-parchment-deep hover:bg-parchment-deep/70'}`}
                          />
                        ))}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => tickClock(i, -1)} className="text-[10px] px-2 py-0.5 rounded border border-rule text-ink-soft hover:bg-parchment-deep font-display uppercase tracking-wider">−1</button>
                        <button onClick={() => tickClock(i, 1)} className="text-[10px] px-2 py-0.5 rounded border border-rule text-ink-soft hover:bg-parchment-deep font-display uppercase tracking-wider">+1</button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </ActivePrepGroup>

          {factions.length > 0 && (
            <ActivePrepGroup title="Faction Renown" icon={Users} count={factions.length}>
              <ul className="space-y-1.5">
                {factions.map((f: any, i: number) => (
                  <li key={i} className="px-2 py-1.5 rounded border border-rule bg-parchment text-sm font-serif flex items-center gap-2">
                    <span className="flex-1 text-ink">{f.name || `Faction ${i + 1}`}</span>
                    <span className="text-xs text-brass-deep font-display tabular-nums">{typeof f.renown === 'number' ? f.renown : 0}</span>
                    <button onClick={() => adjustRenown(i, -1)} className="text-[11px] w-6 h-6 rounded border border-rule text-ink-soft hover:bg-parchment-deep font-display">−</button>
                    <button onClick={() => adjustRenown(i, 1)} className="text-[11px] w-6 h-6 rounded border border-rule text-ink-soft hover:bg-parchment-deep font-display">+</button>
                  </li>
                ))}
              </ul>
            </ActivePrepGroup>
          )}
        </div>

        <div className="space-y-3 lg:sticky lg:top-3 lg:self-start">
          <PanelShell title="Initiative" icon={Swords} open={initiativeOpen} onToggle={() => setInitiativeOpen(o => !o)}>
            {initiativeOpen ? (
              <InitiativePanel
                variant="inline"
                state={(get('__initiative', null) as InitiativeState | null)}
                onChange={(next) => setVal('__initiative', next)}
                monsters={get('homebrewMonsters', []) as HomebrewMonster[]}
                pcs={characters}
                onClose={() => setInitiativeOpen(false)}
              />
            ) : (
              <p className="text-xs text-ink-mute italic font-serif px-1">Tap to expand and track turns, HP, conditions.</p>
            )}
          </PanelShell>

          <PanelShell title="Session Music" icon={Music} open={musicOpen} onToggle={() => setMusicOpen(!musicOpen)}>
            <MusicPlayer
              playlistUrl={(get('__sessionPlaylist', '') as string)}
              onChangePlaylist={(next) => setVal('__sessionPlaylist', next)}
            />
          </PanelShell>

          <PanelShell title="Quick Dice" icon={Dice5} open={true} onToggle={() => {}}>
            <QuickDice />
          </PanelShell>

          <PanelShell title="Quick Inspire" icon={Sparkles} open={true} onToggle={() => {}}>
            <QuickInspire campaignContext={campaignContext} />
          </PanelShell>
        </div>
      </div>

      <InlineNoteSeed trackEvent={trackEvent} />

      <div className="sticky bottom-2 bg-parchment-soft border border-rule rounded shadow-page p-2 flex items-start gap-2">
        <NotebookPen size={14} className="text-brass-deep flex-shrink-0 mt-1.5" />
        <textarea
          value={scratchpad}
          onChange={(e) => setVal('__sessionScratchpad', e.target.value)}
          placeholder="Session scratchpad — what happened, threads, open questions. Seeds the log when you end the session."
          rows={2}
          className="flex-1 bg-parchment border border-rule rounded px-2 py-1.5 text-sm text-ink font-serif placeholder:text-ink-faint placeholder:italic focus:border-crimson focus:outline-none resize-y"
        />
      </div>
    </div>
  );
}

function formatElapsed(ms: number): string {
  if (!isFinite(ms) || ms <= 0) return 'just now';
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 1) return 'just now';
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function InlineNoteSeed({ trackEvent }: { trackEvent: (kind: ChangeEventKind, summary: string) => void }) {
  const [text, setText] = useState('');
  return (
    <details className="rounded border border-rule bg-parchment-soft shadow-card">
      <summary className="px-3 py-2 cursor-pointer font-display tracking-wide text-sm text-ink hover:bg-parchment-deep/30 flex items-center gap-2">
        <Plus size={12} className="text-brass-deep" /> Add Session Note
      </summary>
      <div className="px-3 pb-3 pt-1 border-t border-rule space-y-1.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="A moment to remember…"
          className="w-full bg-parchment border border-rule rounded px-2 py-1 text-sm text-ink font-serif"
        />
        <button
          disabled={!text.trim()}
          onClick={() => { trackEvent('other', text.trim()); setText(''); }}
          className="text-xs px-2 py-1 rounded border border-crimson/60 bg-crimson/10 text-crimson hover:bg-crimson hover:text-parchment disabled:opacity-40 disabled:cursor-not-allowed font-display uppercase tracking-wider"
        >
          Mark as Session Note
        </button>
      </div>
    </details>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-ink-mute italic font-serif">{children}</p>;
}

function ActivePrepGroup({
  title, icon: Icon, count, children,
}: { title: string; icon: any; count?: number; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="rounded border border-rule bg-parchment-soft shadow-card">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-parchment-deep/30"
      >
        <Icon size={14} className="text-brass-deep flex-shrink-0" />
        <span className="font-display tracking-wide text-sm text-ink flex-1">{title}</span>
        {typeof count === 'number' && <span className="text-[11px] text-ink-mute font-serif">{count}</span>}
        {open ? <ChevronDown size={14} className="text-ink-mute" /> : <ChevronRight size={14} className="text-ink-mute" />}
      </button>
      {open && <div className="px-3 pb-3 pt-1 border-t border-rule space-y-1.5">{children}</div>}
    </section>
  );
}

function CompactCard({
  label, status, action,
}: {
  label: string;
  status?: 'used';
  action?: { label: string; onClick: () => void };
}) {
  const dim = status === 'used';
  return (
    <div className={`flex items-start gap-2 px-2 py-1.5 rounded border text-sm font-serif ${dim ? 'border-brass/60 bg-brass/10' : 'border-rule bg-parchment'}`}>
      <span className={`flex-1 ${dim ? 'text-ink-mute line-through' : 'text-ink-soft'}`}>{label}</span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="text-[10px] px-2 py-0.5 rounded-sm border border-brass-deep/60 text-brass-deep hover:bg-brass hover:text-parchment font-display uppercase tracking-wider flex-shrink-0"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function ExpandableCard({
  label, tag, children,
}: { label: string; tag?: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const hasContent = !!children && (React.Children.count(children) > 0);
  return (
    <div className="rounded border border-rule bg-parchment text-sm font-serif">
      <button
        type="button"
        onClick={() => hasContent && setOpen(o => !o)}
        className="w-full text-left px-2 py-1.5 flex items-center gap-2 hover:bg-parchment-deep/30"
      >
        {hasContent && (open ? <ChevronDown size={12} className="text-ink-mute" /> : <ChevronRight size={12} className="text-ink-mute" />)}
        <span className="flex-1 text-ink truncate">{label}</span>
        {tag && <span className="text-[10px] text-brass-deep font-display uppercase tracking-wider">{tag}</span>}
      </button>
      {open && hasContent && (
        <div className="px-3 pb-2 pt-1 border-t border-rule text-[12px] text-ink-soft space-y-0.5">{children}</div>
      )}
    </div>
  );
}

type LookupKind = 'all' | 'npcs' | 'locations' | 'secrets' | 'factions' | 'items';

function LookupView({
  npcs, locations, secrets, factions, magicItems, revealedSecrets, roster
}: {
  npcs: any[];
  locations: any[];
  secrets: string[];
  factions: any[];
  magicItems: any[];
  revealedSecrets: Record<number, boolean>;
  roster?: any[];
}) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<LookupKind>('all');
  const [openId, setOpenId] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const matches = (s: string) => !q || s.toLowerCase().includes(q);

  const showNpcs = kind === 'all' || kind === 'npcs';
  const showLocs = kind === 'all' || kind === 'locations';
  const showSecrets = kind === 'all' || kind === 'secrets';
  const showFactions = kind === 'all' || kind === 'factions';
  const showItems = kind === 'all' || kind === 'items';

  const filteredNpcs = npcs.map((n, i) => ({ n, i })).filter(({ n }) =>
    matches(n.name || '') || matches(n.archetype || '') || matches(n.faction || '') ||
    matches(n.goal || '') || matches(n.method || '')
  );
  const filteredLocs = locations.map((l, i) => ({ l, i })).filter(({ l }) =>
    matches(l.name || '') || matches(l.type || '') || (Array.isArray(l.aspects) && l.aspects.some((a: string) => matches(a || '')))
  );
  const filteredSecrets = secrets.map((s, i) => ({ s, i })).filter(({ s }) => matches(s || ''));
  const filteredFactions = factions.map((f, i) => ({ f, i })).filter(({ f }) =>
    matches(f.name || '') || matches(f.archetype || '') || matches(f.identity || '') || matches(f.area || '')
  );

  const normalizedItems = magicItems.map((it, i) => normalizeItem(it, i));
  const filteredItems = normalizedItems.map((m, i) => ({ m, i })).filter(({ m }) =>
    matches(m.name || '') || matches(m.description || '')
  );

  const totalCount = filteredNpcs.length + filteredLocs.length + filteredSecrets.length + filteredFactions.length + filteredItems.length;

  return (
    <div className="space-y-3">
      <div className="rounded border border-rule bg-parchment p-3 shadow-card space-y-2">
        <div className="flex items-center gap-2">
          <Search size={14} className="text-brass-deep flex-shrink-0" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search NPCs, locations, secrets, factions, items…"
            className="flex-1 bg-parchment-soft border border-rule rounded px-2 py-1 text-sm text-ink font-serif placeholder:text-ink-faint focus:border-crimson focus:outline-none"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {([
            ['all', 'All'],
            ['npcs', `NPCs (${npcs.length})`],
            ['locations', `Locations (${locations.length})`],
            ['secrets', `Secrets (${secrets.length})`],
            ['factions', `Factions (${factions.length})`],
            ['items', `Items (${magicItems.length})`],
          ] as [LookupKind, string][]).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setKind(id)}
              className={`text-[10px] px-2 py-0.5 rounded-sm border font-display uppercase tracking-wider ${
                kind === id ? 'bg-crimson border-crimson text-parchment' : 'border-rule text-ink-mute hover:bg-parchment-deep'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="text-[11px] text-ink-mute font-serif italic">
          {totalCount === 0 && q ? 'No matches.' : totalCount === 0 ? 'Nothing prepped yet.' : `${totalCount} match${totalCount === 1 ? '' : 'es'}`}
        </div>
      </div>

      {showNpcs && filteredNpcs.length > 0 && (
        <LookupGroup title="NPCs" icon={User}>
          {filteredNpcs.map(({ n, i }) => {
            const id = `npc-${i}`;
            const open = openId === id;
            const label = (n.name || '').trim() || (n.archetype || '').trim() || `NPC ${i + 1}`;
            return (
              <LookupCard key={id} label={label} tag={[n.type, n.faction].filter(Boolean).join(' · ')} open={open} onToggle={() => setOpenId(open ? null : id)}>
                {n.archetype && <Detail label="Archetype">{n.archetype}</Detail>}
                {n.goal && <Detail label="Goal">{n.goal}</Detail>}
                {n.method && <Detail label="Method">{n.method}</Detail>}
                {n.mannerism && <Detail label="Mannerism">{n.mannerism}</Detail>}
                {n.appearance && <Detail label="Appearance">{n.appearance}</Detail>}
              </LookupCard>
            );
          })}
        </LookupGroup>
      )}

      {showLocs && filteredLocs.length > 0 && (
        <LookupGroup title="Locations" icon={Map}>
          {filteredLocs.map(({ l, i }) => {
            const id = `loc-${i}`;
            const open = openId === id;
            const label = (l.name || '').trim() || `Location ${i + 1}`;
            return (
              <LookupCard key={id} label={label} tag={l.type || ''} open={open} onToggle={() => setOpenId(open ? null : id)}>
                {Array.isArray(l.aspects) && l.aspects.filter(Boolean).length > 0 && (
                  <ul className="ml-3 list-disc text-[12px] text-ink-soft italic">
                    {l.aspects.filter(Boolean).map((a: string, j: number) => <li key={j}>{a}</li>)}
                  </ul>
                )}
                {l.factions && <Detail label="Factions">{l.factions}</Detail>}
              </LookupCard>
            );
          })}
        </LookupGroup>
      )}

      {showSecrets && filteredSecrets.length > 0 && (
        <LookupGroup title="Secrets" icon={ScrollText}>
          {filteredSecrets.map(({ s, i }) => {
            const revealed = !!revealedSecrets[i];
            return (
              <div
                key={`sec-${i}`}
                className={`px-2 py-1.5 rounded border text-sm font-serif ${revealed ? 'border-emerald-700/40 bg-emerald-100/30 text-ink-mute' : 'border-rule bg-parchment text-ink-soft'}`}
              >
                <span className="text-[10px] text-brass-deep font-display uppercase tracking-wider mr-2">{revealed ? 'Revealed' : 'Hidden'}</span>
                {s}
              </div>
            );
          })}
        </LookupGroup>
      )}

      {showFactions && filteredFactions.length > 0 && (
        <LookupGroup title="Factions" icon={Users}>
          {filteredFactions.map(({ f, i }) => {
            const id = `fac-${i}`;
            const open = openId === id;
            const label = (f.name || '').trim() || (f.identity || '').trim() || `Faction ${i + 1}`;
            return (
              <LookupCard key={id} label={label} tag={f.archetype || f.area || ''} open={open} onToggle={() => setOpenId(open ? null : id)}>
                {f.identity && <Detail label="Identity">{f.identity}</Detail>}
                {f.area && <Detail label="Area">{f.area}</Detail>}
                {f.power && <Detail label="Power">{f.power}</Detail>}
                {f.ideology && <Detail label="Ideology">{f.ideology}</Detail>}
                {f.longGoal && <Detail label="Long-term goal">{f.longGoal}</Detail>}
              </LookupCard>
            );
          })}
        </LookupGroup>
      )}

      {showItems && filteredItems.length > 0 && (
        <LookupGroup title="Magic Items" icon={Gift}>
          {filteredItems.map(({ m, i }) => {
            const player = roster?.find(r => r.slotId === m.assignedPlayerId);
            return (
              <div key={`item-${i}`} className="px-3 py-2 rounded border border-rule bg-parchment text-sm font-serif text-ink-soft space-y-1 shadow-sm">
                <div className="font-semibold text-ink">{m.name}</div>
                {m.description && <div className="text-xs text-ink-soft/80 italic">{m.description}</div>}
                {player && <div className="text-[10px] font-display uppercase tracking-wider text-brass-deep mt-0.5">Carried by: {player.displayName}</div>}
              </div>
            );
          })}
        </LookupGroup>
      )}
    </div>
  );
}

function LookupGroup({
  title, icon: Icon, children,
}: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <section className="rounded border border-rule bg-parchment-soft shadow-card">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-rule">
        <Icon size={14} className="text-brass-deep" />
        <span className="font-display tracking-wide text-sm text-ink">{title}</span>
      </div>
      <div className="p-3 space-y-1.5">{children}</div>
    </section>
  );
}

function LookupCard({
  label, tag, open, onToggle, children,
}: { label: string; tag?: string; open: boolean; onToggle: () => void; children?: React.ReactNode }) {
  return (
    <div className="rounded border border-rule bg-parchment text-sm font-serif">
      <button onClick={onToggle} className="w-full text-left px-2 py-1.5 flex items-center gap-2 hover:bg-parchment-deep/30">
        {open ? <ChevronDown size={12} className="text-ink-mute" /> : <ChevronRight size={12} className="text-ink-mute" />}
        <span className="flex-1 text-ink truncate">{label}</span>
        {tag && <span className="text-[10px] text-brass-deep font-display uppercase tracking-wider">{tag}</span>}
      </button>
      {open && children && (
        <div className="px-3 pb-2 pt-1 border-t border-rule text-[12px] text-ink-soft space-y-0.5">
          {children}
        </div>
      )}
    </div>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-brass-deep font-display uppercase tracking-wider text-[10px]">{label} · </span>
      {children}
    </div>
  );
}

// "DM Solo" vs "With Players" — surfaces whether a phase is run at the table
// collaboratively (Session −1, Session 0) or is DM homework (givens,
// per-session prep, faction-clock updates, mid-campaign audits, ending).
// Mirrors the audience grouping in ModeNav so the signal repeats inside each
// phase header. Avoids the word "Solo" alone, which `PrepTargetsModal` and
// `SoloNote` already use to mean "solo play mode" (one-player campaign).
const AudienceBadge = ({ audience }: { audience: 'solo' | 'together' }) => {
  if (audience === 'together') {
    return (
      <span
        className="text-[10px] px-1.5 py-0.5 rounded-sm border font-display uppercase tracking-wider border-moss/50 bg-moss/10 text-moss inline-flex items-center gap-1"
        title="Done collaboratively with the players at the table"
      >
        <Users size={9} /> With Players
      </span>
    );
  }
  return (
    <span
      className="text-[10px] px-1.5 py-0.5 rounded-sm border font-display uppercase tracking-wider border-wine/50 bg-wine/10 text-wine inline-flex items-center gap-1"
      title="DM-only homework — done without the players"
    >
      <User size={9} /> DM Solo
    </span>
  );
};

const Phase = ({ n, title, sub, methods, audience, children, expanded, onToggle, icon: Icon }: any) => (
  <div className="border border-rule rounded-lg overflow-hidden bg-parchment-soft shadow-page">
    <button onClick={onToggle} className="w-full flex items-center gap-2.5 sm:gap-4 p-3 sm:p-4 hover:bg-parchment-deep/30 text-left transition-colors">
      <div className="font-display text-3xl sm:text-4xl text-crimson w-8 sm:w-12 leading-none flex-shrink-0">{n}</div>
      {Icon && <Icon size={20} className="text-brass-deep flex-shrink-0 hidden sm:block" />}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-display text-base sm:text-lg tracking-wide text-ink">{title}</span>
          {audience && <AudienceBadge audience={audience} />}
          <span className="flex flex-wrap gap-1">{methods?.map((m: any) => <Tag key={m} m={m} />)}</span>
        </div>
        <div className="text-xs sm:text-sm text-ink-soft italic font-serif mt-0.5">{sub}</div>
      </div>
      {expanded ? <ChevronDown size={18} className="text-brass-deep flex-shrink-0" /> : <ChevronRight size={18} className="text-brass-deep flex-shrink-0" />}
    </button>
    {expanded && <div className="p-3 pt-3 space-y-2 border-t border-rule bg-parchment/40">{children}</div>}
  </div>
);

export default function CampaignEditor({
  campaign,
  rawCampaign,
  world,
  userEmail,
  isPro = false,
  worldOnlyMode = false,
}: {
  campaign: Campaign;
  rawCampaign?: Campaign;
  world?: World | null;
  userEmail: string;
  isPro?: boolean;
  worldOnlyMode?: boolean;
}) {
  const router = useRouter();
  const confirmModal = useConfirm();
  const [name, setName] = useState(campaign.name);
  const [initialMigration] = useState(() => migrateSessionLogs(campaign.data || {}));
  const [state, setState] = useState<Record<string, any>>(() => initPlayerMode(migrateCharacters(initialMigration.initialState)).data);
  const [done, setDone] = useState<Record<string, boolean>>(campaign.done || {});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [openLogs, setOpenLogs] = useState<Record<string, boolean>>(
    initialMigration.initialOpenId ? { [initialMigration.initialOpenId]: true } : {}
  );
  const [openChars, setOpenChars] = useState<Record<string, boolean>>({});
  const [phaseOpen, setPhaseOpen] = useState<Record<string, boolean>>({ p0: true });
  const initialModeState = useMemo(() => resolveInitialMode(initialMigration.initialState), [initialMigration.initialState]);
  const [mode, setMode] = useState<Mode>(initialModeState.mode);
  const [subview, setSubview] = useState<string>(initialModeState.subview);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  // Persist mode + subview so users return to wherever they left. Skip the
  // undo snapshot for these — switching tabs shouldn't compete with Cmd+Z.
  useEffect(() => {
    setState(s => {
      if (s.__mode === mode && s.__subview === subview) return s;
      skipNextSnapshotRef.current = true;
      return { ...s, __mode: mode, __subview: subview };
    });
    window.scrollTo(0, 0);
  }, [mode, subview]);
  const [soloMode, setSoloMode] = useState<boolean>(campaign.data?.__soloMode ?? true);
  const [progressOpen, setProgressOpen] = useState(false);
  const progressMenuRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!progressOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!progressMenuRef.current?.contains(e.target as Node)) setProgressOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setProgressOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [progressOpen]);
  const [prepTargetsOpen, setPrepTargetsOpen] = useState(false);
  const [syncState, setSyncState] = useState<'synced' | 'pending' | 'saving' | 'error'>('synced');
  const [syncError, setSyncError] = useState<string>('');
  const [uploadingChar, setUploadingChar] = useState(false);
  const [charUploadError, setCharUploadError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const characterFileInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialLoadRef = useRef(true);

  const undoStackRef = useRef<Snapshot[]>([]);
  const previousSnapRef = useRef<Snapshot | null>(null);
  const skipNextSnapshotRef = useRef(false);
  const [canUndo, setCanUndo] = useState(false);
  const [undoToast, setUndoToast] = useState('');

  // Session 0 wizard — auto-shown on first open of a fresh campaign, also
  // launchable from AccountMenu's Campaign Actions. Tracked via
  // data.__session0Done so it never re-prompts unless the user explicitly
  // re-runs it.
  const [session0Open, setSession0Open] = useState<boolean>(() => {
    if (campaign.data?.__session0Done) return false;
    const d = campaign.data || {};
    const noPitch = !d.pitch;
    const noWorld = !Array.isArray(d.gWorld) || d.gWorld.length === 0;
    const noClocks = !Array.isArray(d.clocks) || d.clocks.length === 0;
    return noPitch && noWorld && noClocks;
  });
  const undoToastTimerRef = useRef<NodeJS.Timeout | null>(null);
  const showUndoToast = useCallback((msg: string, ms = 2000) => {
    if (undoToastTimerRef.current) clearTimeout(undoToastTimerRef.current);
    setUndoToast(msg);
    undoToastTimerRef.current = setTimeout(() => setUndoToast(''), ms);
  }, []);

  // Summon affordance — opens a modal hosting the chosen generator in the
  // context of a prep section. After Save, the new entity is appended to
  // `data` and the section auto-scrolls + highlights it (Phase 2 / Phase 3).
  const [summonState, setSummonState] = useState<{
    section: PrepSection;
    generator: GeneratorMeta;
  } | null>(null);
  const [highlightEntityId, setHighlightEntityId] = useState<string | null>(null);
  const highlightTimerRef = useRef<NodeJS.Timeout | null>(null);
  const [summonToast, setSummonToast] = useState<{
    text: string;
    primaryEntityId: string;
  } | null>(null);
  const summonToastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const scrollToEntity = useCallback((entityId: string) => {
    setTimeout(() => {
      const el = document.getElementById(`entity-${entityId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  }, []);

  const flashHighlight = useCallback((entityId: string) => {
    if (highlightTimerRef.current) clearTimeout(highlightTimerRef.current);
    setHighlightEntityId(entityId);
    highlightTimerRef.current = setTimeout(() => setHighlightEntityId(null), 1500);
  }, []);

  const handlePostSummonSave = useCallback(
    (section: PrepSection, generator: GeneratorMeta, refs: EntityRef[]) => {
      const primary = pickPrimaryRef(refs, generator.kind);
      if (!primary) return;
      scrollToEntity(primary.entityId);
      flashHighlight(primary.entityId);
      // Count by entityKey (not entityType) so we can say "1 Monster, 1
      // Bestiary Entry" instead of "2 Notes". Order is the display order in
      // the toast.
      const counts = refs.reduce<Record<string, number>>((acc, r) => {
        acc[r.entityKey] = (acc[r.entityKey] || 0) + 1;
        return acc;
      }, {});
      const order: Array<[string, string, string]> = [
        ['locations', 'Location', 'Locations'],
        ['npcs', 'NPC', 'NPCs'],
        ['items', 'Item', 'Items'],
        ['monsters', 'Monster', 'Monsters'],
        ['homebrewMonsters', 'Bestiary Entry', 'Bestiary Entries'],
      ];
      const parts: string[] = [];
      for (const [key, sing, plur] of order) {
        const n = counts[key];
        if (n) parts.push(`${n} ${n === 1 ? sing : plur}`);
      }
      const text = parts.length ? `Saved: ${parts.join(', ')}` : 'Saved';
      if (summonToastTimerRef.current) clearTimeout(summonToastTimerRef.current);
      setSummonToast({ text, primaryEntityId: primary.entityId });
      summonToastTimerRef.current = setTimeout(() => setSummonToast(null), 3000);
    },
    [scrollToEntity, flashHighlight],
  );

  const onSummonSave = useCallback(
    (section: PrepSection, generator: GeneratorMeta, action: SummonSaveAction) => {
      let savedRefs: EntityRef[] = [];
      setState((s) => {
        const { next, refs } = applySummonAction(s, action);
        savedRefs = refs;
        return setLastUsed(next, section, generator.kind) as typeof s;
      });
      // Defer post-save UI so the new entity is in the DOM before scrolling.
      requestAnimationFrame(() => handlePostSummonSave(section, generator, savedRefs));
    },
    [handlePostSummonSave],
  );

  const saveToDB = useCallback(async (payload: { name: string; data: Record<string, any>; done: Record<string, boolean> }) => {
    setSyncState('saving');
    try {
      const worldPatch: Record<string, any> = {};
      const campaignPatch: Record<string, any> = {};

      for (const [k, v] of Object.entries(payload.data)) {
        if (WORLD_KEYS.includes(k as any) && campaign.worldId) {
          const existingVal = world?.data?.[k];
          if (JSON.stringify(v) !== JSON.stringify(existingVal)) {
            worldPatch[k] = v;
          }
        } else {
          campaignPatch[k] = v;
        }
      }

      const promises = [];
      promises.push(updateCampaign(campaign.id, { name: payload.name, data: campaignPatch, done: payload.done }));
      
      if (campaign.worldId && Object.keys(worldPatch).length > 0) {
        promises.push(updateWorld(campaign.worldId, { data: worldPatch }));
      }
      
      await Promise.all(promises);

      setSyncState('synced');
      setSyncError('');
    } catch (err: any) {
      setSyncState('error');
      setSyncError(err?.message || 'Unknown error');
    }
  }, [campaign.id, campaign.worldId, world]);

  const handleConvertToWorld = async () => {
    if (campaign.worldId) return;
    const ok = await confirmModal({
      title: 'Convert to Shared World?',
      message: 'This moves all static lore (NPCs, locations, items, factions, etc.) into a central World that other campaigns can share. This cannot be undone.',
      confirmText: 'Convert to World',
    });
    if (!ok) return;

    try {
      setSyncState('saving');
      const worldData: Record<string, any> = {};
      const newCampaignData = { ...state };
      for (const key of WORLD_KEYS) {
        if (newCampaignData[key] !== undefined) {
          worldData[key] = newCampaignData[key];
          delete newCampaignData[key];
        }
      }
      const newWorldId = await createWorld(campaign.userId, `${campaign.name} (World)`, worldData);
      await updateCampaign(campaign.id, { worldId: newWorldId, data: newCampaignData });
      setSyncState('synced');
    } catch (err: any) {
      setSyncError(err.message);
      setSyncState('error');
    }
  };

  useEffect(() => {
    if (initialLoadRef.current) {
      initialLoadRef.current = false;
      previousSnapRef.current = { state, done, name, ts: Date.now() };
      return;
    }
    // Push the previous state as the snapshot the user would undo *to* —
    // unless this change is itself an undo (we don't want to re-snapshot
    // what we just restored).
    if (!skipNextSnapshotRef.current && previousSnapRef.current) {
      undoStackRef.current = pushSnapshot(undoStackRef.current, previousSnapRef.current);
      setCanUndo(undoStackRef.current.length > 0);
    }
    skipNextSnapshotRef.current = false;
    previousSnapRef.current = { state, done, name, ts: Date.now() };

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSyncState('pending');
    saveTimeoutRef.current = setTimeout(() => { saveToDB({ name, data: { ...state, __soloMode: soloMode }, done }); }, 1500);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [name, state, done, soloMode, saveToDB]);

  // B-06: record "last opened" exactly once per mount. This is distinct from
  // "last played" (which only moves on session start/end), so viewing a
  // campaign no longer bumps its "Last played" timestamp. Skip the undo
  // snapshot so this bookkeeping write never lands on the Cmd+Z stack.
  const openedMarkedRef = useRef(false);
  useEffect(() => {
    if (openedMarkedRef.current) return;
    openedMarkedRef.current = true;
    skipNextSnapshotRef.current = true;
    setState(s => markOpened(s));
  }, []);

  const get = (k: string, fb: any) => state[k] !== undefined ? state[k] : fb;
  const setVal = (k: string, v: any) => setState(s => ({ ...s, [k]: v }));
  const prepTargetOverrides = (state[OVERRIDES_STATE_KEY] as PrepTargetOverrides | undefined) || {};
  const tgt = useCallback(
    (key: PrepTargetKey) => getTarget(key, soloMode, prepTargetOverrides),
    [soloMode, prepTargetOverrides],
  );
  const trackEvent = useCallback((kind: ChangeEventKind, summary: string, before?: unknown, after?: unknown) => {
    setState(s => {
      if (!s.__activeSessionId) return s;
      const events = (s.__sessionChangeEvents as ChangeEvent[]) || [];
      return { ...s, __sessionChangeEvents: [...events, makeEvent(kind, summary, before, after)] };
    });
  }, []);

  const handleEndSession = useCallback(async () => {
    const sessionId = get('__activeSessionId', `session_${Date.now()}`) as string;
    const startedAt = get('__sessionStartedAt', Date.now()) as number;
    const endedAt = Date.now();
    const scratchpad = get('__sessionScratchpad', '') as string;
    const events = get('__sessionChangeEvents', []) as any[];
    const existingEntries = get('sessionLogV2', []) as any[];
    
    const keptEvents = events.filter((e: any) => !e.dismissed);
    const nextNumber = Math.max(0, ...existingEntries.map(e => e.number || 0)) + 1;
    const entry = {
      id: sessionId,
      number: nextNumber,
      date: new Date().toISOString().split('T')[0],
      startedAt,
      endedAt,
      title: `Session ${nextNumber}`,
      recap: scratchpad || '',
      events: keptEvents,
      secretsRevealed: keptEvents.filter((e: any) => e.kind === 'secret_revealed').map((e: any) => e.summary),
      scenesUsed: keptEvents.filter((e: any) => e.kind === 'scene_used').map((e: any) => e.summary.replace(/^Used scene:\s*/, '')),
      goalUpdates: keptEvents.filter((e: any) => e.kind === 'goal_status').map((e: any) => {
        const [goalText] = e.summary.split(': ');
        const fromTo = e.summary.split(': ')[1] || '';
        const [from, to] = fromTo.split(' → ');
        return { goal: goalText || '', from: from || String(e.before ?? ''), to: to || String(e.after ?? '') };
      }),
    };
    
    const updatedSessionLog = [...existingEntries, entry];
    
    // Build the next state object
    let nextState: Record<string, any> = { ...state, sessionLogV2: updatedSessionLog };
    delete nextState.__activeSessionId;
    delete nextState.__sessionStartedAt;
    delete nextState.__sessionEndedAt;
    delete nextState.__sessionChangeEvents;
    delete nextState.__sessionScratchpad;
    delete nextState.__sessionUsedScenes;
    nextState.__runSessionOpen = false;
    nextState = markSessionPlayed(nextState);

    // Cancel the pending auto-save timeout so it doesn't fire after our manual save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    // Optimistically update local React state
    setState(nextState);

    try {
      // Save to the database immediately and wait for it to complete
      await saveToDB({ name, data: { ...nextState, __soloMode: soloMode }, done });
    } catch (err) {
      console.error("Failed to save ended session to DB", err);
    }
    
    router.push(`/campaign/${campaign.id}/recap/${sessionId}`);
  }, [state, get, name, soloMode, done, saveToDB, campaign.id, router]);
  const toggleDone = (id: string) => setDone(d => ({ ...d, [id]: !d[id] }));
  const toggleOpen = (id: string) => setOpen(o => ({ ...o, [id]: !o[id] }));
  const togglePhase = (id: string) => setPhaseOpen(p => ({ ...p, [id]: !p[id] }));

  const generatorLogs = (state.generatorLogs as GeneratorLogs) || {};
  const logEntriesFor = (kind: LogKind): LogEntry[] => generatorLogs[kind] ?? [];
  const setLogEntriesFor = (kind: LogKind) => (next: LogEntry[]) => {
    setVal('generatorLogs', { ...generatorLogs, [kind]: next });
  };

  // Bridge from a generator log (or live result) into the campaign data lists.
  // Returns a callback bound to one LogKind that the picker hands its
  // (destination, items) selection to. The helper folds the rows in via
  // `buildCampaignPatch`, then commits with a single setVal.
  const addToCampaignFor = useCallback(
    (kind: LogKind) => (dest: CampaignDestKey, items: SelectableItem[]) => {
      // session-log is a virtual dest — it appends ChangeEvents to the live
      // session log array, not a top-level data field. Source/target the
      // __sessionChangeEvents key explicitly.
      const stateKey = dest === 'session-log' ? '__sessionChangeEvents' : dest;
      const current = (state as Record<string, unknown>)[stateKey];
      const { patch, added } = buildCampaignPatch(current, kind, dest, items);
      if (added === 0) return;
      setVal(stateKey, patch.value);
      // Skip the meta "Added N from X" trackEvent for session-log writes;
      // the segue ChangeEvents themselves are already in the log.
      if (dest === 'session-log') return;
      const eventKind: ChangeEventKind =
        dest === 'locations' ? 'location_added' :
        dest === 'npcs' ? 'npc_added' :
        dest === 'monsters' ? 'monster_added' :
        dest === 'items' ? 'magic_item_given' :
        'other';
      trackEvent(eventKind, `Added ${added} from ${kind} → ${dest}`);
    },
    [state, trackEvent],
  );

  // Per-kind disabled destinations passed down to AddToCampaignPicker. Plot
  // segues offer the live Session Log; that option is unavailable until a
  // Run Session is open.
  const generatorDisabledDests: Partial<Record<LogKind, readonly CampaignDestKey[]>> = useMemo(
    () => ({ 'plot-segue': state.__activeSessionId ? [] : (['session-log'] as const) }),
    [state.__activeSessionId],
  );

  const parsedLevels = ((state.characters as Character[]) || [])
    .map(c => c.isSidekick ? c.sidekickLevel : parseLevelFromClassLevel(c.classLevel))
    .filter((lvl): lvl is number => lvl !== null && lvl > 0);
  const partyLevel = parsedLevels.length > 0
    ? Math.round(parsedLevels.reduce((a, b) => a + b, 0) / parsedLevels.length)
    : undefined;

  // Snapshot of the campaign's premise/theme fields for AI-enhance grounding.
  // Each field is read out of `state`; the helper inside GeneratorPanel hides
  // the "Use campaign context" checkbox when every field is empty.
  const generatorCampaignContext = {
    genre: typeof state.genre === 'string' ? state.genre : '',
    tone: Array.isArray(state.tone) ? (state.tone as string[]) : [],
    pitch: typeof state.pitch === 'string' ? state.pitch : '',
    worldFacts: Array.isArray(state.gWorld) ? (state.gWorld as string[]) : [],
    settingFacts: Array.isArray(state.facts) ? (state.facts as string[]) : [],
    partyLevel,
  };

  const completedCount = Object.values(done || {}).filter(Boolean).length;
  
  const PREP_GROUPS = [
    { name: 'Premise', keys: ['pitch', 'genre', 'g-lines', 'g-mech'], labels: ['Quick Pitch', 'Genre Statement', 'Content Lines', 'Mechanics & System'] },
    { name: 'World', keys: ['g-world', 'facts', 'g-fnl'], labels: ['World Facts', 'Setting Facts', 'Req. Factions, NPCs & Locations'] },
    { name: 'Characters', keys: ['pc', 'goals'], labels: ['Player Characters', 'PC Goals'] },
    { name: 'Fronts', keys: ['factions', 'conflicts', 'secrets', 'handouts'], labels: ['Factions', 'Active Conflicts', 'Secrets & Clues', 'Handouts / Lore'] },
    { name: 'Per-Session', keys: ['s1-review', 's2-start', 's3-scenes', 's4-secrets', 's5-loc', 's6-npc', 's7-mon', 's8-rew'], labels: ['1. Review PCs', '2. Strong Start', '3. Outline Scenes', '4. Define Secrets', '5. Develop Locations', '6. Outline NPCs', '7. Choose Monsters', '8. Select Rewards'] },
  ];

  // Lowest-progress prep target — drives the "Next Up" pill at the top of the
  // Prep Flow tab. Picks the section with the largest gap to target, with
  // ties broken toward the lower current count.
  const nextUp = useMemo(() => {
    type Candidate = { id: PrepTargetKey; label: string; current: number; target: number; sectionId: string; phaseId: string };
    const candidates: Candidate[] = [];
    for (const [k, t] of Object.entries(TARGETS)) {
      const key = k as PrepTargetKey;
      const target = getTarget(key, soloMode, prepTargetOverrides);
      if (target === 0) continue;
      const current = countFilled(key, state[key]);
      if (current < target) {
        candidates.push({
          id: key,
          label: t.label,
          current,
          target,
          sectionId: SECTION_ID_BY_KEY[key] ?? key,
          phaseId: PHASE_ID_BY_KEY[key] ?? 'p0',
        });
      }
    }
    candidates.sort((a, b) => {
      const gapA = a.target - a.current;
      const gapB = b.target - b.current;
      if (gapA !== gapB) return gapB - gapA;
      return a.current - b.current;
    });
    return candidates[0] ?? null;
  }, [state, soloMode, prepTargetOverrides]);

  const jumpToNextUp = useCallback(() => {
    if (!nextUp) return;
    
    let targetMode: Mode = 'prep';
    let targetSubview = 'flow';
    if (nextUp.phaseId === 'p0') { targetMode = 'plan'; targetSubview = 'pitch'; }
    else if (nextUp.phaseId === 'p1') { targetMode = 'plan'; targetSubview = 'worldbuild'; }
    else if (nextUp.phaseId === 'p2') { targetMode = 'plan'; targetSubview = 'pcs'; }
    else if (nextUp.phaseId === 'p4' || nextUp.phaseId === 'p5' || nextUp.phaseId === 'p6') { targetMode = 'plan'; targetSubview = 'fronts'; }
    
    setMode(targetMode);
    setSubview(targetSubview);
    setPhaseOpen(p => ({ ...p, [nextUp.phaseId]: true }));
    setOpen(o => ({ ...o, [nextUp.sectionId]: true }));
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.getElementById(`section-${nextUp.sectionId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
  }, [nextUp]);

  const sessionLogs = (get('sessionLogs', []) as any[]);
  const sortedSessionLogs = [...sessionLogs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const sessionLogsV2 = (get('sessionLogV2', []) as any[]);
  const addSessionLog = () => {
    const id = makeLogId();
    const next: SessionLog = { id, title: `Session ${sessionLogs.length + 1}`, date: todayISO(), body: '' };
    setVal('sessionLogs', [next, ...sessionLogs]);
    setOpenLogs(o => ({ ...o, [id]: true }));
  };
  const updateSessionLog = (id: string, patch: Partial<SessionLog>) => {
    setVal('sessionLogs', sessionLogs.map(l => l.id === id ? { ...l, ...patch } : l));
  };
  const removeSessionLog = (id: string) => {
    const log = sessionLogs.find(l => l.id === id);
    setVal('sessionLogs', sessionLogs.filter(l => l.id !== id));
    setOpenLogs(o => { const next = { ...o }; delete next[id]; return next; });
    const title = log?.title || 'session log';
    showUndoToast(`Deleted "${title}" — Press ⌘Z to undo`, 5000);
  };

  const characters = (state.characters as Character[]) || [];
  const addCharacter = () => {
    const fresh = { ...emptyCharacter(), id: makeCharacterId() };
    setVal('characters', [...characters, fresh]);
    setOpenChars(o => ({ ...o, [fresh.id]: true }));
  };
  const updateCharacter = (id: string, patch: Character) => {
    setVal('characters', characters.map(c => (c.id === id ? patch : c)));
  };
  const removeCharacter = (id: string) => {
    const c = characters.find(x => x.id === id);
    const label = c?.name || 'character';
    setVal('characters', characters.filter(x => x.id !== id));
    setOpenChars(o => { const next = { ...o }; delete next[id]; return next; });
    showUndoToast(`Deleted "${label}" — Press ⌘Z to undo`, 5000);
  };

  const uploadCharacterSheet = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setCharUploadError('');
    setUploadingChar(true);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('Not signed in');
      const idToken = await user.getIdToken();
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/parse-character-sheet', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
        body: form,
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || `Parse failed (${res.status})`);
      const parsed = normalizeCharacter(body.character);
      const fresh: Character = { ...parsed, id: makeCharacterId() };
      setVal('characters', [...characters, fresh]);
      setOpenChars(o => ({ ...o, [fresh.id]: true }));
    } catch (err: any) {
      setCharUploadError(err?.message || 'Upload failed');
    } finally {
      setUploadingChar(false);
    }
  };

  const exportJSON = () => {
    const safe = (name || 'untitled').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const payload = { _format: 'campaign_prep_v1', _exported: new Date().toISOString(), campaignName: name, state, done };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${safe || 'campaign'}_prep.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showUndoToast('Campaign exported as JSON', 4000);
  };

  const importJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data._format !== 'campaign_prep_v1') {
          showUndoToast('Import failed: unsupported file format', 4000);
          return;
        }
        if (data.campaignName) setName(data.campaignName);
        setState(data.state || {});
        setDone(data.done || {});
        showUndoToast('Campaign imported successfully', 4000);
      } catch {
        showUndoToast('Import failed: invalid JSON file', 4000);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDelete = async () => {
    const ok = await confirmModal({
      title: 'Delete Campaign',
      message: `Delete "${name}"? This cannot be undone.`,
      confirmText: 'Delete',
      isDestructive: true,
    });
    if (!ok) return;
    try {
      await deleteCampaignDoc(campaign.id);
      router.push('/campaign');
    } catch (err: any) {
      alert(`Delete failed: ${err?.message || err}`);
    }
  };

  const isArchived = Boolean(campaign.archivedAt);

  const handleArchive = async () => {
    try {
      if (isArchived) {
        await unarchiveCampaign(campaign.id);
      } else {
        const ok = await confirmModal({
          title: 'Archive Campaign',
          message: `Archive "${name}"? It will be hidden from your main list — you can restore it from the Archived section.`,
          confirmText: 'Archive',
          isDestructive: true,
        });
        if (!ok) return;
        await archiveCampaign(campaign.id);
        router.push('/campaign');
      }
    } catch (err: any) {
      alert(`${isArchived ? 'Unarchive' : 'Archive'} failed: ${err?.message || err}`);
    }
  };

  const handleCopy = async () => {
    if (!confirm(`Create a copy of "${name}"?`)) return;
    try {
      const newId = await copyCampaign(campaign.id);
      router.push(`/campaign/${newId}`);
    } catch (err: any) {
      alert(`Copy failed: ${err?.message || err}`);
    }
  };

  const SyncIndicator = () => {
    if (syncState === 'saving') return <span className="text-xs text-ink-soft flex items-center gap-1 font-display uppercase tracking-wider"><Cloud size={12} className="animate-pulse" /> Saving…</span>;
    if (syncState === 'pending') return <span className="text-xs text-ink-mute flex items-center gap-1 font-display uppercase tracking-wider"><Cloud size={12} /> Pending</span>;
    if (syncState === 'error') return <span className="text-xs text-crimson flex items-center gap-1 font-display uppercase tracking-wider" title={syncError}><CloudOff size={12} /> Save Failed</span>;
    return <span className="text-xs text-brass-deep flex items-center gap-1 font-display uppercase tracking-wider"><Cloud size={12} /> Saved</span>;
  };

  // Manual retry — uses current state, bypasses the debounce timer. Wired to
  // the bottom-pill in error state so the user can recover from a failed save
  // without making another change first.
  const retrySave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    saveToDB({ name, data: { ...state, __soloMode: soloMode }, done });
  }, [saveToDB, name, state, soloMode, done]);

  // Bottom-pill overlay for risky sync states. The header SyncIndicator is the
  // calm baseline; this pill is the urgent reminder when something is unsaved
  // or has failed. Hidden once we're back to 'synced'.
  const SyncPill = () => {
    if (syncState === 'synced') return null;
    const isRun = get('__runSessionOpen', false);
    const base = `fixed ${isRun ? 'bottom-[88px]' : 'bottom-4'} left-1/2 -translate-x-1/2 z-40 px-3 py-1.5 rounded-full shadow-page border text-xs font-display uppercase tracking-wider flex items-center gap-2 transition-all`;
    if (syncState === 'pending' || syncState === 'saving') {
      return null;
    }
    return (
      <button
        type="button"
        onClick={retrySave}
        title={syncError || 'Click to retry'}
        className={`${base} border-crimson/70 bg-crimson/10 text-crimson hover:bg-crimson hover:text-parchment cursor-pointer`}
      >
        <CloudOff size={12} />
        Save failed — click to retry
      </button>
    );
  };

  // Confirm tab/route changes while a save error is outstanding. Returns true
  // if the navigation should proceed.
  const confirmUnsavedNav = (): boolean => {
    if (syncState !== 'error') return true;
    return window.confirm(
      'Your last change failed to save. Switching may lose unsaved data. Switch anyway?',
    );
  };

  const ToolBtn = ({ onClick, children, danger = false, title }: { onClick: () => void; children: React.ReactNode; danger?: boolean; title?: string }) => (
    <button onClick={onClick} title={title} className={`text-xs px-3 py-1 rounded border font-display uppercase tracking-wider flex items-center gap-1.5 transition-colors ${
      danger
        ? 'border-crimson/50 text-crimson hover:bg-crimson hover:text-parchment'
        : 'border-brass-deep/50 text-brass-deep hover:bg-brass hover:text-parchment hover:border-brass'
    }`}>
      {children}
    </button>
  );

  // Each prep section sits inside one Phase; the palette uses this to
  // re-expand the right phase before scrolling to a section. Phase 4 has no
  // direct sections (only faction clocks), so it's intentionally absent.
  const SECTION_TO_PHASE: Record<string, string> = {
    'g-world': 'p0', 'g-fnl': 'p0', 'g-mech': 'p0', 'g-lines': 'p0', 'pitch': 'p0',
    'genre': 'p1', 'facts': 'p1', 'factions': 'p1', 'conflicts': 'p1',
    'pc': 'p2', 'goals': 'p2',
    's1-review': 'p3', 's2-start': 'p3', 's3-scenes': 'p3', 's4-secrets': 'p3',
    's5-loc': 'p3', 's6-npc': 'p3', 's7-mon': 'p3', 's8-rew': 'p3',
    'audit-goals': 'p5', 'audit-factions': 'p5', 'audit-secrets': 'p5',
    'end-ready': 'p6', 'end-collect': 'p6', 'end-catalyst': 'p6',
  };

  const scrollToAnchor = (anchor: string) => {
    // requestAnimationFrame x2 lets React commit the tab/expand state before
    // we try to find the now-mounted element. One frame is usually enough,
    // but a slow render can push the element render to the next paint.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(`[data-cp-anchor="${anchor}"]`);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('cp-highlight');
      setTimeout(() => el.classList.remove('cp-highlight'), 1600);
    }));
  };

  // Each prep section also belongs to a Plan sub-view (Phases 0-2 live there;
  // Phases 3 is Prep/Flow; Phases 4-6 are Plan/Fronts). Used by the palette
  // and Next-Up jump so we route to the right tab before scrolling.
  const PHASE_TO_VIEW: Record<string, { mode: Mode; subview: string }> = {
    p0: { mode: 'plan', subview: 'pitch' },
    p1: { mode: 'plan', subview: 'worldbuild' },
    p2: { mode: 'plan', subview: 'pcs' },
    p3: { mode: 'prep', subview: 'flow' },
    p4: { mode: 'plan', subview: 'fronts' },
    p5: { mode: 'plan', subview: 'fronts' },
    p6: { mode: 'plan', subview: 'fronts' },
  };

  const navigateTo = (target: {
    mode: Mode;
    subview?: string;
    sectionId?: string;
    sessionId?: string;
    characterId?: string;
    anchor?: string;
  }) => {
    if (target.mode === 'run' && mode !== 'run' && nextUp) {
      if (!window.confirm(`You have unfinished prep targets (e.g. ${nextUp.label}). Are you sure you want to start the session anyway?`)) {
        return;
      }
    }
    const nextSubview =
      target.subview && isValidSubview(target.mode, target.subview)
        ? target.subview
        : defaultSubview(target.mode);
    setMode(target.mode);
    setSubview(nextSubview);
    if (target.sectionId) {
      const phase = SECTION_TO_PHASE[target.sectionId];
      if (phase) setPhaseOpen(p => ({ ...p, [phase]: true }));
      setOpen(o => ({ ...o, [target.sectionId!]: true }));
    }
    if (target.sessionId) {
      setOpenLogs(o => ({ ...o, [target.sessionId!]: true }));
    }
    if (target.characterId) {
      setOpenChars(o => ({ ...o, [target.characterId!]: true }));
    }
    if (target.anchor) scrollToAnchor(target.anchor);
  };

  // Resolve a prep section ID to its (mode, subview) — used by command-palette
  // entries that target a specific section.
  const viewForSection = (sectionId: string): { mode: Mode; subview: string } => {
    const phase = SECTION_TO_PHASE[sectionId];
    return PHASE_TO_VIEW[phase] ?? { mode: 'prep', subview: 'flow' };
  };

  const handleModeChange = (m: Mode) => {
    if (!confirmUnsavedNav()) return;
    if (m === mode) return;
    if (m === 'run' && nextUp) {
      if (!window.confirm(`You have unfinished prep targets (e.g. ${nextUp.label}). Are you sure you want to start the session anyway?`)) {
        return;
      }
    }
    setMode(m);
    setSubview(defaultSubview(m));
  };

  const handleSubviewChange = (sv: string) => {
    if (!confirmUnsavedNav()) return;
    if (sv === subview) return;
    if (isValidSubview(mode, sv)) setSubview(sv);
  };

  // Global keyboard shortcuts:
  //  - Cmd/Ctrl-K: open the command palette (works even inside text inputs —
  //    the palette is the entire app's "go anywhere" affordance).
  //  - ?: open the keyboard cheatsheet (suppressed inside text inputs so the
  //    glyph still types into prose fields).
  //  - ←/→: previous / next tab (suppressed inside text inputs and while any
  //    modal — palette, cheatsheet, prep wizard, run session — is open).
  useEffect(() => {
    const isTyping = (el: EventTarget | null) => {
      const node = el as HTMLElement | null;
      if (!node) return false;
      const tag = node.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || node.isContentEditable;
    };

    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen(p => !p);
        return;
      }
      // Cmd/Ctrl+Z outside an editable element steps back through the in-memory
      // snapshot stack. Inside inputs/textareas we let the browser's native
      // undo handle the field instead.
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (isTyping(e.target)) return;
        const { snap, next } = popSnapshot(undoStackRef.current);
        if (snap) {
          skipNextSnapshotRef.current = true;
          setState(snap.state);
          setDone(snap.done);
          setName(snap.name);
          undoStackRef.current = next;
          setCanUndo(next.length > 0);
          showUndoToast(snap.description || 'Undid last change');
        }
        e.preventDefault();
        return;
      }
      if (isTyping(e.target)) return;
      if (paletteOpen || shortcutsOpen) return;

      if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (!confirmUnsavedNav()) return;
        e.preventDefault();
        const idx = ALL_SUBVIEWS.findIndex(p => p.mode === mode && p.subview === subview);
        if (idx < 0) return;
        const step = e.key === 'ArrowRight' ? 1 : -1;
        const next = ALL_SUBVIEWS[(idx + step + ALL_SUBVIEWS.length) % ALL_SUBVIEWS.length];
        setMode(next.mode);
        setSubview(next.subview);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [paletteOpen, shortcutsOpen, syncState, syncError, mode, subview]);

  const VIEW_META: Array<{ mode: Mode; subview: string; label: string; icon: any; keywords?: string[] }> = [
    { mode: 'plan',    subview: 'pitch',     label: 'Premise',     icon: Compass,         keywords: ['hook', 'givens', 'truths'] },
    { mode: 'plan',    subview: 'worldbuild',     label: 'Worldbuild',       icon: BookOpen,        keywords: ['setting', 'factions', 'reference', 'downtime'] },
    { mode: 'plan',    subview: 'pcs',       label: 'Characters',  icon: User,            keywords: ['pc', 'goals', 'sidekick'] },
    { mode: 'plan',    subview: 'fronts',    label: 'Fronts',      icon: Target,          keywords: ['clocks', 'audits', 'tracking', 'ending', 'secrets revealed'] },
    { mode: 'prep',    subview: 'flow',      label: 'Prep Flow',   icon: ScrollText,      keywords: ['lazy dm', '8 step', 'next session'] },
    { mode: 'prep',    subview: 'wizard',    label: 'Prep Wizard', icon: ClipboardList,   keywords: ['guided', 'walkthrough'] },
    { mode: 'run',     subview: 'session',   label: 'Run Session', icon: Swords,          keywords: ['active', 'table'] },
    { mode: 'run',     subview: 'lookup',    label: 'Lookup',      icon: Search,          keywords: ['quick reference'] },
    { mode: 'run',     subview: 'dice',      label: 'Dice',        icon: Dice5 },
    { mode: 'run',     subview: 'spells',    label: 'Spells',      icon: Sparkles },
    { mode: 'run',     subview: 'dmref',     label: 'DM Ref',      icon: BookOpen,        keywords: ['rules', 'madness', 'travel'] },
    { mode: 'run',     subview: 'chase',     label: 'Chase',       icon: Footprints,      keywords: ['chase tracker'] },
    { mode: 'run',     subview: 'log',       label: 'Sessions',    icon: Calendar,        keywords: ['session log', 'recap'] },
    { mode: 'library', subview: 'generators',label: 'Generators',  icon: Wand2,           keywords: ['tavern', 'treasure', 'shop', 'dungeon', 'settlement', 'trinket', 'names', 'locations'] },
    { mode: 'library', subview: 'monsters',  label: 'Monsters',    icon: Skull,           keywords: ['stat block', 'bestiary'] },
    { mode: 'library', subview: 'traps',     label: 'Traps',       icon: Hash },
    { mode: 'library', subview: 'vivify',    label: 'Vivify',      icon: Sparkles,        keywords: ['ai description', 'prose'] },
    { mode: 'library', subview: 'pointbuy',  label: 'Point-Buy',   icon: Wrench,          keywords: ['point buy', 'ability scores', 'calculator', 'stats'] },
  ];

  const PREP_SECTION_META: Array<{ id: string; label: string }> = [
    { id: 'g-world', label: 'World Facts' },
    { id: 'g-fnl', label: 'Required Factions, NPCs & Locations' },
    { id: 'g-mech', label: 'Mechanics & System' },
    { id: 'g-lines', label: 'Content Lines (Hard Nos)' },
    { id: 'pitch', label: 'Quick Pitch' },
    { id: 'genre', label: 'Genre Statement' },
    { id: 'facts', label: 'Setting Facts' },
    { id: 'factions', label: 'Factions' },
    { id: 'conflicts', label: 'Active Conflicts' },
    { id: 'pc', label: 'Player Characters' },
    { id: 'goals', label: 'PC Goals (5 Rules of Proactive Fun)' },
    { id: 's1-review', label: '1 · Review the Characters' },
    { id: 's2-start', label: '2 · Create a Strong Start' },
    { id: 's3-scenes', label: '3 · Outline Potential Scenes' },
    { id: 's4-secrets', label: '4 · Define Secrets & Clues' },
    { id: 's5-loc', label: '5 · Develop Fantastic Locations' },
    { id: 's6-npc', label: '6 · Outline Important NPCs' },
    { id: 's7-mon', label: '7 · Choose Relevant Monsters' },
    { id: 's8-rew', label: '8 · Select Magic Item Rewards' },
    { id: 'audit-goals', label: 'PC Goal Audit' },
    { id: 'audit-factions', label: 'Faction Audit' },
    { id: 'audit-secrets', label: 'Secrets Audit' },
    { id: 'end-ready', label: 'Is the Campaign Ready to End?' },
    { id: 'end-collect', label: 'Collect Every Thread' },
    { id: 'end-catalyst', label: 'Add Catalysts' },
  ];

  const paletteItems: CommandItem[] = useMemo(() => {
    const items: CommandItem[] = [];

    for (const t of VIEW_META) {
      items.push({
        id: `view:${t.mode}:${t.subview}`,
        label: `Go to ${t.label}`,
        sublabel: MODES[t.mode].label,
        group: 'Navigation',
        keywords: t.keywords,
        icon: t.icon,
        run: () => navigateTo({ mode: t.mode, subview: t.subview }),
      });
    }

    items.push(
      { id: 'act:new-session', label: 'New session log', group: 'Actions', icon: Plus, run: () => { addSessionLog(); navigateTo({ mode: 'run', subview: 'log' }); } },
      { id: 'act:export', label: 'Export campaign JSON', group: 'Actions', icon: Download, run: () => exportJSON() },
      { id: 'act:import', label: 'Import campaign JSON', group: 'Actions', icon: Upload, run: () => fileInputRef.current?.click() },
      { id: 'act:add-character', label: 'Add character', group: 'Actions', icon: User, run: () => { addCharacter(); const v = viewForSection('pc'); navigateTo({ mode: v.mode, subview: v.subview, sectionId: 'pc' }); } },
      { id: 'act:solo-toggle', label: soloMode ? 'Switch to Group prep targets' : 'Switch to Solo prep targets', group: 'Actions', icon: Users, run: () => setSoloMode(s => !s) },
      { id: 'act:prep-targets', label: 'Customize prep target counts…', group: 'Actions', icon: SlidersHorizontal, run: () => setPrepTargetsOpen(true) },
    );

    for (const s of PREP_SECTION_META) {
      const v = viewForSection(s.id);
      items.push({
        id: `sec:${s.id}`,
        label: s.label,
        sublabel: MODES[v.mode].label,
        group: 'Prep section',
        icon: ScrollText,
        run: () => navigateTo({ mode: v.mode, subview: v.subview, sectionId: s.id, anchor: `section:${s.id}` }),
      });
    }

    const npcs = (get('npcs', []) as Array<{ name?: string; type?: string; archetype?: string; faction?: string }>);
    npcs.forEach((n, i) => {
      const label = (n.name || '').trim() || (n.archetype || '').trim() || `Unnamed NPC #${i + 1}`;
      const tag = [n.type, n.faction].filter(Boolean).join(' · ');
      items.push({
        id: `npc:${i}`,
        label,
        sublabel: tag || undefined,
        group: 'NPCs',
        keywords: [n.archetype || '', n.faction || ''],
        icon: User,
        run: () => { const v = viewForSection('s6-npc'); navigateTo({ mode: v.mode, subview: v.subview, sectionId: 's6-npc', anchor: `npc:${i}` }); },
      });
    });

    const locs = (get('locations', []) as Array<{ name?: string; type?: string; factions?: string }>);
    locs.forEach((l, i) => {
      const label = (l.name || '').trim() || `Unnamed Location #${i + 1}`;
      items.push({
        id: `loc:${i}`,
        label,
        sublabel: l.type || undefined,
        group: 'Locations',
        keywords: [l.factions || ''],
        icon: Map,
        run: () => { const v = viewForSection('s5-loc'); navigateTo({ mode: v.mode, subview: v.subview, sectionId: 's5-loc', anchor: `location:${i}` }); },
      });
    });

    const facs = (get('factions', []) as Array<{ name?: string; archetype?: string; identity?: string; area?: string }>);
    facs.forEach((f, i) => {
      const label = (f.name || '').trim() || (f.identity || '').trim() || `Unnamed Faction #${i + 1}`;
      items.push({
        id: `fac:${i}`,
        label,
        sublabel: f.archetype || f.area || undefined,
        group: 'Factions',
        icon: Users,
        run: () => { const v = viewForSection('factions'); navigateTo({ mode: v.mode, subview: v.subview, sectionId: 'factions', anchor: `faction:${i}` }); },
      });
    });

    const scenes = (get('scenes', []) as string[]);
    scenes.forEach((s, i) => {
      const text = (s || '').trim();
      if (!text) return;
      items.push({
        id: `sce:${i}`,
        label: text.length > 80 ? `${text.slice(0, 77)}…` : text,
        sublabel: `Scene ${i + 1}`,
        group: 'Scenes',
        icon: Calendar,
        run: () => { const v = viewForSection('s3-scenes'); navigateTo({ mode: v.mode, subview: v.subview, sectionId: 's3-scenes', anchor: 'section:s3-scenes' }); },
      });
    });

    const secrets = (get('secrets', []) as string[]);
    secrets.forEach((s, i) => {
      const text = (s || '').trim();
      if (!text) return;
      items.push({
        id: `sec-clue:${i}`,
        label: text.length > 80 ? `${text.slice(0, 77)}…` : text,
        sublabel: `Secret ${i + 1}`,
        group: 'Secrets',
        icon: ScrollText,
        run: () => { const v = viewForSection('s4-secrets'); navigateTo({ mode: v.mode, subview: v.subview, sectionId: 's4-secrets', anchor: 'section:s4-secrets' }); },
      });
    });

    characters.forEach((c) => {
      if (c.isSidekick) return;
      const label = (c.name || '').trim() || (c.player ? `${c.player}'s character` : 'Unnamed character');
      const tag = [c.classLevel, c.race].filter(Boolean).join(' · ');
      items.push({
        id: `char:${c.id}`,
        label,
        sublabel: tag || undefined,
        group: 'Characters',
        keywords: [c.player || '', c.background || ''],
        icon: User,
        run: () => { const v = viewForSection('pc'); navigateTo({ mode: v.mode, subview: v.subview, sectionId: 'pc', characterId: c.id, anchor: `character:${c.id}` }); },
      });
    });

    characters.forEach((c) => {
      if (!c.isSidekick) return;
      const label = (c.name || '').trim() || 'Unnamed sidekick';
      items.push({
        id: `side:${c.id}`,
        label,
        sublabel: c.sidekickClass || undefined,
        group: 'Sidekicks',
        icon: Users,
        run: () => { const v = viewForSection('pc'); navigateTo({ mode: v.mode, subview: v.subview, sectionId: 'pc', characterId: c.id, anchor: `character:${c.id}` }); },
      });
    });

    sortedSessionLogs.forEach((log) => {
      const label = (log.title || '').trim() || 'Untitled session';
      items.push({
        id: `ses:${log.id}`,
        label,
        sublabel: log.date || undefined,
        group: 'Sessions',
        icon: Calendar,
        run: () => navigateTo({ mode: 'run', subview: 'log', sessionId: log.id, anchor: `session:${log.id}` }),
      });
    });

    // PC goals — track progress in the 'track' tab where the goal-progress
    // card lives, but expose the same prep-tab anchor as a sublabel hint.
    const goals = (get('pcGoals', []) as Array<{ text?: string; timeframe?: string; status?: string }>);
    goals.forEach((g, i) => {
      const text = (g.text || '').trim();
      if (!text) return;
      const sub = [g.status, g.timeframe].filter(Boolean).join(' · ');
      items.push({
        id: `goal:${i}`,
        label: text.length > 80 ? `${text.slice(0, 77)}…` : text,
        sublabel: sub || `PC Goal ${i + 1}`,
        group: 'Goals',
        icon: Target,
        run: () => { const v = viewForSection('goals'); navigateTo({ mode: v.mode, subview: v.subview, sectionId: 'goals', anchor: 'section:goals' }); },
      });
    });

    // Magic items live in the Phase 3 / step 8 prep section as a string list.
    const magicItems = (get('items', []) as string[]);
    magicItems.forEach((m, i) => {
      const text = (m || '').trim();
      if (!text) return;
      items.push({
        id: `magic:${i}`,
        label: text.length > 80 ? `${text.slice(0, 77)}…` : text,
        sublabel: `Magic Item ${i + 1}`,
        group: 'Magic items',
        icon: Gift,
        run: () => { const v = viewForSection('s8-rew'); navigateTo({ mode: v.mode, subview: v.subview, sectionId: 's8-rew', anchor: 'section:s8-rew' }); },
      });
    });

    // Faction clocks (Phase 4). No per-card anchor — clock cards aren't
    // individually addressable today; landing on the tab is the goal.
    const clocks = (get('clocks', []) as Array<{ text?: string; faction?: string; filled?: number; max?: number }>);
    clocks.forEach((c, i) => {
      const text = (c.text || '').trim();
      const faction = (c.faction || '').trim();
      const label = text || faction || `Clock ${i + 1}`;
      const sub = [faction && text ? faction : null, typeof c.filled === 'number' && typeof c.max === 'number' ? `${c.filled}/${c.max}` : null].filter(Boolean).join(' · ');
      items.push({
        id: `clock:${i}`,
        label: label.length > 80 ? `${label.slice(0, 77)}…` : label,
        sublabel: sub || undefined,
        group: 'Faction clocks',
        keywords: [faction],
        icon: Target,
        run: () => { setPhaseOpen(p => ({ ...p, p4: true })); navigateTo({ mode: 'plan', subview: 'fronts' }); },
      });
    });

    // Homebrew monsters live in their own tab; no in-tab anchor today.
    const homebrew = (get('homebrewMonsters', []) as Array<{ slug?: string; name?: string; challenge_rating?: string; type?: string }>);
    homebrew.forEach((m, i) => {
      const name = (m.name || '').trim() || `Monster ${i + 1}`;
      const sub = [m.challenge_rating ? `CR ${m.challenge_rating}` : null, m.type].filter(Boolean).join(' · ');
      items.push({
        id: `mon:${m.slug || i}`,
        label: name,
        sublabel: sub || undefined,
        group: 'Monsters',
        keywords: [m.type || ''],
        icon: Skull,
        run: () => navigateTo({ mode: 'library', subview: 'monsters' }),
      });
    });

    const traps = (get('traps', []) as Array<{ id?: string; name?: string; tier?: string; severity?: string }>);
    traps.forEach((t, i) => {
      const name = (t.name || '').trim() || `Trap ${i + 1}`;
      const sub = [t.tier, t.severity].filter(Boolean).join(' · ');
      items.push({
        id: `trap:${t.id || i}`,
        label: name,
        sublabel: sub || undefined,
        group: 'Traps',
        icon: Hash,
        run: () => navigateTo({ mode: 'library', subview: 'traps' }),
      });
    });

    const chases = (get('chases', []) as Array<{ id?: string; name?: string; terrain?: string; resolved?: string }>);
    chases.forEach((c, i) => {
      const name = (c.name || '').trim() || `Chase ${i + 1}`;
      const sub = [c.terrain, c.resolved && c.resolved !== 'ongoing' ? c.resolved : null].filter(Boolean).join(' · ');
      items.push({
        id: `chase:${c.id || i}`,
        label: name,
        sublabel: sub || undefined,
        group: 'Chases',
        keywords: [c.terrain || ''],
        icon: Footprints,
        run: () => navigateTo({ mode: 'run', subview: 'chase' }),
      });
    });

    const downtime = (get('downtime', []) as Array<DowntimeEntry>);
    downtime.forEach((d) => {
      const typeDef = DOWNTIME_TYPES.find(t => t.id === d.type);
      const typeLabel = typeDef?.label || d.type || 'Downtime';
      const firstField = typeDef?.fields?.[0];
      const summary = firstField ? (d.fields?.[firstField.key] || '').trim() : '';
      const label = summary || typeLabel;
      const sub = summary ? typeLabel : (d.archived ? 'Archived' : undefined);
      items.push({
        id: `down:${d.id}`,
        label: label.length > 80 ? `${label.slice(0, 77)}…` : label,
        sublabel: sub,
        group: 'Downtime',
        keywords: [typeLabel],
        icon: Calendar,
        run: () => navigateTo({ mode: 'plan', subview: 'worldbuild' }),
      });
    });

    // Generator log: surface the most recent few per kind. Title is whatever
    // the generator stored — usually a name or one-line summary.
    const LOG_LABEL: Record<string, string> = {
      'treasure-hoard': 'Treasure', 'trinket': 'Trinket', 'mundane-shop': 'Mundane shop',
      'magic-shop': 'Magic shop', 'tavern': 'Tavern', 'tavern-name': 'Tavern name',
      'dungeon': 'Dungeon', 'settlement': 'Settlement', 'names': 'Names',
      'locations': 'Location', 'monster-roll': 'Monster', 'monster-scale': 'Scaled monster',
      'dice': 'Dice',
    };
    const LOG_TO_VIEW: Record<string, { mode: Mode; subview: string }> = {
      'names':         { mode: 'library', subview: 'generators' },
      'locations':     { mode: 'library', subview: 'generators' },
      'monster-roll':  { mode: 'library', subview: 'monsters' },
      'monster-scale': { mode: 'library', subview: 'monsters' },
      'dice':          { mode: 'run',     subview: 'dice' },
    };
    for (const kind of Object.keys(generatorLogs) as Array<keyof typeof generatorLogs>) {
      const entries = (generatorLogs[kind] || []).slice(0, 5);
      const destView = LOG_TO_VIEW[kind] || { mode: 'library' as const, subview: 'generators' };
      entries.forEach((entry) => {
        const title = (entry.title || '').trim();
        if (!title) return;
        items.push({
          id: `log:${entry.id}`,
          label: title.length > 70 ? `${title.slice(0, 67)}…` : title,
          sublabel: LOG_LABEL[kind] || kind,
          group: 'Generator log',
          icon: Wand2,
          run: () => navigateTo({ mode: destView.mode, subview: destView.subview }),
        });
      });
    }

    return items;
    // navigateTo and the action callbacks close over the latest state via the
    // setter callbacks they call; the deps below cover the fields we read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, soloMode, sortedSessionLogs, characters, generatorLogs]);

  if (get('__runSessionOpen', false)) {
    return (
      <>
        <RunSessionView
          get={get}
          setVal={setVal}
          characters={characters}
          onEndSession={handleEndSession}
          onExitWithoutEnding={() => setVal('__runSessionOpen', false)}
          onOpenLibrary={() => {
            setVal('__runSessionOpen', false);
            setState(s => ({ ...s, __mode: 'library', __subview: 'generators' }));
          }}
          campaignContext={generatorCampaignContext}
        />
        <SyncPill />
      </>
    );
  }

  const closePrepWizard = () => {
    setState(s => {
      const next = { ...s };
      delete next.__prepWizardOpen;
      delete next.__prepWizardStep;
      delete next.__prepWizardCompleted;
      delete next.__prepWizardStepNotes;
      return next;
    });
  };
  const startSessionFromPrep = () => {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    setState(s => {
      const next = { ...s };
      delete next.__prepWizardOpen;
      delete next.__prepWizardStep;
      delete next.__prepWizardCompleted;
      delete next.__prepWizardStepNotes;
      next.__activeSessionId = sessionId;
      next.__sessionStartedAt = Date.now();
      next.__sessionChangeEvents = [];
      next.__sessionUsedScenes = [];
      next.__runSessionOpen = true;
      return markSessionPlayed(next);
    });
  };

  if (get('__prepWizardOpen', false)) {
    return (
      <PrepWizardView
        get={get}
        setVal={setVal}
        soloMode={soloMode}
        overrides={prepTargetOverrides}
        onExit={closePrepWizard}
        onClose={closePrepWizard}
        onStartSession={startSessionFromPrep}
      />
    );
  }

  if (session0Open) {
    return (
      <Session0Wizard
        initialName={name}
        initialSoloMode={soloMode}
        onClose={() => {
          // Closing without finishing still marks done so the user is not
          // re-prompted on every load. They can re-run from the menu.
          setState(s => ({ ...s, __session0Done: true }));
          setSession0Open(false);
        }}
        onFinish={(patch) => {
          if (patch.name) setName(patch.name);
          if (patch.soloMode !== undefined) setSoloMode(patch.soloMode);
          setState(s => applySession0Patch(s, patch));
          setSession0Open(false);
          setMode('plan');
          setSubview('pitch');
        }}
      />
    );
  }

  return (
    <main className="min-h-screen p-3 sm:p-5 md:p-8">
      <div className="max-w-5xl mx-auto">
        <div className="bg-parchment-soft border border-rule rounded-lg shadow-page p-3 sm:p-5 md:p-8 space-y-4">
          <header className="pb-3 border-b border-rule">
            <div className="flex items-center justify-between gap-2 mb-2">
              <button
                type="button"
                onClick={() => { if (confirmUnsavedNav()) router.push('/campaign'); }}
                className="text-xs text-brass-deep hover:text-crimson font-display uppercase tracking-wider flex items-center gap-1"
              >
                <ArrowLeft size={12} /> All Campaigns
              </button>
              <div className="flex items-center gap-2">
                <SyncIndicator />
                <AccountMenu
                  onExport={exportJSON}
                  onImport={() => fileInputRef.current?.click()}
                  onArchive={handleArchive}
                  isArchived={isArchived}
                  onDelete={handleDelete}
                  onRerunSession0={() => setSession0Open(true)}
                  onOpenPrepTargets={() => setPrepTargetsOpen(true)}
                  onCopy={handleCopy}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <ScrollText size={20} className="text-crimson flex-shrink-0" />
              <textarea rows={1} value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign Name"
                className="flex-1 min-w-[12rem] bg-transparent border-b border-rule font-display text-xl sm:text-2xl tracking-wide text-ink placeholder:text-ink-faint focus:border-crimson focus:outline-none pb-1 resize-none whitespace-pre-wrap break-words [field-sizing:content]" />
              {isArchived && (
                <span
                  title="This campaign is archived — hidden from your main list. Unarchive from the Account menu."
                  className="text-[10px] not-italic px-1.5 py-0.5 rounded-sm border border-brass-deep/60 bg-brass/10 text-brass-deep font-display uppercase tracking-wider flex-shrink-0"
                >
                  Archived
                </span>
              )}
              {worldOnlyMode ? (
                <span className="text-[10px] not-italic px-1.5 py-0.5 rounded-sm border border-moss/60 bg-moss/10 text-moss font-display uppercase tracking-wider flex-shrink-0">
                  Shared World
                </span>
              ) : campaign.worldId ? (
                <button
                  onClick={() => router.push(`/world/${campaign.worldId}`)}
                  className="text-[10px] not-italic px-2 py-0.5 rounded border border-indigo-700/60 bg-indigo-50 text-indigo-700 font-display uppercase tracking-wider flex-shrink-0 hover:bg-indigo-100 transition-colors flex items-center gap-1"
                >
                  <Globe size={10} /> World Linked
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleConvertToWorld}
                  className="text-[10px] not-italic px-2 py-0.5 rounded border border-brass-deep/60 bg-brass/5 text-brass-deep font-display uppercase tracking-wider flex-shrink-0 hover:bg-brass/10 transition-colors"
                >
                  Convert to Shared World
                </button>
              )}
              <div
                role="group"
                aria-label="Prep target mode"
                title="Switch prep item targets between solo and group scale"
                className="inline-flex rounded border border-rule overflow-hidden text-xs font-display uppercase tracking-wider flex-shrink-0"
              >
                <button
                  type="button"
                  onClick={() => setSoloMode(true)}
                  aria-pressed={soloMode}
                  className={`px-3 py-1 flex items-center gap-1.5 transition-colors ${
                    soloMode ? 'bg-wine/15 text-wine' : 'text-ink-soft hover:bg-parchment-deep'
                  }`}
                >
                  <User size={12} /> Solo
                </button>
                <button
                  type="button"
                  onClick={() => setSoloMode(false)}
                  aria-pressed={!soloMode}
                  className={`px-3 py-1 flex items-center gap-1.5 border-l border-rule transition-colors ${
                    !soloMode ? 'bg-brass-deep/15 text-brass-deep' : 'text-ink-soft hover:bg-parchment-deep'
                  }`}
                >
                  <Users size={12} /> Group
                </button>
              </div>
              {!soloMode && (
                <PlayersManager campaign={campaign} />
              )}
            </div>
            <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={importJSON} className="hidden" />

            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 justify-between">
              <div className="flex flex-wrap items-center gap-1.5">
                <ToolBtn onClick={() => setPaletteOpen(true)} title="Open command palette (⌘K)">
                  <Search size={12} /> Search
                  <kbd className="ml-1 text-[10px] font-display uppercase tracking-wider border border-rule rounded px-1 py-px text-ink-mute">⌘K</kbd>
                </ToolBtn>
                <button
                  type="button"
                  onClick={() => {
                    setVal('__prepWizardOpen', true);
                    setVal('__prepWizardStep', 1);
                  }}
                  disabled={!!get('__activeSessionId', '')}
                  className="text-xs px-3 py-1 rounded border border-moss/60 bg-moss/10 text-moss hover:bg-moss hover:text-parchment font-display uppercase tracking-wider flex items-center gap-1.5 shadow-sm disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-moss/10 disabled:hover:text-moss"
                  title={get('__activeSessionId', '') ? 'Finish your current session first' : 'Walk through Lazy DM\'s 8-step prep'}
                >
                  <ClipboardList size={12} /> Prep Next Session
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                    setState(s => ({
                      ...s,
                      __activeSessionId: sessionId,
                      __sessionStartedAt: Date.now(),
                      __sessionChangeEvents: [],
                      __sessionUsedScenes: [],
                      __runSessionOpen: true,
                    }));
                  }}
                  className="text-xs px-3 py-1 rounded border border-crimson/60 bg-crimson/10 text-crimson hover:bg-crimson hover:text-parchment font-display uppercase tracking-wider flex items-center gap-1.5 shadow-sm"
                  title="Enter Run Session mode for live play"
                >
                  <Play size={12} /> Run Session
                </button>
              </div>
              <div className="relative" ref={progressMenuRef}>
                <button
                  type="button"
                  onClick={() => setProgressOpen(!progressOpen)}
                  className="flex items-center gap-1.5 rounded-full border border-moss/45 bg-moss/5 px-2.5 py-1 hover:bg-moss/10 transition-colors"
                >
                  <div className="font-display text-[10px] uppercase tracking-wider text-moss flex items-center gap-1">
                    {completedCount} Steps Done <ChevronDown size={10} className={`transition-transform ${progressOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>
                {progressOpen && (
                  <div className="absolute right-0 top-full mt-2 w-64 rounded border border-rule bg-parchment-soft shadow-page z-30 max-h-[80vh] overflow-y-auto">
                    <div className="p-3 border-b border-rule font-display text-xs uppercase tracking-wider text-ink bg-parchment-deep/50">
                      Uncompleted Tasks
                    </div>
                    <div className="p-2 space-y-3">
                      {PREP_GROUPS.map(g => {
                        const uncompleted = g.keys.map((k, i) => ({ k, label: g.labels[i] })).filter(x => !done?.[x.k]);
                        if (uncompleted.length === 0) return null;
                        return (
                          <div key={g.name}>
                            <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep mb-1 px-1">
                              {g.name}
                            </div>
                            <ul className="space-y-1">
                              {uncompleted.map(u => (
                                <li key={u.k} className="font-serif text-xs text-ink-soft flex items-start gap-1.5 px-1 leading-tight">
                                  <span className="text-crimson/60 mt-0.5">•</span> <span>{u.label}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                      {PREP_GROUPS.every(g => g.keys.every(k => done?.[k])) && (
                        <div className="text-center font-serif text-xs italic text-moss p-2">
                          All standard prep steps are complete!
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </header>

          <ModeNav
            mode={mode}
            subview={subview}
            onModeChange={handleModeChange}
            onSubviewChange={handleSubviewChange}
            worldOnlyMode={worldOnlyMode}
          />

        <div key={`${mode}:${subview}`} className="gm-tab-enter space-y-4">
          <div className="space-y-3">
            {mode === 'prep' && subview === 'flow' && (
              nextUp ? (
                <div className="rounded border border-brass/40 bg-brass/5 p-3 flex items-center gap-3 shadow-card">
                  <div className="text-[10px] font-display uppercase tracking-wider text-brass-deep flex-shrink-0">
                    Next Up
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-display text-ink text-sm">{nextUp.label}</div>
                    <div className="text-xs text-ink-soft font-serif italic">
                      {nextUp.current} of {nextUp.target} — {nextUp.target - nextUp.current} to go
                    </div>
                  </div>
                  <button
                    onClick={jumpToNextUp}
                    className="text-xs px-3 py-1.5 rounded border border-brass-deep/60 text-brass-deep hover:bg-brass hover:text-parchment hover:border-brass font-display uppercase tracking-wider flex-shrink-0 transition-colors"
                  >
                    Jump To
                  </button>
                </div>
              ) : completedCount > 0 ? (
                <div className="rounded border border-moss/40 bg-moss/5 p-3 text-sm font-serif italic text-moss text-center">
                  All prep targets met. Ready to run.
                </div>
              ) : null
            )}
            {mode === 'plan' && subview === 'pitch' && (
            <Phase n="0" title="Givens & Pitch" sub="Decide What's Non-Negotiable" methods={['ccd']} audience="solo" icon={Layers} expanded={phaseOpen.p0} onToggle={() => togglePhase('p0')}>
              <BookQuote source="CCD ch. 1">Givens are a set of things your group agrees will feature regardless of how worldbuilding ends up.</BookQuote>
              <Section id="g-world" title="World Facts" methods={['ccd']} done={done['g-world']} onToggle={toggleDone} open={open['g-world']} onToggleOpen={toggleOpen}>
                <Example title="from CCD">"Post-apocalyptic." "The sun has gone out." "Magic has died."</Example>
                <ListField items={get('gWorld', [])} onChange={(v) => setVal('gWorld', v)} placeholder="A world fact" target={tgt('gWorld')} />
              </Section>
              <Section id="g-fnl" title="Required Factions, NPCs & Locations" methods={['ccd']} done={done['g-fnl']} onToggle={toggleDone} open={open['g-fnl']} onToggleOpen={toggleOpen}>
                <ListField items={get('gFNL', [])} onChange={(v) => setVal('gFNL', v)} placeholder="A specific entity" target={tgt('gFNL')} />
              </Section>
              <Section id="g-mech" title="Mechanics & System" methods={['ccd']} done={done['g-mech']} onToggle={toggleDone} open={open['g-mech']} onToggleOpen={toggleOpen}>
                <Field value={get('system', '')} onChange={(v) => setVal('system', v)} placeholder="System (e.g. 5e)" />
                <CardLabel>Tone Keywords</CardLabel>
                <ListField items={get('tone', [])} onChange={(v) => setVal('tone', v)} placeholder="A tone word" />
              </Section>
              <Section id="g-lines" title="Content Lines (Hard Nos)" methods={['ccd']} done={done['g-lines']} onToggle={toggleDone} open={open['g-lines']} onToggleOpen={toggleOpen}>
                <ListField items={get('lines', [])} onChange={(v) => setVal('lines', v)} placeholder="A topic to avoid" target={tgt('lines')} />
              </Section>
              <Section id="pitch" title="Quick Pitch" methods={['ccd']} done={done.pitch} onToggle={toggleDone} open={open.pitch} onToggleOpen={toggleOpen}>
                <BookQuote source="CCD case study">Pitch the results, not the concept.</BookQuote>
                <Field value={get('pitch', '')} onChange={(v) => setVal('pitch', v)} placeholder="2-3 sentences" rows={4} />
                <InspireGroup>
                  <span className="text-[10px] text-ink-mute font-display uppercase tracking-wider">Goal seeds:</span>
                  <Inspire tableId="dungeonGoals" label="Dungeon" onPick={(e) => {
                    const cur = get('pitch', '') as string;
                    setVal('pitch', cur ? `${cur}\n• ${e}` : `• ${e}`);
                  }} />
                  <Inspire tableId="wildernessGoals" label="Wilderness" onPick={(e) => {
                    const cur = get('pitch', '') as string;
                    setVal('pitch', cur ? `${cur}\n• ${e}` : `• ${e}`);
                  }} />
                  <Inspire tableId="urbanGoals" label="Urban" onPick={(e) => {
                    const cur = get('pitch', '') as string;
                    setVal('pitch', cur ? `${cur}\n• ${e}` : `• ${e}`);
                  }} />
                </InspireGroup>
              </Section>
            </Phase>
            )}

            {mode === 'plan' && subview === 'worldbuild' && (
            <Phase n="1" title="Session −1" sub="Collaborative Worldbuilding" methods={['ccd', 'pr']} audience="together" icon={Users} expanded={phaseOpen.p1} onToggle={() => togglePhase('p1')}>
              <BookQuote source="CCD ch. 2">Session −1 is a long creative session in which the group brings ideas to define a setting.</BookQuote>
              <SoloNote>With one player, this becomes a 2-person conversation. Take turns. Hold back on conflict-stage so player gets first authority.</SoloNote>
              <Section id="genre" title="Genre Statement" methods={['ccd']} done={done.genre} onToggle={toggleDone} open={open.genre} onToggleOpen={toggleOpen}>
                <Example title="format">[tone] [genre] in [setting] where [tension]</Example>
                <Field value={get('genre', '')} onChange={(v) => setVal('genre', v)} placeholder="One sentence" rows={2} />
              </Section>
              <Section id="facts" title="Setting Facts" methods={['ccd']} done={done.facts} onToggle={toggleDone} open={open.facts} onToggleOpen={toggleOpen}>
                <Pitfall>Don't pre-load all the secrets. Players still need new ones to discover.</Pitfall>
                <ListField items={get('facts', [])} onChange={(v) => setVal('facts', v)} placeholder="A fact about the world" rows={2} target={tgt('facts')} />
              </Section>
              <Section id="secrets" title="Secrets & Clues" methods={['ccd', 'pr']} done={done.secrets} onToggle={toggleDone} open={open.secrets} onToggleOpen={toggleOpen}>
                <BookQuote source="PR ch. 5">Secrets are the currency of the game. They shouldn't be gated behind high rolls.</BookQuote>
                <Pitfall>Secrets without context (like "the duke is actually a lizard") don't drive action. Tie them to character goals.</Pitfall>
                <TargetBar current={countFilled('secrets', get('secrets', []))} target={tgt('secrets')} source={TARGETS.secrets.source} />
                <ListField items={get('secrets', [])} onChange={(v) => setVal('secrets', v)} placeholder="A secret someone doesn't want known" rows={2} target={tgt('secrets')} />
              </Section>
              <Section id="handouts" title="Handouts / Lore (Public)" methods={[]} done={done.handouts} onToggle={toggleDone} open={open.handouts} onToggleOpen={toggleOpen}>
                <div className="text-[10px] text-ink-mute uppercase font-display tracking-wider mb-2">Visible to players via invite link</div>
                <Field value={get('handouts', '')} onChange={(v) => setVal('handouts', v)} placeholder="Notes, rumors, or handouts that players can see..." rows={6} />
              </Section>
              <Section id="factions" title="Factions" methods={['pr', 'ccd']} done={done.factions} onToggle={toggleDone} open={open.factions} onToggleOpen={toggleOpen} icon={Users}>
                <BookQuote source="PR ch. 2">Think of factions, not individual NPCs, as the GM-controlled counterparts of the party.</BookQuote>
                <Pitfall>Factions whose goals don't overlap with PC goals are just colour.</Pitfall>
                <TargetBar current={countFilled('factions', get('factions', []))} target={tgt('factions')} source={TARGETS.factions.source} />
                {(get('factions', []) as any[]).map((f: any, i: number) => (
                  <div key={i} data-cp-anchor={`faction:${i}`}>
                    <FactionCard data={f} onChange={(v: any) => {
                      const next = [...(get('factions', []) as any[])]; next[i] = v; setVal('factions', next);
                      const fromR = typeof f.renown === 'number' ? f.renown : 0;
                      const toR = typeof v.renown === 'number' ? v.renown : 0;
                      if (fromR !== toR) {
                        trackEvent(
                          'renown_changed',
                          `${v.name || f.name || `Faction ${i + 1}`} renown: ${fromR} → ${toR}`,
                          fromR, toR,
                        );
                      }
                    }} onRemove={() => setVal('factions', (get('factions', []) as any[]).filter((_: any, j: number) => j !== i))} />
                  </div>
                ))}
                <InspireGroup>
                  <span className="text-[10px] text-ink-mute font-display uppercase tracking-wider">Add faction from:</span>
                  <Inspire tableId="villainArchetypes" label="Villain" onPick={(e) => {
                    setVal('factions', [...(get('factions', []) as any[]), { name: '', archetype: '', identity: e, area: '', power: '', ideology: '', shortGoals: [], midGoals: [], longGoal: '' }]);
                  }} />
                  <Inspire tableId="allyTypes" label="Ally" onPick={(e) => {
                    setVal('factions', [...(get('factions', []) as any[]), { name: '', archetype: '', identity: e, area: '', power: '', ideology: '', shortGoals: [], midGoals: [], longGoal: '' }]);
                  }} />
                  <Inspire tableId="patronTypes" label="Patron" onPick={(e) => {
                    setVal('factions', [...(get('factions', []) as any[]), { name: '', archetype: '', identity: e, area: '', power: '', ideology: '', shortGoals: [], midGoals: [], longGoal: '' }]);
                  }} />
                </InspireGroup>
                <button onClick={() => setVal('factions', [...(get('factions', []) as any[]), { name: '', archetype: '', identity: '', area: '', power: '', ideology: '', shortGoals: [], midGoals: [], longGoal: '' }])} className="text-xs text-brass-deep hover:text-crimson flex items-center gap-1 font-display uppercase tracking-wider">
                  <Plus size={12} /> Add Faction
                </button>
              </Section>
              <Section id="conflicts" title="Active Conflicts" methods={['ccd', 'pr']} done={done.conflicts} onToggle={toggleDone} open={open.conflicts} onToggleOpen={toggleOpen}>
                <BookQuote source="CCD ch. 2">Conflicts are the end goal of worldbuilding.</BookQuote>
                <ListField items={get('conflicts', [])} onChange={(v) => setVal('conflicts', v)} placeholder="Faction A vs Faction B over X" rows={2} target={tgt('conflicts')} />
                <InspireGroup>
                  <span className="text-[10px] text-ink-mute font-display uppercase tracking-wider">Inspire:</span>
                  <Inspire tableId="twists" label="Twist" onPick={(e) => {
                    setVal('conflicts', [...(get('conflicts', []) as string[]), e]);
                  }} />
                  <Inspire tableId="moralQuandaries" label="Quandary" onPick={(e) => {
                    setVal('conflicts', [...(get('conflicts', []) as string[]), e]);
                  }} />
                  <Inspire tableId="sideComplications" label="Complication" onPick={(e) => {
                    setVal('conflicts', [...(get('conflicts', []) as string[]), e]);
                  }} />
                  <Inspire tableId="campaignEvents" label="Event" onPick={(e) => {
                    setVal('conflicts', [...(get('conflicts', []) as string[]), e]);
                  }} />
                </InspireGroup>
              </Section>
            </Phase>
            )}

            {mode === 'plan' && subview === 'pcs' && (
            <Phase n="2" title="Session 0 — Characters & Goals" sub="PCs Created After the World Exists" methods={['pr', 'shea']} audience="together" icon={User} expanded={phaseOpen.p2} onToggle={() => togglePhase('p2')}>
              <SoloNote>Solo Session 0 is fast. Spend the saved time on goal craft.</SoloNote>
              <Section id="pc" title="Player Characters" methods={['shea']} done={done.pc} onToggle={toggleDone} open={open.pc} onToggleOpen={toggleOpen}>
                <BookQuote source="Lazy DM (Chris Perkins)">Nothing's more important to a campaign than the stories of the player characters.</BookQuote>
                <div className="space-y-2">
                  {characters.map((c) => (
                    <div key={c.id} data-cp-anchor={`character:${c.id}`}>
                      <CharacterCard
                        data={c}
                        open={!!openChars[c.id]}
                        soloMode={soloMode}
                        onToggleOpen={() => setOpenChars(o => ({ ...o, [c.id]: !o[c.id] }))}
                        onChange={(v) => updateCharacter(c.id, v)}
                        onRemove={() => removeCharacter(c.id)}
                      />
                    </div>
                  ))}
                  {characters.length === 0 && (
                    <p className="text-sm text-ink-mute italic font-serif">
                      No characters yet. Click &quot;Add Character&quot; to start.
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-3 items-center pt-1">
                  <button onClick={addCharacter} className="text-xs text-brass-deep hover:text-crimson flex items-center gap-1 font-display uppercase tracking-wider">
                    <Plus size={12} /> Add Character
                  </button>
                  {isPro ? (
                    <>
                      <button
                        onClick={() => characterFileInputRef.current?.click()}
                        disabled={uploadingChar}
                        className="text-xs text-crimson hover:text-wine flex items-center gap-1 font-display uppercase tracking-wider disabled:opacity-50 disabled:cursor-wait"
                        title="Upload a PDF, image, or text character sheet — parsed by Claude (pro only)"
                      >
                        <FileUp size={12} /> {uploadingChar ? 'Parsing…' : 'Upload Sheet'}
                      </button>
                      <input
                        ref={characterFileInputRef}
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.json,application/pdf,image/png,image/jpeg,image/webp,image/gif,text/plain,application/json,text/markdown"
                        onChange={uploadCharacterSheet}
                        className="hidden"
                      />
                    </>
                  ) : (
                    <LockedInline label="Upload Sheet" />
                  )}
                  {charUploadError && (
                    <span className="text-xs text-crimson italic" title={charUploadError}>
                      {charUploadError}
                    </span>
                  )}
                </div>

                {soloMode && (
                  <div className="pt-2">
                    <SoloNote>
                      Running solo? Add a <strong>sidekick</strong> from Tasha's Cauldron — an
                      Expert, Spellcaster, or Warrior companion that levels with you.
                    </SoloNote>
                    <SidekickAddPanel
                      isPro={isPro}
                      onAdd={(c) => {
                        setVal('characters', [...characters, c]);
                        setOpenChars(o => ({ ...o, [c.id]: true }));
                      }}
                    />
                  </div>
                )}
              </Section>
              <Section id="goals" title="PC Goals (5 Rules of Proactive Fun)" methods={['pr']} done={done.goals} onToggle={toggleDone} open={open.goals} onToggleOpen={toggleOpen} icon={Target}>
                <div className="rounded border border-wine/40 bg-wine/5 p-3 text-sm space-y-1.5 text-ink-soft font-serif">
                  <p><span className="text-wine font-display uppercase tracking-wider text-xs">1 · </span>Multiple Goals (3+ concurrent)</p>
                  <p><span className="text-wine font-display uppercase tracking-wider text-xs">2 · </span>Varying Timeframes</p>
                  <p><span className="text-wine font-display uppercase tracking-wider text-xs">3 · </span>Achievable (measurable)</p>
                  <p><span className="text-wine font-display uppercase tracking-wider text-xs">4 · </span>Consequences for Failure</p>
                  <p><span className="text-wine font-display uppercase tracking-wider text-xs">5 · </span>Fun to Pursue</p>
                </div>
                <Example title="Bad → Good">"Become powerful" → "Win a duel against the captain of the guard"</Example>
                <Pitfall>Long-term goals locked in Session 0 are usually worse than ones locked after Session 1.</Pitfall>
                <TargetBar current={countFilled('pcGoals', get('pcGoals', []))} target={tgt('pcGoals')} source={TARGETS.pcGoals.source} />
                {(get('pcGoals', []) as any[]).map((g: any, i: number) => (
                  <GoalCard key={i} data={g} onChange={(v: any) => {
                    const next = [...(get('pcGoals', []) as any[])]; next[i] = v; setVal('pcGoals', next);
                  }} onRemove={() => setVal('pcGoals', (get('pcGoals', []) as any[]).filter((_: any, j: number) => j !== i))} />
                ))}
                <button onClick={() => setVal('pcGoals', [...(get('pcGoals', []) as any[]), { text: '', timeframe: 'short', success: '', failure: '', linked: '' }])} className="text-xs text-brass-deep hover:text-crimson flex items-center gap-1 font-display uppercase tracking-wider">
                  <Plus size={12} /> Add Goal
                </button>
              </Section>
            </Phase>
            )}

            {mode === 'prep' && subview === 'flow' && (
            <Phase n="3" title="Per-Session Prep" sub="Lazy DM 8-Step Checklist" methods={['shea']} audience="solo" icon={Calendar} expanded={phaseOpen.p3} onToggle={() => togglePhase('p3')}>
              <BookQuote source="Lazy DM (Jeremy Crawford)">Prep as little as you can.</BookQuote>
              <Section id="s1-review" title="1 · Review the Characters" methods={['shea']} done={done['s1-review']} onToggle={toggleDone} open={open['s1-review']} onToggleOpen={toggleOpen}>
                <Field value={get('reviewNotes', '')} onChange={(v) => setVal('reviewNotes', v)} placeholder="Mental priming notes" rows={3} />
              </Section>
              <Section id="s2-start" title="2 · Create a Strong Start" methods={['shea']} done={done['s2-start']} onToggle={toggleDone} open={open['s2-start']} onToggleOpen={toggleOpen}>
                <SoloNote>Solo level-1 cannot reliably survive opening combat. Substitute action that isn't a losable fight.</SoloNote>
                <Field value={get('strongStart', '')} onChange={(v) => setVal('strongStart', v)} placeholder="One sentence or paragraph" rows={4} />
                <InspireGroup>
                  <Inspire tableId="introductions" label="Introduction" onPick={(e) => {
                    const cur = (get('strongStart', '') as string).trim();
                    if (cur && !confirm('Replace the current strong start?')) return;
                    setVal('strongStart', e);
                  }} />
                  <StrongStartPicker onUse={(body) => {
                    const cur = (get('strongStart', '') as string).trim();
                    if (cur && !confirm('Replace the current strong start?')) return;
                    setVal('strongStart', body);
                  }} />
                </InspireGroup>
              </Section>
              <Section id="s3-scenes" title="3 · Outline Potential Scenes" methods={['shea']} done={done['s3-scenes']} onToggle={toggleDone} open={open['s3-scenes']} onToggleOpen={toggleOpen}>
                <BookQuote source="Lazy DM (Perkins)">Be prepared to throw what you have away.</BookQuote>
                <ListField items={get('scenes', [])} onChange={(v) => setVal('scenes', v)} placeholder="A scene" target={tgt('scenes')} />
                <InspireGroup>
                  <span className="text-[10px] text-ink-mute font-display uppercase tracking-wider">Inspire:</span>
                  <Inspire tableId="sideQuests" label="Side Quest" onPick={(e) => {
                    setVal('scenes', [...(get('scenes', []) as string[]), e]);
                  }} />
                  <Inspire tableId="sideComplications" label="Complication" onPick={(e) => {
                    setVal('scenes', [...(get('scenes', []) as string[]), e]);
                  }} />
                </InspireGroup>
              </Section>
              <Section id="s4-secrets" title="4 · Define Secrets & Clues" methods={['shea']} done={done['s4-secrets']} onToggle={toggleDone} open={open['s4-secrets']} onToggleOpen={toggleOpen}>
                <BookQuote source="Lazy DM ch. 6">Secrets and clues are the connective tissue of an adventure.</BookQuote>
                <Pitfall>Tying a secret to a specific NPC means if players skip them, the secret never surfaces.</Pitfall>
                <ListField items={get('secrets', [])} onChange={(v) => setVal('secrets', v)} placeholder="A single-sentence secret" rows={2} target={tgt('secrets')} />
                <InspireGroup>
                  <span className="text-[10px] text-ink-mute font-display uppercase tracking-wider">Inspire:</span>
                  <Inspire tableId="villainSchemes" label="Scheme" onPick={(e) => {
                    setVal('secrets', [...(get('secrets', []) as string[]), e]);
                  }} />
                  <Inspire tableId="villainWeaknesses" label="Weakness" onPick={(e) => {
                    setVal('secrets', [...(get('secrets', []) as string[]), e]);
                  }} />
                  <Inspire tableId="campaignEvents" label="Event" onPick={(e) => {
                    setVal('secrets', [...(get('secrets', []) as string[]), e]);
                  }} />
                </InspireGroup>
              </Section>
              <Section id="s5-loc" title="5 · Develop Fantastic Locations" methods={['shea']} done={done['s5-loc']} onToggle={toggleDone} open={open['s5-loc']} onToggleOpen={toggleOpen} icon={Map}>
                <BookQuote source="Lazy DM ch. 7">When in doubt, go for scale.</BookQuote>
                <TargetBar current={countFilled('locations', get('locations', []))} target={tgt('locations')} source={TARGETS.locations.source} />
                {(get('locations', []) as any[]).map((l: any, i: number) => {
                  const entityId = l?.id ?? `loc-${i}`;
                  const highlighted = highlightEntityId === entityId;
                  return (
                    <div
                      key={i}
                      id={`entity-${entityId}`}
                      data-cp-anchor={`location:${i}`}
                      className={`transition-shadow rounded ${highlighted ? 'ring-2 ring-crimson ring-offset-2 ring-offset-parchment-soft' : ''}`}
                    >
                      <LocationCard data={l} onChange={(v: any) => {
                        const next = [...(get('locations', []) as any[])]; next[i] = v; setVal('locations', next);
                      }} onRemove={() => setVal('locations', (get('locations', []) as any[]).filter((_: any, j: number) => j !== i))} />
                    </div>
                  );
                })}
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => {
                    setVal('locations', [...(get('locations', []) as any[]), { name: '', type: '', aspects: ['', '', ''], factions: '' }]);
                    trackEvent('location_added', 'Added a new location');
                  }} className="text-xs text-brass-deep hover:text-crimson flex items-center gap-1 font-display uppercase tracking-wider">
                    <Plus size={12} /> Add Location
                  </button>
                  {SECTION_GENERATORS.locations.length > 0 && (() => {
                    const lastUsed = getLastUsed(state, 'locations');
                    if (!lastUsed) return null;
                    return (
                      <SummonButton
                        section="locations"
                        lastUsed={lastUsed}
                        options={SECTION_GENERATORS.locations}
                        onSummon={(meta) => setSummonState({ section: 'locations', generator: meta })}
                      />
                    );
                  })()}
                </div>
              </Section>
              <Section id="s6-npc" title="6 · Outline Important NPCs" methods={['shea', 'pr']} done={done['s6-npc']} onToggle={toggleDone} open={open['s6-npc']} onToggleOpen={toggleOpen}>
                <BookQuote source="PR ch. 3">Villains form goals in response to PC goals.</BookQuote>
                <TargetBar current={countFilled('npcs', get('npcs', []))} target={tgt('npcs')} source={TARGETS.npcs.source} />
                {(get('npcs', []) as any[]).map((n: any, i: number) => {
                  const entityId = n?.id ?? `npc-${i}`;
                  const highlighted = highlightEntityId === entityId;
                  return (
                    <div
                      key={i}
                      id={`entity-${entityId}`}
                      data-cp-anchor={`npc:${i}`}
                      className={`transition-shadow rounded ${highlighted ? 'ring-2 ring-crimson ring-offset-2 ring-offset-parchment-soft' : ''}`}
                    >
                      <NPCCard data={n} onChange={(v: any) => {
                        const next = [...(get('npcs', []) as any[])]; next[i] = v; setVal('npcs', next);
                      }} onRemove={() => setVal('npcs', (get('npcs', []) as any[]).filter((_: any, j: number) => j !== i))} />
                    </div>
                  );
                })}
                <InspireGroup>
                  <span className="text-[10px] text-ink-mute font-display uppercase tracking-wider">Add new NPC seeded by:</span>
                  <Inspire tableId="villainArchetypes" label="Villain" onPick={(e) => {
                    setVal('npcs', [...(get('npcs', []) as any[]), { name: '', type: 'Villain', faction: '', archetype: e, goal: '', method: '' }]);
                  }} />
                  <Inspire tableId="npcBackgroundConcepts" label="Background" onPick={(e) => {
                    setVal('npcs', [...(get('npcs', []) as any[]), { name: '', type: '', faction: '', archetype: e, goal: '', method: '' }]);
                  }} />
                  <Inspire tableId="raceCharacterNotes" label="Species" onPick={(e) => {
                    setVal('npcs', [...(get('npcs', []) as any[]), { name: '', type: '', faction: '', archetype: e, goal: '', method: '' }]);
                  }} />
                </InspireGroup>
                <p className="text-[10px] text-ink-mute italic font-serif -mt-1">
                  Trait inspirations (mannerism, talent, ideal, bond, etc.) live inside each NPC card under &quot;Show Details&quot;.
                </p>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => {
                    setVal('npcs', [...(get('npcs', []) as any[]), { name: '', type: '', faction: '', archetype: '', goal: '', method: '' }]);
                    trackEvent('npc_added', 'Added a new NPC');
                  }} className="text-xs text-brass-deep hover:text-crimson flex items-center gap-1 font-display uppercase tracking-wider">
                    <Plus size={12} /> Add NPC
                  </button>
                  {SECTION_GENERATORS.npcs.length > 0 && (() => {
                    const lastUsed = getLastUsed(state, 'npcs');
                    if (!lastUsed) return null;
                    return (
                      <SummonButton
                        section="npcs"
                        lastUsed={lastUsed}
                        options={SECTION_GENERATORS.npcs}
                        onSummon={(meta) => setSummonState({ section: 'npcs', generator: meta })}
                      />
                    );
                  })()}
                </div>
              </Section>
              <Section id="s7-mon" title="7 · Choose Relevant Monsters" methods={['shea']} done={done['s7-mon']} onToggle={toggleDone} open={open['s7-mon']} onToggleOpen={toggleOpen} icon={Swords}>
                <SoloNote>Solo level-1 ~8-12 HP. CR 1/8 one-at-a-time. Narrative outs always.</SoloNote>
                <ListField
                  items={get('monsters', [])}
                  onChange={(v) => setVal('monsters', v)}
                  placeholder="Monster — CR — use case"
                  target={tgt('monsters')}
                  rowIdFor={(i) => `monsters-${i}`}
                  highlightId={highlightEntityId}
                />
                {SECTION_GENERATORS.monsters.length > 0 && (() => {
                  const lastUsed = getLastUsed(state, 'monsters');
                  if (!lastUsed) return null;
                  return (
                    <div className="flex">
                      <SummonButton
                        section="monsters"
                        lastUsed={lastUsed}
                        options={SECTION_GENERATORS.monsters}
                        onSummon={(meta) => setSummonState({ section: 'monsters', generator: meta })}
                      />
                    </div>
                  );
                })()}
                <EncounterHelper
                  state={(get('__encounterCalc', { pcLevel: 1, monsters: [] })) as EncounterCalcState}
                  onChange={(s) => setVal('__encounterCalc', s)}
                />
              </Section>
              <Section id="s8-rew" title="8 · Select Magic Item Rewards" methods={['shea', 'pr']} done={done['s8-rew']} onToggle={toggleDone} open={open['s8-rew']} onToggleOpen={toggleOpen} icon={Gift}>
                <BookQuote source="PR ch. 6">Your +1 needs to be actionable.</BookQuote>
                <Example title="from PR">Sword from a stone. +1: right to rule Albion.</Example>
                <ListField
                  items={get('items', [])}
                  onChange={(v) => setVal('items', v)}
                  placeholder="Item · what +1 hook it delivers"
                  rows={2}
                  target={tgt('items')}
                  rowIdFor={(i) => `items-${i}`}
                  highlightId={highlightEntityId}
                />
                {SECTION_GENERATORS.magicItems.length > 0 && (() => {
                  const lastUsed = getLastUsed(state, 'magicItems');
                  if (!lastUsed) return null;
                  return (
                    <div className="flex">
                      <SummonButton
                        section="magicItems"
                        lastUsed={lastUsed}
                        options={SECTION_GENERATORS.magicItems}
                        onSummon={(meta) => setSummonState({ section: 'magicItems', generator: meta })}
                      />
                    </div>
                  );
                })()}
                <div className="pt-3 border-t border-rule/60">
                  <p className="text-xs text-brass-deep font-display uppercase tracking-wider mb-1.5">Treasure</p>
                  <p className="text-[11px] text-ink-mute italic font-serif mb-1.5">
                    Coins, gems, art, trinkets, and other rewards — generated entries land here.
                  </p>
                  <ListField
                    items={get('treasure', [])}
                    onChange={(v) => setVal('treasure', v)}
                    placeholder="Treasure item — coins · gem · art · trinket"
                    rows={2}
                    rowIdFor={(i) => `treasure-${i}`}
                    highlightId={highlightEntityId}
                  />
                </div>
              </Section>
            </Phase>
            )}

            {mode === 'plan' && subview === 'players' && state.player && (
              <PlayerModePanel
                campaignId={campaign.id}
                campaignName={name}
                data={state}
                config={state.player as PlayerConfig}
                onConfigChange={(cfg) => setVal('player', cfg)}
                confirm={confirmModal}
                playerLog={get('playerLog', []) as PlayerLogEntry[]}
                onPlayerLogChange={(entries) => setVal('playerLog', entries)}
              />
            )}

            {mode === 'plan' && subview === 'fronts' && (
            <>
            <Phase n="4" title="Between Sessions · Faction Clocks" sub="Update Faction Progress" methods={['ccd']} audience="solo" icon={Target} expanded={phaseOpen.p4} onToggle={() => togglePhase('p4')}>
              <BookQuote source="CCD ch. 6">Glance at faction clocks once per session.</BookQuote>
              <div className="rounded border border-rule bg-parchment-deep/40 p-3 text-sm font-serif">
                <p className="text-ink font-display uppercase tracking-wider text-xs mb-1.5">Clock Sizes</p>
                <div className="grid grid-cols-2 gap-1 text-ink-soft">
                  <p>4 — quick task</p><p>6 — short-term goal</p>
                  <p>8 — multi-session</p><p>12 — long project</p>
                  <p>16 — arc-defining</p>
                </div>
              </div>
              <div id="section-clocks" />
              <TargetBar current={countFilled('clocks', get('clocks', []))} target={tgt('clocks')} source={TARGETS.clocks.source} />
              {(get('clocks', []) as any[]).map((c: any, i: number) => (
                <ClockCard key={i} data={c} onChange={(v: any) => {
                  const next = [...(get('clocks', []) as any[])]; next[i] = v; setVal('clocks', next);
                  if ((c.filled || 0) !== (v.filled || 0)) {
                    trackEvent(
                      'faction_clock_ticked',
                      `${v.faction || c.faction || 'Faction'}: ${v.text || c.text || 'clock'} ${c.filled || 0} → ${v.filled || 0} / ${v.max || c.max || 6}`,
                      c.filled || 0, v.filled || 0,
                    );
                  }
                  if ((c.notes || '') !== (v.notes || '')) {
                    trackEvent(
                      'other',
                      `Updated notes on clock: ${v.faction || c.faction || 'Faction'} — ${v.text || c.text || 'clock'}`,
                    );
                  }
                }} onRemove={() => setVal('clocks', (get('clocks', []) as any[]).filter((_: any, j: number) => j !== i))} />
              ))}
              <button onClick={() => setVal('clocks', [...(get('clocks', []) as any[]), { text: '', faction: '', max: 6, filled: 0 }])} className="text-xs text-brass-deep hover:text-crimson flex items-center gap-1 font-display uppercase tracking-wider">
                <Plus size={12} /> Add Clock
              </button>
            </Phase>

            <Phase n="5" title="Mid-Campaign · Arc Planning" sub="Periodic Review (Every 5-10 Sessions)" methods={['ccd', 'pr']} audience="solo" icon={Layers} expanded={phaseOpen.p5} onToggle={() => togglePhase('p5')}>
              <Section id="audit-goals" title="PC Goal Audit" methods={['pr']} done={done['audit-goals']} onToggle={toggleDone} open={open['audit-goals']} onToggleOpen={toggleOpen}>
                <Field value={get('auditGoals', '')} onChange={(v) => setVal('auditGoals', v)} placeholder="Still active? Completed? Boring?" rows={5} />
              </Section>
              <Section id="audit-factions" title="Faction Audit" methods={['pr', 'ccd']} done={done['audit-factions']} onToggle={toggleDone} open={open['audit-factions']} onToggleOpen={toggleOpen}>
                <Field value={get('auditFactions', '')} onChange={(v) => setVal('auditFactions', v)} placeholder="..." rows={5} />
              </Section>
              <Section id="audit-secrets" title="Secrets Audit" methods={['shea']} done={done['audit-secrets']} onToggle={toggleDone} open={open['audit-secrets']} onToggleOpen={toggleOpen}>
                <Field value={get('auditSecrets', '')} onChange={(v) => setVal('auditSecrets', v)} placeholder="Which secrets never landed?" rows={4} />
              </Section>
            </Phase>

            <Phase n="6" title="Ending the Campaign" sub="When and How to Wrap" methods={['ccd']} audience="solo" icon={Trophy} expanded={phaseOpen.p6} onToggle={() => togglePhase('p6')}>
              <BookQuote source="CCD ch. 7">Players maintain desire to keep playing until natural conclusion.</BookQuote>
              <Section id="end-ready" title="Is the Campaign Ready to End?" methods={['ccd']} done={done['end-ready']} onToggle={toggleDone} open={open['end-ready']} onToggleOpen={toggleOpen}>
                <Field value={get('endReadiness', '')} onChange={(v) => setVal('endReadiness', v)} placeholder="Where are we?" rows={3} />
              </Section>
              <Section id="end-collect" title="Collect Every Thread" methods={['ccd']} done={done['end-collect']} onToggle={toggleDone} open={open['end-collect']} onToggleOpen={toggleOpen}>
                <Field value={get('endThreads', '')} onChange={(v) => setVal('endThreads', v)} placeholder="Active threads list" rows={6} />
                <InspireGroup>
                  <span className="text-[10px] text-ink-mute font-display uppercase tracking-wider">Inspire:</span>
                  <Inspire tableId="climaxes" label="Climax" onPick={(e) => {
                    const cur = get('endThreads', '') as string;
                    setVal('endThreads', cur ? `${cur}\n• ${e}` : `• ${e}`);
                  }} />
                  <Inspire tableId="campaignEvents" label="Event" onPick={(e) => {
                    const cur = get('endThreads', '') as string;
                    setVal('endThreads', cur ? `${cur}\n• ${e}` : `• ${e}`);
                  }} />
                </InspireGroup>
              </Section>
              <Section id="end-catalyst" title="Add Catalysts" methods={['ccd']} done={done['end-catalyst']} onToggle={toggleDone} open={open['end-catalyst']} onToggleOpen={toggleOpen}>
                <Field value={get('endCatalyst', '')} onChange={(v) => setVal('endCatalyst', v)} placeholder="Forcing events" rows={3} />
              </Section>
            </Phase>
            </>
            )}
          </div>

        {mode === 'plan' && subview === 'worldbuild' && (
          <div className="space-y-3 text-sm">
            <div className="rounded border border-rule bg-parchment p-4 shadow-card">
              <h2 className="font-display text-lg tracking-wide text-ink mb-2">The Three Methodologies</h2>
              <div className="space-y-3 text-sm text-ink-soft font-serif">
                <div>
                  <div className="flex items-center gap-2 mb-1"><Tag m="shea" /><span className="font-display tracking-wide text-ink">Return of the Lazy Dungeon Master</span> <span className="text-ink-mute italic">· Shea</span></div>
                  <p>8-step per-session checklist. Strong start, secrets & clues, fantastic locations.</p>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1"><Tag m="ccd" /><span className="font-display tracking-wide text-ink">Collaborative Campaign Design</span> <span className="text-ink-mute italic">· Fishel</span></div>
                  <p>Session −1 worldbuilding before character creation. Faction clocks.</p>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1"><Tag m="pr" /><span className="font-display tracking-wide text-ink">Proactive Roleplaying</span> <span className="text-ink-mute italic">· Fishel</span></div>
                  <p>5 Rules of Proactive Fun. "+1" reward principle.</p>
                </div>
              </div>
            </div>
            <div className="rounded border border-rule bg-parchment p-4 shadow-card">
              <h2 className="font-display text-lg tracking-wide text-ink mb-2">Five Rules of Proactive Fun</h2>
              <ol className="space-y-2 text-sm text-ink-soft font-serif list-decimal list-inside">
                <li><span className="font-semibold text-ink">Multiple Goals.</span> 3-4 concurrent.</li>
                <li><span className="font-semibold text-ink">Varying Timeframes.</span> Short / Mid / Long.</li>
                <li><span className="font-semibold text-ink">Achievable.</span> Measurable success state.</li>
                <li><span className="font-semibold text-ink">Consequences for Failure.</span> If retryable, it was a skill check.</li>
                <li><span className="font-semibold text-ink">Fun to Pursue.</span> GM can imagine obstacles.</li>
              </ol>
            </div>
            <div className="rounded border border-rule bg-parchment p-4 shadow-card">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h2 className="font-display text-lg tracking-wide text-ink">Campaign Events Between Sessions</h2>
                <Inspire tableId="campaignEvents" label="Roll Event" onPick={(e) => {
                  const log = (get('campaignEventLog', []) as string[]) || [];
                  setVal('campaignEventLog', [...log, e]);
                }} />
              </div>
              <p className="text-sm text-ink-soft font-serif mb-2">
                Quick &quot;while the party was away&quot; events for solo or sandbox play.
              </p>
              {((get('campaignEventLog', []) as string[]) || []).length === 0 ? (
                <p className="text-sm text-ink-mute italic font-serif">No events logged yet. Click &quot;Roll Event&quot; to add one.</p>
              ) : (
                <ol className="space-y-1 text-sm text-ink-soft font-serif">
                  {((get('campaignEventLog', []) as string[]) || []).map((evt, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="flex-1">
                        <span className="font-display text-xs text-brass-deep mr-1">{i + 1}.</span>
                        {evt}
                      </span>
                      <button
                        onClick={() => {
                          const log = (get('campaignEventLog', []) as string[]) || [];
                          setVal('campaignEventLog', log.filter((_, j) => j !== i));
                        }}
                        className="text-ink-mute hover:text-crimson"
                        title="Remove this event"
                      >
                        <X size={12} />
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <div className="rounded border border-rule bg-parchment p-4 shadow-card">
              <h2 className="font-display text-lg tracking-wide text-ink mb-2">The 10-Sentence NPC</h2>
              <p className="text-sm text-ink-soft font-serif">
                Detailed NPCs benefit from a roughly ten-sentence sketch: occupation and history,
                appearance, abilities, talent, mannerism, interactions, useful knowledge, ideal, bond,
                and flaw or secret. Click &quot;Show Details&quot; on any NPC card to expand the full set.
              </p>
            </div>
            <div className="rounded border border-wine/40 bg-wine/5 p-4 shadow-card">
              <h2 className="font-display text-lg tracking-wide text-ink mb-2 flex items-center gap-2"><User size={16} className="text-wine" /> Solo Play Adaptations</h2>
              <div className="text-sm text-ink-soft font-serif space-y-2">
                <p><span className="text-wine font-display uppercase tracking-wider text-xs">Session −1 · </span>2-person conversation.</p>
                <p><span className="text-wine font-display uppercase tracking-wider text-xs">Goals · </span>Rule 4 matters more.</p>
                <p><span className="text-wine font-display uppercase tracking-wider text-xs">Combat · </span>Solo level-1 ~8-12 HP. Narrative outs always.</p>
                <p><span className="text-wine font-display uppercase tracking-wider text-xs">Strong Start · </span>Action without losable fight.</p>
                <p><span className="text-wine font-display uppercase tracking-wider text-xs">Pacing · </span>2-3 scenes/hour instead of 1-2.</p>
              </div>
            </div>
          </div>
        )}

        {mode === 'plan' && subview === 'fronts' && (
          <div className="space-y-3 text-sm">
            <div className="rounded border border-rule bg-parchment p-3 shadow-card">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-display tracking-wide text-ink">Session Logs</h3>
                <button onClick={addSessionLog} className="text-xs text-brass-deep hover:text-crimson flex items-center gap-1 font-display uppercase tracking-wider">
                  <Plus size={12} /> New Session
                </button>
              </div>
              <div className="space-y-2">
                {sortedSessionLogs.length === 0 && sessionLogsV2.length === 0 && (
                  <p className="text-sm text-ink-mute italic font-serif">No sessions yet. Click "New Session" to start a log.</p>
                )}
                {sessionLogsV2.slice().reverse().map((log: any) => (
                  <div key={log.id} className="rounded border border-rule bg-parchment p-3 flex items-center justify-between">
                    <div>
                      <div className="font-display tracking-wide text-sm text-ink">
                        {log.title || `Session ${log.number}`}
                      </div>
                      <div className="text-[11px] text-ink-mute font-serif">
                        {log.date}
                      </div>
                    </div>
                    <button onClick={() => router.push(`/campaign/${campaign.id}/recap/${log.id}`)} className="text-xs text-brass-deep hover:text-crimson font-display uppercase tracking-wider flex items-center gap-1 bg-brass-deep/10 px-2 py-1 rounded">
                      View Recap <ArrowRight size={12} />
                    </button>
                  </div>
                ))}
                {sortedSessionLogs.map((log) => (
                  <div key={log.id} data-cp-anchor={`session:${log.id}`}>
                    <SessionLogCard
                      data={log}
                      open={!!openLogs[log.id]}
                      onToggleOpen={() => setOpenLogs(o => ({ ...o, [log.id]: !o[log.id] }))}
                      onChange={(v) => updateSessionLog(log.id, v)}
                      onRemove={() => removeSessionLog(log.id)}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded border border-rule bg-parchment p-3 shadow-card">
              <h3 className="font-display tracking-wide text-ink mb-2">Revealed Secrets</h3>
              <div className="space-y-1">
                {(get('secrets', []) as string[]).map((s: string, i: number) => (
                  <label key={i} className="flex items-start gap-2 text-sm cursor-pointer font-serif">
                    <input type="checkbox" checked={(get('revSec', {}) as Record<number, boolean>)[i] || false} onChange={(e) => {
                      const wasRevealed = !!(get('revSec', {}) as Record<number, boolean>)[i];
                      const r = { ...(get('revSec', {}) as Record<number, boolean>) }; r[i] = e.target.checked; setVal('revSec', r);
                      if (!wasRevealed && e.target.checked) trackEvent('secret_revealed', s);
                    }} className="mt-1 accent-crimson" />
                    <span className={((get('revSec', {}) as Record<number, boolean>)[i]) ? 'text-ink-mute line-through' : 'text-ink-soft'}>{s}</span>
                  </label>
                ))}
                {(get('secrets', []) as string[]).length === 0 && <p className="text-sm text-ink-mute italic font-serif">Add secrets in Phase 3 step 4.</p>}
              </div>
            </div>
            <div className="rounded border border-rule bg-parchment p-3 shadow-card">
              <h3 className="font-display tracking-wide text-ink mb-2">Goal Progress</h3>
              <div className="space-y-2">
                {(get('pcGoals', []) as any[]).map((g: any, i: number) => (
                  <div key={i} className="rounded border border-rule bg-parchment-soft p-2.5 text-sm font-serif">
                    <p className="text-ink-soft">{g.text}</p>
                    <div className="flex gap-1 mt-1.5">
                      {['Active', 'Progressed', 'Completed', 'Failed'].map(s => (
                        <button key={s} onClick={() => {
                          const from = g.status || 'Active';
                          if (from === s) return;
                          const next = [...(get('pcGoals', []) as any[])];
                          next[i] = { ...g, status: s };
                          setVal('pcGoals', next);
                          trackEvent('goal_status', `${g.text || `Goal ${i + 1}`}: ${from} → ${s}`, from, s);
                        }} className={`text-[10px] px-2 py-0.5 rounded-sm border font-display uppercase tracking-wider ${g.status === s ? 'bg-crimson border-crimson text-parchment' : 'border-rule text-ink-mute'}`}>{s}</button>
                      ))}
                    </div>
                  </div>
                ))}
                {(get('pcGoals', []) as any[]).length === 0 && <p className="text-sm text-ink-mute italic font-serif">Add goals in Phase 2.</p>}
              </div>
            </div>
            <div className="rounded border border-rule bg-parchment p-3 shadow-card">
              <h3 className="font-display tracking-wide text-ink mb-2">Dropped Threads</h3>
              <ListField items={get('dropped', [])} onChange={(v) => setVal('dropped', v)} placeholder="A thread to follow up" />
            </div>
          </div>
        )}

        {mode === 'plan' && subview === 'worldbuild' && (() => {
          const downtime = (get('downtime', []) as DowntimeEntry[]) || [];
          const active = downtime.filter(e => !e.archived);
          const archived = downtime.filter(e => !!e.archived);
          const [archivedOpen, setArchivedOpen] = [(get('__archivedDowntimeOpen', false) as boolean), (v: boolean) => setVal('__archivedDowntimeOpen', v)];

          const addEntry = (typeId: string) => {
            const next: DowntimeEntry = {
              id: makeDowntimeId(),
              type: typeId,
              fields: {},
              createdAt: new Date().toISOString(),
            };
            setVal('downtime', [...downtime, next]);
            const label = DOWNTIME_TYPES.find(t => t.id === typeId)?.label || typeId;
            trackEvent('downtime_added', `Started downtime: ${label}`);
          };
          const updateEntry = (id: string, patch: DowntimeEntry) => {
            setVal('downtime', downtime.map(e => e.id === id ? patch : e));
          };
          const setArchived = (id: string, archived: boolean) => {
            setVal('downtime', downtime.map(e => e.id === id ? { ...e, archived } : e));
          };
          const removeEntry = (id: string) => {
            const entry = downtime.find(e => e.id === id);
            const typeLabel = DOWNTIME_TYPES.find(t => t.id === entry?.type)?.label || 'entry';
            setVal('downtime', downtime.filter(e => e.id !== id));
            showUndoToast(`Deleted "${typeLabel}" — Press ⌘Z to undo`, 5000);
          };

          const groupedActive = DOWNTIME_TYPES
            .map(t => ({ type: t, entries: active.filter(e => e.type === t.id) }))
            .filter(g => g.entries.length > 0);

          return (
            <div className="space-y-3 text-sm">
              <div className="rounded border border-rule bg-parchment p-4 shadow-card">
                <p className="text-ink-soft font-serif">
                  Downtime activities take place between adventures. Each activity has a cost, a duration,
                  and consequences. Track them here so the time between sessions feels lived-in rather than skipped.
                </p>
              </div>

              <div className="rounded border border-rule bg-parchment p-3 shadow-card flex items-center gap-2 flex-wrap">
                <label className="text-xs text-ink-soft font-display uppercase tracking-wider">Add Downtime Activity</label>
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      addEntry(e.target.value);
                      e.target.value = '';
                    }
                  }}
                  className="bg-parchment-soft border border-rule rounded px-2 py-1 text-sm text-ink font-serif"
                >
                  <option value="">— Choose Activity —</option>
                  {DOWNTIME_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>

              {active.length === 0 && (
                <p className="text-sm text-ink-mute italic font-serif">No active downtime activities yet.</p>
              )}

              {groupedActive.map(({ type, entries }) => (
                <div key={type.id} className="space-y-2">
                  <h3 className="font-display tracking-wide text-ink text-sm">{type.label}</h3>
                  {entries.map(entry => (
                    <DowntimeCard
                      key={entry.id}
                      entry={entry}
                      onChange={(v) => updateEntry(entry.id, v)}
                      onArchive={() => setArchived(entry.id, true)}
                      onUnarchive={() => setArchived(entry.id, false)}
                      onRemove={() => removeEntry(entry.id)}
                    />
                  ))}
                </div>
              ))}

              <div className="rounded border border-rule bg-parchment p-3 shadow-card">
                <button
                  onClick={() => setArchivedOpen(!archivedOpen)}
                  className="flex items-center gap-1.5 font-display tracking-wide text-ink text-sm hover:text-crimson"
                >
                  {archivedOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  Archived ({archived.length})
                </button>
                {archivedOpen && (
                  <div className="space-y-2 mt-3">
                    {archived.length === 0 && (
                      <p className="text-sm text-ink-mute italic font-serif">No archived downtime activities yet.</p>
                    )}
                    {archived.map(entry => (
                      <DowntimeCard
                        key={entry.id}
                        entry={entry}
                        onChange={(v) => updateEntry(entry.id, v)}
                        onArchive={() => setArchived(entry.id, true)}
                        onUnarchive={() => setArchived(entry.id, false)}
                        onRemove={() => removeEntry(entry.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {mode === 'prep' && subview === 'wizard' && (() => {
          const runs = (get('prepWizardRuns', []) as PrepWizardRun[]) || [];
          const sortedRuns = [...runs].sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
          const launch = () => {
            setVal('__prepWizardOpen', true);
            setVal('__prepWizardStep', 1);
          };
          const sessionOpen = !!get('__activeSessionId', '');
          return (
            <div className="space-y-3">
              <div className="rounded border border-rule bg-parchment p-4 shadow-card">
                <h2 className="font-display text-lg tracking-wide text-ink mb-1">Prep Wizard</h2>
                <p className="text-sm text-ink-soft font-serif mb-3">
                  An 8-step guided walkthrough of Lazy DM's per-session prep — Review, Strong
                  Start, Scenes, Secrets, Locations, NPCs, Monsters, Magic Items.
                </p>
                <button
                  type="button"
                  onClick={launch}
                  disabled={sessionOpen}
                  title={sessionOpen ? 'Finish your current session first' : 'Walk through the 8-step prep'}
                  className="text-xs px-3 py-1.5 rounded border border-moss/60 bg-moss/10 text-moss hover:bg-moss hover:text-parchment font-display uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ClipboardList size={12} /> Start Wizard
                </button>
              </div>
              <div className="rounded border border-rule bg-parchment p-4 shadow-card">
                <h3 className="font-display tracking-wide text-ink mb-2 text-sm">Past Runs</h3>
                {sortedRuns.length === 0 ? (
                  <p className="text-xs text-ink-mute italic font-serif">No wizard runs yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {sortedRuns.slice(0, 8).map(r => (
                      <li key={r.id} className="text-xs font-serif text-ink-soft flex items-center gap-2">
                        <span className="text-[10px] text-brass-deep font-display uppercase tracking-wider w-16">
                          {(r.stepsCompleted || []).length}/8
                        </span>
                        <span className="flex-1">
                          Session {r.forSessionNumber}
                          {r.completedAt && <span className="text-ink-mute italic ml-2">{new Date(r.completedAt).toLocaleDateString()}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          );
        })()}

        {mode === 'run' && subview === 'session' && (
          <RunSessionInline
            get={get}
            setVal={setVal}
            setState={setState}
            characters={characters}
            campaignContext={generatorCampaignContext}
            nextUp={nextUp}
            jumpToNextUp={jumpToNextUp}
            trackEvent={trackEvent}
            navigateTo={navigateTo}
            onEndSession={handleEndSession}
          />
        )}

        {mode === 'run' && subview === 'lookup' && (() => {
          const playerConfig = (get('player', {}) as any) || {};
          const roster = playerConfig.roster || [];
          return <LookupView
            npcs={get('npcs', []) as any[]}
            locations={get('locations', []) as any[]}
            secrets={get('secrets', []) as string[]}
            factions={get('factions', []) as any[]}
            magicItems={get('items', []) as any[]}
            revealedSecrets={get('revSec', {}) as Record<number, boolean>}
            roster={roster}
          />;
        })()}

        {mode === 'run' && subview === 'log' && (
          <SessionLogTab
            entries={(get('sessionLogV2', []) as SessionLogEntry[])}
            onChange={(v) => setVal('sessionLogV2', v)}
            campaignId={campaign.id}
            campaignSecrets={get('secrets', []) as string[]}
            campaignScenes={get('scenes', []) as string[]}
          />
        )}

        {mode === 'run' && subview === 'dice' && (
          <DiceRoller
            macros={get('macros', []) as Macro[]}
            onMacrosChange={(v) => setVal('macros', v)}
            logEntries={logEntriesFor('dice')}
            onLogEntriesChange={setLogEntriesFor('dice')}
          />
        )}

        {mode === 'run' && subview === 'spells' && (
          <SpellsTab
            favorites={get('spellFavs', []) as string[]}
            onFavoritesChange={(v) => setVal('spellFavs', v)}
            homebrewSpells={get('homebrewSpells', []) as Spell[]}
            onHomebrewSpellsChange={(v) => setVal('homebrewSpells', v)}
          />
        )}

        {mode === 'library' && subview === 'generators' && (
          <GeneratorsTab
            logs={generatorLogs}
            onLogsChange={(next) => setVal('generatorLogs', next)}
            campaignContext={generatorCampaignContext}
            onAddToCampaign={addToCampaignFor}
            disabledDestsByKind={generatorDisabledDests}
            renderNames={() => (isPro ? (
              <NamesTab
                logEntries={logEntriesFor('names')}
                onLogEntriesChange={setLogEntriesFor('names')}
                onAddToCampaign={addToCampaignFor('names')}
              />
            ) : (
              <LockedPanel title="Names Generator">
                Generate culture-rooted first and last names for NPCs, towns, and places — powered by Claude.
              </LockedPanel>
            ))}
            renderLocations={() => (isPro ? (
              <LocationsTab
                logEntries={logEntriesFor('locations')}
                onLogEntriesChange={setLogEntriesFor('locations')}
                onAddToCampaign={addToCampaignFor('locations')}
              />
            ) : (
              <LockedPanel title="Locations Generator">
                Generate evocative location names with type tag, cultural tradition, and a one-line atmospheric blurb. Powered by Claude.
              </LockedPanel>
            ))}
          />
        )}

        {mode === 'library' && subview === 'monsters' && (
          <MonstersTab
            characters={characters}
            homebrewMonsters={get('homebrewMonsters', []) as HomebrewMonster[]}
            onHomebrewMonstersChange={(v) => {
              const prev = (get('homebrewMonsters', []) as HomebrewMonster[]);
              setVal('homebrewMonsters', v);
              if (v.length > prev.length) {
                const added = v[v.length - 1];
                trackEvent('monster_added', `Added monster: ${added?.name || 'unnamed'}`);
              }
            }}
            rollLogEntries={logEntriesFor('monster-roll')}
            onRollLogEntriesChange={setLogEntriesFor('monster-roll')}
            scaleLogEntries={logEntriesFor('monster-scale')}
            onScaleLogEntriesChange={setLogEntriesFor('monster-scale')}
            onAddRollToCampaign={addToCampaignFor('monster-roll')}
            onAddScaleToCampaign={addToCampaignFor('monster-scale')}
          />
        )}

        {mode === 'library' && subview === 'vivify' && (isPro ? (
          <VivifyPanel
            data={state}
            history={(get('vivifyHistory', []) as VivifyHistoryEntry[])}
            onHistoryChange={(h) => setVal('vivifyHistory', h)}
          />
        ) : (
          <LockedPanel title="Vivify">
            Generate vivid, campaign-aware descriptions — places, NPCs, scene openings, rumors,
            aftermath, magic items, foreshadowing — powered by Claude. Streams in real time and
            saves the generations you want to keep.
          </LockedPanel>
        ))}

        {mode === 'library' && subview === 'traps' && (
          <TrapBuilder
            traps={(get('traps', []) as Trap[])}
            onChange={(traps) => setVal('traps', traps)}
          />
        )}

        {mode === 'run' && subview === 'dmref' && <DMRefTab />}

        {mode === 'run' && subview === 'chase' && (
          <ChaseTracker
            chases={(get('chases', []) as Chase[])}
            onChange={(chases) => setVal('chases', chases)}
          />
        )}

        {mode === 'library' && subview === 'pointbuy' && (
          <ToolsTab
            characters={characters}
            onChangeCharacter={updateCharacter}
          />
        )}

        {mode === 'library' && subview === 'hazards' && (
          <HazardCalculator />
        )}

        {mode === 'library' && subview === 'logistics' && (
          <LogisticsTab
            characters={characters}
            state={(get('logistics', emptyLogistics()) as LogisticsState)}
            onChange={(s) => setVal('logistics', s)}
          />
        )}

        {mode === 'library' && subview === 'web' && (
          <NPCRelationshipWeb
            npcs={get('npcs', []) as any[]}
            characters={characters}
            graph={(get('relationshipGraph', emptyGraph()) as RelationshipGraphState)}
            onChange={(g) => setVal('relationshipGraph', g)}
          />
        )}

        {mode === 'library' && subview === 'factions' && (
          <FactionEngineTab
            campaignId={campaign.id}
            world={(get('factionWorld', emptyWorld()) as FactionWorld)}
            onChange={(w) => setVal('factionWorld', w)}
          />
        )}
        </div>

        <footer className="pt-3 mt-4 border-t border-rule text-xs text-ink-mute italic font-serif text-center">
          {userEmail}
          {isPro && (
            <span className="not-italic ml-1.5 px-1.5 py-0.5 rounded-sm border border-crimson/60 bg-crimson/10 text-crimson font-display uppercase tracking-wider text-[10px]">
              Pro
            </span>
          )}
          {' · auto-syncs to Firestore every 1.5s'}
        </footer>
        </div>
      </div>

      {get('__runSessionOpen', false) && !get('__initiativeOpen', false) && (
        <button
          onClick={() => setVal('__initiativeOpen', true)}
          className="fixed bottom-[88px] right-4 z-20 flex items-center gap-1.5 px-3 py-2 rounded-full border border-crimson/60 bg-parchment shadow-page text-crimson hover:bg-crimson hover:text-parchment font-display uppercase tracking-wider text-xs"
          title="Open initiative tracker"
        >
          <Swords size={14} /> Initiative
        </button>
      )}

      {get('__runSessionOpen', false) && get('__initiativeOpen', false) && (
        <InitiativePanel
          state={(get('__initiative', null) as InitiativeState | null)}
          onChange={(next) => setVal('__initiative', next)}
          monsters={get('homebrewMonsters', []) as HomebrewMonster[]}
          pcs={characters}
          onClose={() => setVal('__initiativeOpen', false)}
        />
      )}

      {/* finalizerModal removed */}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        items={paletteItems}
      />

      <KeyboardShortcuts open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <PrepTargetsModal
        open={prepTargetsOpen}
        initialOverrides={prepTargetOverrides}
        onClose={() => setPrepTargetsOpen(false)}
        onSave={(next) => setVal(OVERRIDES_STATE_KEY, next)}
      />

      <button
        type="button"
        onClick={() => setShortcutsOpen(true)}
        title="Keyboard shortcuts (press ?)"
        aria-label="Keyboard shortcuts"
        className={`fixed left-4 z-30 w-8 h-8 rounded-full border border-rule bg-parchment-soft text-brass-deep hover:bg-brass hover:text-parchment shadow-page font-display text-sm leading-none flex items-center justify-center transition-all ${
          get('__runSessionOpen', false) ? 'bottom-[88px]' : 'bottom-4'
        }`}
      >
        ?
      </button>

      <SyncPill />

      {undoToast && (
        <div
          role="status"
          className={`fixed left-16 z-40 px-3 py-1.5 rounded-full shadow-page border border-brass-deep/70 bg-parchment text-brass-deep text-xs font-display uppercase tracking-wider flex items-center gap-2 gm-toast transition-all ${
            get('__runSessionOpen', false) ? 'bottom-[88px]' : 'bottom-4'
          }`}
        >
          {undoToast}
        </div>
      )}

      {summonToast && (
        <button
          type="button"
          onClick={() => {
            scrollToEntity(summonToast.primaryEntityId);
            flashHighlight(summonToast.primaryEntityId);
          }}
          className={`fixed left-1/2 -translate-x-1/2 z-40 px-3 py-1.5 rounded-full shadow-page border border-brass-deep/70 bg-parchment text-brass-deep text-xs font-display uppercase tracking-wider flex items-center gap-2 hover:bg-brass hover:text-parchment transition-all ${
            get('__runSessionOpen', false) ? 'bottom-[88px]' : 'bottom-4'
          }`}
          title="Click to re-scroll"
        >
          <Check size={12} /> {summonToast.text}
        </button>
      )}

      {summonState && (
        <SummonModal
          section={summonState.section}
          generator={summonState.generator}
          isPro={isPro}
          onClose={() => setSummonState(null)}
          onSave={(action) =>
            onSummonSave(summonState.section, summonState.generator, action)
          }
          campaignContext={generatorCampaignContext}
          logs={generatorLogs}
          setLogEntries={setLogEntriesFor}
        />
      )}
    </main>
  );
}
