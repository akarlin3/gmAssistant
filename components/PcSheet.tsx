'use client';

import { useMemo } from 'react';
import {
  ChevronDown, ChevronRight, X, Plus, Trash2, Download, Heart, Shield,
  Moon, Sun, Dice5,
} from 'lucide-react';
import {
  abilityMod, formatMod, pcInitiative, pcTotalLevel, proficiencyBonusForLevel,
} from '@/lib/pc/derived';
import {
  SKILL_ABILITIES, SKILL_NAMES, skillModifier, savingThrowModifier, passivePerception,
} from '@/lib/pc/skills';
import { longRest, shortRest } from '@/lib/pc/rest';
import { pcToMarkdown } from '@/lib/pc/export';
import { makePcId } from '@/lib/pc/factory';
import {
  ABILITY_NAMES, SPELL_SLOT_LEVELS,
  type AbilityName, type Attack, type FeatureEntry, type InventoryItem,
  type PlayerCharacter, type SkillName, type SpellSlotLevel,
} from '@/lib/pc/types';
import { CONDITIONS } from '@/lib/initiative';

type Props = {
  pc: PlayerCharacter;
  open: boolean;
  onToggleOpen: () => void;
  onChange: (next: PlayerCharacter) => void;
  onRemove: () => void;
};

// ---- small primitives ---------------------------------------------------

const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-0.5 font-display text-[10px] uppercase tracking-wider text-brass-deep">
    {children}
  </div>
);

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <div className="font-display text-xs uppercase tracking-wider text-crimson">{children}</div>
);

const inputCls =
  'w-full border-b border-rule bg-transparent px-1 py-1 font-serif text-sm text-ink placeholder:italic placeholder:text-ink-faint focus:border-crimson focus:outline-none';

function TextInput({
  value, onChange, placeholder, name,
}: { value: string; onChange: (v: string) => void; placeholder?: string; name?: string }) {
  return (
    <input
      type="text"
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={inputCls}
    />
  );
}

function NumInput({
  value, onChange, name, min, max, className,
}: { value: number; onChange: (v: number) => void; name?: string; min?: number; max?: number; className?: string }) {
  return (
    <input
      type="number"
      name={name}
      min={min}
      max={max}
      value={Number.isFinite(value) ? value : 0}
      onChange={(e) => {
        const n = parseInt(e.target.value, 10);
        onChange(Number.isFinite(n) ? n : 0);
      }}
      className={className ?? `${inputCls} text-center`}
    />
  );
}

const chipBtn = (active: boolean) =>
  `text-[10px] px-2 py-1 rounded border font-display uppercase tracking-wider transition-colors ${
    active
      ? 'border-wine/50 bg-wine/15 text-wine'
      : 'border-rule text-ink-mute hover:bg-parchment-deep'
  }`;

// ---- main component -----------------------------------------------------

