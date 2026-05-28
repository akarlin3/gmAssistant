import React, { useEffect, useState } from 'react';
import { Clock, Plus, X, Pause, Play } from 'lucide-react';
import { clockName, downtimeName } from '@/lib/world/tick';
import type {
  TickRule,
  TickTargetType,
  FactionClockEntity,
  DowntimeEntity,
  FactionEntity,
} from '@/lib/world/types';
import { clampInt } from './helpers';
import { TARGET_LABELS } from './types';

export function TickRulesSection({
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
  clocks: FactionClockEntity[];
  downtime: DowntimeEntity[];
  factions: FactionEntity[];
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
  clocks: FactionClockEntity[];
  downtime: DowntimeEntity[];
  factions: FactionEntity[];
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
