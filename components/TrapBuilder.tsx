'use client';

import { useState } from 'react';
import {
  type Trap, TIERS, SEVERITIES, SAVES, TRIGGERS, EFFECTS, DETECTIONS, DISARMS, LOCATIONS,
  rollTrap, emptyTrap, pick,
} from '@/lib/trapTables';
import {
  Plus, Trash2, Dices, RefreshCw, ChevronDown, ChevronRight,
  AlertTriangle, Skull, Sliders, Eye, EyeOff,
} from 'lucide-react';

type Props = {
  traps: Trap[];
  onChange: (traps: Trap[]) => void;
};

export default function TrapBuilder({ traps, onChange }: Props) {
  const [activeId, setActiveId] = useState<string | null>(traps[0]?.id ?? null);
  const [detailed, setDetailed] = useState(true);

  const active = traps.find(t => t.id === activeId) ?? null;

  const updateActive = (patch: Partial<Trap>) => {
    if (!active) return;
    onChange(traps.map(t => t.id === active.id ? { ...t, ...patch } : t));
  };

  const addNew = (mode: 'empty' | 'roll') => {
    const trap = mode === 'roll' ? rollTrap() : emptyTrap();
    onChange([...traps, trap]);
    setActiveId(trap.id);
  };

  const deleteTrap = (id: string) => {
    if (!confirm('Delete this trap?')) return;
    const next = traps.filter(t => t.id !== id);
    onChange(next);
    if (activeId === id) setActiveId(next[0]?.id ?? null);
  };

  const rollAll = () => {
    if (!active) return;
    const fresh = rollTrap(active.tier);
    updateActive({
      ...fresh,
      id: active.id,
      name: active.name || fresh.name,
      notes: active.notes,
      createdAt: active.createdAt,
    });
  };

  // Per-tier helpers
  const recomputeNumbersFromTier = (tierId: string, severityId: string) => {
    const tier = TIERS.find(t => t.id === tierId);
    if (!tier) return {};
    const dcKey = `${severityId}DC` as 'setbackDC' | 'dangerousDC' | 'deadlyDC';
    const dmgKey = `${severityId}Dmg` as 'setbackDmg' | 'dangerousDmg' | 'deadlyDmg';
    return {
      saveDC: tier[dcKey],
      detectionDC: tier[dcKey],
      disarmDC: tier[dcKey],
      damageDice: tier[dmgKey],
    };
  };

  if (traps.length === 0) {
    return (
      <div className="space-y-3">
        <div className="font-serif text-xs italic text-ink-mute">
          Design traps for your dungeons. Build one parameter at a time, or click &ldquo;Roll All&rdquo; to generate a complete trap and edit from there.
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => addNew('roll')}
            className="flex flex-1 items-center justify-center gap-2 rounded border border-dashed border-brass/40 bg-brass-soft/10 p-4 font-display text-sm uppercase tracking-wider text-brass-deep hover:bg-brass-soft/30"
          >
            <Dices size={16} /> Roll a Trap
          </button>
          <button
            onClick={() => addNew('empty')}
            className="flex flex-1 items-center justify-center gap-2 rounded border border-dashed border-rule p-4 font-display text-sm uppercase tracking-wider text-ink-soft hover:border-brass hover:bg-parchment-deep hover:text-ink"
          >
            <Plus size={16} /> Build from Scratch
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      {/* Trap list */}
      <div className="flex flex-wrap items-center gap-1.5">
        {traps.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveId(t.id)}
            className={`flex items-center gap-1.5 rounded border px-2.5 py-1 font-display text-xs uppercase tracking-wider transition-colors ${
              t.id === activeId
                ? 'border-crimson bg-crimson text-parchment'
                : 'border-rule bg-parchment-soft text-ink-soft hover:bg-parchment-deep'
            }`}
          >
            <SeverityIcon severity={t.severity} />
            {t.name || 'Untitled Trap'}
          </button>
        ))}
        <button
          onClick={() => addNew('roll')}
          className="flex items-center gap-1 rounded border border-brass/40 bg-brass-soft/20 px-2.5 py-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-brass-soft/40"
          title="Roll a new random trap"
        >
          <Dices size={12} /> Roll
        </button>
        <button
          onClick={() => addNew('empty')}
          className="flex items-center gap-1 rounded border border-dashed border-rule px-2.5 py-1 font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep hover:text-ink"
        >
          <Plus size={12} /> New
        </button>
      </div>

      {active && (
        <>
          {/* Header: name + actions */}
          <div className="space-y-2 rounded border border-rule bg-parchment-soft p-3 shadow-card">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={active.name}
                onChange={(e) => updateActive({ name: e.target.value })}
                placeholder="Trap Name"
                className="flex-1 border-b border-rule bg-transparent pb-0.5 font-display text-base tracking-wider text-ink placeholder-ink-faint focus:border-brass focus:outline-none"
              />
              <button
                onClick={() => setDetailed(d => !d)}
                className="flex items-center gap-1 rounded border border-rule bg-parchment px-2.5 py-1 font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep"
                title={detailed ? 'Switch to simplified view' : 'Switch to detailed view'}
              >
                {detailed ? <Eye size={12} /> : <EyeOff size={12} />}
                {detailed ? 'Detailed' : 'Simplified'}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={rollAll}
                className="flex items-center gap-1 rounded border border-brass/40 bg-brass-soft/20 px-2.5 py-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-brass-soft/40"
                title="Re-roll all fields (preserves name + notes)"
              >
                <Dices size={12} /> Roll All
              </button>
              <div className="flex-1" />
              <button
                onClick={() => deleteTrap(active.id)}
                className="flex items-center gap-1 rounded border border-crimson/40 bg-crimson/5 px-2.5 py-1 font-display text-xs uppercase tracking-wider text-crimson-deep hover:bg-crimson/15"
              >
                <Trash2 size={12} /> Delete
              </button>
            </div>
          </div>

          {/* Description (always shown) */}
          <FieldRow
            label="Description"
            value={active.description}
            onChange={(v) => updateActive({ description: v })}
            placeholder="Narrative paragraph — what the trap looks like, feels like, what it does in story terms"
            rows={3}
          />

          {/* Tier and severity (these drive the numbers) */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="mb-0.5 font-display text-xs uppercase tracking-wider text-ink-mute">Character Tier</div>
              <select
                value={active.tier}
                onChange={(e) => {
                  const numbers = recomputeNumbersFromTier(e.target.value, active.severity);
                  updateActive({ tier: e.target.value, ...numbers });
                }}
                className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-xs text-ink focus:border-brass focus:outline-none"
              >
                {TIERS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <div className="mb-0.5 font-display text-xs uppercase tracking-wider text-ink-mute">Severity</div>
              <select
                value={active.severity}
                onChange={(e) => {
                  const numbers = recomputeNumbersFromTier(active.tier, e.target.value);
                  updateActive({ severity: e.target.value, ...numbers });
                }}
                className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-xs text-ink focus:border-brass focus:outline-none"
              >
                {SEVERITIES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {/* Trigger and Effect — core narrative fields, always shown */}
          <RollableField
            label="Trigger"
            value={active.trigger}
            onChange={(v) => updateActive({ trigger: v })}
            onRoll={() => updateActive({ trigger: pick(TRIGGERS) })}
            placeholder="What sets the trap off"
            rows={2}
          />
          <RollableField
            label="Effect"
            value={active.effect}
            onChange={(v) => {
              updateActive({ effect: v });
            }}
            onRoll={() => {
              const fx = pick(EFFECTS);
              updateActive({ effect: fx.text, damageType: fx.dmg });
            }}
            placeholder="What the trap does when triggered"
            rows={2}
          />

          {/* Simplified view stops here for mechanics, but adds combined DC + damage */}
          {!detailed && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="mb-0.5 font-display text-xs uppercase tracking-wider text-ink-mute">DC (used for save / detection / disarm)</div>
                <input
                  type="number"
                  value={active.saveDC}
                  onChange={(e) => updateActive({
                    saveDC: Number(e.target.value),
                    detectionDC: Number(e.target.value),
                    disarmDC: Number(e.target.value),
                  })}
                  className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-sm tabular-nums text-ink focus:border-brass focus:outline-none"
                />
              </div>
              <div>
                <div className="mb-0.5 font-display text-xs uppercase tracking-wider text-ink-mute">Damage</div>
                <input
                  type="text"
                  value={active.damageDice}
                  onChange={(e) => updateActive({ damageDice: e.target.value })}
                  className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-sm text-ink focus:border-brass focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Detailed view shows everything */}
          {detailed && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="mb-0.5 font-display text-xs uppercase tracking-wider text-ink-mute">Save Type</div>
                  <select
                    value={active.saveType}
                    onChange={(e) => updateActive({ saveType: e.target.value })}
                    className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-xs text-ink focus:border-brass focus:outline-none"
                  >
                    {SAVES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                  </select>
                </div>
                <div>
                  <div className="mb-0.5 font-display text-xs uppercase tracking-wider text-ink-mute">Save DC</div>
                  <input
                    type="number"
                    value={active.saveDC}
                    onChange={(e) => updateActive({ saveDC: Number(e.target.value) })}
                    className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-sm tabular-nums text-ink focus:border-brass focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="mb-0.5 font-display text-xs uppercase tracking-wider text-ink-mute">Damage Dice</div>
                  <input
                    type="text"
                    value={active.damageDice}
                    onChange={(e) => updateActive({ damageDice: e.target.value })}
                    className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-sm text-ink focus:border-brass focus:outline-none"
                  />
                </div>
                <div>
                  <div className="mb-0.5 font-display text-xs uppercase tracking-wider text-ink-mute">Damage Type</div>
                  <input
                    type="text"
                    value={active.damageType}
                    onChange={(e) => updateActive({ damageType: e.target.value })}
                    className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-sm text-ink focus:border-brass focus:outline-none"
                  />
                </div>
              </div>

              <RollableField
                label="Detection"
                value={active.detection}
                onChange={(v) => updateActive({ detection: v })}
                onRoll={() => updateActive({ detection: pick(DETECTIONS) })}
                placeholder="How the trap can be found before triggering"
                rows={2}
              />
              <div>
                <div className="mb-0.5 font-display text-xs uppercase tracking-wider text-ink-mute">Detection DC</div>
                <input
                  type="number"
                  value={active.detectionDC}
                  onChange={(e) => updateActive({ detectionDC: Number(e.target.value) })}
                  className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-sm tabular-nums text-ink focus:border-brass focus:outline-none"
                />
              </div>

              <RollableField
                label="Disarm"
                value={active.disarm}
                onChange={(v) => updateActive({ disarm: v })}
                onRoll={() => updateActive({ disarm: pick(DISARMS) })}
                placeholder="How the trap can be disabled or bypassed"
                rows={2}
              />
              <div>
                <div className="mb-0.5 font-display text-xs uppercase tracking-wider text-ink-mute">Disarm DC</div>
                <input
                  type="number"
                  value={active.disarmDC}
                  onChange={(e) => updateActive({ disarmDC: Number(e.target.value) })}
                  className="w-full rounded border border-rule bg-parchment px-2 py-1 font-serif text-sm tabular-nums text-ink focus:border-brass focus:outline-none"
                />
              </div>

              <RollableField
                label="Location"
                value={active.location}
                onChange={(v) => updateActive({ location: v })}
                onRoll={() => updateActive({ location: pick(LOCATIONS) })}
                placeholder="Where the trap is placed in the dungeon"
                rows={2}
              />
            </>
          )}

          {/* Notes always shown */}
          <FieldRow
            label="Notes"
            value={active.notes}
            onChange={(v) => updateActive({ notes: v })}
            placeholder="Session notes, custom mechanics, what happened when the party encountered it"
            rows={3}
          />

          {/* Summary card — read-only at-a-glance reference */}
          <SummaryCard trap={active} />
        </>
      )}
    </div>
  );
}

// ---- Subcomponents ----

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === 'deadly')    return <Skull size={11} className="text-crimson" />;
  if (severity === 'dangerous') return <AlertTriangle size={11} className="text-orange-700" />;
  return <Sliders size={11} className="text-ink-mute" />;
}

