'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Clock,
  Plus,
  X,
  Pause,
  Play,
  Undo2,
  Eye,
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Target,
} from 'lucide-react';
import { SoloNote } from '@/components/campaignEditor/prepPrimitives';
import { applyTicks, previewTicks, clockName, downtimeName } from '@/lib/world/tick';
import { undoLastBriefing, canUndo } from '@/lib/world/undo';
import {
  readWorldClock,
  makeWorldId,
  type WorldClock,
  type TickRule,
  type TickTargetType,
  type NpcAgenda,
  type AgendaSchedule,
  type BriefingChange,
} from '@/lib/world/types';
import { makeEntityId } from '@/lib/playerMode/share';
import { relativeTime } from '@/lib/relativeTime';
import { formatChange } from '@/lib/world/format';
import { BriefingView } from './BriefingView';

type GetFn = (k: string, fb: any) => any;
type SetFn = (k: string, v: any) => void;

type Props = {
  get: GetFn;
  setVal: SetFn;
  isPro: boolean;
  soloMode: boolean;
  campaignName: string;
};

type PreviewState = {
  toDay: number;
  label: string;
  changes: BriefingChange[];
  rngSeed: number;
} | null;

const TARGET_LABELS: Record<TickTargetType, string> = {
  factionClock: 'Faction Clock',
  downtime: 'Downtime',
  renown: 'Renown',
};

