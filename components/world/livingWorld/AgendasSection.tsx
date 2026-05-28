import React, { useEffect, useState } from 'react';
import { Plus, X, CheckCircle2, Target } from 'lucide-react';
import type { NpcAgenda, AgendaSchedule, NpcEntity } from '@/lib/world/types';

export function AgendasSection({
  agendas,
  npcs,
  onAdd,
  onUpdate,
  onRemove,
}: {
  agendas: NpcAgenda[];
  npcs: NpcEntity[];
  onAdd: (a: Omit<NpcAgenda, 'id'>) => void;
  onUpdate: (id: string, patch: Partial<NpcAgenda>) => void;
  onRemove: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [npcId, setNpcId] = useState('');
  const [goal, setGoal] = useState('');
  const [schedule, setSchedule] = useState<AgendaSchedule>('weekly');

  useEffect(() => {
    if (!npcs.find((n) => n.id === npcId)) setNpcId(npcs[0]?.id ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [npcs.length]);

  const npcName = (id: string) => npcs.find((n) => n.id === id)?.name || 'Unknown NPC';

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-sm uppercase tracking-wider text-brass-deep">
          <Target size={14} /> NPC Agendas
        </h2>
        <button
          onClick={() => setAdding((v) => !v)}
          className="inline-flex items-center gap-1 rounded border border-rule px-2 py-1 font-display text-[11px] uppercase tracking-wider text-ink-soft hover:bg-parchment-deep"
        >
          <Plus size={12} /> Add Agenda
        </button>
      </div>

      {adding && (
        <div className="space-y-3 rounded border border-crimson/40 bg-crimson/5 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
                NPC
              </span>
              <select
                name="agendaNpc"
                value={npcId}
                onChange={(e) => setNpcId(e.target.value)}
                className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 text-sm text-ink"
              >
                {npcs.length === 0 ? (
                  <option value="">— no NPCs —</option>
                ) : (
                  npcs.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name || 'Unnamed NPC'}
                    </option>
                  ))
                )}
              </select>
            </label>
            <label className="space-y-1">
              <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
                Schedule
              </span>
              <select
                name="agendaSchedule"
                value={schedule}
                onChange={(e) => setSchedule(e.target.value as AgendaSchedule)}
                className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 text-sm text-ink"
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="irregular">Irregular</option>
              </select>
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
                Goal
              </span>
              <input
                name="agendaGoal"
                type="text"
                value={goal}
                placeholder="e.g. Recruit allies in the Lower Wells"
                onChange={(e) => setGoal(e.target.value)}
                className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 text-sm text-ink placeholder:italic placeholder:text-ink-faint"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setAdding(false)}
              className="rounded border border-rule px-3 py-1.5 font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep"
            >
              Cancel
            </button>
            <button
              onClick={() => {
                if (!npcId) return;
                onAdd({ npcId, goal: goal.trim(), schedule, progress: 0, blockers: [] });
                setGoal('');
                setAdding(false);
              }}
              disabled={!npcId || !goal.trim()}
              className="rounded bg-crimson px-3 py-1.5 font-display text-xs uppercase tracking-wider text-parchment hover:bg-wine disabled:opacity-50"
            >
              Save Agenda
            </button>
          </div>
        </div>
      )}

      {agendas.length === 0 && !adding ? (
        <p className="rounded border border-dashed border-rule p-3 text-sm italic text-ink-mute">
          No agendas yet. Give an NPC a goal and they&rsquo;ll pursue it between sessions.
        </p>
      ) : (
        <div className="space-y-2">
          {agendas.map((a) => {
            const resolved = a.progress >= 100;
            return (
              <div
                key={a.id}
                data-agenda
                className="rounded border border-rule bg-parchment p-3 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-serif font-semibold text-ink">{npcName(a.npcId)}</span>
                      <span className="rounded-sm bg-parchment-deep px-1.5 py-0.5 font-display text-[10px] uppercase tracking-wider text-brass-deep">
                        {a.schedule}
                      </span>
                      {resolved && <CheckCircle2 size={14} className="text-moss" />}
                    </div>
                    <div className="text-ink-soft">
                      {a.goal || <span className="italic text-ink-mute">No goal set</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => onRemove(a.id)}
                    className="text-ink-mute hover:text-crimson"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-parchment-deep">
                    <div
                      className={`h-full ${resolved ? 'bg-moss' : 'bg-crimson'}`}
                      style={{ width: `${Math.min(100, a.progress)}%` }}
                    />
                  </div>
                  <span className="font-display text-xs tabular-nums text-brass-deep">
                    {a.progress}%
                  </span>
                  {resolved && (
                    <button
                      onClick={() => onUpdate(a.id, { progress: 0, blockers: [] })}
                      className="rounded border border-rule px-2 py-0.5 font-display text-[10px] uppercase tracking-wider text-ink-soft hover:bg-parchment-deep"
                    >
                      New Goal
                    </button>
                  )}
                </div>
                {a.blockers.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {a.blockers.map((b, i) => (
                      <span
                        key={i}
                        className="rounded-sm border border-crimson/30 bg-crimson/5 px-1.5 py-0.5 text-[11px] italic text-crimson"
                      >
                        {b}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
