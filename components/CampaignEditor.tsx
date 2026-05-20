'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { updateCampaign, deleteCampaign as deleteCampaignDoc, type Campaign } from '@/lib/firebase/campaigns';
import { getFirebaseAuth } from '@/lib/firebase/client';
import {
  ChevronDown, ChevronRight, Check, Plus, X, Quote,
  User, Users, Map, Swords, Gift, Layers, Calendar, Target, Trophy,
  Download, Upload, ScrollText, Trash2, ArrowLeft, Cloud, CloudOff,
  FileUp, Sparkles,
} from 'lucide-react';
import { TABLES, sampleTable } from '@/lib/inspirationTables';
import { CR_TO_XP, encounterMultiplier, difficultyForSolo } from '@/lib/encounterMath';
import DiceRoller, { type Macro } from './DiceRoller';
import SpellsTab, { type Spell } from './SpellsTab';
import DMRefTab from './DMRefTab';
import CharacterCard from './CharacterCard';
import SidekickAddPanel from './SidekickAddPanel';
import NamesTab from './NamesTab';
import LocationsTab from './LocationsTab';
import MonstersTab, { type HomebrewMonster } from './MonstersTab';
import GeneratorsTab from './generators/GeneratorsTab';
import VivifyPanel, { type VivifyHistoryEntry } from './VivifyPanel';
import type { GeneratorLogs, LogEntry, LogKind } from '@/lib/generators/log';
import { AccountMenu } from './AccountMenu';
import { LockedInline, LockedPanel } from './LockedFeature';
import {
  type Character,
  emptyCharacter,
  makeCharacterId,
  normalizeCharacter,
} from '@/lib/character-schema';

const M = {
  shea: { label: 'Lazy DM', color: 'border-moss/40 bg-moss/5 text-moss' },
  ccd: { label: 'CCD', color: 'border-brass/40 bg-brass/5 text-brass-deep' },
  pr: { label: 'Proactive', color: 'border-wine/40 bg-wine/5 text-wine' },
};

// Prep item targets — book-grounded with solo adaptations
// Keys match section ids / state keys used throughout the editor
const TARGETS: Record<string, { standard: number; solo: number; label: string; source: string }> = {
  // CCD ch. 1 — Givens
  gWorld:    { standard: 10, solo: 5,  label: 'World Facts',         source: 'CCD ch. 1' },
  gFNL:      { standard: 5,  solo: 3,  label: 'Required Entities',   source: 'CCD ch. 1' },
  lines:     { standard: 3,  solo: 3,  label: 'Content Lines',       source: 'Safety tools' },

  // CCD ch. 2 — Session −1
  facts:     { standard: 15, solo: 8,  label: 'Setting Facts',       source: 'CCD ch. 2' },
  factions:  { standard: 4,  solo: 3,  label: 'Factions',            source: 'CCD ch. 2 (3-4 min)' },
  conflicts: { standard: 3,  solo: 2,  label: 'Active Conflicts',    source: 'CCD ch. 2' },

  // Proactive Roleplaying ch. 1
  pcGoals:   { standard: 3,  solo: 3,  label: 'PC Goals',            source: 'PR ch. 1 (3 concurrent)' },

  // Lazy DM ch. 4-8 — per-session
  scenes:    { standard: 5,  solo: 4,  label: 'Potential Scenes',    source: 'Lazy DM ch. 4 (1-2/hr)' },
  secrets:   { standard: 10, solo: 8,  label: 'Secrets & Clues',     source: 'Lazy DM ch. 6 (shoot for 10)' },
  locations: { standard: 4,  solo: 3,  label: 'Fantastic Locations', source: 'Lazy DM ch. 7 (1-2/hr)' },
  npcs:      { standard: 4,  solo: 3,  label: 'Important NPCs',      source: 'Lazy DM ch. 8' },
  monsters:  { standard: 4,  solo: 3,  label: 'Relevant Monsters',   source: 'Lazy DM ch. 9' },
  items:     { standard: 2,  solo: 2,  label: 'Magic Item Rewards',  source: 'Lazy DM ch. 10' },

  // CCD ch. 6 — Faction tracking
  clocks:    { standard: 4,  solo: 3,  label: 'Active Faction Clocks', source: 'CCD ch. 6' },
};

function getTarget(key: string, soloMode: boolean): number {
  const t = TARGETS[key];
  if (!t) return 0;
  return soloMode ? t.solo : t.standard;
}