export default function LivingWorldTab({ get, setVal, isPro, soloMode, campaignName }: Props) {
  // Backfill stable ids on the entities the engine FKs, so rules/agendas can
  // reference them. Downtime entries already carry ids.
  useEffect(() => {
    for (const key of ['clocks', 'factions', 'npcs']) {
      const arr = get(key, []);
      if (!Array.isArray(arr)) continue;
      let changed = false;
      const next = arr.map((e: any) => {
        if (e && typeof e === 'object' && !Array.isArray(e) && !e.id) {
          changed = true;
          return { ...e, id: makeEntityId() };
        }
        return e;
      });
      if (changed) setVal(key, next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clocks: any[] = Array.isArray(get('clocks', [])) ? get('clocks', []) : [];
  const downtime: any[] = (Array.isArray(get('downtime', [])) ? get('downtime', []) : []).filter(
    (d: any) => d && !d.archived,
  );
  const factions: any[] = Array.isArray(get('factions', [])) ? get('factions', []) : [];
  const npcs: any[] = Array.isArray(get('npcs', [])) ? get('npcs', []) : [];

  const wc: WorldClock = useMemo(
    () => readWorldClock({ worldClock: get('worldClock', null) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(get('worldClock', null))],
  );

  const [preview, setPreview] = useState<PreviewState>(null);

  // Snapshot of the engine-relevant slice of campaign data.
  const buildData = () => ({
    worldClock: wc,
    clocks: get('clocks', []),
    downtime: get('downtime', []),
    factions: get('factions', []),
    npcs: get('npcs', []),
  });

  const writeBack = (next: Record<string, any>) => {
    setVal('clocks', next.clocks);
    setVal('downtime', next.downtime);
    setVal('factions', next.factions);
    setVal('worldClock', next.worldClock);
  };

  const updateClock = (updater: (clock: WorldClock) => void) => {
    const draft = structuredClone(wc);
    updater(draft);
    setVal('worldClock', draft);
  };

  // --- Advance / preview / apply -------------------------------------------
  const openPreview = (toDay: number, label: string) => {
    if (toDay <= wc.currentDay) return;
    const { changes, rngSeed } = previewTicks({ data: buildData(), toDay });
    setPreview({ toDay, label, changes, rngSeed });
  };

  const applyPreview = () => {
    if (!preview) return;
    const { data: next, briefing } = applyTicks({
      data: buildData(),
      toDay: preview.toDay,
      rngSeed: preview.rngSeed,
    });
    writeBack(next);
    setVal('__livingWorldBriefingPendingId', briefing.id);
    setPreview(null);
  };

  const onUndo = () => {
    if (!canUndo(buildData())) return;
    const next = undoLastBriefing(buildData());
    writeBack(next);
    setVal('__livingWorldBriefingPendingId', '');
  };

  // --- Tick rules -----------------------------------------------------------
  const addRule = (rule: Omit<TickRule, 'id'>) => {
    updateClock((c) => {
      c.tickRules.push({ ...rule, id: makeWorldId() });
    });
  };
  const updateRule = (id: string, patch: Partial<TickRule>) => {
    updateClock((c) => {
      const r = c.tickRules.find((x) => x.id === id);
      if (r) Object.assign(r, patch);
    });
  };
  const removeRule = (id: string) => {
    updateClock((c) => {
      c.tickRules = c.tickRules.filter((x) => x.id !== id);
    });
  };

  // --- Agendas --------------------------------------------------------------
  const addAgenda = (agenda: Omit<NpcAgenda, 'id'>) => {
    updateClock((c) => {
      c.agendas.push({ ...agenda, id: makeWorldId() });
    });
  };
  const updateAgenda = (id: string, patch: Partial<NpcAgenda>) => {
    updateClock((c) => {
      const a = c.agendas.find((x) => x.id === id);
      if (a) Object.assign(a, patch);
    });
  };
  const removeAgenda = (id: string) => {
    updateClock((c) => {
      c.agendas = c.agendas.filter((x) => x.id !== id);
    });
  };

  const setBriefingNarrative = (briefingId: string, narrative: string) => {
    updateClock((c) => {
      const b = c.briefingLog.find((x) => x.id === briefingId);
      if (b) b.narrative = narrative;
    });
  };

  const entityNameFor = (type: TickTargetType, id: string): string => {
    if (type === 'factionClock') {
      const fc = clocks.find((c) => c.id === id);
      return fc ? clockName(fc) : 'Unknown clock';
    }
    if (type === 'downtime') {
      const dt = downtime.find((d) => d.id === id);
      return dt ? downtimeName(dt) : 'Unknown downtime';
    }
    const f = factions.find((x) => x.id === id);
    return f?.name || 'Unknown faction';
  };

  const briefings = [...wc.briefingLog].reverse();

  return (
    <div className="space-y-5">
      <SoloNote>
        The world keeps turning between sessions. Define tick rules so faction clocks advance,
        downtime resolves, and NPCs chase their agendas on their own — then read the &ldquo;While
        You Were Away&rdquo; briefing when you sit back down. No more frozen world waiting on you.
      </SoloNote>

      {/* World status + advance controls */}
      <section className="rounded border border-rule bg-parchment p-4 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CalendarClock size={20} className="text-crimson" />
            <div>
              <div className="font-display text-lg text-ink">In-World Day {wc.currentDay}</div>
              <div className="font-serif text-xs text-ink-mute">
                Last advanced {relativeTime(new Date(wc.lastTickAt))}
              </div>
            </div>
          </div>
          <button
            onClick={onUndo}
            disabled={!canUndo(buildData())}
            className="inline-flex items-center gap-1.5 rounded border border-rule px-2.5 py-1.5 font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep disabled:opacity-40"
          >
            <Undo2 size={12} /> Undo Last Tick
          </button>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => openPreview(wc.currentDay + 1, 'Advance 1 Day')}
            className="inline-flex items-center gap-1.5 rounded bg-parchment-deep px-3 py-1.5 font-display text-xs uppercase tracking-wider text-ink hover:bg-rule"
          >
            <CalendarDays size={12} /> Advance 1 Day
          </button>
          <button
            onClick={() => openPreview(wc.currentDay + 7, 'Advance 1 Week')}
            className="inline-flex items-center gap-1.5 rounded bg-parchment-deep px-3 py-1.5 font-display text-xs uppercase tracking-wider text-ink hover:bg-rule"
          >
            <CalendarDays size={12} /> Advance 1 Week
          </button>
          <button
            onClick={() => openPreview(wc.currentDay + 7, 'Advance To Next Session')}
            className="inline-flex items-center gap-1.5 rounded bg-crimson px-3 py-1.5 font-display text-xs uppercase tracking-wider text-parchment hover:bg-wine"
          >
            <CalendarPlus size={12} /> Advance To Next Session
          </button>
        </div>
      </section>

      {!soloMode && (
        <div className="rounded border border-brass/40 bg-brass/5 p-3 font-serif text-sm text-ink-soft">
          <span className="font-display text-xs uppercase tracking-wider text-brass-deep">
            Note ·{' '}
          </span>
          Auto-progression is built for solo play. Your tick rules are saved, but switch to Solo
          mode if you want the world to move on its own between sessions.
        </div>
      )}

      {/* Tick rules */}
      <TickRulesSection
        rules={wc.tickRules}
        clocks={clocks}
        downtime={downtime}
        factions={factions}
        entityNameFor={entityNameFor}
        onAdd={addRule}
        onUpdate={updateRule}
        onRemove={removeRule}
      />

      {/* NPC agendas */}
      <AgendasSection
        agendas={wc.agendas}
        npcs={npcs}
        onAdd={addAgenda}
        onUpdate={updateAgenda}
        onRemove={removeAgenda}
      />

      {/* Briefing log */}
      <section className="space-y-3">
        <h2 className="flex items-center gap-2 font-display text-sm uppercase tracking-wider text-brass-deep">
          <Eye size={14} /> Briefing Log
        </h2>
        {briefings.length === 0 ? (
          <p className="rounded border border-dashed border-rule p-3 text-sm italic text-ink-mute">
            No briefings yet. Advance the world to generate one.
          </p>
        ) : (
          briefings.map((b) => (
            <BriefingView
              key={b.id}
              briefing={b}
              isPro={isPro}
              campaignName={campaignName}
              onNarrative={setBriefingNarrative}
            />
          ))
        )}
      </section>

      {preview && (
        <PreviewModal
          preview={preview}
          currentDay={wc.currentDay}
          onChangeDay={(toDay) => openPreview(toDay, preview.label)}
          onApply={applyPreview}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

// --- Tick Rules ------------------------------------------------------------

function TickRulesSection({
  rules,
  clocks,
  downtime,
  factions,
  entityNameFor,
  onAdd,
  onUpdate,
  onRemove,
}: {
  rules: TickRule[];
  clocks: any[];
  downtime: any[];
  factions: any[];
  entityNameFor: (t: TickTargetType, id: string) => string;
  onAdd: (rule: Omit<TickRule, 'id'>) => void;
  onUpdate: (id: string, patch: Partial<TickRule>) => void;
  onRemove: (id: string) => void;
}) {
  const [adding, setAdding] = useState(false);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-sm uppercase tracking-wider text-brass-deep">
          <Clock size={14} /> Tick Rules
        </h2>
        <button
          onClick={() => setAdding((v) => !v)}
          className="inline-flex items-center gap-1 rounded border border-rule px-2 py-1 font-display text-[11px] uppercase tracking-wider text-ink-soft hover:bg-parchment-deep"
        >
          <Plus size={12} /> Add Tick Rule
        </button>
      </div>

      {adding && (
        <AddRuleForm
          clocks={clocks}
          downtime={downtime}
          factions={factions}
          onAdd={(rule) => {
            onAdd(rule);
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {rules.length === 0 && !adding ? (
        <p className="rounded border border-dashed border-rule p-3 text-sm italic text-ink-mute">
          No tick rules yet. Attach one to a faction clock, downtime project, or faction&rsquo;s
          renown.
        </p>
      ) : (
        <div className="space-y-2">
          {rules.map((r) => (
            <div
              key={r.id}
              data-tick-rule
              className="flex flex-wrap items-center gap-2 rounded border border-rule bg-parchment p-2.5 text-sm"
            >
              <span className="rounded-sm bg-parchment-deep px-1.5 py-0.5 font-display text-[10px] uppercase tracking-wider text-brass-deep">
                {TARGET_LABELS[r.targetType]}
              </span>
              <span className="font-serif font-semibold text-ink">
                {entityNameFor(r.targetType, r.targetId)}
              </span>
              {r.trigger === 'everyNDays' ? (
                <span className="text-ink-soft">
                  +
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={r.advanceBy}
                    onChange={(e) => onUpdate(r.id, { advanceBy: clampInt(e.target.value, 1, 10) })}
                    className="mx-1 w-12 rounded border border-rule bg-parchment-soft px-1 py-0.5 text-ink"
                  />
                  every
                  <input
                    type="number"
                    min={1}
                    value={r.intervalDays ?? 7}
                    onChange={(e) =>
                      onUpdate(r.id, { intervalDays: clampInt(e.target.value, 1, 3650) })
                    }
                    className="mx-1 w-14 rounded border border-rule bg-parchment-soft px-1 py-0.5 text-ink"
                  />
                  days
                </span>
              ) : (
                <span className="text-ink-soft">manual (+{r.advanceBy} when fired)</span>
              )}
              {r.condition && <span className="italic text-ink-mute">· {r.condition}</span>}
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  onClick={() => onUpdate(r.id, { paused: !r.paused })}
                  title={r.paused ? 'Resume' : 'Pause'}
                  className={`inline-flex items-center gap-1 rounded border px-2 py-1 font-display text-[10px] uppercase tracking-wider ${
                    r.paused
                      ? 'border-brass/50 bg-brass/10 text-brass-deep'
                      : 'border-rule text-ink-soft hover:bg-parchment-deep'
                  }`}
                >
                  {r.paused ? <Play size={11} /> : <Pause size={11} />}
                  {r.paused ? 'Paused' : 'Active'}
                </button>
                <button onClick={() => onRemove(r.id)} className="text-ink-mute hover:text-crimson">
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function AddRuleForm({
  clocks,
  downtime,
  factions,
  onAdd,
  onCancel,
}: {
  clocks: any[];
  downtime: any[];
  factions: any[];
  onAdd: (rule: Omit<TickRule, 'id'>) => void;
  onCancel: () => void;
}) {
  const [targetType, setTargetType] = useState<TickTargetType>('factionClock');
  const [targetId, setTargetId] = useState('');
  const [trigger, setTrigger] = useState<'manual' | 'everyNDays'>('everyNDays');
  const [intervalDays, setIntervalDays] = useState(7);
  const [advanceBy, setAdvanceBy] = useState(1);
  const [condition, setCondition] = useState('');

  const options =
    targetType === 'factionClock'
      ? clocks.map((c) => ({ id: c.id, label: clockName(c) }))
      : targetType === 'downtime'
        ? downtime.map((d) => ({ id: d.id, label: downtimeName(d) }))
        : factions.map((f) => ({ id: f.id, label: f.name || 'Faction' }));

  // Keep the selected target valid for the chosen type.
  useEffect(() => {
    if (!options.find((o) => o.id === targetId)) {
      setTargetId(options[0]?.id ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetType, options.length]);

  const canSave = !!targetId && (trigger === 'manual' || intervalDays > 0);

  return (
    <div className="space-y-3 rounded border border-crimson/40 bg-crimson/5 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
            Target Type
          </span>
          <select
            name="targetType"
            value={targetType}
            onChange={(e) => setTargetType(e.target.value as TickTargetType)}
            className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 text-sm text-ink"
          >
            <option value="factionClock">Faction Clock</option>
            <option value="downtime">Downtime</option>
            <option value="renown">Renown (Faction)</option>
          </select>
        </label>
        <label className="space-y-1">
          <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
            Target
          </span>
          <select
            name="targetId"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 text-sm text-ink"
          >
            {options.length === 0 ? (
              <option value="">— none available —</option>
            ) : (
              options.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="space-y-1">
          <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
            Trigger
          </span>
          <select
            name="trigger"
            value={trigger}
            onChange={(e) => setTrigger(e.target.value as 'manual' | 'everyNDays')}
            className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 text-sm text-ink"
          >
            <option value="everyNDays">Every N Days</option>
            <option value="manual">Manual</option>
          </select>
        </label>
        {trigger === 'everyNDays' && (
          <label className="space-y-1">
            <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
              Interval (Days)
            </span>
            <input
              name="intervalDays"
              type="number"
              min={1}
              value={intervalDays}
              onChange={(e) => setIntervalDays(clampInt(e.target.value, 1, 3650))}
              className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 text-sm text-ink"
            />
          </label>
        )}
        <label className="space-y-1">
          <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
            Advance By (1–10)
          </span>
          <input
            name="advanceBy"
            type="number"
            min={1}
            max={10}
            value={advanceBy}
            onChange={(e) => setAdvanceBy(clampInt(e.target.value, 1, 10))}
            className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 text-sm text-ink"
          />
        </label>
        <label className="space-y-1 sm:col-span-2">
          <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
            Condition (Optional)
          </span>
          <input
            name="condition"
            type="text"
            value={condition}
            placeholder="e.g. unless the party intervenes"
            onChange={(e) => setCondition(e.target.value)}
            className="w-full rounded border border-rule bg-parchment-soft px-2 py-1 text-sm text-ink placeholder:italic placeholder:text-ink-faint"
          />
        </label>
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded border border-rule px-3 py-1.5 font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep"
        >
          Cancel
        </button>
        <button
          onClick={() =>
            onAdd({
              targetType,
              targetId,
              trigger,
              intervalDays: trigger === 'everyNDays' ? intervalDays : undefined,
              advanceBy,
              condition: condition.trim() || undefined,
              paused: false,
            })
          }
          disabled={!canSave}
          className="rounded bg-crimson px-3 py-1.5 font-display text-xs uppercase tracking-wider text-parchment hover:bg-wine disabled:opacity-50"
        >
          Save Rule
        </button>
      </div>
    </div>
  );
}

// --- Agendas ---------------------------------------------------------------

function AgendasSection({
  agendas,
  npcs,
  onAdd,
  onUpdate,
  onRemove,
}: {
  agendas: NpcAgenda[];
  npcs: any[];
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

// --- Preview (dry-run) modal ----------------------------------------------

function PreviewModal({
  preview,
  currentDay,
  onChangeDay,
  onApply,
  onClose,
}: {
  preview: NonNullable<PreviewState>;
  currentDay: number;
  onChangeDay: (toDay: number) => void;
  onApply: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg border border-rule bg-parchment-soft p-5 shadow-page"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-base uppercase tracking-wider text-ink">
            {preview.label}
          </h3>
          <button onClick={onClose} className="text-ink-mute hover:text-crimson">
            <X size={16} />
          </button>
        </div>

        <label className="mb-3 flex items-center gap-2 text-sm">
          <span className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
            Advance To Day
          </span>
          <input
            name="targetDay"
            type="number"
            min={currentDay + 1}
            value={preview.toDay}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!isNaN(v) && v > currentDay) onChangeDay(v);
            }}
            className="w-24 rounded border border-rule bg-parchment px-2 py-1 text-ink"
          />
          <span className="text-xs text-ink-mute">(from Day {currentDay})</span>
        </label>

        <p className="mb-2 font-serif text-xs italic text-ink-mute">
          Dry run — nothing is saved until you apply. {preview.changes.length} planned change
          {preview.changes.length === 1 ? '' : 's'}.
        </p>

        {preview.changes.length === 0 ? (
          <p className="rounded border border-dashed border-rule p-3 text-sm italic text-ink-mute">
            No rules or agendas fire over this span.
          </p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {preview.changes.map((c, i) => (
              <li key={`${c.entityId}-${i}`} data-preview-change className="flex gap-2">
                <span className="text-brass">·</span>
                <span className="text-ink">
                  <strong>{c.entityName}</strong> — {formatChange(c)}
                </span>
              </li>
            ))}
          </ul>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded border border-rule px-3 py-1.5 font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep"
          >
            Cancel
          </button>
          <button
            onClick={onApply}
            className="rounded bg-crimson px-4 py-1.5 font-display text-xs uppercase tracking-wider text-parchment hover:bg-wine"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}

function clampInt(value: string, min: number, max: number): number {
  const n = parseInt(value, 10);
  if (isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}