function FieldRow({
  label, value, onChange, placeholder, rows = 1,
}: { label: string; value: string; onChange: (v: string) => void; placeholder: string; rows?: number }) {
  return (
    <div>
      <div className="mb-0.5 font-display text-xs uppercase tracking-wider text-ink-mute">{label}</div>
      {rows > 1 ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="w-full resize-y rounded border border-rule bg-parchment-soft px-2 py-1.5 font-serif text-sm text-ink placeholder-ink-faint focus:border-brass focus:outline-none"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded border border-rule bg-parchment-soft px-2 py-1.5 font-serif text-sm text-ink placeholder-ink-faint focus:border-brass focus:outline-none"
        />
      )}
    </div>
  );
}

function RollableField({
  label, value, onChange, onRoll, placeholder, rows = 1,
}: { label: string; value: string; onChange: (v: string) => void; onRoll: () => void; placeholder: string; rows?: number }) {
  return (
    <div>
      <div className="mb-0.5 flex items-center justify-between">
        <span className="font-display text-xs uppercase tracking-wider text-ink-mute">{label}</span>
        <button
          onClick={onRoll}
          className="flex items-center gap-0.5 font-display text-[10px] uppercase tracking-wider text-brass-deep hover:text-brass"
        >
          <RefreshCw size={10} /> Roll
        </button>
      </div>
      {rows > 1 ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          className="w-full resize-y rounded border border-rule bg-parchment-soft px-2 py-1.5 font-serif text-sm text-ink placeholder-ink-faint focus:border-brass focus:outline-none"
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded border border-rule bg-parchment-soft px-2 py-1.5 font-serif text-sm text-ink placeholder-ink-faint focus:border-brass focus:outline-none"
        />
      )}
    </div>
  );
}