const Tag = ({ m }: { m: keyof typeof M }) => (
  <span className={`text-[10px] px-1.5 py-0.5 rounded-sm border font-display uppercase tracking-wider ${M[m].color}`}>{M[m].label}</span>
);

const Flourish = () => (
  <div className="flourish my-2"><span>❦</span></div>
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
}: {
  items: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  rows?: number;
  target?: number;
}) => {
  const update = (i: number, v: string) => { const next = [...items]; next[i] = v; onChange(next); };
  const add = () => onChange([...items, '']);
  const remove = (i: number) => onChange(items.filter((_, j) => j !== i));
  const remaining = Math.max(0, target - items.length);

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex gap-2 items-center">
          <span className="text-brass-deep font-display text-xs w-5 text-right">{i + 1}.</span>
          <div className="flex-1"><Field value={item} onChange={(v) => update(i, v)} placeholder={placeholder} rows={rows} /></div>
          <button onClick={() => remove(i)} className="text-ink-mute hover:text-crimson px-1"><X size={14} /></button>
        </div>
      ))}
      {Array.from({ length: remaining }).map((_, i) => (
        <div key={`ghost-${i}`} className="flex gap-2 items-center opacity-50">
          <span className="text-ink-faint font-display text-xs w-5 text-right">{items.length + i + 1}.</span>
          <div className="flex-1 border-b border-dashed border-rule px-1 py-1 text-xs text-ink-faint italic font-serif">
            {placeholder}…
          </div>
          <div className="px-1 w-6" />
        </div>
      ))}
      <button onClick={add} className="ml-7 text-xs text-brass-deep hover:text-crimson flex items-center gap-1 font-display uppercase tracking-wider">
        <Plus size={12} /> Add
      </button>
    </div>
  );
};

const Section = ({ id, title, methods, children, done, onToggle, open, onToggleOpen, icon: Icon }: any) => (
  <div className={`rounded border ${done ? 'border-brass/60 bg-brass/5' : 'border-rule bg-parchment-soft'} shadow-card`}>
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
    {open && <div className="px-2.5 sm:px-3 pb-3 border-t border-rule pt-3 space-y-3">{children}</div>}
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
        <button onClick={onRemove} className="text-ink-mute hover:text-crimson"><X size={14} /></button>
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
      <button onClick={onRemove} className="text-ink-mute hover:text-crimson"><X size={14} /></button>
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
  { min: 50, label: 'Legend' },
  { min: 25, label: 'Honored' },
  { min: 10, label: 'Established' },
  { min: 3,  label: 'Trusted' },
  { min: 1,  label: 'Initiate' },
  { min: 0,  label: 'Unknown' },
];