export default function PcSheet({ pc, open, onToggleOpen, onChange, onRemove }: Props) {
  const totalLevel = useMemo(() => pcTotalLevel(pc), [pc]);

  // Patch helper: shallow-merges a partial and emits the new PC.
  const patch = (p: Partial<PlayerCharacter>) => onChange({ ...pc, ...p });

  const setAbility = (a: AbilityName, v: number) =>
    patch({ abilities: { ...pc.abilities, [a]: v } });

  const setLevel = (v: number) => {
    const lvl = Math.max(1, Math.min(20, v));
    // Auto-recompute proficiency bonus from the new level (still overridable).
    patch({ level: lvl, proficiencyBonus: proficiencyBonusForLevel(lvl) });
  };

  const toggleSkill = (s: SkillName) => {
    const has = pc.proficiencies.skills.includes(s);
    patch({
      proficiencies: {
        ...pc.proficiencies,
        skills: has
          ? pc.proficiencies.skills.filter((x) => x !== s)
          : [...pc.proficiencies.skills, s],
      },
    });
  };

  const toggleSave = (a: AbilityName) => {
    const has = pc.proficiencies.savingThrows.includes(a);
    patch({
      proficiencies: {
        ...pc.proficiencies,
        savingThrows: has
          ? pc.proficiencies.savingThrows.filter((x) => x !== a)
          : [...pc.proficiencies.savingThrows, a],
      },
    });
  };

  const toggleCondition = (c: string) => {
    const has = pc.conditions.includes(c);
    patch({ conditions: has ? pc.conditions.filter((x) => x !== c) : [...pc.conditions, c] });
  };

  // ---- inventory ----
  const addItem = () =>
    patch({ inventory: [...pc.inventory, { id: makePcId(), name: '', qty: 1 }] });
  const updateItem = (id: string, p: Partial<InventoryItem>) =>
    patch({ inventory: pc.inventory.map((i) => (i.id === id ? { ...i, ...p } : i)) });
  const removeItem = (id: string) =>
    patch({ inventory: pc.inventory.filter((i) => i.id !== id) });

  const carriedWeight = useMemo(
    () => pc.inventory.reduce((s, i) => s + (i.weight ?? 0) * (i.qty || 1), 0),
    [pc.inventory],
  );
  const carryCap = pc.abilities.STR * 15;
  const encumbered = carriedWeight > carryCap;

  // ---- attacks ----
  const addAttack = () =>
    patch({
      attacks: [
        ...pc.attacks,
        { id: makePcId(), name: '', attackBonus: 0, damageExpr: '', damageType: '', range: '' },
      ],
    });
  const updateAttack = (id: string, p: Partial<Attack>) =>
    patch({ attacks: pc.attacks.map((a) => (a.id === id ? { ...a, ...p } : a)) });
  const removeAttack = (id: string) =>
    patch({ attacks: pc.attacks.filter((a) => a.id !== id) });

  // ---- features ----
  const addFeature = () =>
    patch({
      features: [
        ...pc.features,
        { id: makePcId(), name: '', source: '', description: '' },
      ],
    });
  const updateFeature = (id: string, p: Partial<FeatureEntry>) =>
    patch({ features: pc.features.map((f) => (f.id === id ? { ...f, ...p } : f)) });
  const removeFeature = (id: string) =>
    patch({ features: pc.features.filter((f) => f.id !== id) });

  // ---- spell slots ----
  const setSlot = (lvl: SpellSlotLevel, key: 'max' | 'used', v: number) => {
    const slots = { ...(pc.spellSlots ?? {}) };
    const cur = slots[lvl] ?? { max: 0, used: 0 };
    slots[lvl] = { ...cur, [key]: Math.max(0, v) };
    patch({ spellSlots: slots });
  };

  // ---- list-of-strings editors (goals/bonds/ideals/flaws/spells) ----
  const listFieldEditor = (
    field: 'goals' | 'bonds' | 'ideals' | 'flaws',
  ) => (
    <ListEditor
      values={pc[field]}
      onChange={(next) => patch({ [field]: next } as Partial<PlayerCharacter>)}
      placeholder={`Add a ${field.replace(/s$/, '')}…`}
    />
  );

  const exportMd = () => {
    const md = pcToMarkdown(pc);
    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const safe = (pc.name || 'pc').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    a.href = url;
    a.download = `${safe || 'pc'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const classesLabel = pc.classes.length
    ? pc.classes.map((c) => `${c.name} ${c.level}`).join(' / ')
    : '';

  return (
    <div className="rounded border border-rule bg-parchment shadow-card">
      {/* header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={onToggleOpen} className="text-ink-mute hover:text-ink" aria-label="Toggle">
          {open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
        </button>
        <button onClick={onToggleOpen} className="min-w-0 flex-1 text-left">
          <span className="font-display tracking-wide text-ink">{pc.name || 'Unnamed PC'}</span>
          <span className="ml-2 font-serif text-xs italic text-ink-mute">
            {[pc.race, classesLabel].filter(Boolean).join(' · ') || `Level ${pc.level}`}
          </span>
        </button>
        <span className="flex items-center gap-1 font-serif text-[11px] text-ink-soft">
          <Heart size={11} className="text-crimson" /> {pc.hp.current}/{pc.hp.max}
          <Shield size={11} className="ml-1.5 text-brass-deep" /> {pc.ac}
        </span>
        <button onClick={exportMd} className="gm-tooltip text-ink-mute hover:text-brass-deep" data-tooltip="Export Markdown" title="Export Markdown" aria-label="Export Markdown">
          <Download size={14} />
        </button>
        <button onClick={onRemove} className="gm-tooltip text-ink-mute hover:text-crimson" data-tooltip="Delete PC" title="Delete PC" aria-label="Delete PC">
          <Trash2 size={14} />
        </button>
      </div>

      {!open ? null : (
        <div className="space-y-3 border-t border-rule px-3 py-3">
          {/* Identity */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-1">
              <Label>Name</Label>
              <TextInput name="name" value={pc.name} onChange={(v) => patch({ name: v })} placeholder="Character name" />
            </div>
            <div>
              <Label>Level</Label>
              <NumInput name="level" min={1} max={20} value={pc.level} onChange={setLevel} />
            </div>
            <div>
              <Label>Race</Label>
              <TextInput name="race" value={pc.race} onChange={(v) => patch({ race: v })} placeholder="Human" />
            </div>
            <div>
              <Label>Background</Label>
              <TextInput name="background" value={pc.background} onChange={(v) => patch({ background: v })} placeholder="Soldier" />
            </div>
            <div>
              <Label>Alignment</Label>
              <TextInput value={pc.alignment ?? ''} onChange={(v) => patch({ alignment: v })} placeholder="LG" />
            </div>
          </div>

          {/* Classes */}
          <div className="space-y-1.5 border-t border-rule pt-2.5">
            <div className="flex items-center justify-between">
              <SectionTitle>Classes</SectionTitle>
              <button
                onClick={() => patch({ classes: [...pc.classes, { name: '', level: 1 }] })}
                className="flex items-center gap-1 font-display text-[10px] uppercase tracking-wider text-brass-deep hover:text-crimson"
              >
                <Plus size={11} /> Class
              </button>
            </div>
            {pc.classes.length === 0 && (
              <p className="font-serif text-xs italic text-ink-mute">No classes — add one to track multiclass levels.</p>
            )}
            {pc.classes.map((c, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={c.name}
                  onChange={(e) => patch({ classes: pc.classes.map((x, xi) => (xi === i ? { ...x, name: e.target.value } : x)) })}
                  placeholder="Class"
                  className={`${inputCls} flex-1`}
                />
                <input
                  type="text"
                  value={c.subclass ?? ''}
                  onChange={(e) => patch({ classes: pc.classes.map((x, xi) => (xi === i ? { ...x, subclass: e.target.value } : x)) })}
                  placeholder="Subclass"
                  className={`${inputCls} flex-1`}
                />
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={c.level}
                  onChange={(e) => patch({ classes: pc.classes.map((x, xi) => (xi === i ? { ...x, level: Math.max(1, parseInt(e.target.value, 10) || 1) } : x)) })}
                  className={`${inputCls} w-14 text-center`}
                />
                <button onClick={() => patch({ classes: pc.classes.filter((_, xi) => xi !== i) })} className="text-ink-mute hover:text-crimson">
                  <X size={13} />
                </button>
              </div>
            ))}
            <p className="font-serif text-[10px] italic text-ink-mute">
              Total level {totalLevel} · Proficiency {formatMod(pc.proficiencyBonus)}
            </p>
          </div>

          {/* Abilities */}
          <div className="border-t border-rule pt-2.5">
            <SectionTitle>Abilities</SectionTitle>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              {ABILITY_NAMES.map((a) => (
                <div key={a} className="rounded border border-rule bg-parchment-soft p-1.5 text-center">
                  <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">{a}</div>
                  <NumInput name={a} min={1} max={30} value={pc.abilities[a]} onChange={(v) => setAbility(a, v)} className="w-full bg-transparent text-center font-serif text-lg text-ink focus:outline-none" />
                  <div className="font-display text-xs text-crimson">{formatMod(abilityMod(pc.abilities[a]))}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Combat stats */}
          <div className="grid grid-cols-2 gap-2 border-t border-rule pt-2.5 sm:grid-cols-4">
            <div>
              <Label>AC</Label>
              <NumInput name="ac" value={pc.ac} onChange={(v) => patch({ ac: v })} />
            </div>
            <div>
              <Label>Speed</Label>
              <NumInput value={pc.speed} onChange={(v) => patch({ speed: v })} />
            </div>
            <div>
              <Label>Initiative</Label>
              <NumInput value={pc.initiativeMod} onChange={(v) => patch({ initiativeMod: v })} />
              <div className="text-center font-display text-[10px] text-ink-mute">eff {formatMod(pcInitiative(pc))}</div>
            </div>
            <div>
              <Label>Prof. Bonus</Label>
              <NumInput value={pc.proficiencyBonus} onChange={(v) => patch({ proficiencyBonus: v })} />
            </div>
            <div>
              <Label>HP Current</Label>
              <NumInput name="hpCurrent" value={pc.hp.current} onChange={(v) => patch({ hp: { ...pc.hp, current: v } })} />
            </div>
            <div>
              <Label>HP Max</Label>
              <NumInput name="hpMax" value={pc.hp.max} onChange={(v) => patch({ hp: { ...pc.hp, max: v } })} />
            </div>
            <div>
              <Label>Temp HP</Label>
              <NumInput value={pc.hp.temp} onChange={(v) => patch({ hp: { ...pc.hp, temp: v } })} />
            </div>
            <div>
              <Label>Hit Dice (d{pc.hitDice.dieSize})</Label>
              <div className="flex items-center gap-1">
                <NumInput value={pc.hitDice.used} onChange={(v) => patch({ hitDice: { ...pc.hitDice, used: Math.max(0, Math.min(pc.hitDice.max, v)) } })} />
                <span className="font-serif text-xs text-ink-mute">/ {pc.hitDice.max}</span>
              </div>
            </div>
          </div>

          {/* Saving throws */}
          <div className="border-t border-rule pt-2.5">
            <SectionTitle>Saving Throws</SectionTitle>
            <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-3">
              {ABILITY_NAMES.map((a) => {
                const prof = pc.proficiencies.savingThrows.includes(a);
                return (
                  <button
                    key={a}
                    onClick={() => toggleSave(a)}
                    role="checkbox"
                    aria-checked={prof}
                    aria-label={`Proficient in ${a} save`}
                    className={`flex items-center justify-between rounded border px-2 py-1 font-serif text-sm ${prof ? 'border-brass-deep/50 bg-brass/10' : 'border-rule'}`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full border ${prof ? 'border-crimson bg-crimson' : 'border-ink-mute'}`} />
                      <span className="font-display text-[11px] uppercase tracking-wider text-ink-soft">{a}</span>
                    </span>
                    <span className="font-display text-crimson">{formatMod(savingThrowModifier(pc, a))}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Skills */}
          <div className="border-t border-rule pt-2.5">
            <div className="flex items-center justify-between">
              <SectionTitle>Skills</SectionTitle>
              <span className="font-display text-[10px] uppercase tracking-wider text-ink-mute">
                Passive Perception {passivePerception(pc)}
              </span>
            </div>
            <div className="mt-1.5 grid grid-cols-1 gap-1 sm:grid-cols-2">
              {SKILL_NAMES.map((s) => {
                const prof = pc.proficiencies.skills.includes(s);
                return (
                  <button
                    key={s}
                    onClick={() => toggleSkill(s)}
                    role="checkbox"
                    aria-checked={prof}
                    aria-label={`Proficient in ${s}`}
                    className={`flex items-center justify-between rounded px-2 py-1 font-serif text-sm ${prof ? 'bg-brass/10' : 'hover:bg-parchment-deep'}`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span className={`inline-block h-2.5 w-2.5 rounded-sm border ${prof ? 'border-crimson bg-crimson' : 'border-ink-mute'}`} />
                      <span className="text-ink-soft">{s}</span>
                      <span className="font-display text-[9px] uppercase text-ink-faint">{SKILL_ABILITIES[s]}</span>
                    </span>
                    <span className="font-display text-crimson">{formatMod(skillModifier(pc, s))}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Conditions + exhaustion + death saves */}
          <div className="border-t border-rule pt-2.5">
            <SectionTitle>Conditions</SectionTitle>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {CONDITIONS.map((c) => (
                <button key={c} onClick={() => toggleCondition(c)} className={chipBtn(pc.conditions.includes(c))}>
                  {c}
                </button>
              ))}
            </div>
            <div className="mt-2.5 flex flex-wrap items-center gap-4">
              <div>
                <Label>Exhaustion</Label>
                <div className="flex gap-1">
                  {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                    <button
                      key={n}
                      onClick={() => patch({ exhaustion: n as PlayerCharacter['exhaustion'] })}
                      className={`h-6 w-6 rounded border font-display text-xs ${pc.exhaustion === n ? 'border-crimson bg-crimson text-parchment' : 'border-rule text-ink-soft hover:bg-parchment-deep'}`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Death Saves</Label>
                <div className="flex items-center gap-3">
                  <Bubbles label="✓" color="emerald" count={pc.deathSaves.successes} onSet={(n) => patch({ deathSaves: { ...pc.deathSaves, successes: n } })} />
                  <Bubbles label="✗" color="crimson" count={pc.deathSaves.failures} onSet={(n) => patch({ deathSaves: { ...pc.deathSaves, failures: n } })} />
                </div>
              </div>
            </div>
          </div>

          {/* Attacks */}
          <div className="border-t border-rule pt-2.5">
            <div className="flex items-center justify-between">
              <SectionTitle>Attacks</SectionTitle>
              <button onClick={addAttack} className="flex items-center gap-1 font-display text-[10px] uppercase tracking-wider text-brass-deep hover:text-crimson">
                <Plus size={11} /> Add Attack
              </button>
            </div>
            {pc.attacks.length === 0 && <p className="mt-1 font-serif text-xs italic text-ink-mute">No attacks. Adding one creates a roll macro.</p>}
            <div className="mt-1.5 space-y-1.5">
              {pc.attacks.map((a) => (
                <div key={a.id} className="rounded border border-rule bg-parchment-soft p-2">
                  <div className="flex items-center gap-1.5">
                    <input name="attackName" value={a.name} onChange={(e) => updateAttack(a.id, { name: e.target.value })} placeholder="Attack name" className={`${inputCls} flex-1`} />
                    <button onClick={() => removeAttack(a.id)} className="text-ink-mute hover:text-crimson"><X size={13} /></button>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                    <label className="text-[9px] font-display uppercase tracking-wider text-ink-mute">Bonus
                      <input name="attackBonus" type="number" value={a.attackBonus} onChange={(e) => updateAttack(a.id, { attackBonus: parseInt(e.target.value, 10) || 0 })} className={`${inputCls} text-center`} />
                    </label>
                    <label className="text-[9px] font-display uppercase tracking-wider text-ink-mute">Damage
                      <input name="damageExpr" value={a.damageExpr} onChange={(e) => updateAttack(a.id, { damageExpr: e.target.value })} placeholder="1d8+3" className={inputCls} />
                    </label>
                    <label className="text-[9px] font-display uppercase tracking-wider text-ink-mute">Type
                      <input name="damageType" value={a.damageType} onChange={(e) => updateAttack(a.id, { damageType: e.target.value })} placeholder="slashing" className={inputCls} />
                    </label>
                    <label className="text-[9px] font-display uppercase tracking-wider text-ink-mute">Range
                      <input name="range" value={a.range} onChange={(e) => updateAttack(a.id, { range: e.target.value })} placeholder="5 ft." className={inputCls} />
                    </label>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 font-display text-[10px] uppercase tracking-wider text-ink-mute">
                    <Dice5 size={11} /> 1d20{formatMod(a.attackBonus)} · {a.damageExpr || '—'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Inventory */}
          <div className="border-t border-rule pt-2.5">
            <div className="flex items-center justify-between">
              <SectionTitle>Inventory</SectionTitle>
              <span className={`font-display text-[10px] uppercase tracking-wider ${encumbered ? 'text-crimson' : 'text-ink-mute'}`}>
                {carriedWeight} / {carryCap} lb {encumbered ? '· Encumbered' : ''}
              </span>
            </div>
            <div className="mt-1.5 space-y-1">
              {pc.inventory.map((it) => (
                <div key={it.id} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={!!it.equipped} onChange={(e) => updateItem(it.id, { equipped: e.target.checked })} title="Equipped" aria-label={`Equipped ${it.name}`} />
                  <input value={it.name} onChange={(e) => updateItem(it.id, { name: e.target.value })} placeholder="Item" className={`${inputCls} flex-1`} />
                  <input type="number" min={0} value={it.qty} onChange={(e) => updateItem(it.id, { qty: parseInt(e.target.value, 10) || 0 })} className={`${inputCls} w-12 text-center`} title="Quantity" />
                  <input type="number" min={0} value={it.weight ?? 0} onChange={(e) => updateItem(it.id, { weight: parseFloat(e.target.value) || 0 })} className={`${inputCls} w-14 text-center`} title="Weight (lb)" />
                  <button onClick={() => removeItem(it.id)} className="text-ink-mute hover:text-crimson"><X size={13} /></button>
                </div>
              ))}
            </div>
            <button onClick={addItem} className="mt-1 flex items-center gap-1 font-display text-[10px] uppercase tracking-wider text-brass-deep hover:text-crimson">
              <Plus size={11} /> Add Item
            </button>
          </div>

          {/* Spell slots + features */}
          <div className="border-t border-rule pt-2.5">
            <div className="flex items-center justify-between">
              <SectionTitle>Spellcasting</SectionTitle>
              <div className="flex items-center gap-2">
                <Label>Ability</Label>
                <select
                  value={pc.spellcastingAbility ?? ''}
                  onChange={(e) => patch({ spellcastingAbility: (e.target.value || undefined) as AbilityName | undefined })}
                  className="border-b border-rule bg-transparent font-serif text-xs text-ink focus:outline-none"
                >
                  <option value="">—</option>
                  {ABILITY_NAMES.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </div>
            </div>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5 sm:grid-cols-3">
              {SPELL_SLOT_LEVELS.map((lvl) => {
                const slot = pc.spellSlots?.[lvl] ?? { max: 0, used: 0 };
                return (
                  <div key={lvl} className="rounded border border-rule bg-parchment-soft p-1.5">
                    <div className="font-display text-[10px] uppercase tracking-wider text-brass-deep">Lvl {lvl}</div>
                    <div className="flex items-center gap-1">
                      <input type="number" min={0} value={slot.used} onChange={(e) => setSlot(lvl, 'used', parseInt(e.target.value, 10) || 0)} className={`${inputCls} w-10 text-center`} title="Used" />
                      <span className="font-serif text-xs text-ink-mute">/</span>
                      <input type="number" min={0} value={slot.max} onChange={(e) => setSlot(lvl, 'max', parseInt(e.target.value, 10) || 0)} className={`${inputCls} w-10 text-center`} title="Max" />
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-2">
              <Label>Spells Known</Label>
              <ListEditor
                values={pc.spellsKnown ?? []}
                onChange={(next) => patch({ spellsKnown: next })}
                placeholder="Add a spell…"
              />
            </div>
          </div>

          {/* Features */}
          <div className="border-t border-rule pt-2.5">
            <div className="flex items-center justify-between">
              <SectionTitle>Features</SectionTitle>
              <button onClick={addFeature} className="flex items-center gap-1 font-display text-[10px] uppercase tracking-wider text-brass-deep hover:text-crimson">
                <Plus size={11} /> Add Feature
              </button>
            </div>
            <div className="mt-1.5 space-y-1.5">
              {pc.features.map((f) => (
                <div key={f.id} className="rounded border border-rule bg-parchment-soft p-2">
                  <div className="flex items-center gap-1.5">
                    <input value={f.name} onChange={(e) => updateFeature(f.id, { name: e.target.value })} placeholder="Feature name" className={`${inputCls} flex-[2]`} />
                    <input value={f.source} onChange={(e) => updateFeature(f.id, { source: e.target.value })} placeholder="Source" className={`${inputCls} flex-1`} />
                    <button onClick={() => removeFeature(f.id)} className="text-ink-mute hover:text-crimson"><X size={13} /></button>
                  </div>
                  <textarea value={f.description} onChange={(e) => updateFeature(f.id, { description: e.target.value })} placeholder="Description" rows={1} className={`${inputCls} mt-1 resize-none [field-sizing:content]`} />
                  <div className="mt-1 flex items-center gap-2">
                    {f.uses ? (
                      <>
                        <span className="font-display text-[9px] uppercase tracking-wider text-ink-mute">Uses</span>
                        <input type="number" min={0} value={f.uses.used} onChange={(e) => updateFeature(f.id, { uses: { ...f.uses!, used: parseInt(e.target.value, 10) || 0 } })} className={`${inputCls} w-10 text-center`} />
                        <span className="text-xs text-ink-mute">/</span>
                        <input type="number" min={0} value={f.uses.max} onChange={(e) => updateFeature(f.id, { uses: { ...f.uses!, max: parseInt(e.target.value, 10) || 0 } })} className={`${inputCls} w-10 text-center`} />
                        <select value={f.uses.refresh} onChange={(e) => updateFeature(f.id, { uses: { ...f.uses!, refresh: e.target.value as 'short' | 'long' } })} className="border-b border-rule bg-transparent font-serif text-xs text-ink focus:outline-none">
                          <option value="short">Short rest</option>
                          <option value="long">Long rest</option>
                        </select>
                        <button onClick={() => updateFeature(f.id, { uses: undefined })} className="font-display text-[9px] uppercase text-ink-mute hover:text-crimson">No uses</button>
                      </>
                    ) : (
                      <button onClick={() => updateFeature(f.id, { uses: { max: 1, used: 0, refresh: 'long' } })} className="font-display text-[9px] uppercase tracking-wider text-brass-deep hover:text-crimson">+ Track uses</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Rest controls */}
          <div className="flex flex-wrap gap-2 border-t border-rule pt-2.5">
            <button onClick={() => onChange(shortRest(pc))} className="flex items-center gap-1.5 rounded border border-brass-deep/50 px-3 py-1.5 font-display text-xs uppercase tracking-wider text-brass-deep hover:bg-brass hover:text-parchment">
              <Sun size={12} /> Short Rest
            </button>
            <button onClick={() => onChange(longRest(pc))} className="flex items-center gap-1.5 rounded border border-crimson/60 bg-crimson/10 px-3 py-1.5 font-display text-xs uppercase tracking-wider text-crimson hover:bg-crimson hover:text-parchment">
              <Moon size={12} /> Long Rest
            </button>
          </div>

          {/* Roleplay */}
          <div className="grid grid-cols-1 gap-3 border-t border-rule pt-2.5 sm:grid-cols-2">
            <div><Label>Goals</Label>{listFieldEditor('goals')}</div>
            <div><Label>Bonds</Label>{listFieldEditor('bonds')}</div>
            <div><Label>Ideals</Label>{listFieldEditor('ideals')}</div>
            <div><Label>Flaws</Label>{listFieldEditor('flaws')}</div>
          </div>

          {/* Notes */}
          <div className="border-t border-rule pt-2.5">
            <Label>Notes</Label>
            <textarea value={pc.notes} onChange={(e) => patch({ notes: e.target.value })} placeholder="Freeform notes…" rows={2} className={`${inputCls} resize-none [field-sizing:content]`} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---- helper sub-components ----------------------------------------------

function Bubbles({
  label, color, count, onSet,
}: { label: string; color: 'emerald' | 'crimson'; count: number; onSet: (n: 0 | 1 | 2 | 3) => void }) {
  const filledCls = color === 'emerald' ? 'border-emerald-700 bg-emerald-600' : 'border-crimson bg-crimson';
  return (
    <div className="flex items-center gap-1">
      <span className={`font-display text-xs ${color === 'emerald' ? 'text-emerald-700' : 'text-crimson'}`}>{label}</span>
      {[1, 2, 3].map((n) => (
        <button
          key={n}
          // Click a filled bubble to clear back to n-1, else fill up to n.
          onClick={() => onSet((count >= n ? n - 1 : n) as 0 | 1 | 2 | 3)}
          aria-label={`${label} ${n}`}
          className={`h-4 w-4 rounded-full border ${count >= n ? filledCls : 'border-ink-mute'}`}
        />
      ))}
    </div>
  );
}

function ListEditor({
  values, onChange, placeholder,
}: { values: string[]; onChange: (next: string[]) => void; placeholder: string }) {
  return (
    <div className="space-y-1">
      {values.map((v, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <input
            value={v}
            onChange={(e) => onChange(values.map((x, xi) => (xi === i ? e.target.value : x)))}
            className={`${inputCls} flex-1`}
          />
          <button onClick={() => onChange(values.filter((_, xi) => xi !== i))} className="text-ink-mute hover:text-crimson"><X size={12} /></button>
        </div>
      ))}
      <button onClick={() => onChange([...values, ''])} className="flex items-center gap-1 font-display text-[10px] uppercase tracking-wider text-brass-deep hover:text-crimson">
        <Plus size={10} /> {placeholder}
      </button>
    </div>
  );
}