function SummaryCard({ trap }: { trap: Trap }) {
  const [open, setOpen] = useState(false);
  const tier = TIERS.find(t => t.id === trap.tier);
  const severity = SEVERITIES.find(s => s.id === trap.severity);
  const save = SAVES.find(s => s.id === trap.saveType);

  return (
    <div className="mt-2 rounded border border-rule bg-parchment-soft shadow-card">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 p-2.5 text-left text-ink-soft hover:bg-parchment-deep"
      >
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        <span className="font-display text-sm uppercase tracking-wider text-brass-deep">At-a-glance Reference</span>
      </button>
      {open && (
        <div className="space-y-1 border-t border-rule p-3 font-serif text-xs leading-relaxed text-ink">
          <div><span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">Tier:</span> {tier?.label}</div>
          <div><span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">Severity:</span> {severity?.label} — <span className="italic text-ink-mute">{severity?.note}</span></div>
          <div><span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">Trigger:</span> {trap.trigger || <em className="text-ink-faint">unset</em>}</div>
          <div><span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">Effect:</span> {trap.effect || <em className="text-ink-faint">unset</em>}</div>
          <div><span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">Save:</span> DC {trap.saveDC} {save?.label} {trap.damageDice && `→ ${trap.damageDice} ${trap.damageType}`}</div>
          <div><span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">Detection:</span> DC {trap.detectionDC} — {trap.detection || <em className="text-ink-faint">unset</em>}</div>
          <div><span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">Disarm:</span> DC {trap.disarmDC} — {trap.disarm || <em className="text-ink-faint">unset</em>}</div>
          {trap.location && <div><span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">Location:</span> {trap.location}</div>}
        </div>
      )}
    </div>
  );
}