function renownRank(value: number, custom?: string[]): string {
  if (custom && custom.length === 6) {
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
  return 'Unknown';
}

const Phase = ({ n, title, sub, methods, children, expanded, onToggle, icon: Icon }: any) => (
  <div className="border border-rule rounded-lg overflow-hidden bg-parchment-soft shadow-page">
    <button onClick={onToggle} className="w-full flex items-center gap-2.5 sm:gap-4 p-3 sm:p-4 hover:bg-parchment-deep/30 text-left transition-colors">
      <div className="font-display text-3xl sm:text-4xl text-crimson w-8 sm:w-12 leading-none flex-shrink-0">{n}</div>
      {Icon && <Icon size={20} className="text-brass-deep flex-shrink-0 hidden sm:block" />}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-display text-base sm:text-lg tracking-wide text-ink">{title}</span>
          <span className="flex flex-wrap gap-1">{methods?.map((m: any) => <Tag key={m} m={m} />)}</span>
        </div>
        <div className="text-xs sm:text-sm text-ink-soft italic font-serif mt-0.5">{sub}</div>
      </div>
      {expanded ? <ChevronDown size={18} className="text-brass-deep flex-shrink-0" /> : <ChevronRight size={18} className="text-brass-deep flex-shrink-0" />}
    </button>
    {expanded && <div className="p-3 pt-3 space-y-2 border-t border-rule bg-parchment/40">{children}</div>}
  </div>
);

export default function CampaignEditor({ campaign, userEmail, isPro = false }: { campaign: Campaign; userEmail: string; isPro?: boolean }) {
  const router = useRouter();
  const [name, setName] = useState(campaign.name);
  const [initialMigration] = useState(() => migrateSessionLogs(campaign.data || {}));
  const [state, setState] = useState<Record<string, any>>(() => migrateCharacters(initialMigration.initialState));
  const [done, setDone] = useState<Record<string, boolean>>(campaign.done || {});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [openLogs, setOpenLogs] = useState<Record<string, boolean>>(
    initialMigration.initialOpenId ? { [initialMigration.initialOpenId]: true } : {}
  );
  const [openChars, setOpenChars] = useState<Record<string, boolean>>({});
  const [phaseOpen, setPhaseOpen] = useState<Record<string, boolean>>({ p0: true });
  const [tab, setTab] = useState<'prep' | 'ref' | 'track' | 'down' | 'dice' | 'spells' | 'generators' | 'names' | 'locations' | 'monsters' | 'vivify' | 'dmref'>('prep');
  const [soloMode, setSoloMode] = useState<boolean>(campaign.data?.__soloMode ?? true);
  const [syncState, setSyncState] = useState<'synced' | 'pending' | 'saving' | 'error'>('synced');
  const [syncError, setSyncError] = useState<string>('');
  const [uploadingChar, setUploadingChar] = useState(false);
  const [charUploadError, setCharUploadError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const characterFileInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initialLoadRef = useRef(true);

  const saveToDB = useCallback(async (payload: { name: string; data: Record<string, any>; done: Record<string, boolean> }) => {
    setSyncState('saving');
    try {
      await updateCampaign(campaign.id, payload);
      setSyncState('synced');
      setSyncError('');
    } catch (err: any) {
      setSyncState('error');
      setSyncError(err?.message || 'Unknown error');
    }
  }, [campaign.id]);

  useEffect(() => {
    if (initialLoadRef.current) { initialLoadRef.current = false; return; }
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSyncState('pending');
    saveTimeoutRef.current = setTimeout(() => { saveToDB({ name, data: { ...state, __soloMode: soloMode }, done }); }, 1500);
    return () => { if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current); };
  }, [name, state, done, soloMode, saveToDB]);

  const get = (k: string, fb: any) => state[k] !== undefined ? state[k] : fb;
  const setVal = (k: string, v: any) => setState(s => ({ ...s, [k]: v }));
  const toggleDone = (id: string) => setDone(d => ({ ...d, [id]: !d[id] }));
  const toggleOpen = (id: string) => setOpen(o => ({ ...o, [id]: !o[id] }));
  const togglePhase = (id: string) => setPhaseOpen(p => ({ ...p, [id]: !p[id] }));

  const generatorLogs = (state.generatorLogs as GeneratorLogs) || {};
  const logEntriesFor = (kind: LogKind): LogEntry[] => generatorLogs[kind] ?? [];
  const setLogEntriesFor = (kind: LogKind) => (next: LogEntry[]) => {
    setVal('generatorLogs', { ...generatorLogs, [kind]: next });
  };

  const completedCount = Object.values(done).filter(Boolean).length;

  const sessionLogs = (state.sessionLogs as SessionLog[]) || [];
  const sortedSessionLogs = [...sessionLogs].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
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
    if (log && (log.body || '').trim() && !confirm(`Delete "${log.title || 'this session log'}"? This cannot be undone.`)) return;
    setVal('sessionLogs', sessionLogs.filter(l => l.id !== id));
    setOpenLogs(o => { const next = { ...o }; delete next[id]; return next; });
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
    const label = c?.name || 'this character';
    if (!confirm(`Delete "${label}"? This cannot be undone.`)) return;
    setVal('characters', characters.filter(x => x.id !== id));
    setOpenChars(o => { const next = { ...o }; delete next[id]; return next; });
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
  };

  const importJSON = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (data._format !== 'campaign_prep_v1') return;
        if (data.campaignName) setName(data.campaignName);
        setState(data.state || {});
        setDone(data.done || {});
      } catch {}
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await deleteCampaignDoc(campaign.id);
      router.push('/campaign');
    } catch (err: any) {
      alert(`Delete failed: ${err?.message || err}`);
    }
  };

  const SyncIndicator = () => {
    if (syncState === 'saving') return <span className="text-xs text-ink-soft flex items-center gap-1 font-display uppercase tracking-wider"><Cloud size={12} className="animate-pulse" /> Saving…</span>;
    if (syncState === 'pending') return <span className="text-xs text-ink-mute flex items-center gap-1 font-display uppercase tracking-wider"><Cloud size={12} /> Pending</span>;
    if (syncState === 'error') return <span className="text-xs text-crimson flex items-center gap-1 font-display uppercase tracking-wider" title={syncError}><CloudOff size={12} /> Save Failed</span>;
    return <span className="text-xs text-brass-deep flex items-center gap-1 font-display uppercase tracking-wider"><Cloud size={12} /> Saved</span>;
  };

  const ToolBtn = ({ onClick, children, danger = false }: { onClick: () => void; children: React.ReactNode; danger?: boolean }) => (
    <button onClick={onClick} className={`text-xs px-3 py-1 rounded border font-display uppercase tracking-wider flex items-center gap-1.5 transition-colors ${
      danger
        ? 'border-crimson/50 text-crimson hover:bg-crimson hover:text-parchment'
        : 'border-brass-deep/50 text-brass-deep hover:bg-brass hover:text-parchment hover:border-brass'
    }`}>
      {children}
    </button>
  );

  return (
    <main className="min-h-screen p-3 sm:p-5 md:p-8">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row md:items-start gap-3 md:gap-4">
        <aside className="md:w-44 md:flex-shrink-0 md:sticky md:top-3">
          <nav
            role="tablist"
            aria-label="Campaign sections"
            className="flex md:flex-col border border-rule rounded font-display uppercase tracking-wider text-xs bg-parchment-soft overflow-x-auto md:overflow-x-visible"
          >
            {([
              ['prep', 'Prep Flow'],
              ['ref', 'Reference'],
              ['track', 'Tracking'],
              ['down', 'Downtime'],
              ['dice', 'Dice'],
              ['spells', 'Spells'],
              ['generators', 'Generators'],
              ['names', 'Names'],
              ['locations', 'Locations'],
              ['monsters', 'Monsters'],
              ['vivify', 'Vivify'],
              ['dmref', 'DM Ref'],
            ] as const).map(([id, label], i) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                className={`px-3 py-2 text-left whitespace-nowrap transition-colors ${
                  i > 0 ? 'border-l md:border-l-0 md:border-t border-rule' : ''
                } ${
                  tab === id
                    ? 'bg-crimson text-parchment'
                    : 'text-ink-soft hover:bg-parchment-deep'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </aside>
        <div className="flex-1 min-w-0 bg-parchment-soft border border-rule rounded-lg shadow-page p-3 sm:p-5 md:p-8 space-y-4">
          <header className="pb-4 border-b border-rule">
            <div className="flex items-center justify-between gap-2 mb-3">
              <Link href="/campaign" className="text-xs text-brass-deep hover:text-crimson font-display uppercase tracking-wider flex items-center gap-1">
                <ArrowLeft size={12} /> All Campaigns
              </Link>
              <div className="flex items-center gap-2">
                <SyncIndicator />
                <AccountMenu />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <ScrollText size={20} className="text-crimson flex-shrink-0" />
              <textarea rows={1} value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign Name"
                className="flex-1 min-w-0 bg-transparent border-b border-rule font-display text-xl sm:text-2xl tracking-wide text-ink placeholder:text-ink-faint focus:border-crimson focus:outline-none pb-1 resize-none whitespace-pre-wrap break-words [field-sizing:content]" />
            </div>
            <p className="text-sm text-ink-soft italic font-serif mt-1.5">Lazy DM · Collaborative Campaign Design · Proactive Roleplaying</p>

            <Flourish />

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 justify-between">
              <div className="flex flex-wrap items-center gap-1.5">
                <ToolBtn onClick={exportJSON}><Download size={12} /> Export</ToolBtn>
                <ToolBtn onClick={() => fileInputRef.current?.click()}><Upload size={12} /> Import</ToolBtn>
                <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={importJSON} className="hidden" />
                <ToolBtn onClick={handleDelete} danger><Trash2 size={12} /> Delete</ToolBtn>
              </div>
              <div
                role="group"
                aria-label="Prep target mode"
                title="Switch prep item targets between solo and group scale"
                className="inline-flex rounded border border-rule overflow-hidden text-xs font-display uppercase tracking-wider"
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
            </div>

            <div className="mt-3 flex justify-end">
              <div className="text-xs text-brass-deep font-display uppercase tracking-wider">
                {completedCount} Steps Done
              </div>
            </div>
          </header>

        {tab === 'prep' && (
          <div className="space-y-3">
            <Phase n="0" title="Givens & Pitch" sub="Decide What's Non-Negotiable" methods={['ccd']} icon={Layers} expanded={phaseOpen.p0} onToggle={() => togglePhase('p0')}>
              <BookQuote source="CCD ch. 1">Givens are a set of things your group agrees will feature regardless of how worldbuilding ends up.</BookQuote>
              <Section id="g-world" title="World Facts" methods={['ccd']} done={done['g-world']} onToggle={toggleDone} open={open['g-world']} onToggleOpen={toggleOpen}>
                <Example title="from CCD">"Post-apocalyptic." "The sun has gone out." "Magic has died."</Example>
                <ListField items={get('gWorld', [])} onChange={(v) => setVal('gWorld', v)} placeholder="A world fact" target={getTarget('gWorld', soloMode)} />
              </Section>
              <Section id="g-fnl" title="Required Factions, NPCs & Locations" methods={['ccd']} done={done['g-fnl']} onToggle={toggleDone} open={open['g-fnl']} onToggleOpen={toggleOpen}>
                <ListField items={get('gFNL', [])} onChange={(v) => setVal('gFNL', v)} placeholder="A specific entity" target={getTarget('gFNL', soloMode)} />
              </Section>
              <Section id="g-mech" title="Mechanics & System" methods={['ccd']} done={done['g-mech']} onToggle={toggleDone} open={open['g-mech']} onToggleOpen={toggleOpen}>
                <Field value={get('system', '')} onChange={(v) => setVal('system', v)} placeholder="System (e.g. 5e)" />
                <CardLabel>Tone Keywords</CardLabel>
                <ListField items={get('tone', [])} onChange={(v) => setVal('tone', v)} placeholder="A tone word" />
              </Section>
              <Section id="g-lines" title="Content Lines (Hard Nos)" methods={['ccd']} done={done['g-lines']} onToggle={toggleDone} open={open['g-lines']} onToggleOpen={toggleOpen}>
                <ListField items={get('lines', [])} onChange={(v) => setVal('lines', v)} placeholder="A topic to avoid" target={getTarget('lines', soloMode)} />
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

            <Phase n="1" title="Session −1" sub="Collaborative Worldbuilding" methods={['ccd', 'pr']} icon={Users} expanded={phaseOpen.p1} onToggle={() => togglePhase('p1')}>
              <BookQuote source="CCD ch. 2">Session −1 is a long creative session in which the group brings ideas to define a setting.</BookQuote>
              <SoloNote>With one player, this becomes a 2-person conversation. Take turns. Hold back on conflict-stage so player gets first authority.</SoloNote>
              <Section id="genre" title="Genre Statement" methods={['ccd']} done={done.genre} onToggle={toggleDone} open={open.genre} onToggleOpen={toggleOpen}>
                <Example title="format">[tone] [genre] in [setting] where [tension]</Example>
                <Field value={get('genre', '')} onChange={(v) => setVal('genre', v)} placeholder="One sentence" rows={2} />
              </Section>
              <Section id="facts" title="Setting Facts" methods={['ccd']} done={done.facts} onToggle={toggleDone} open={open.facts} onToggleOpen={toggleOpen}>
                <Pitfall>Don't pre-load all the secrets. Players still need new ones to discover.</Pitfall>
                <ListField items={get('facts', [])} onChange={(v) => setVal('facts', v)} placeholder="A fact about the world" rows={2} target={getTarget('facts', soloMode)} />
              </Section>
              <Section id="factions" title="Factions" methods={['pr', 'ccd']} done={done.factions} onToggle={toggleDone} open={open.factions} onToggleOpen={toggleOpen} icon={Users}>
                <BookQuote source="PR ch. 2">Think of factions, not individual NPCs, as the GM-controlled counterparts of the party.</BookQuote>
                <Pitfall>Factions whose goals don't overlap with PC goals are just colour.</Pitfall>
                <TargetBar current={(get('factions', []) as any[]).length} target={getTarget('factions', soloMode)} source={TARGETS.factions.source} />
                {(get('factions', []) as any[]).map((f: any, i: number) => (
                  <FactionCard key={i} data={f} onChange={(v: any) => {
                    const next = [...(get('factions', []) as any[])]; next[i] = v; setVal('factions', next);
                  }} onRemove={() => setVal('factions', (get('factions', []) as any[]).filter((_: any, j: number) => j !== i))} />
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
                <ListField items={get('conflicts', [])} onChange={(v) => setVal('conflicts', v)} placeholder="Faction A vs Faction B over X" rows={2} target={getTarget('conflicts', soloMode)} />
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

            <Phase n="2" title="Session 0 — Characters & Goals" sub="PCs Created After the World Exists" methods={['pr', 'shea']} icon={User} expanded={phaseOpen.p2} onToggle={() => togglePhase('p2')}>
              <SoloNote>Solo Session 0 is fast. Spend the saved time on goal craft.</SoloNote>
              <Section id="pc" title="Player Characters" methods={['shea']} done={done.pc} onToggle={toggleDone} open={open.pc} onToggleOpen={toggleOpen}>
                <BookQuote source="Lazy DM (Chris Perkins)">Nothing's more important to a campaign than the stories of the player characters.</BookQuote>
                <div className="space-y-2">
                  {characters.map((c) => (
                    <CharacterCard
                      key={c.id}
                      data={c}
                      open={!!openChars[c.id]}
                      soloMode={soloMode}
                      onToggleOpen={() => setOpenChars(o => ({ ...o, [c.id]: !o[c.id] }))}
                      onChange={(v) => updateCharacter(c.id, v)}
                      onRemove={() => removeCharacter(c.id)}
                    />
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
                <TargetBar current={(get('pcGoals', []) as any[]).length} target={getTarget('pcGoals', soloMode)} source={TARGETS.pcGoals.source} />
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

            <Phase n="3" title="Per-Session Prep" sub="Lazy DM 8-Step Checklist" methods={['shea']} icon={Calendar} expanded={phaseOpen.p3} onToggle={() => togglePhase('p3')}>
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
                </InspireGroup>
              </Section>
              <Section id="s3-scenes" title="3 · Outline Potential Scenes" methods={['shea']} done={done['s3-scenes']} onToggle={toggleDone} open={open['s3-scenes']} onToggleOpen={toggleOpen}>
                <BookQuote source="Lazy DM (Perkins)">Be prepared to throw what you have away.</BookQuote>
                <ListField items={get('scenes', [])} onChange={(v) => setVal('scenes', v)} placeholder="A scene" target={getTarget('scenes', soloMode)} />
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
                <ListField items={get('secrets', [])} onChange={(v) => setVal('secrets', v)} placeholder="A single-sentence secret" rows={2} target={getTarget('secrets', soloMode)} />
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
                <TargetBar current={(get('locations', []) as any[]).length} target={getTarget('locations', soloMode)} source={TARGETS.locations.source} />
                {(get('locations', []) as any[]).map((l: any, i: number) => (
                  <LocationCard key={i} data={l} onChange={(v: any) => {
                    const next = [...(get('locations', []) as any[])]; next[i] = v; setVal('locations', next);
                  }} onRemove={() => setVal('locations', (get('locations', []) as any[]).filter((_: any, j: number) => j !== i))} />
                ))}
                <button onClick={() => setVal('locations', [...(get('locations', []) as any[]), { name: '', type: '', aspects: ['', '', ''], factions: '' }])} className="text-xs text-brass-deep hover:text-crimson flex items-center gap-1 font-display uppercase tracking-wider">
                  <Plus size={12} /> Add Location
                </button>
              </Section>
              <Section id="s6-npc" title="6 · Outline Important NPCs" methods={['shea', 'pr']} done={done['s6-npc']} onToggle={toggleDone} open={open['s6-npc']} onToggleOpen={toggleOpen}>
                <BookQuote source="PR ch. 3">Villains form goals in response to PC goals.</BookQuote>
                <TargetBar current={(get('npcs', []) as any[]).length} target={getTarget('npcs', soloMode)} source={TARGETS.npcs.source} />
                {(get('npcs', []) as any[]).map((n: any, i: number) => (
                  <NPCCard key={i} data={n} onChange={(v: any) => {
                    const next = [...(get('npcs', []) as any[])]; next[i] = v; setVal('npcs', next);
                  }} onRemove={() => setVal('npcs', (get('npcs', []) as any[]).filter((_: any, j: number) => j !== i))} />
                ))}
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
                <button onClick={() => setVal('npcs', [...(get('npcs', []) as any[]), { name: '', type: '', faction: '', archetype: '', goal: '', method: '' }])} className="text-xs text-brass-deep hover:text-crimson flex items-center gap-1 font-display uppercase tracking-wider">
                  <Plus size={12} /> Add NPC
                </button>
              </Section>
              <Section id="s7-mon" title="7 · Choose Relevant Monsters" methods={['shea']} done={done['s7-mon']} onToggle={toggleDone} open={open['s7-mon']} onToggleOpen={toggleOpen} icon={Swords}>
                <SoloNote>Solo level-1 ~8-12 HP. CR 1/8 one-at-a-time. Narrative outs always.</SoloNote>
                <ListField items={get('monsters', [])} onChange={(v) => setVal('monsters', v)} placeholder="Monster — CR — use case" target={getTarget('monsters', soloMode)} />
                <EncounterHelper
                  state={(get('__encounterCalc', { pcLevel: 1, monsters: [] })) as EncounterCalcState}
                  onChange={(s) => setVal('__encounterCalc', s)}
                />
              </Section>
              <Section id="s8-rew" title="8 · Select Magic Item Rewards" methods={['shea', 'pr']} done={done['s8-rew']} onToggle={toggleDone} open={open['s8-rew']} onToggleOpen={toggleOpen} icon={Gift}>
                <BookQuote source="PR ch. 6">Your +1 needs to be actionable.</BookQuote>
                <Example title="from PR">Sword from a stone. +1: right to rule Albion.</Example>
                <ListField items={get('items', [])} onChange={(v) => setVal('items', v)} placeholder="Item · what +1 hook it delivers" rows={2} target={getTarget('items', soloMode)} />
              </Section>
            </Phase>

            <Phase n="4" title="Between Sessions · Faction Clocks" sub="Update Faction Progress" methods={['ccd']} icon={Target} expanded={phaseOpen.p4} onToggle={() => togglePhase('p4')}>
              <BookQuote source="CCD ch. 6">Glance at faction clocks once per session.</BookQuote>
              <div className="rounded border border-rule bg-parchment-deep/40 p-3 text-sm font-serif">
                <p className="text-ink font-display uppercase tracking-wider text-xs mb-1.5">Clock Sizes</p>
                <div className="grid grid-cols-2 gap-1 text-ink-soft">
                  <p>4 — quick task</p><p>6 — short-term goal</p>
                  <p>8 — multi-session</p><p>12 — long project</p>
                  <p>16 — arc-defining</p>
                </div>
              </div>
              <TargetBar current={(get('clocks', []) as any[]).length} target={getTarget('clocks', soloMode)} source={TARGETS.clocks.source} />
              {(get('clocks', []) as any[]).map((c: any, i: number) => (
                <ClockCard key={i} data={c} onChange={(v: any) => {
                  const next = [...(get('clocks', []) as any[])]; next[i] = v; setVal('clocks', next);
                }} onRemove={() => setVal('clocks', (get('clocks', []) as any[]).filter((_: any, j: number) => j !== i))} />
              ))}
              <button onClick={() => setVal('clocks', [...(get('clocks', []) as any[]), { text: '', faction: '', max: 6, filled: 0 }])} className="text-xs text-brass-deep hover:text-crimson flex items-center gap-1 font-display uppercase tracking-wider">
                <Plus size={12} /> Add Clock
              </button>
            </Phase>

            <Phase n="5" title="Mid-Campaign · Arc Planning" sub="Periodic Review (Every 5-10 Sessions)" methods={['ccd', 'pr']} icon={Layers} expanded={phaseOpen.p5} onToggle={() => togglePhase('p5')}>
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

            <Phase n="6" title="Ending the Campaign" sub="When and How to Wrap" methods={['ccd']} icon={Trophy} expanded={phaseOpen.p6} onToggle={() => togglePhase('p6')}>
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
          </div>
        )}

        {tab === 'ref' && (
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

        {tab === 'track' && (
          <div className="space-y-3 text-sm">
            <div className="rounded border border-rule bg-parchment p-3 shadow-card">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-display tracking-wide text-ink">Session Logs</h3>
                <button onClick={addSessionLog} className="text-xs text-brass-deep hover:text-crimson flex items-center gap-1 font-display uppercase tracking-wider">
                  <Plus size={12} /> New Session
                </button>
              </div>
              <div className="space-y-2">
                {sortedSessionLogs.length === 0 && (
                  <p className="text-sm text-ink-mute italic font-serif">No sessions yet. Click "New Session" to start a log.</p>
                )}
                {sortedSessionLogs.map((log) => (
                  <SessionLogCard
                    key={log.id}
                    data={log}
                    open={!!openLogs[log.id]}
                    onToggleOpen={() => setOpenLogs(o => ({ ...o, [log.id]: !o[log.id] }))}
                    onChange={(v) => updateSessionLog(log.id, v)}
                    onRemove={() => removeSessionLog(log.id)}
                  />
                ))}
              </div>
            </div>
            <div className="rounded border border-rule bg-parchment p-3 shadow-card">
              <h3 className="font-display tracking-wide text-ink mb-2">Revealed Secrets</h3>
              <div className="space-y-1">
                {(get('secrets', []) as string[]).map((s: string, i: number) => (
                  <label key={i} className="flex items-start gap-2 text-sm cursor-pointer font-serif">
                    <input type="checkbox" checked={(get('revSec', {}) as Record<number, boolean>)[i] || false} onChange={(e) => {
                      const r = { ...(get('revSec', {}) as Record<number, boolean>) }; r[i] = e.target.checked; setVal('revSec', r);
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
                          const next = [...(get('pcGoals', []) as any[])];
                          next[i] = { ...g, status: s };
                          setVal('pcGoals', next);
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

        {tab === 'down' && (() => {
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
          };
          const updateEntry = (id: string, patch: DowntimeEntry) => {
            setVal('downtime', downtime.map(e => e.id === id ? patch : e));
          };
          const setArchived = (id: string, archived: boolean) => {
            setVal('downtime', downtime.map(e => e.id === id ? { ...e, archived } : e));
          };
          const removeEntry = (id: string) => {
            const entry = downtime.find(e => e.id === id);
            const typeLabel = DOWNTIME_TYPES.find(t => t.id === entry?.type)?.label || 'this entry';
            if (!confirm(`Delete "${typeLabel}"? This cannot be undone.`)) return;
            setVal('downtime', downtime.filter(e => e.id !== id));
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

        {tab === 'dice' && (
          <DiceRoller
            macros={get('macros', []) as Macro[]}
            onMacrosChange={(v) => setVal('macros', v)}
            logEntries={logEntriesFor('dice')}
            onLogEntriesChange={setLogEntriesFor('dice')}
          />
        )}

        {tab === 'spells' && (
          <SpellsTab
            favorites={get('spellFavs', []) as string[]}
            onFavoritesChange={(v) => setVal('spellFavs', v)}
            homebrewSpells={get('homebrewSpells', []) as Spell[]}
            onHomebrewSpellsChange={(v) => setVal('homebrewSpells', v)}
          />
        )}

        {tab === 'generators' && (
          <GeneratorsTab
            logs={generatorLogs}
            onLogsChange={(next) => setVal('generatorLogs', next)}
            renderNames={() => (isPro ? (
              <NamesTab
                logEntries={logEntriesFor('names')}
                onLogEntriesChange={setLogEntriesFor('names')}
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
              />
            ) : (
              <LockedPanel title="Locations Generator">
                Generate evocative location names with type tag, cultural tradition, and a one-line atmospheric blurb. Powered by Claude.
              </LockedPanel>
            ))}
          />
        )}

        {tab === 'names' && (isPro ? (
          <NamesTab
            logEntries={logEntriesFor('names')}
            onLogEntriesChange={setLogEntriesFor('names')}
          />
        ) : (
          <LockedPanel title="Names Generator">
            Generate culture-rooted first and last names for NPCs, towns, and places — powered by Claude.
            Mix Western European with Drow, batch fifty at a time, or roll a single random one.
          </LockedPanel>
        ))}

        {tab === 'locations' && (isPro ? (
          <LocationsTab
            logEntries={logEntriesFor('locations')}
            onLogEntriesChange={setLogEntriesFor('locations')}
          />
        ) : (
          <LockedPanel title="Locations Generator">
            Generate evocative location names with type tag, cultural tradition, and a one-line
            atmospheric blurb — across settlements, wilderness, sites, and planar realms. Powered by Claude.
          </LockedPanel>
        ))}

        {tab === 'monsters' && (
          <MonstersTab
            characters={characters}
            homebrewMonsters={get('homebrewMonsters', []) as HomebrewMonster[]}
            onHomebrewMonstersChange={(v) => setVal('homebrewMonsters', v)}
            rollLogEntries={logEntriesFor('monster-roll')}
            onRollLogEntriesChange={setLogEntriesFor('monster-roll')}
            scaleLogEntries={logEntriesFor('monster-scale')}
            onScaleLogEntriesChange={setLogEntriesFor('monster-scale')}
          />
        )}

        {tab === 'vivify' && (isPro ? (
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

        {tab === 'dmref' && <DMRefTab />}

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
    </main>
  );
}
