'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { updateCampaign, deleteCampaign as deleteCampaignDoc, type Campaign } from '@/lib/firebase/campaigns';
import {
  ChevronDown, ChevronRight, Check, Plus, X, BookOpen, Quote,
  User, Users, Map, Swords, Gift, Layers, Calendar, Target, Trophy,
  Download, Upload, FileText, Trash2, ArrowLeft, Cloud, CloudOff
} from 'lucide-react';

const M = {
  shea: { label: 'Lazy DM', color: 'bg-emerald-950/60 text-emerald-300 border-emerald-900/60' },
  ccd: { label: 'CCD', color: 'bg-sky-950/60 text-sky-300 border-sky-900/60' },
  pr: { label: 'Proactive', color: 'bg-violet-950/60 text-violet-300 border-violet-900/60' },
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
  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${M[m].color}`}>{M[m].label}</span>
);

const BookQuote = ({ source, children }: { source: string; children: React.ReactNode }) => (
  <div className="flex gap-2 rounded border border-zinc-800 bg-zinc-900/40 p-2.5 text-xs">
    <Quote size={12} className="text-zinc-600 flex-shrink-0 mt-0.5" />
    <div>
      <div className="text-zinc-300 italic leading-relaxed">{children}</div>
      <div className="text-zinc-600 mt-1">— {source}</div>
    </div>
  </div>
);

const SoloNote = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-start gap-2 rounded border border-pink-900/40 bg-pink-950/20 p-2 text-xs">
    <User size={12} className="text-pink-400 flex-shrink-0 mt-0.5" />
    <div className="text-pink-200/90"><span className="font-medium">Solo Adaptation:</span> {children}</div>
  </div>
);

const Pitfall = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-start gap-2 rounded border border-red-900/40 bg-red-950/20 p-2 text-xs">
    <X size={12} className="text-red-400 flex-shrink-0 mt-0.5" />
    <div className="text-red-200/90"><span className="font-medium">Common Pitfall:</span> {children}</div>
  </div>
);

const TargetBar = ({ current, target, source }: { current: number; target: number; source?: string }) => {
  if (target === 0) return null;
  const pct = Math.min(100, (current / target) * 100);
  const complete = current >= target;
  return (
    <div className="space-y-1" title={source}>
      <div className="flex items-center justify-between text-[10px]">
        <span className={complete ? 'text-emerald-400' : 'text-zinc-500'}>
          {current} of {target}
        </span>
        {source && <span className="text-zinc-700">{source}</span>}
      </div>
      <div className="h-1 bg-zinc-900 rounded overflow-hidden">
        <div
          className={`h-full transition-all ${complete ? 'bg-emerald-700' : 'bg-zinc-600'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
};

const Example = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded border border-zinc-800 bg-zinc-900/40 p-2.5 text-xs">
    <p className="text-zinc-500 mb-1">Example — {title}</p>
    <div className="text-zinc-300 leading-relaxed">{children}</div>
  </div>
);

const Field = ({ value, onChange, placeholder, rows = 1 }: { value: string; onChange: (v: string) => void; placeholder: string; rows?: number }) => (
  rows > 1 ? (
    <textarea value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={rows}
      className="w-full bg-zinc-900/60 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none resize-y" />
  ) : (
    <input type="text" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full bg-zinc-900/60 border border-zinc-800 rounded px-2 py-1.5 text-sm text-zinc-200 placeholder-zinc-600 focus:border-zinc-600 focus:outline-none" />
  )
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
    <div className="space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex gap-1.5">
          <Field value={item} onChange={(v) => update(i, v)} placeholder={placeholder} rows={rows} />
          <button onClick={() => remove(i)} className="text-zinc-600 hover:text-red-400 px-1.5"><X size={14} /></button>
        </div>
      ))}
      {Array.from({ length: remaining }).map((_, i) => (
        <div key={`ghost-${i}`} className="flex gap-1.5 opacity-30">
          <div className="w-full bg-zinc-900/30 border border-dashed border-zinc-800 rounded px-2 py-1.5 text-xs text-zinc-700 italic">
            {placeholder} #{items.length + i + 1}
          </div>
          <div className="px-1.5 w-7" />
        </div>
      ))}
      <button onClick={add} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
        <Plus size={12} /> Add
      </button>
    </div>
  );
};

