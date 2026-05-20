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
        <div className="text-xs font-serif italic text-ink-mute">
          Track chase scenes round-by-round. Set up participants, roll complications appropriate to the terrain, adjust the distance gap each round. Chase ends when the gap closes to zero or stretches past escape.
        </div>
        <div className="text-xs font-display uppercase tracking-wider text-brass-deep">Start a new chase in:</div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {TERRAINS.map(t => (
            <button
              key={t.id}
              onClick={() => addNew(t.id)}
              className="text-xs px-2.5 py-1.5 rounded border border-rule bg-parchment-soft text-ink hover:bg-parchment-deep text-left shadow-card"
            >
              <div className="font-display uppercase tracking-wider text-brass-deep">{t.label}</div>
              <div className="text-[10px] font-serif italic text-ink-mute">{t.note}</div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      {/* Chase picker */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {chases.map(c => (
          <button
            key={c.id}
            onClick={() => setActiveId(c.id)}
            className={`text-xs px-2.5 py-1 rounded border flex items-center gap-1.5 font-display uppercase tracking-wider transition-colors ${
              c.id === activeId
                ? 'bg-crimson border-crimson text-parchment'
                : 'border-rule bg-parchment-soft text-ink-soft hover:bg-parchment-deep'
            }`}
          >
            <ResolutionIcon resolution={c.resolved} />
            {c.name || 'Untitled'}
            <span className={`text-[10px] font-serif tabular-nums ${c.id === activeId ? 'text-parchment/80' : 'text-ink-mute'}`}>R{c.currentRound}</span>
          </button>
        ))}
        <div className="flex gap-1">
          {TERRAINS.slice(0, 3).map(t => (
            <button
              key={t.id}
              onClick={() => addNew(t.id)}
              className="text-xs px-2 py-1 rounded border border-dashed border-rule text-ink-soft hover:text-ink hover:bg-parchment-deep font-display uppercase tracking-wider"
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
          <div className="rounded border border-rule bg-parchment-soft p-3 space-y-2 shadow-card">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={active.name}
                onChange={(e) => updateActive({ name: e.target.value })}
                placeholder="Chase Name"
                className="flex-1 bg-transparent border-b border-rule text-base font-display tracking-wider text-ink placeholder-ink-faint focus:border-brass focus:outline-none pb-0.5"
              />
              <select
                value={active.terrain}
                onChange={(e) => updateActive({ terrain: e.target.value })}
                className="bg-parchment border border-rule rounded px-2 py-1 text-xs font-serif text-ink"
              >
                {TERRAINS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>

            {/* Round + Gap controls */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              <div>
                <div className="text-[10px] font-display uppercase tracking-wider text-ink-mute mb-0.5">Round</div>
                <div className="flex items-center gap-1">
                  <span className="text-lg font-display tabular-nums text-ink w-8 text-center">{active.currentRound}</span>
                  <button
                    onClick={advanceRound}
                    className="text-xs px-2 py-0.5 rounded border border-rule bg-parchment text-ink-soft hover:bg-parchment-deep flex items-center gap-1 font-display uppercase tracking-wider"
                  >
                    <SkipForward size={11} /> Next
                  </button>
                </div>
              </div>
              <div>
                <div className="text-[10px] font-display uppercase tracking-wider text-ink-mute mb-0.5">Gap</div>
                <div className="flex items-center gap-1">
                  <button onClick={() => adjustGap(-1)} className="text-ink-mute hover:text-ink"><ArrowLeft size={14} /></button>
                  <span className="text-lg font-display tabular-nums text-ink w-8 text-center">{active.gap}</span>
                  <button onClick={() => adjustGap(1)} className="text-ink-mute hover:text-ink"><ArrowRight size={14} /></button>
                </div>
                <div className="text-[10px] font-serif italic text-ink-faint mt-0.5">
                  Caught at {active.catchGap}, escapes at {active.escapeGap}
                </div>
              </div>
              <div>
                <div className="text-[10px] font-display uppercase tracking-wider text-ink-mute mb-0.5">Status</div>
                <div className="flex items-center gap-1.5">
                  <ResolutionIcon resolution={active.resolved} />
                  <span className="text-sm font-serif text-ink capitalize">{active.resolved}</span>
                </div>
              </div>
            </div>

            {/* Thresholds editor */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div>
                <div className="text-[10px] font-display uppercase tracking-wider text-ink-mute mb-0.5">Catch at (gap &le; this)</div>
                <input
                  type="number"
                  value={active.catchGap}
                  onChange={(e) => updateActive({ catchGap: Number(e.target.value) })}
                  className="w-full bg-parchment border border-rule rounded px-2 py-1 text-xs font-serif tabular-nums text-ink focus:border-brass focus:outline-none"
                />
              </div>
              <div>
                <div className="text-[10px] font-display uppercase tracking-wider text-ink-mute mb-0.5">Escape at (gap &ge; this)</div>
                <input
                  type="number"
                  value={active.escapeGap}
                  onChange={(e) => updateActive({ escapeGap: Number(e.target.value) })}
                  className="w-full bg-parchment border border-rule rounded px-2 py-1 text-xs font-serif tabular-nums text-ink focus:border-brass focus:outline-none"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-1.5 pt-1">
              {active.resolved !== 'ongoing' && (
                <button
                  onClick={reopenChase}
                  className="text-xs px-2.5 py-1 rounded border border-brass/40 bg-brass-soft/20 text-brass-deep hover:bg-brass-soft/40 font-display uppercase tracking-wider"
                >
                  Reopen
                </button>
              )}
              <div className="flex-1" />
              <button
                onClick={() => deleteChase(active.id)}
                className="text-xs px-2.5 py-1 rounded border border-crimson/40 bg-crimson/5 text-crimson-deep hover:bg-crimson/15 flex items-center gap-1 font-display uppercase tracking-wider"
              >
                <Trash2 size={12} /> Delete
              </button>
            </div>
          </div>

          {/* Participants */}
          <div className="rounded border border-rule bg-parchment-soft p-3 space-y-2 shadow-card">
            <div className="flex items-center justify-between">
              <span className="text-sm font-display uppercase tracking-wider text-brass-deep">Participants</span>
              <div className="flex gap-1.5">
                <button
                  onClick={() => addParticipant('pursuer')}
                  className="text-xs px-2 py-0.5 rounded border border-red-700/40 bg-red-100/60 text-red-800 hover:bg-red-100 flex items-center gap-1 font-display uppercase tracking-wider"
                >
                  <Plus size={11} /> Pursuer
                </button>
                <button
                  onClick={() => addParticipant('quarry')}
                  className="text-xs px-2 py-0.5 rounded border border-sky-700/40 bg-sky-100/60 text-sky-800 hover:bg-sky-100 flex items-center gap-1 font-display uppercase tracking-wider"
                >
                  <Plus size={11} /> Quarry
                </button>
              </div>
            </div>

            {active.participants.length === 0 ? (
              <p className="text-xs font-serif italic text-ink-mute">No participants yet. Add at least one quarry and one pursuer.</p>
            ) : (
              <div className="space-y-1.5">
                {active.participants.map(p => (
                  <div key={p.id} className={`rounded border p-2 space-y-1.5 ${
                    p.side === 'quarry' ? 'border-sky-700/40 bg-sky-100/40' : 'border-red-700/40 bg-red-100/40'
                  }`}>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] uppercase font-display tracking-wider ${p.side === 'quarry' ? 'text-sky-800' : 'text-red-800'}`}>
                        {p.side}
                      </span>
                      <input
                        type="text"
                        value={p.name}
                        onChange={(e) => updateParticipant(p.id, { name: e.target.value })}
                        placeholder="Name"
                        className="flex-1 bg-transparent border-b border-rule text-sm font-serif text-ink placeholder-ink-faint focus:border-brass focus:outline-none pb-0.5"
                      />
                      <button
                        onClick={() => rollForParticipant(p.id)}
                        className="text-xs px-2 py-0.5 rounded border border-brass/40 bg-brass-soft/20 text-brass-deep hover:bg-brass-soft/40 flex items-center gap-1 font-display uppercase tracking-wider"
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
                        <div className="text-[10px] font-display uppercase tracking-wider text-ink-mute">Speed Mod</div>
                        <input
                          type="number"
                          value={p.speedMod}
                          onChange={(e) => updateParticipant(p.id, { speedMod: Number(e.target.value) })}
                          className="w-full bg-parchment border border-rule rounded px-1 py-0.5 text-xs font-serif tabular-nums text-ink focus:border-brass focus:outline-none"
                        />
                      </div>
                      <div>
                        <div className="text-[10px] font-display uppercase tracking-wider text-ink-mute">Exhaustion</div>
                        <input
                          type="number"
                          min={0}
                          max={6}
                          value={p.exhaustion}
                          onChange={(e) => updateParticipant(p.id, { exhaustion: Math.max(0, Math.min(6, Number(e.target.value))) })}
                          className="w-full bg-parchment border border-rule rounded px-1 py-0.5 text-xs font-serif tabular-nums text-ink focus:border-brass focus:outline-none"
                        />
                      </div>
                      <div>
                        <div className="text-[10px] font-display uppercase tracking-wider text-ink-mute">Notes</div>
                        <input
                          type="text"
                          value={p.notes}
                          onChange={(e) => updateParticipant(p.id, { notes: e.target.value })}
                          placeholder="..."
                          className="w-full bg-parchment border border-rule rounded px-1 py-0.5 text-xs font-serif text-ink placeholder-ink-faint focus:border-brass focus:outline-none"
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
                className="text-xs px-2.5 py-1 rounded border border-brass/40 bg-brass-soft/20 text-brass-deep hover:bg-brass-soft/40 flex items-center gap-1 font-display uppercase tracking-wider"
                title="Roll a complication affecting everyone"
              >
                <Dices size={11} /> Roll Generic Complication
              </button>
            </div>
          </div>

          {/* Round log */}
          <div className="rounded border border-rule bg-parchment-soft p-3 space-y-2 shadow-card">
            <div className="text-sm font-display uppercase tracking-wider text-brass-deep">Round Log</div>
            {active.rounds.length === 0 ? (
              <p className="text-xs font-serif italic text-ink-mute">No complications rolled yet. Click &ldquo;Roll&rdquo; next to a participant.</p>
            ) : (
              <div className="space-y-1.5">
                {[...active.rounds].reverse().map(entry => (
                  <div key={entry.id} className="rounded border border-rule bg-parchment p-2 space-y-1">
                    <div className="flex items-center gap-2 text-[10px] font-display uppercase tracking-wider text-ink-mute">
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
                    <div className="text-xs font-serif text-ink leading-relaxed">{entry.complication}</div>
                    <input
                      type="text"
                      value={entry.outcome}
                      onChange={(e) => updateRoundEntry(entry.id, { outcome: e.target.value })}
                      placeholder="Outcome: what actually happened"
                      className="w-full bg-parchment-soft border border-rule rounded px-2 py-1 text-xs font-serif text-ink placeholder-ink-faint focus:border-brass focus:outline-none"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Chase notes */}
          <div>
            <div className="text-xs font-display uppercase tracking-wider text-ink-mute mb-0.5">Chase Notes</div>
            <textarea
              value={active.notes}
              onChange={(e) => updateActive({ notes: e.target.value })}
              placeholder="Setup, motivations, what was at stake, how it ended"
              rows={3}
              className="w-full bg-parchment-soft border border-rule rounded px-2 py-1.5 text-sm font-serif text-ink placeholder-ink-faint focus:border-brass focus:outline-none resize-y"
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
