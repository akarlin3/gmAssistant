'use client';

import { useState } from 'react';
import {
  type Chase, type Participant, type ChaseSide, type RoundEntry,
  TERRAINS,
  newChase, newParticipant, rollComplication, uid,
} from '@/lib/chaseTables';
import {
  Plus, Trash2, Dices,
  ArrowRight, ArrowLeft, SkipForward, Flag, X as XIcon,
  Footprints, Trophy, AlertOctagon,
} from 'lucide-react';

type Props = {
  chases: Chase[];
  onChange: (chases: Chase[]) => void;
};

export default function ChaseTracker({ chases, onChange }: Props) {
  const [activeId, setActiveId] = useState<string | null>(chases[0]?.id ?? null);

  const active = chases.find(c => c.id === activeId) ?? null;

  const updateActive = (patch: Partial<Chase>) => {
    if (!active) return;
    onChange(chases.map(c => c.id === active.id ? { ...c, ...patch, updatedAt: Date.now() } : c));
  };

  const addNew = (terrainId: string) => {
    const chase = newChase(terrainId);
    onChange([...chases, chase]);
    setActiveId(chase.id);
  };

  const deleteChase = (id: string) => {
    if (!confirm('Delete this chase? This cannot be undone.')) return;
    const next = chases.filter(c => c.id !== id);
    onChange(next);
    if (activeId === id) setActiveId(next[0]?.id ?? null);
  };

  const addParticipant = (side: ChaseSide) => {
    if (!active) return;
    updateActive({ participants: [...active.participants, newParticipant(side)] });
  };

  const updateParticipant = (pid: string, patch: Partial<Participant>) => {
    if (!active) return;
    updateActive({
      participants: active.participants.map(p => p.id === pid ? { ...p, ...patch } : p),
    });
  };

  const removeParticipant = (pid: string) => {
    if (!active) return;
    updateActive({ participants: active.participants.filter(p => p.id !== pid) });
  };

  const rollForParticipant = (pid: string) => {
    if (!active) return;
    const p = active.participants.find(p => p.id === pid);
    if (!p) return;
    const complication = rollComplication(active.terrain);
    const entry: RoundEntry = {
      id: uid(),
      roundNumber: active.currentRound,
      participantId: pid,
      participantName: p.name || (p.side === 'quarry' ? 'Quarry' : 'Pursuer'),
      complication,
      outcome: '',
    };
    updateActive({ rounds: [...active.rounds, entry] });
  };

  const rollGeneric = () => {
    if (!active) return;
    const complication = rollComplication(active.terrain);
    const entry: RoundEntry = {
      id: uid(),
      roundNumber: active.currentRound,
      participantId: null,
      participantName: 'Both sides',
      complication,
      outcome: '',
    };
    updateActive({ rounds: [...active.rounds, entry] });
  };

  const updateRoundEntry = (rid: string, patch: Partial<RoundEntry>) => {
    if (!active) return;
    updateActive({
      rounds: active.rounds.map(r => r.id === rid ? { ...r, ...patch } : r),
    });
  };

  const removeRoundEntry = (rid: string) => {
    if (!active) return;
    updateActive({ rounds: active.rounds.filter(r => r.id !== rid) });
  };

  const advanceRound = () => {
    if (!active) return;
    updateActive({ currentRound: active.currentRound + 1 });
  };

  const adjustGap = (delta: number) => {
    if (!active) return;
    const next = active.gap + delta;
    let resolved = active.resolved;
    if (next >= active.escapeGap) resolved = 'escaped';
    else if (next <= active.catchGap) resolved = 'caught';
    updateActive({ gap: next, resolved });
  };

  const reopenChase = () => {
    if (!active) return;
    updateActive({ resolved: 'ongoing' });
  };

  if (chases.length === 0) {
    return (
      <div className="space-y-3">
        <div className="font-serif text-xs italic text-ink-mute">
          Track chase scenes round-by-round. Set up participants, roll complications appropriate to the terrain, adjust the distance gap each round. Chase ends when the gap closes to zero or stretches past escape.
        </div>
        <div className="font-display text-xs uppercase tracking-wider text-brass-deep">Start a new chase in:</div>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
          {TERRAINS.map(t => (
            <button
              key={t.id}
              onClick={() => addNew(t.id)}
              className="rounded border border-rule bg-parchment-soft px-2.5 py-1.5 text-left text-xs text-ink shadow-card hover:bg-parchment-deep"
            >
              <div className="font-display uppercase tracking-wider text-brass-deep">{t.label}</div>
              <div className="font-serif text-[10px] italic text-ink-mute">{t.note}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      {/* Chase picker */}
      <div className="flex flex-wrap items-center gap-1.5">
        {chases.map(c => (
          <button
            key={c.id}
            onClick={() => setActiveId(c.id)}
            className={`flex items-center gap-1.5 rounded border px-2.5 py-1 font-display text-xs uppercase tracking-wider transition-colors ${
              c.id === activeId
                ? 'border-crimson bg-crimson text-parchment'
                : 'border-rule bg-parchment-soft text-ink-soft hover:bg-parchment-deep'
            }`}
          >
            <ResolutionIcon resolution={c.resolved} />
            {c.name || 'Untitled'}
            <span className={`font-serif text-[10px] tabular-nums ${c.id === activeId ? 'text-parchment/80' : 'text-ink-mute'}`}>R{c.currentRound}</span>
          </button>
        ))}
        <div className="flex gap-1">
          {TERRAINS.slice(0, 3).map(t => (
            <button
              key={t.id}
              onClick={() => addNew(t.id)}
              className="rounded border border-dashed border-rule px-2 py-1 font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep hover:text-ink"
              title={`New ${t.label} chase`}
            >
              <Plus size={11} className="inline" /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {active && (
        <>
          {/* Header */}
          <div className="space-y-2 rounded border border-rule bg-parchment-soft p-3 shadow-card">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={active.name}
                onChange={(e) => updateActive({ name: e.target.value })}
                placeholder="Chase Name"
                className="flex-1 border-b border-rule bg-transparent pb-0.5 font-display text-base tracking-wider text-ink placeholder-ink-faint focus:border-brass focus:outline-none"
              />
              <select
                value={active.terrain}
                onChange={(e) => updateActive({ terrain: e.target.value })}
                className="rounded border border-rule bg-parchment px-2 py-1 font-serif text-xs text-ink"
              >
                {TERRAINS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>

            {/* Round + Gap controls */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div>
                <div className="mb-0.5 font-display text-[10px] uppercase tracking-wider text-ink-mute">Round</div>
                <div className="flex items-center gap-1">
                  <span className="w-8 text-center font-display text-lg tabular-nums text-ink">{active.currentRound}</span>
                  <button
                    onClick={advanceRound}
                    className="flex items-center gap-1 rounded border border-rule bg-parchment px-2 py-0.5 font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep"
                  >
                    <SkipForward size={11} /> Next
                  </button>
                </div>
              </div>
              <div>
                <div className="mb-0.5 font-display text-[10px] uppercase tracking-wider text-ink-mute">Gap</div>
                <div className="flex items-center gap-1">
                  <button onClick={() => adjustGap(-1)} className="text-ink-mute hover:text-ink"><ArrowLeft size={14} /></button>
                  <span className="w-8 text-center font-display text-lg tabular-nums text-ink">{active.gap}</span>
                  <button onClick={() => adjustGap(1)} className="text-ink-mute hover:text-ink"><ArrowRight size={14} /></button>
                </div>
                <div className="mt-0.5 font-serif text-[10px] italic text-ink-faint">
                  Caught at {active.catchGap}, escapes at {active.escapeGap}
                </div>
              </div>
              <div>
                <div className="mb-0.5 font-display text-[10px] uppercase tracking-wider text-ink-mute">Status</div>
                <div className="flex items-center gap-1.5">
                  <ResolutionIcon resolution={active.resolved} />
                  <span className="font-serif text-sm capitalize text-ink">{active.resolved}</span>
                </div>
              </div>
            </div>

            {/* Thresholds editor */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <div className="mb-0.5 font-display text-[10px] uppercase tracking-wider text-ink-mute">Catch at (gap &le; this)</div>
                <input
                  type="number"
                  value={active.catchGap}
                  onChange={(e) => updateActive({ catchGap: Number(e.target.value) })}
                  className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-xs tabular-nums text-ink focus:border-brass focus:outline-none"
                />
              </div>
              <div>
                <div className="mb-0.5 font-display text-[10px] uppercase tracking-wider text-ink-mute">Escape at (gap &ge; this)</div>
                <input
                  type="number"
                  value={active.escapeGap}
                  onChange={(e) => updateActive({ escapeGap: Number(e.target.value) })}
                  className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-xs tabular-nums text-ink focus:border-brass focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {active.resolved !== 'ongoing' && (
                <button
                  onClick={reopenChase}
                  className="rounded border border-brass/40 bg-brass-soft/20 px-2.5 py-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-brass-soft/40"
                >
                  Reopen
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={() => deleteChase(active.id)}
                className="flex items-center gap-1 rounded border border-crimson/40 bg-crimson/5 px-2.5 py-1 font-display text-xs uppercase tracking-wider text-crimson-deep hover:bg-crimson/15"
              >
                <Trash2 size={12} /> Delete
              </button>
            </div>
          </div>

          {/* Participants */}
          <div className="space-y-2 rounded border border-rule bg-parchment-soft p-3 shadow-card">
            <div className="flex items-center justify-between">
              <span className="font-display text-sm uppercase tracking-wider text-brass-deep">Participants</span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => addParticipant('pursuer')}
                  className="flex items-center gap-1 rounded border border-red-700/40 bg-red-100/60 px-2 py-0.5 font-display text-xs uppercase tracking-wider text-red-800 hover:bg-red-100"
                >
                  <Plus size={11} /> Pursuer
                </button>
                <button
                  onClick={() => addParticipant('quarry')}
                  className="flex items-center gap-1 rounded border border-sky-700/40 bg-sky-100/60 px-2 py-0.5 font-display text-xs uppercase tracking-wider text-sky-800 hover:bg-sky-100"
                >
                  <Plus size={11} /> Quarry
                </button>
              </div>
            </div>

            {active.participants.length === 0 ? (
              <p className="font-serif text-xs italic text-ink-mute">No participants yet. Add at least one quarry and one pursuer.</p>
            ) : (
              <div className="space-y-1.5">
                {active.participants.map(p => (
                  <div key={p.id} className={`space-y-1.5 rounded border p-2 ${
                    p.side === 'quarry' ? 'border-sky-700/40 bg-sky-100/40' : 'border-red-700/40 bg-red-100/40'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className={`font-display text-[10px] uppercase tracking-wider ${p.side === 'quarry' ? 'text-sky-800' : 'text-red-800'}`}>
                        {p.side}
                      </span>
                      <input
                        type="text"
                        value={p.name}
                        onChange={(e) => updateParticipant(p.id, { name: e.target.value })}
                        placeholder="Name"
                        className="flex-1 border-b border-rule bg-transparent pb-0.5 font-serif text-sm text-ink placeholder-ink-faint focus:border-brass focus:outline-none"
                      />
                      <button
                        onClick={() => rollForParticipant(p.id)}
                        className="flex items-center gap-1 rounded border border-brass/40 bg-brass-soft/20 px-2 py-0.5 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-brass-soft/40"
                        title="Roll a complication for this participant"
                      >
                        <Dices size={11} /> Roll
                      </button>
                      <button
                        onClick={() => removeParticipant(p.id)}
                        className="text-ink-faint hover:text-crimson"
                      >
                        <XIcon size={13} />
                      </button>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5 text-xs">
                      <div>
                        <div className="font-display text-[10px] uppercase tracking-wider text-ink-mute">Speed Mod</div>
                        <input
                          type="number"
                          value={p.speedMod}
                          onChange={(e) => updateParticipant(p.id, { speedMod: Number(e.target.value) })}
                          className="w-full rounded border border-rule bg-parchment px-1 py-0.5 font-serif text-xs tabular-nums text-ink focus:border-brass focus:outline-none"
                        />
                      </div>
                      <div>
                        <div className="font-display text-[10px] uppercase tracking-wider text-ink-mute">Exhaustion</div>
                        <input
                          type="number"
                          min={0}
                          max={6}
                          value={p.exhaustion}
                          onChange={(e) => updateParticipant(p.id, { exhaustion: Math.max(0, Math.min(6, Number(e.target.value))) })}
                          className="w-full rounded border border-rule bg-parchment px-1 py-0.5 font-serif text-xs tabular-nums text-ink focus:border-brass focus:outline-none"
                        />
                      </div>
                      <div>
                        <div className="font-display text-[10px] uppercase tracking-wider text-ink-mute">Notes</div>
                        <input
                          type="text"
                          value={p.notes}
                          onChange={(e) => updateParticipant(p.id, { notes: e.target.value })}
                          placeholder="..."
                          className="w-full rounded border border-rule bg-parchment px-1 py-0.5 font-serif text-xs text-ink placeholder-ink-faint focus:border-brass focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-1">
              <button
                onClick={rollGeneric}
                className="flex items-center gap-1 rounded border border-brass/40 bg-brass-soft/20 px-2.5 py-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-brass-soft/40"
                title="Roll a complication affecting everyone"
              >
                <Dices size={11} /> Roll Generic Complication
              </button>
            </div>
          </div>

          {/* Round log */}
          <div className="space-y-2 rounded border border-rule bg-parchment-soft p-3 shadow-card">
            <div className="font-display text-sm uppercase tracking-wider text-brass-deep">Round Log</div>
            {active.rounds.length === 0 ? (
              <p className="font-serif text-xs italic text-ink-mute">No complications rolled yet. Click &ldquo;Roll&rdquo; next to a participant.</p>
            ) : (
              <div className="space-y-1.5">
                {[...active.rounds].reverse().map(entry => (
                  <div key={entry.id} className="space-y-1 rounded border border-rule bg-parchment p-2">
                    <div className="flex items-center gap-2 font-display text-[10px] uppercase tracking-wider text-ink-mute">
                      <span className="tabular-nums">R{entry.roundNumber}</span>
                      <span>&middot;</span>
                      <span>{entry.participantName}</span>
                      <div className="flex-1" />
                      <button
                        onClick={() => removeRoundEntry(entry.id)}
                        className="text-ink-faint hover:text-crimson"
                      >
                        <XIcon size={11} />
                      </button>
                    </div>
                    <div className="font-serif text-xs leading-relaxed text-ink">{entry.complication}</div>
                    <input
                      type="text"
                      value={entry.outcome}
                      onChange={(e) => updateRoundEntry(entry.id, { outcome: e.target.value })}
                      placeholder="Outcome: what actually happened"
                      className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 font-serif text-xs text-ink placeholder-ink-faint focus:border-brass focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Chase notes */}
          <div>
            <div className="mb-0.5 font-display text-xs uppercase tracking-wider text-ink-mute">Chase Notes</div>
            <textarea
              value={active.notes}
              onChange={(e) => updateActive({ notes: e.target.value })}
              placeholder="Setup, motivations, what was at stake, how it ended"
              rows={3}
              className="w-full resize-y rounded border border-rule bg-parchment-soft px-2 py-1.5 font-serif text-sm text-ink placeholder-ink-faint focus:border-brass focus:outline-none"
            />
          </div>
        </>
      )}
    </div>
  );
}

function ResolutionIcon({ resolution }: { resolution: string }) {
  if (resolution === 'caught')   return <AlertOctagon size={11} className="text-crimson" />;
  if (resolution === 'escaped')  return <Trophy size={11} className="text-emerald-700" />;
  if (resolution === 'aborted')  return <Flag size={11} className="text-ink-mute" />;
  return <Footprints size={11} className="text-brass-deep" />;
}
