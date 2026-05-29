'use client';

// Presentational primitives and prep "card" components extracted verbatim from
// CampaignEditor. These are closure-free (module-scope) building blocks — they
// receive everything via props and hold no campaign state — so they live here
// to keep CampaignEditor focused on orchestration.

import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { CampaignPlayModeContext } from '../CampaignPlayModeContext';
import { User, X, Sparkles, Plus, Check, ChevronDown, ChevronRight, Eye, EyeOff } from 'lucide-react';
import { TABLES, sampleTable } from '@/lib/inspirationTables';
import RelationshipsSection from '@/components/wiki/RelationshipsSection';

export const M = {
  shea: { label: 'Lazy DM', color: 'border-moss/40 bg-moss/5 text-moss' },
  ccd: { label: 'CCD', color: 'border-brass/40 bg-brass/5 text-brass-deep' },
  pr: { label: 'Proactive', color: 'border-wine/40 bg-wine/5 text-wine' },
};

// Mode + subview navigation. The shape of MODES, the legacy migration map,
// and the helpers all live in lib/modes.ts so other surfaces (palette,
// future deep-links) share a single source of truth.

// Prep item targets — see lib/prepTargets.ts for the single source of truth
// (shared with the pre-session PrepWizard).

export const Tag = ({ m }: { m: keyof typeof M }) => (
  <span className={`rounded-sm border px-1.5 py-0.5 font-display text-[10px] uppercase tracking-wider ${M[m].color}`}>{M[m].label}</span>
);

export const BookQuote = ({ source, children }: { source: string; children: React.ReactNode }) => (
  <blockquote className="rounded-r border-l-2 border-crimson/70 bg-parchment-soft/60 px-3 py-2 text-sm">
    <div className="font-serif italic leading-relaxed text-ink-soft">{children}</div>
    <div className="mt-1 font-display text-xs uppercase tracking-wider text-brass-deep">— {source}</div>
  </blockquote>
);

export const ModeAdaptationHint = ({ mode, children }: { mode: 'solo' | 'duet'; children: React.ReactNode }) => {
  const isSolo = mode === 'solo';
  const colorClass = isSolo
    ? 'border-pink-500/30 bg-pink-950/5 text-ink'
    : 'border-teal-500/30 bg-teal-950/5 text-ink';
  const textClass = isSolo ? 'text-pink-500' : 'text-teal-500';
  const label = isSolo ? 'Solo Adaptation' : 'Duet Adaptation';
  const Icon = isSolo ? Sparkles : User;

  return (
    <div className={`flex items-start gap-2.5 rounded border p-2.5 text-xs leading-relaxed ${colorClass}`}>
      <Icon size={14} className={`${textClass} mt-0.5 flex-shrink-0`} />
      <div className="font-serif text-ink-soft">
        <span className={`font-display text-[10px] font-semibold uppercase tracking-wider ${textClass}`}>
          {label} ·{' '}
        </span>
        {children}
      </div>
    </div>
  );
};

export const SoloNote = ({ children }: { children: React.ReactNode }) => {
  const playMode = useContext(CampaignPlayModeContext);
  if (playMode === 'standard') return null;
  if (playMode === 'solo' || playMode === 'duet') {
    return <ModeAdaptationHint mode={playMode}>{children}</ModeAdaptationHint>;
  }
  return null;
};

export const Pitfall = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-start gap-2 rounded border border-crimson/40 bg-crimson/5 p-2.5 text-sm">
    <X size={13} className="mt-0.5 flex-shrink-0 text-crimson" />
    <div className="font-serif text-ink-soft"><span className="font-display text-xs uppercase tracking-wider text-crimson">Common Pitfall · </span>{children}</div>
  </div>
);

export const Inspire = ({
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
        aria-label={`Inspire from ${table.title}`}
      >
        <Sparkles size={11} /> {label}
      </button>
      {open && coords && (
        <div
          ref={popupRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width, zIndex: 50 }}
          className="space-y-1.5 rounded border border-brass-deep/70 bg-parchment p-2 shadow-xl"
        >
          <div className="flex items-center justify-between border-b border-rule px-1 pb-1 text-[10px] text-ink-mute">
            <span className="font-display uppercase tracking-wider text-brass-deep">{table.title}</span>
            <div className="flex gap-2">
              <button onClick={reroll} className="font-display uppercase tracking-wider text-crimson hover:text-wine">Reroll</button>
              <button onClick={() => setOpen(false)} className="font-display uppercase tracking-wider text-ink-mute hover:text-ink">Close</button>
            </div>
          </div>
          {picks.map((entry, i) => (
            <button
              key={i}
              onClick={() => { onPick(entry); setOpen(false); }}
              className="block w-full rounded px-2 py-1.5 text-left font-serif text-xs text-ink-soft hover:bg-parchment-deep hover:text-ink"
            >
              {entry}
            </button>
          ))}
          <div className="px-1 pt-1 text-[9px] italic text-ink-mute">{table.attribution}</div>
        </div>
      )}
    </div>
  );
};