const Section = ({ id, title, methods, children, done, onToggle, open, onToggleOpen, icon: Icon }: any) => (
  <div className={`rounded border ${done ? 'border-emerald-900/50 bg-emerald-950/10' : 'border-zinc-800 bg-zinc-900/30'}`}>
    <div className="flex items-center gap-2 p-2.5">
      <button onClick={() => onToggle(id)} className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${done ? 'bg-emerald-700 border-emerald-600' : 'border-zinc-600'}`}>
        {done && <Check size={10} />}
      </button>
      <button onClick={() => onToggleOpen(id)} className="flex-1 flex items-center gap-2 text-left">
        {Icon && <Icon size={13} className="text-zinc-500" />}
        <span className="text-sm font-medium text-zinc-100">{title}</span>
        <span className="flex gap-1">{methods?.map((m: any) => <Tag key={m} m={m} />)}</span>
        <span className="ml-auto text-zinc-600">{open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
      </button>
    </div>
    {open && <div className="px-3 pb-3 border-t border-zinc-800/60 pt-3 space-y-3">{children}</div>}
  </div>
);

const FactionCard = ({ data, onChange, onRemove }: any) => (
  <div className="rounded border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
    <div className="flex justify-between items-center gap-2">
      <Field value={data.name} onChange={(v) => onChange({ ...data, name: v })} placeholder="Faction Name" />
      <button onClick={onRemove} className="text-zinc-600 hover:text-red-400"><X size={14} /></button>
    </div>
    <div><div className="text-xs text-zinc-500 mb-0.5">Archetype</div>
      <select value={data.archetype || ''} onChange={(e) => onChange({ ...data, archetype: e.target.value })} className="w-full bg-zinc-900/60 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200">
        <option value="">— Choose —</option>
        <option>Government (preserves order/stability)</option>
        <option>Religious</option><option>Criminal / underground</option><option>Mercantile</option>
        <option>Military</option><option>Cult</option><option>Scholarly</option>
        <option>Revolutionary</option><option>Other</option>
      </select></div>
    <div><div className="text-xs text-zinc-500 mb-0.5">Identity</div>
      <Field value={data.identity} onChange={(v) => onChange({ ...data, identity: v })} placeholder="One sentence" rows={2} /></div>
    <div><div className="text-xs text-zinc-500 mb-0.5">Area of Operation</div>
      <Field value={data.area} onChange={(v) => onChange({ ...data, area: v })} placeholder="Where active" /></div>
    <div><div className="text-xs text-zinc-500 mb-0.5">Power Level</div>
      <Field value={data.power} onChange={(v) => onChange({ ...data, power: v })} placeholder="Resources" /></div>
    <div><div className="text-xs text-zinc-500 mb-0.5">Ideology</div>
      <Field value={data.ideology} onChange={(v) => onChange({ ...data, ideology: v })} placeholder="Why they do it" rows={2} /></div>
    <div><div className="text-xs text-zinc-500 mb-0.5">Short-Term Goals</div>
      <ListField items={data.shortGoals || []} onChange={(v) => onChange({ ...data, shortGoals: v })} placeholder="A short-term goal" /></div>
    <div><div className="text-xs text-zinc-500 mb-0.5">Mid-Term Goals</div>
      <ListField items={data.midGoals || []} onChange={(v) => onChange({ ...data, midGoals: v })} placeholder="A mid-term goal" /></div>
    <div><div className="text-xs text-zinc-500 mb-0.5">Long-Term Goal</div>
      <Field value={data.longGoal} onChange={(v) => onChange({ ...data, longGoal: v })} placeholder="The one big thing" /></div>
  </div>
);

const GoalCard = ({ data, onChange, onRemove }: any) => (
  <div className="rounded border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
    <div className="flex justify-between gap-2">
      <Field value={data.text} onChange={(v) => onChange({ ...data, text: v })} placeholder="Goal Statement" rows={2} />
      <button onClick={onRemove} className="text-zinc-600 hover:text-red-400"><X size={14} /></button>
    </div>
    <div className="grid grid-cols-3 gap-1.5">
      {[['short', 'Short-Term'], ['mid', 'Mid-Term'], ['long', 'Long-Term']].map(([t, label]) => (
        <button key={t} onClick={() => onChange({ ...data, timeframe: t })} className={`text-xs py-1 rounded border ${data.timeframe === t ? 'bg-violet-950/60 border-violet-700 text-violet-200' : 'border-zinc-800 text-zinc-500'}`}>{label}</button>
      ))}
    </div>
    <div><div className="text-xs text-zinc-500 mb-0.5">Rule 3 — Success State</div>
      <Field value={data.success} onChange={(v) => onChange({ ...data, success: v })} placeholder="What signals completion?" /></div>
    <div><div className="text-xs text-zinc-500 mb-0.5">Rule 4 — Failure Consequence</div>
      <Field value={data.failure} onChange={(v) => onChange({ ...data, failure: v })} placeholder="What changes if it fails?" /></div>
    <div><div className="text-xs text-zinc-500 mb-0.5">Linked Factions / Conflicts</div>
      <Field value={data.linked} onChange={(v) => onChange({ ...data, linked: v })} placeholder="..." /></div>
  </div>
);

const NPCCard = ({ data, onChange, onRemove }: any) => (
  <div className="rounded border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
    <div className="flex justify-between gap-2">
      <Field value={data.name} onChange={(v) => onChange({ ...data, name: v })} placeholder="NPC Name" />
      <button onClick={onRemove} className="text-zinc-600 hover:text-red-400"><X size={14} /></button>
    </div>
    <div className="grid grid-cols-2 gap-2">
      <div><div className="text-xs text-zinc-500 mb-0.5">Type</div>
        <select value={data.type || ''} onChange={(e) => onChange({ ...data, type: e.target.value })} className="w-full bg-zinc-900/60 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200">
          <option value="">— Choose —</option>
          <option>Ally</option><option>Villain</option><option>Patron</option><option>Rival</option><option>Neutral / Colour</option>
        </select></div>
      <div><div className="text-xs text-zinc-500 mb-0.5">Faction</div>
        <Field value={data.faction} onChange={(v) => onChange({ ...data, faction: v })} placeholder="..." /></div>
    </div>
    <div><div className="text-xs text-zinc-500 mb-0.5">Archetype</div>
      <Field value={data.archetype} onChange={(v) => onChange({ ...data, archetype: v })} placeholder='e.g. "Han Solo"' /></div>
    <div><div className="text-xs text-zinc-500 mb-0.5">Active Goal</div>
      <Field value={data.goal} onChange={(v) => onChange({ ...data, goal: v })} placeholder="What are they pursuing?" rows={2} /></div>
    <div><div className="text-xs text-zinc-500 mb-0.5">Method of Pursuit</div>
      <Field value={data.method} onChange={(v) => onChange({ ...data, method: v })} placeholder="Violence? Charm?" /></div>
  </div>
);

const LocationCard = ({ data, onChange, onRemove }: any) => (
  <div className="rounded border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
    <div className="flex justify-between gap-2">
      <Field value={data.name} onChange={(v) => onChange({ ...data, name: v })} placeholder="Evocative Name" />
      <button onClick={onRemove} className="text-zinc-600 hover:text-red-400"><X size={14} /></button>
    </div>
    <div><div className="text-xs text-zinc-500 mb-0.5">Type</div>
      <select value={data.type || ''} onChange={(e) => onChange({ ...data, type: e.target.value })} className="w-full bg-zinc-900/60 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200">
        <option value="">— Choose —</option>
        <option>Player Base</option><option>Faction Stronghold</option><option>Wilderness Landmark</option>
        <option>Dungeon Room / Area</option><option>Settlement</option><option>Travel Waypoint</option><option>Other</option>
      </select></div>
    <div><div className="text-xs text-zinc-500">3 Aspects</div>
      {[0, 1, 2].map(i => (
        <Field key={i} value={(data.aspects || [])[i] || ''} onChange={(v) => {
          const aspects = [...(data.aspects || ['', '', ''])]; aspects[i] = v; onChange({ ...data, aspects });
        }} placeholder={`Aspect ${i + 1}`} />
      ))}</div>
    <div><div className="text-xs text-zinc-500 mb-0.5">Factions Present</div>
      <Field value={data.factions} onChange={(v) => onChange({ ...data, factions: v })} placeholder="..." /></div>
  </div>
);

const ClockCard = ({ data, onChange, onRemove }: any) => {
  const max = data.max || 6;
  const filled = data.filled || 0;
  return (
    <div className="rounded border border-zinc-800 bg-zinc-900/40 p-3 space-y-2">
      <div className="flex justify-between gap-2">
        <Field value={data.text} onChange={(v) => onChange({ ...data, text: v })} placeholder="What is this faction trying to do?" />
        <button onClick={onRemove} className="text-zinc-600 hover:text-red-400"><X size={14} /></button>
      </div>
      <Field value={data.faction} onChange={(v) => onChange({ ...data, faction: v })} placeholder="Faction" />
      <div className="flex items-center gap-2">
        <select value={max} onChange={(e) => onChange({ ...data, max: Number(e.target.value) })} className="bg-zinc-900/60 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-200">
          {[4, 6, 8, 12, 16].map(n => <option key={n} value={n}>{n} segments</option>)}
        </select>
        <div className="flex gap-1 flex-1">
          {Array.from({ length: max }).map((_, i) => (
            <button key={i} onClick={() => onChange({ ...data, filled: i + 1 === filled ? i : i + 1 })} className={`flex-1 h-5 rounded ${i < filled ? 'bg-red-700' : 'bg-zinc-800 hover:bg-zinc-700'}`} />
          ))}
        </div>
        <span className="text-xs text-zinc-500 font-mono">{filled}/{max}</span>
      </div>
    </div>
  );
};

const Phase = ({ n, title, sub, methods, children, expanded, onToggle, icon: Icon }: any) => (
  <div className="border border-zinc-800 rounded-lg overflow-hidden bg-zinc-900/20">
    <button onClick={onToggle} className="w-full flex items-center gap-3 p-4 hover:bg-zinc-900/40 text-left">
      <div className="text-2xl font-mono text-zinc-700 w-8">{n}</div>
      {Icon && <Icon size={18} className="text-zinc-500" />}
      <div className="flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-zinc-100">{title}</span>
          <span className="flex gap-1">{methods?.map((m: any) => <Tag key={m} m={m} />)}</span>
        </div>
        <div className="text-xs text-zinc-500 mt-0.5">{sub}</div>
      </div>
      {expanded ? <ChevronDown size={18} className="text-zinc-500" /> : <ChevronRight size={18} className="text-zinc-500" />}
    </button>
    {expanded && <div className="p-3 pt-0 space-y-2 border-t border-zinc-800">{children}</div>}
  </div>
);

export default function CampaignEditor({ campaign, userEmail }: { campaign: Campaign; userEmail: string }) {
  const router = useRouter();
  const [name, setName] = useState(campaign.name);
  const [state, setState] = useState<Record<string, any>>(campaign.data || {});
  const [done, setDone] = useState<Record<string, boolean>>(campaign.done || {});
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [phaseOpen, setPhaseOpen] = useState<Record<string, boolean>>({ p0: true });
  const [tab, setTab] = useState<'prep' | 'ref' | 'track'>('prep');
  const [soloMode, setSoloMode] = useState<boolean>(campaign.data?.__soloMode ?? true);
  const [syncState, setSyncState] = useState<'synced' | 'pending' | 'saving' | 'error'>('synced');
  const [syncError, setSyncError] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  const completedCount = Object.values(done).filter(Boolean).length;

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
    if (syncState === 'saving') return <span className="text-xs text-zinc-500 flex items-center gap-1"><Cloud size={12} className="animate-pulse" /> Saving…</span>;
    if (syncState === 'pending') return <span className="text-xs text-zinc-500 flex items-center gap-1"><Cloud size={12} /> Pending</span>;
    if (syncState === 'error') return <span className="text-xs text-red-400 flex items-center gap-1" title={syncError}><CloudOff size={12} /> Save Failed</span>;
    return <span className="text-xs text-emerald-500 flex items-center gap-1"><Cloud size={12} /> Saved</span>;
  };

  return (
    <main className="min-h-screen p-5">
      <div className="max-w-3xl mx-auto space-y-3">
        <header className="pb-3 border-b border-zinc-800">
          <div className="flex items-center justify-between gap-2 mb-3">
            <Link href="/campaign" className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
              <ArrowLeft size={12} /> All Campaigns
            </Link>
            <SyncIndicator />
          </div>
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-zinc-500" />
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Campaign Name"
              className="flex-1 bg-transparent border-b border-zinc-800 text-lg font-medium text-zinc-50 placeholder-zinc-700 focus:border-zinc-600 focus:outline-none pb-0.5" />
          </div>
          <p className="text-xs text-zinc-400 mt-1">Lazy DM · Collaborative Campaign Design · Proactive Roleplaying</p>

          <div className="flex flex-wrap gap-1.5 mt-3 items-center">
            <button onClick={exportJSON} className="text-xs px-2.5 py-1 rounded border border-zinc-800 text-zinc-300 hover:bg-zinc-900 flex items-center gap-1">
              <Download size={12} /> Export
            </button>
            <button onClick={() => fileInputRef.current?.click()} className="text-xs px-2.5 py-1 rounded border border-zinc-800 text-zinc-300 hover:bg-zinc-900 flex items-center gap-1">
              <Upload size={12} /> Import
            </button>
            <input ref={fileInputRef} type="file" accept=".json,application/json" onChange={importJSON} className="hidden" />
            <div className="flex-1" />
            <button
              onClick={() => setSoloMode(s => !s)}
              className={`text-xs px-2.5 py-1 rounded border flex items-center gap-1 ${
                soloMode
                  ? 'bg-pink-950/30 border-pink-900/50 text-pink-300'
                  : 'border-zinc-800 text-zinc-400 hover:bg-zinc-900'
              }`}
              title={soloMode ? 'Solo targets active — click to switch to group' : 'Group targets active — click to switch to solo'}
            >
              <User size={12} /> {soloMode ? 'Solo' : 'Group'}
            </button>
            <button onClick={handleDelete} className="text-xs px-2.5 py-1 rounded border border-red-950 text-red-400 hover:bg-red-950/30 flex items-center gap-1">
              <Trash2 size={12} /> Delete
            </button>
          </div>

          <div className="flex gap-1 mt-3">
            {([['prep', 'Prep Flow'], ['ref', 'Reference'], ['track', 'Tracking']] as const).map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} className={`text-xs px-3 py-1.5 rounded border ${tab === id ? 'bg-zinc-800 border-zinc-700 text-zinc-100' : 'border-zinc-800 text-zinc-500 hover:text-zinc-300'}`}>
                {label}
              </button>
            ))}
            <span className="ml-auto text-xs text-zinc-500 self-center">{completedCount} Steps Done</span>
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
                <div className="text-xs text-zinc-500 mt-2 mb-0.5">Tone Keywords</div>
                <ListField items={get('tone', [])} onChange={(v) => setVal('tone', v)} placeholder="A tone word" />
              </Section>
              <Section id="g-lines" title="Content Lines (Hard Nos)" methods={['ccd']} done={done['g-lines']} onToggle={toggleDone} open={open['g-lines']} onToggleOpen={toggleOpen}>
                <ListField items={get('lines', [])} onChange={(v) => setVal('lines', v)} placeholder="A topic to avoid" target={getTarget('lines', soloMode)} />
              </Section>
              <Section id="pitch" title="Quick Pitch" methods={['ccd']} done={done['pitch']} onToggle={toggleDone} open={open['pitch']} onToggleOpen={toggleOpen}>
                <BookQuote source="CCD case study">Pitch the results, not the concept.</BookQuote>
                <Field value={get('pitch', '')} onChange={(v) => setVal('pitch', v)} placeholder="2-3 sentences" rows={4} />
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
                <button onClick={() => setVal('factions', [...(get('factions', []) as any[]), { name: '', archetype: '', identity: '', area: '', power: '', ideology: '', shortGoals: [], midGoals: [], longGoal: '' }])} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
                  <Plus size={12} /> Add Faction
                </button>
              </Section>
              <Section id="conflicts" title="Active Conflicts" methods={['ccd', 'pr']} done={done.conflicts} onToggle={toggleDone} open={open.conflicts} onToggleOpen={toggleOpen}>
                <BookQuote source="CCD ch. 2">Conflicts are the end goal of worldbuilding.</BookQuote>
                <ListField items={get('conflicts', [])} onChange={(v) => setVal('conflicts', v)} placeholder="Faction A vs Faction B over X" rows={2} target={getTarget('conflicts', soloMode)} />
              </Section>
            </Phase>

            <Phase n="2" title="Session 0 — Characters & Goals" sub="PCs Created After the World Exists" methods={['pr', 'shea']} icon={User} expanded={phaseOpen.p2} onToggle={() => togglePhase('p2')}>
              <SoloNote>Solo Session 0 is fast. Spend the saved time on goal craft.</SoloNote>
              <Section id="pc" title="Character Review" methods={['shea']} done={done.pc} onToggle={toggleDone} open={open.pc} onToggleOpen={toggleOpen}>
                <BookQuote source="Lazy DM (Chris Perkins)">Nothing's more important to a campaign than the stories of the player characters.</BookQuote>
                <div className="grid grid-cols-2 gap-2">
                  <div><div className="text-xs text-zinc-500 mb-0.5">Name</div><Field value={get('pcName', '')} onChange={(v) => setVal('pcName', v)} placeholder="..." /></div>
                  <div><div className="text-xs text-zinc-500 mb-0.5">Class / Level</div><Field value={get('pcClass', '')} onChange={(v) => setVal('pcClass', v)} placeholder="..." /></div>
                </div>
                <div><div className="text-xs text-zinc-500 mb-0.5">Background / Hometown</div><Field value={get('pcBg', '')} onChange={(v) => setVal('pcBg', v)} placeholder="..." rows={2} /></div>
                <div><div className="text-xs text-zinc-500 mb-0.5">What They Want</div><Field value={get('pcWant', '')} onChange={(v) => setVal('pcWant', v)} placeholder="..." /></div>
                <div><div className="text-xs text-zinc-500 mb-0.5">What They Fear</div><Field value={get('pcFear', '')} onChange={(v) => setVal('pcFear', v)} placeholder="..." /></div>
                <div><div className="text-xs text-zinc-500 mb-0.5">One Person They Love</div><Field value={get('pcLove', '')} onChange={(v) => setVal('pcLove', v)} placeholder="..." /></div>
                <div><div className="text-xs text-zinc-500 mb-0.5">Faction Ties</div><ListField items={get('pcFactions', [])} onChange={(v) => setVal('pcFactions', v)} placeholder="..." /></div>
              </Section>
              <Section id="goals" title="PC Goals (5 Rules of Proactive Fun)" methods={['pr']} done={done.goals} onToggle={toggleDone} open={open.goals} onToggleOpen={toggleOpen} icon={Target}>
                <div className="rounded border border-violet-900/40 bg-violet-950/20 p-3 text-xs space-y-1.5 text-zinc-300">
                  <p><span className="text-violet-300 font-medium">1.</span> Multiple Goals (3+ concurrent)</p>
                  <p><span className="text-violet-300 font-medium">2.</span> Varying Timeframes</p>
                  <p><span className="text-violet-300 font-medium">3.</span> Achievable (measurable)</p>
                  <p><span className="text-violet-300 font-medium">4.</span> Consequences for Failure</p>
                  <p><span className="text-violet-300 font-medium">5.</span> Fun to Pursue</p>
                </div>
                <Example title="Bad → Good">"Become powerful" → "Win a duel against the captain of the guard"</Example>
                <Pitfall>Long-term goals locked in Session 0 are usually worse than ones locked after Session 1.</Pitfall>
                <TargetBar current={(get('pcGoals', []) as any[]).length} target={getTarget('pcGoals', soloMode)} source={TARGETS.pcGoals.source} />
                {(get('pcGoals', []) as any[]).map((g: any, i: number) => (
                  <GoalCard key={i} data={g} onChange={(v: any) => {
                    const next = [...(get('pcGoals', []) as any[])]; next[i] = v; setVal('pcGoals', next);
                  }} onRemove={() => setVal('pcGoals', (get('pcGoals', []) as any[]).filter((_: any, j: number) => j !== i))} />
                ))}
                <button onClick={() => setVal('pcGoals', [...(get('pcGoals', []) as any[]), { text: '', timeframe: 'short', success: '', failure: '', linked: '' }])} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
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
              </Section>
              <Section id="s3-scenes" title="3 · Outline Potential Scenes" methods={['shea']} done={done['s3-scenes']} onToggle={toggleDone} open={open['s3-scenes']} onToggleOpen={toggleOpen}>
                <BookQuote source="Lazy DM (Perkins)">Be prepared to throw what you have away.</BookQuote>
                <ListField items={get('scenes', [])} onChange={(v) => setVal('scenes', v)} placeholder="A scene" target={getTarget('scenes', soloMode)} />
              </Section>
              <Section id="s4-secrets" title="4 · Define Secrets & Clues" methods={['shea']} done={done['s4-secrets']} onToggle={toggleDone} open={open['s4-secrets']} onToggleOpen={toggleOpen}>
                <BookQuote source="Lazy DM ch. 6">Secrets and clues are the connective tissue of an adventure.</BookQuote>
                <Pitfall>Tying a secret to a specific NPC means if players skip them, the secret never surfaces.</Pitfall>
                <ListField items={get('secrets', [])} onChange={(v) => setVal('secrets', v)} placeholder="A single-sentence secret" rows={2} target={getTarget('secrets', soloMode)} />
              </Section>
              <Section id="s5-loc" title="5 · Develop Fantastic Locations" methods={['shea']} done={done['s5-loc']} onToggle={toggleDone} open={open['s5-loc']} onToggleOpen={toggleOpen} icon={Map}>
                <BookQuote source="Lazy DM ch. 7">When in doubt, go for scale.</BookQuote>
                <TargetBar current={(get('locations', []) as any[]).length} target={getTarget('locations', soloMode)} source={TARGETS.locations.source} />
                {(get('locations', []) as any[]).map((l: any, i: number) => (
                  <LocationCard key={i} data={l} onChange={(v: any) => {
                    const next = [...(get('locations', []) as any[])]; next[i] = v; setVal('locations', next);
                  }} onRemove={() => setVal('locations', (get('locations', []) as any[]).filter((_: any, j: number) => j !== i))} />
                ))}
                <button onClick={() => setVal('locations', [...(get('locations', []) as any[]), { name: '', type: '', aspects: ['', '', ''], factions: '' }])} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
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
                <button onClick={() => setVal('npcs', [...(get('npcs', []) as any[]), { name: '', type: '', faction: '', archetype: '', goal: '', method: '' }])} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
                  <Plus size={12} /> Add NPC
                </button>
              </Section>
              <Section id="s7-mon" title="7 · Choose Relevant Monsters" methods={['shea']} done={done['s7-mon']} onToggle={toggleDone} open={open['s7-mon']} onToggleOpen={toggleOpen} icon={Swords}>
                <SoloNote>Solo level-1 ~8-12 HP. CR 1/8 one-at-a-time. Narrative outs always.</SoloNote>
                <ListField items={get('monsters', [])} onChange={(v) => setVal('monsters', v)} placeholder="Monster — CR — use case" target={getTarget('monsters', soloMode)} />
              </Section>
              <Section id="s8-rew" title="8 · Select Magic Item Rewards" methods={['shea', 'pr']} done={done['s8-rew']} onToggle={toggleDone} open={open['s8-rew']} onToggleOpen={toggleOpen} icon={Gift}>
                <BookQuote source="PR ch. 6">Your +1 needs to be actionable.</BookQuote>
                <Example title="from PR">Sword from a stone. +1: right to rule Albion.</Example>
                <ListField items={get('items', [])} onChange={(v) => setVal('items', v)} placeholder="Item · what +1 hook it delivers" rows={2} target={getTarget('items', soloMode)} />
              </Section>
            </Phase>

            <Phase n="4" title="Between Sessions · Faction Clocks" sub="Update Faction Progress" methods={['ccd']} icon={Target} expanded={phaseOpen.p4} onToggle={() => togglePhase('p4')}>
              <BookQuote source="CCD ch. 6">Glance at faction clocks once per session.</BookQuote>
              <div className="rounded border border-zinc-800 bg-zinc-900/40 p-2.5 text-xs">
                <p className="text-zinc-300 font-medium mb-1.5">Clock Sizes</p>
                <div className="grid grid-cols-2 gap-1 text-zinc-400">
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
              <button onClick={() => setVal('clocks', [...(get('clocks', []) as any[]), { text: '', faction: '', max: 6, filled: 0 }])} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1">
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
              </Section>
              <Section id="end-catalyst" title="Add Catalysts" methods={['ccd']} done={done['end-catalyst']} onToggle={toggleDone} open={open['end-catalyst']} onToggleOpen={toggleOpen}>
                <Field value={get('endCatalyst', '')} onChange={(v) => setVal('endCatalyst', v)} placeholder="Forcing events" rows={3} />
              </Section>
            </Phase>
          </div>
        )}

        {tab === 'ref' && (
          <div className="space-y-3 text-sm">
            <div className="rounded border border-zinc-800 bg-zinc-900/40 p-4">
              <h2 className="text-zinc-100 font-medium mb-2">The Three Methodologies</h2>
              <div className="space-y-3 text-xs text-zinc-300">
                <div>
                  <div className="flex items-center gap-2 mb-1"><Tag m="shea" /><span className="text-zinc-100 font-medium">Return of the Lazy Dungeon Master</span> <span className="text-zinc-500">· Shea</span></div>
                  <p className="text-zinc-400">8-step per-session checklist. Strong start, secrets & clues, fantastic locations.</p>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1"><Tag m="ccd" /><span className="text-zinc-100 font-medium">Collaborative Campaign Design</span> <span className="text-zinc-500">· Fishel</span></div>
                  <p className="text-zinc-400">Session −1 worldbuilding before character creation. Faction clocks.</p>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1"><Tag m="pr" /><span className="text-zinc-100 font-medium">Proactive Roleplaying</span> <span className="text-zinc-500">· Fishel</span></div>
                  <p className="text-zinc-400">5 Rules of Proactive Fun. "+1" reward principle.</p>
                </div>
              </div>
            </div>
            <div className="rounded border border-zinc-800 bg-zinc-900/40 p-4">
              <h2 className="text-zinc-100 font-medium mb-2">Five Rules of Proactive Fun</h2>
              <ol className="space-y-2 text-xs text-zinc-300 list-decimal list-inside">
                <li><span className="font-medium">Multiple Goals.</span> 3-4 concurrent.</li>
                <li><span className="font-medium">Varying Timeframes.</span> Short / Mid / Long.</li>
                <li><span className="font-medium">Achievable.</span> Measurable success state.</li>
                <li><span className="font-medium">Consequences for Failure.</span> If retryable, it was a skill check.</li>
                <li><span className="font-medium">Fun to Pursue.</span> GM can imagine obstacles.</li>
              </ol>
            </div>
            <div className="rounded border border-pink-900/30 bg-pink-950/10 p-4">
              <h2 className="text-zinc-100 font-medium mb-2 flex items-center gap-2"><User size={14} className="text-pink-400" /> Solo Play Adaptations</h2>
              <div className="text-xs text-zinc-300 space-y-2">
                <p><span className="text-pink-300 font-medium">Session −1:</span> 2-person conversation.</p>
                <p><span className="text-pink-300 font-medium">Goals:</span> Rule 4 matters more.</p>
                <p><span className="text-pink-300 font-medium">Combat:</span> Solo level-1 ~8-12 HP. Narrative outs always.</p>
                <p><span className="text-pink-300 font-medium">Strong Start:</span> Action without losable fight.</p>
                <p><span className="text-pink-300 font-medium">Pacing:</span> 2-3 scenes/hour instead of 1-2.</p>
              </div>
            </div>
          </div>
        )}

        {tab === 'track' && (
          <div className="space-y-3 text-sm">
            <div className="rounded border border-zinc-800 bg-zinc-900/30 p-3">
              <h3 className="text-zinc-100 font-medium text-sm mb-2">Session Log</h3>
              <Field value={get('logCurrent', '')} onChange={(v) => setVal('logCurrent', v)} placeholder="What happened. Open threads." rows={6} />
            </div>
            <div className="rounded border border-zinc-800 bg-zinc-900/30 p-3">
              <h3 className="text-zinc-100 font-medium text-sm mb-2">Revealed Secrets</h3>
              <div className="space-y-1">
                {(get('secrets', []) as string[]).map((s: string, i: number) => (
                  <label key={i} className="flex items-start gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={(get('revSec', {}) as Record<number, boolean>)[i] || false} onChange={(e) => {
                      const r = { ...(get('revSec', {}) as Record<number, boolean>) }; r[i] = e.target.checked; setVal('revSec', r);
                    }} className="mt-0.5" />
                    <span className={((get('revSec', {}) as Record<number, boolean>)[i]) ? 'text-zinc-600 line-through' : 'text-zinc-300'}>{s}</span>
                  </label>
                ))}
                {(get('secrets', []) as string[]).length === 0 && <p className="text-xs text-zinc-600 italic">Add secrets in Phase 3 step 4.</p>}
              </div>
            </div>
            <div className="rounded border border-zinc-800 bg-zinc-900/30 p-3">
              <h3 className="text-zinc-100 font-medium text-sm mb-2">Goal Progress</h3>
              <div className="space-y-2">
                {(get('pcGoals', []) as any[]).map((g: any, i: number) => (
                  <div key={i} className="rounded border border-zinc-800 bg-zinc-900/40 p-2 text-xs">
                    <p className="text-zinc-300">{g.text}</p>
                    <div className="flex gap-1 mt-1.5">
                      {['Active', 'Progressed', 'Completed', 'Failed'].map(s => (
                        <button key={s} onClick={() => {
                          const next = [...(get('pcGoals', []) as any[])];
                          next[i] = { ...g, status: s };
                          setVal('pcGoals', next);
                        }} className={`text-[10px] px-2 py-0.5 rounded border ${g.status === s ? 'bg-zinc-800 border-zinc-600 text-zinc-200' : 'border-zinc-800 text-zinc-500'}`}>{s}</button>
                      ))}
                    </div>
                  </div>
                ))}
                {(get('pcGoals', []) as any[]).length === 0 && <p className="text-xs text-zinc-600 italic">Add goals in Phase 2.</p>}
              </div>
            </div>
            <div className="rounded border border-zinc-800 bg-zinc-900/30 p-3">
              <h3 className="text-zinc-100 font-medium text-sm mb-2">Dropped Threads</h3>
              <ListField items={get('dropped', [])} onChange={(v) => setVal('dropped', v)} placeholder="A thread to follow up" />
            </div>
          </div>
        )}

        <footer className="pt-3 mt-4 border-t border-zinc-800 text-xs text-zinc-600 italic">
          {userEmail} · auto-syncs to Firestore every 1.5s
        </footer>
      </div>
    </main>
  );
}
