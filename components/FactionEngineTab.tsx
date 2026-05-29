'use client';

import { useState, useMemo } from 'react';
import {
  Plus, X, Play, RotateCcw, Trash2, Crown, Swords, Handshake, ChevronDown, ChevronRight, GitMerge,
} from 'lucide-react';
import {
  emptyWorld, runTick, runTicks, getRelationship, setRelationship,
  type FactionWorld, type Faction, type Territory, type TickEvent,
} from '@/lib/factionEngine';
import { useWiki } from './wiki/WikiContext';
import { factionStanceProposals } from '@/lib/wiki/factionTurnEdges';

type Props = {
  campaignId: string;
  world: FactionWorld;
  onChange: (next: FactionWorld) => void;
};

const FACTION_COLORS = ['#9a1d2e', '#7a5a1e', '#3d5a2a', '#5c1f3d', '#1e4a5a', '#5a3d1e', '#4a1e5a'];

export default function FactionEngineTab({ campaignId, world, onChange }: Props) {
  const safeWorld = world.factions ? world : emptyWorld();
  const [tickCount, setTickCount] = useState(1);
  const [showLog, setShowLog] = useState(true);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const wiki = useWiki();

  // Surface strong faction stances as proposed graph edges between the matching
  // wiki faction entities (by name). Lands in the Wiki review queue.
  const syncStancesToGraph = () => {
    if (!wiki?.proposeRelationships) return;
    const byName = new Map<string, string>();
    for (const e of wiki.index.entities) {
      if (e.type === 'faction') byName.set(e.name.trim().toLowerCase(), e.id);
    }
    const proposals = factionStanceProposals(safeWorld, (n) => byName.get(n.trim().toLowerCase()));
    const added = wiki.proposeRelationships(proposals);
    setSyncMsg(
      added > 0
        ? `Sent ${added} stance${added === 1 ? '' : 's'} to the graph review queue.`
        : 'No matching factions with strong stances to send.',
    );
    setTimeout(() => setSyncMsg(null), 4000);
  };

  const addFaction = () => {
    const id = `f${Date.now().toString(36)}`;
    const color = FACTION_COLORS[safeWorld.factions.length % FACTION_COLORS.length];
    const f: Faction = {
      id, name: `New Faction ${safeWorld.factions.length + 1}`, archetype: '',
      color, aggression: 5, reach: 3, wealth: 3, influence: 5, goals: [],
    };
    onChange({ ...safeWorld, factions: [...safeWorld.factions, f] });
  };

  const addTerritory = () => {
    const id = `t${Date.now().toString(36)}`;
    const t: Territory = {
      id, name: `New Region ${safeWorld.territories.length + 1}`,
      controllerId: null, value: 2, neighbors: [],
    };
    onChange({ ...safeWorld, territories: [...safeWorld.territories, t] });
  };

  const advance = () => {
    onChange(runTicks(safeWorld, tickCount, campaignId));
  };

  const reset = () => {
    if (!confirm('Reset all faction-engine state? Factions, territories, and history will be wiped.')) return;
    onChange(emptyWorld());
  };

  const undoLastTick = () => {
    if (safeWorld.tick === 0) return;
    // Naive undo: replay from scratch with one fewer tick. The engine is
    // deterministic so this reproduces the prior state — but we'd need the
    // pre-tick faction/territory configuration. For now, we only roll back
    // the log; the DM is told that the world state is not restored.
    if (!confirm('Roll back the tick log? Faction and territory state will NOT be restored — use this only to clear narrative history.')) return;
    const newLog = safeWorld.log.filter(e => e.tick < safeWorld.tick);
    onChange({ ...safeWorld, tick: safeWorld.tick - 1, log: newLog });
  };

  return (
    <div className="space-y-4 text-sm">
      <header className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-lg uppercase tracking-wide text-ink">Living World</h2>
          <span className="font-display text-xs uppercase tracking-wider text-brass-deep">Tick {safeWorld.tick}</span>
        </div>
        <p className="font-serif text-xs italic text-ink-mute">
          Simulates background faction movement between sessions. Configure factions, territories,
          and relationships, then advance the clock. Outcomes are deterministic per (campaign, tick),
          so you can preview, accept, or veto each round.
        </p>
      </header>

      <section className="space-y-2.5 rounded border border-rule bg-parchment p-3 shadow-card">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1">
            <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Advance</span>
            <input
              type="number" min={1} max={20}
              value={tickCount}
              onChange={(e) => setTickCount(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
              className="w-20 rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-sm text-ink focus:border-crimson focus:outline-none"
            />
          </label>
          <button
            onClick={advance}
            disabled={safeWorld.factions.length === 0}
            className="flex items-center gap-1.5 rounded border border-crimson bg-crimson px-3 py-1.5 font-display text-xs uppercase tracking-wider text-parchment hover:bg-crimson-deep disabled:opacity-40"
          >
            <Play size={12} /> Run {tickCount} tick{tickCount > 1 ? 's' : ''}
          </button>
          <button
            onClick={undoLastTick}
            disabled={safeWorld.tick === 0}
            className="flex items-center gap-1.5 rounded border border-brass/40 bg-brass-soft/20 px-2.5 py-1.5 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-brass-soft/40 disabled:opacity-40"
          >
            <RotateCcw size={12} /> Rollback log
          </button>
          {wiki?.proposeRelationships && (
            <button
              onClick={syncStancesToGraph}
              disabled={safeWorld.factions.length < 2}
              className="flex items-center gap-1.5 rounded border border-brass/40 bg-brass-soft/20 px-2.5 py-1.5 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-brass-soft/40 disabled:opacity-40"
              title="Propose ally/enemy graph edges between faction entities whose stances are strong (matched by name), for review in the Wiki"
            >
              <GitMerge size={12} /> Stances → graph
            </button>
          )}
          <button
            onClick={reset}
            className="ml-auto flex items-center gap-1.5 rounded border border-crimson/40 px-2.5 py-1.5 font-display text-xs uppercase tracking-wider text-crimson hover:bg-crimson/10"
          >
            <Trash2 size={12} /> Reset world
          </button>
        </div>
        {syncMsg && <p className="font-serif text-xs italic text-brass-deep">{syncMsg}</p>}
      </section>

      <FactionsSection world={safeWorld} onChange={onChange} onAdd={addFaction} />
      <TerritoriesSection world={safeWorld} onChange={onChange} onAdd={addTerritory} />
      <RelationshipsSection world={safeWorld} onChange={onChange} />
      <LogSection world={safeWorld} expanded={showLog} onToggle={() => setShowLog(s => !s)} />
    </div>
  );
}

function FactionsSection({
  world, onChange, onAdd,
}: { world: FactionWorld; onChange: (w: FactionWorld) => void; onAdd: () => void }) {
  const update = (id: string, patch: Partial<Faction>) => {
    onChange({ ...world, factions: world.factions.map(f => f.id === id ? { ...f, ...patch } : f) });
  };
  const remove = (id: string) => {
    onChange({
      ...world,
      factions: world.factions.filter(f => f.id !== id),
      territories: world.territories.map(t => t.controllerId === id ? { ...t, controllerId: null } : t),
    });
  };

  return (
    <section className="space-y-2.5 rounded border border-rule bg-parchment p-3 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 font-display text-sm uppercase tracking-wide text-ink">
          <Crown size={14} /> Factions
        </h3>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 rounded border border-brass/40 bg-brass-soft/20 px-2 py-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-brass-soft/40"
        >
          <Plus size={12} /> Add
        </button>
      </div>
      {world.factions.length === 0 && (
        <p className="font-serif text-xs italic text-ink-mute">No factions yet — add at least two to start the simulation.</p>
      )}
      <div className="space-y-2">
        {world.factions.map(f => (
          <div key={f.id} className="space-y-2 rounded border border-rule bg-parchment-soft p-2.5">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={f.color ?? '#9a1d2e'}
                onChange={(e) => update(f.id, { color: e.target.value })}
                className="size-6 cursor-pointer rounded border border-rule"
              />
              <input
                value={f.name}
                onChange={(e) => update(f.id, { name: e.target.value })}
                className="flex-1 bg-transparent font-display text-sm text-ink focus:outline-none"
              />
              <span className="font-serif text-xs text-ink-mute">
                Influence <span className="font-display text-ink">{f.influence}</span>
              </span>
              <button onClick={() => remove(f.id)} className="text-ink-mute hover:text-crimson"><X size={14} /></button>
            </div>
            <input
              value={f.archetype}
              onChange={(e) => update(f.id, { archetype: e.target.value })}
              placeholder="Archetype (merchant cabal, mercenary company, divine cult…)"
              className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-xs text-ink focus:border-crimson focus:outline-none"
            />
            <div className="grid grid-cols-3 gap-2">
              <StatSlider label="Aggression" value={f.aggression} onChange={(v) => update(f.id, { aggression: v })} />
              <StatSlider label="Reach"      value={f.reach}      onChange={(v) => update(f.id, { reach: v })} />
              <StatSlider label="Wealth"     value={f.wealth}     onChange={(v) => update(f.id, { wealth: v })} />
            </div>
            <GoalsEditor
              goals={f.goals}
              onChange={(g) => update(f.id, { goals: g })}
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function StatSlider({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex items-center justify-between font-display text-[10px] uppercase tracking-wider text-brass-deep">
        <span>{label}</span><span className="text-ink">{value}</span>
      </span>
      <input
        type="range" min={0} max={10}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-crimson"
      />
    </label>
  );
}

function GoalsEditor({ goals, onChange }: { goals: string[]; onChange: (g: string[]) => void }) {
  const [draft, setDraft] = useState('');
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1">
        {goals.map((g, i) => (
          <span key={i} className="inline-flex items-center gap-1 rounded border border-brass/40 bg-brass-soft/20 px-1.5 py-0.5 font-serif text-xs text-ink">
            {g}
            <button onClick={() => onChange(goals.filter((_, j) => j !== i))} className="text-ink-mute hover:text-crimson"><X size={10} /></button>
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && draft.trim()) {
              onChange([...goals, draft.trim()]);
              setDraft('');
            }
          }}
          placeholder="Add goal — first goal weights tick choices"
          className="flex-1 rounded border border-rule bg-parchment px-2 py-0.5 font-serif text-xs text-ink focus:border-crimson focus:outline-none"
        />
      </div>
    </div>
  );
}

function TerritoriesSection({
  world, onChange, onAdd,
}: { world: FactionWorld; onChange: (w: FactionWorld) => void; onAdd: () => void }) {
  const update = (id: string, patch: Partial<Territory>) => {
    onChange({ ...world, territories: world.territories.map(t => t.id === id ? { ...t, ...patch } : t) });
  };
  const remove = (id: string) => {
    onChange({
      ...world,
      territories: world.territories.filter(t => t.id !== id)
        .map(t => ({ ...t, neighbors: t.neighbors.filter(n => n !== id) })),
    });
  };
  const toggleNeighbor = (id: string, neighborId: string) => {
    const t = world.territories.find(x => x.id === id);
    if (!t) return;
    const has = t.neighbors.includes(neighborId);
    const neighbors = has ? t.neighbors.filter(n => n !== neighborId) : [...t.neighbors, neighborId];
    update(id, { neighbors });
    // Keep symmetric.
    const other = world.territories.find(x => x.id === neighborId);
    if (other) {
      const has2 = other.neighbors.includes(id);
      const neighbors2 = has ? other.neighbors.filter(n => n !== id) : (has2 ? other.neighbors : [...other.neighbors, id]);
      onChange({
        ...world,
        territories: world.territories.map(x =>
          x.id === id ? { ...x, neighbors }
          : x.id === neighborId ? { ...x, neighbors: neighbors2 }
          : x,
        ),
      });
    }
  };

  return (
    <section className="space-y-2.5 rounded border border-rule bg-parchment p-3 shadow-card">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-sm uppercase tracking-wide text-ink">Territories</h3>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 rounded border border-brass/40 bg-brass-soft/20 px-2 py-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-brass-soft/40"
        >
          <Plus size={12} /> Add
        </button>
      </div>
      {world.territories.length === 0 && (
        <p className="font-serif text-xs italic text-ink-mute">No territories — the engine still runs, but expansion/raids have nothing to target.</p>
      )}
      <div className="space-y-2">
        {world.territories.map(t => {
          const controller = world.factions.find(f => f.id === t.controllerId);
          return (
            <div key={t.id} className="space-y-1.5 rounded border border-rule bg-parchment-soft p-2.5">
              <div className="flex items-center gap-2">
                <span
                  className="inline-block size-3 rounded-sm border border-rule"
                  style={{ background: controller?.color ?? 'transparent' }}
                />
                <input
                  value={t.name}
                  onChange={(e) => update(t.id, { name: e.target.value })}
                  className="flex-1 bg-transparent font-display text-sm text-ink focus:outline-none"
                />
                <select
                  value={t.controllerId ?? ''}
                  onChange={(e) => update(t.id, { controllerId: e.target.value || null })}
                  className="rounded border border-rule bg-parchment px-2 py-0.5 font-serif text-xs text-ink focus:border-crimson focus:outline-none"
                >
                  <option value="">— neutral —</option>
                  {world.factions.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
                <label className="flex items-center gap-1 font-display text-[10px] uppercase tracking-wider text-brass-deep">
                  Value
                  <input
                    type="number" min={1} max={5}
                    value={t.value}
                    onChange={(e) => update(t.id, { value: Math.max(1, Math.min(5, Number(e.target.value) || 1)) })}
                    className="w-12 rounded border border-rule bg-parchment px-1.5 py-0.5 font-serif text-xs text-ink focus:border-crimson focus:outline-none"
                  />
                </label>
                <button onClick={() => remove(t.id)} className="text-ink-mute hover:text-crimson"><X size={14} /></button>
              </div>
              <div className="flex flex-wrap gap-1">
                <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Borders:</span>
                {world.territories.filter(x => x.id !== t.id).map(other => {
                  const linked = t.neighbors.includes(other.id);
                  return (
                    <button
                      key={other.id}
                      onClick={() => toggleNeighbor(t.id, other.id)}
                      className={`rounded border px-1.5 py-0.5 font-serif text-[10px] ${
                        linked
                          ? 'border-brass bg-brass-soft/30 text-brass-deep'
                          : 'border-rule bg-parchment text-ink-mute hover:border-brass'
                      }`}
                    >
                      {other.name}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function RelationshipsSection({
  world, onChange,
}: { world: FactionWorld; onChange: (w: FactionWorld) => void }) {
  const facs = world.factions;
  if (facs.length < 2) return null;
  return (
    <section className="space-y-2.5 rounded border border-rule bg-parchment p-3 shadow-card">
      <h3 className="flex items-center gap-1.5 font-display text-sm uppercase tracking-wide text-ink">
        <Handshake size={14} /> Relationships
      </h3>
      <p className="font-serif text-xs italic text-ink-mute">
        −10 sworn enemies · 0 neutral · +10 sworn allies. Affects diplomacy/raid targeting.
      </p>
      <div className="space-y-1">
        {facs.flatMap((a, i) => facs.slice(i + 1).map(b => {
          const rel = getRelationship(world.relationships, a.id, b.id);
          return (
            <div key={`${a.id}-${b.id}`} className="flex items-center gap-2 rounded border border-rule bg-parchment-soft p-1.5">
              <span className="truncate font-serif text-xs text-ink" style={{ minWidth: 100 }}>{a.name}</span>
              <span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">↔</span>
              <span className="truncate font-serif text-xs text-ink" style={{ minWidth: 100 }}>{b.name}</span>
              <input
                type="range" min={-10} max={10}
                value={rel.stance}
                onChange={(e) => onChange({
                  ...world,
                  relationships: setRelationship(world.relationships, a.id, b.id, { ...rel, stance: Number(e.target.value) }),
                })}
                className="flex-1 accent-crimson"
              />
              <span className={`w-10 text-right font-display text-xs ${
                rel.stance > 2 ? 'text-moss' : rel.stance < -2 ? 'text-crimson' : 'text-ink-mute'
              }`}>
                {rel.stance > 0 ? `+${rel.stance}` : rel.stance}
              </span>
            </div>
          );
        }))}
      </div>
    </section>
  );
}

function LogSection({
  world, expanded, onToggle,
}: { world: FactionWorld; expanded: boolean; onToggle: () => void }) {
  // Group by tick, newest first.
  const byTick = useMemo(() => {
    const m = new Map<number, TickEvent[]>();
    for (const e of world.log) {
      if (!m.has(e.tick)) m.set(e.tick, []);
      m.get(e.tick)!.push(e);
    }
    return Array.from(m.entries()).sort((a, b) => b[0] - a[0]);
  }, [world.log]);

  return (
    <section className="rounded border border-rule bg-parchment p-3 shadow-card">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between"
      >
        <h3 className="flex items-center gap-1.5 font-display text-sm uppercase tracking-wide text-ink">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Swords size={14} /> Tick log
          <span className="font-display text-xs text-brass-deep">({world.log.length} events)</span>
        </h3>
      </button>
      {expanded && (
        <div className="mt-2 max-h-96 space-y-1.5 overflow-y-auto">
          {byTick.length === 0 && (
            <p className="font-serif text-xs italic text-ink-mute">No history yet. Configure factions and press &ldquo;Run tick&rdquo;.</p>
          )}
          {byTick.map(([tick, events]) => (
            <div key={tick} className="rounded border border-rule bg-parchment-soft p-2">
              <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Tick {tick}</div>
              <ul className="mt-1 space-y-0.5">
                {events.map((e, i) => (
                  <li key={i} className="font-serif text-xs text-ink">
                    <span className="mr-1 font-display text-[10px] uppercase tracking-wider text-ink-mute">
                      [{e.kind}]
                    </span>
                    {e.summary}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