export const InspireGroup = ({ children }: { children: React.ReactNode }) => (
  <div className="flex flex-wrap items-center gap-1.5">{children}</div>
);

export const TargetBar = ({ current, target, source }: { current: number; target: number; source?: string }) => {
  if (target === 0) return null;
  const pct = Math.min(100, (current / target) * 100);
  const complete = current >= target;
  return (
    <div className="space-y-1" title={source}>
      <div className="flex items-center justify-between font-serif text-xs">
        <span className={complete ? 'font-semibold text-brass-deep' : 'text-ink-soft'}>
          {current} of {target}
        </span>
        {source && <span className="italic text-ink-mute">{source}</span>}
      </div>
      <div className="h-1.5 overflow-hidden rounded-sm border border-rule bg-parchment-deep">
        <div
          className={`h-full transition-all ${complete ? 'bg-brass' : 'bg-brass/50'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

export const Example = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded border border-rule bg-parchment-deep/40 p-2.5 text-sm">
    <p className="mb-1 font-display text-xs uppercase tracking-wider text-brass-deep">Example — {title}</p>
    <div className="font-serif italic leading-relaxed text-ink-soft">{children}</div>
  </div>
);

export const Field = ({ value, onChange, placeholder, rows = 1 }: { value: string; onChange: (v: string) => void; placeholder: string; rows?: number }) => (
  <textarea value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows}
    className="w-full resize-none whitespace-pre-wrap break-words border-b border-rule bg-transparent p-1 font-serif text-sm text-ink [field-sizing:content] placeholder:italic placeholder:text-ink-faint focus:border-crimson focus:outline-none" />
);

export const ListField = ({
  items = [],
  onChange,
  placeholder,
  rows = 1,
  target = 0,
  rowIdFor,
  highlightId,
  isShared,
  onToggleShare,
}: {
  items: (string | any)[];
  onChange: (v: any[]) => void;
  placeholder: string;
  rows?: number;
  target?: number;
  rowIdFor?: (i: number) => string;
  highlightId?: string | null;
  isShared?: (i: number) => boolean;
  onToggleShare?: (i: number) => void;
}) => {
  const playMode = useContext(CampaignPlayModeContext);
  const getStringValue = (item: any): string => {
    if (typeof item === 'string') return item;
    if (!item) return '';
    const name = item.name || '';
    const desc = item.description || '';
    return desc ? `${name} — ${desc}` : name;
  };

  const update = (i: number, v: string) => {
    const next = [...items];
    const current = next[i];
    if (current && typeof current === 'object') {
      const parts = v.split(' — ');
      next[i] = {
        ...current,
        name: parts[0] || '',
        description: parts.slice(1).join(' — ') || ''
      };
    } else {
      next[i] = v;
    }
    onChange(next);
  };
  const add = () => onChange([...items, '']);
  const remove = (i: number) => onChange(items.filter((_, j) => j !== i));
  // Count only authored rows toward the target — empty rows are scaffolding,
  // not progress.
  const filled = items.filter(s => getStringValue(s).trim().length > 0).length;
  const remaining = Math.max(0, target - filled);

  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const rid = rowIdFor ? rowIdFor(i) : undefined;
        const highlighted = !!rid && highlightId === rid;
        const valStr = getStringValue(item);
        const hasContent = valStr.trim().length > 0;
        const shared = hasContent && isShared && onToggleShare ? isShared(i) : false;
        return (
          <div
            key={i}
            id={rid ? `entity-${rid}` : undefined}
            className={`flex items-center gap-2 rounded transition-shadow ${
              highlighted ? 'ring-2 ring-crimson ring-offset-2 ring-offset-parchment-soft' : ''
            } ${
              shared ? 'border border-moss/10 bg-moss/5 px-1 py-0.5' : ''
            }`}
          >
            <span className="w-5 text-right font-display text-xs text-brass-deep">{i + 1}.</span>
            <div className="flex-1"><Field value={valStr} onChange={(v) => update(i, v)} placeholder={placeholder} rows={rows} /></div>
            {playMode !== 'solo' && onToggleShare && isShared && hasContent && (
              <button
                type="button"
                onClick={() => onToggleShare(i)}
                aria-label={shared ? 'Hide from players' : 'Share with players'}
                className={`p-1 transition-colors ${
                  shared ? 'text-moss hover:bg-moss/10' : 'text-ink-mute hover:bg-brass/10 hover:text-brass-deep'
                }`}
                title={shared ? 'Shared with Players (Click to hide)' : 'Share with Players'}
              >
                {shared ? <Eye size={12} /> : <EyeOff size={12} />}
              </button>
            )}
            <button onClick={() => remove(i)} aria-label="Remove item" className="px-1 text-ink-mute hover:text-crimson"><X size={14} /></button>
          </div>
        );
      })}
      {target > 0 && filled < target && (
        <div className="ml-7 font-serif text-[11px] italic text-ink-mute">
          {remaining} more to reach target
          {filled === 0 && (
            <span className="text-ink-faint"> (target: {target})</span>
          )}
        </div>
      )}
      <button onClick={add} className="ml-7 flex items-center gap-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:text-crimson">
        <Plus size={12} /> Add
      </button>
    </div>
  );
};

export const Section = ({ id, title, methods, children, done, onToggle, open, onToggleOpen, icon: Icon }: any) => (
  <div id={`section-${id}`} data-cp-anchor={`section:${id}`} className={`rounded border ${done ? 'border-brass/60 bg-brass/5' : 'border-rule bg-parchment-soft'} shadow-card`}>
    <div className="flex items-center gap-2 p-2.5 sm:p-3">
      <button
        onClick={() => onToggle(id)}
        aria-label={done ? 'Mark step uncompleted' : 'Mark step completed'}
        aria-pressed={done}
        className={`flex size-4 flex-shrink-0 items-center justify-center rounded-sm border ${done ? 'border-brass-deep bg-brass text-parchment' : 'border-ink-mute bg-parchment'}`}
        title={done ? "Mark step uncompleted" : "Mark step completed"}
      >
        {done && <Check size={10} strokeWidth={3} />}
      </button>
      <button onClick={() => onToggleOpen(id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
        {Icon && <Icon size={14} className="flex-shrink-0 text-brass-deep" />}
        <span className="min-w-0 flex-1 font-display text-sm tracking-wide text-ink">{title}</span>
        <span className="hidden flex-shrink-0 gap-1 sm:flex">{methods?.map((m: any) => <Tag key={m} m={m} />)}</span>
        <span className="flex-shrink-0 text-ink-mute">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
      </button>
    </div>
    <div className={`gm-collapse ${open ? 'gm-collapse-open' : ''}`}>
      <div className="gm-collapse-content">
        <div className="space-y-3 border-t border-rule px-2.5 py-3 sm:px-3">
          {children}
        </div>
      </div>
    </div>
  </div>
);

export const CardLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-0.5 font-display text-xs uppercase tracking-wider text-brass-deep">{children}</div>
);

export const GoalCard = ({ data, onChange, onRemove }: any) => {
  const playMode = useContext(CampaignPlayModeContext);
  return (
    <div className="space-y-2.5 rounded border border-rule bg-parchment p-3 shadow-card">
      <div className="flex justify-between gap-2">
        <Field value={data.text} onChange={(v) => onChange({ ...data, text: v })} placeholder="Goal Statement" rows={2} />
        <div className="flex flex-shrink-0 items-center gap-2">
          {playMode !== 'solo' && (
            <button
              type="button"
              onClick={() => onChange({ ...data, isPublic: !data.isPublic })}
              aria-label={data.isPublic ? 'Hide from players' : 'Share with players'}
              aria-pressed={!!data.isPublic}
              className={`flex items-center gap-1 rounded border px-2 py-0.5 font-display text-[10px] uppercase tracking-wider transition-colors ${
                data.isPublic
                  ? 'border-moss bg-moss text-parchment hover:bg-moss/90'
                  : 'border-ink-mute text-ink-mute hover:bg-parchment-deep hover:text-ink'
              }`}
              title={data.isPublic ? 'Shared with Players (Public)' : 'Hidden from Players (Private)'}
            >
              {data.isPublic ? <Eye size={10} /> : <EyeOff size={10} />}
              {data.isPublic ? 'Shared' : 'Private'}
            </button>
          )}
          <button onClick={onRemove} aria-label="Remove" className="text-ink-mute hover:text-crimson"><X size={14} /></button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {[['short', 'Short-Term'], ['mid', 'Mid-Term'], ['long', 'Long-Term']].map(([t, label]) => (
          <button key={t} onClick={() => onChange({ ...data, timeframe: t })} className={`rounded border py-1 font-display text-xs uppercase tracking-wider ${data.timeframe === t ? 'border-wine bg-wine/10 text-wine' : 'border-rule text-ink-mute'}`}>{label}</button>
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
};

export const NPCFieldRow = ({
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
    <div className="mb-0.5 flex items-center justify-between gap-2">
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

export const NPCCard = ({ data, onChange, onRemove, defaultDetailsOpen = false }: any) => {
  const playMode = useContext(CampaignPlayModeContext);
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
    <div className="space-y-2.5 rounded border border-rule bg-parchment p-3 shadow-card">
      <div className="flex justify-between gap-2">
        <Field value={data.name} onChange={(v) => onChange({ ...data, name: v })} placeholder="NPC Name" />
        <div className="flex flex-shrink-0 items-center gap-2">
          {playMode !== 'solo' && (
            <button
              type="button"
              onClick={() => onChange({ ...data, isPublic: !data.isPublic })}
              className={`flex items-center gap-1 rounded border px-2 py-0.5 font-display text-[10px] uppercase tracking-wider transition-colors ${
                data.isPublic
                  ? 'border-moss bg-moss text-parchment hover:bg-moss/90'
                  : 'border-ink-mute text-ink-mute hover:bg-parchment-deep hover:text-ink'
              }`}
              title={data.isPublic ? 'Shared with Players (Public)' : 'Hidden from Players (Private)'}
            >
              {data.isPublic ? <Eye size={10} /> : <EyeOff size={10} />}
              {data.isPublic ? 'Shared' : 'Private'}
            </button>
          )}
          <button onClick={onRemove} aria-label="Remove" className="text-ink-mute hover:text-crimson"><X size={14} /></button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div><CardLabel>Type</CardLabel>
          <select value={data.type || ''} onChange={(e) => onChange({ ...data, type: e.target.value })} className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-sm text-ink">
            <option value="">— Choose —</option>
            <option>Ally</option><option>Villain</option><option>Patron</option><option>Rival</option><option>Neutral / Colour</option>
          </select></div>
        <div><CardLabel>Faction</CardLabel>
          <Field value={data.faction} onChange={(v) => onChange({ ...data, faction: v })} placeholder="..." /></div>
      </div>
      <div>
        <div className="mb-0.5 flex flex-wrap items-center justify-between gap-2">
          <CardLabel>Archetype</CardLabel>
          <div className="flex flex-wrap gap-1">
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
        className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:text-crimson"
      >
        {showDetails ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {showDetails ? 'Hide Details' : 'Show Details'}
      </button>
      {showDetails && (
        <div className="space-y-2 border-t border-rule pt-1">
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
      <RelationshipsSection entityType="npc" entityId={data.id} entityName={data.name} />
    </div>
  );
};

export const LocationCard = ({ data, onChange, onRemove }: any) => {
  const playMode = useContext(CampaignPlayModeContext);
  return (
    <div className="space-y-2.5 rounded border border-rule bg-parchment p-3 shadow-card">
      <div className="flex justify-between gap-2">
        <Field value={data.name} onChange={(v) => onChange({ ...data, name: v })} placeholder="Evocative Name" />
        <div className="flex flex-shrink-0 items-center gap-2">
          {playMode !== 'solo' && (
            <button
              type="button"
              onClick={() => onChange({ ...data, isPublic: !data.isPublic })}
              className={`flex items-center gap-1 rounded border px-2 py-0.5 font-display text-[10px] uppercase tracking-wider transition-colors ${
                data.isPublic
                  ? 'border-moss bg-moss text-parchment hover:bg-moss/90'
                  : 'border-ink-mute text-ink-mute hover:bg-parchment-deep hover:text-ink'
              }`}
              title={data.isPublic ? 'Shared with Players (Public)' : 'Hidden from Players (Private)'}
            >
              {data.isPublic ? <Eye size={10} /> : <EyeOff size={10} />}
              {data.isPublic ? 'Shared' : 'Private'}
            </button>
          )}
          <button onClick={onRemove} aria-label="Remove" className="text-ink-mute hover:text-crimson"><X size={14} /></button>
        </div>
      </div>
      <div><CardLabel>Type</CardLabel>
        <select value={data.type || ''} onChange={(e) => onChange({ ...data, type: e.target.value })} className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-sm text-ink">
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
      <RelationshipsSection entityType="location" entityId={data.id} entityName={data.name} />
    </div>
  );
};
