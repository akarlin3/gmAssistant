import { useState, useEffect } from 'react';
import { Wand2, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import type { Action, HomebrewMonster } from './types';
import { SIZES, TYPES, CR_OPTIONS, CR_LABEL_TO_VALUE } from './constants';
import { blankHomebrewMonster } from './format';

const fieldLabelClass = 'text-brass-deep font-display tracking-wider uppercase text-[10px] mb-1';
const inputClass =
  'w-full bg-parchment border border-rule rounded-sm px-2 py-1.5 text-sm text-ink placeholder-ink-faint font-serif focus:border-brass-deep focus:outline-none';

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <div className={fieldLabelClass}>{children}</div>;
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  placeholder,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  placeholder?: string;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type="number"
        value={value ?? ''}
        min={min}
        max={max}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') onChange(null);
          else {
            const n = Number(raw);
            onChange(Number.isFinite(n) ? n : null);
          }
        }}
        className={inputClass}
      />
    </div>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={inputClass}
      />
    </div>
  );
}

function ActionListEditor({
  label,
  entries,
  onChange,
}: {
  label: string;
  entries: Action[];
  onChange: (next: Action[]) => void;
}) {
  const addEntry = () => onChange([...entries, { name: '', desc: '' }]);
  const updateEntry = (i: number, patch: Partial<Action>) =>
    onChange(entries.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const removeEntry = (i: number) => onChange(entries.filter((_, j) => j !== i));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <FieldLabel>{label}</FieldLabel>
        <button
          type="button"
          onClick={addEntry}
          className="flex items-center gap-1 font-display text-[10px] uppercase tracking-wider text-wine hover:text-crimson"
        >
          <Plus size={10} /> Add
        </button>
      </div>
      {entries.length === 0 ? (
        <div className="font-serif text-[11px] italic text-ink-mute">None.</div>
      ) : (
        <div className="space-y-2">
          {entries.map((a, i) => (
            <div key={i} className="space-y-1.5 rounded-sm border border-rule bg-parchment-soft/50 p-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={a.name}
                  onChange={(e) => updateEntry(i, { name: e.target.value })}
                  placeholder="Action name"
                  className={`${inputClass} font-display text-sm`}
                />
                <button
                  type="button"
                  onClick={() => removeEntry(i)}
                  className="flex-shrink-0 text-ink-mute hover:text-crimson"
                  title="Remove"
                  aria-label="Remove action"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              <textarea
                value={a.desc}
                onChange={(e) => updateEntry(i, { desc: e.target.value })}
                placeholder="Description (e.g. Melee Weapon Attack: +5 to hit, reach 5 ft., one target. Hit: 8 (1d10+3) slashing damage.)"
                rows={3}
                className={`${inputClass} resize-y leading-relaxed`}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SpeedEditor({
  speed,
  onChange,
}: {
  speed: Record<string, number | boolean>;
  onChange: (next: Record<string, number | boolean>) => void;
}) {
  const get = (k: string): number => {
    const v = speed[k];
    return typeof v === 'number' ? v : 0;
  };
  const setNum = (k: string, v: number) => {
    const next = { ...speed };
    if (v > 0) next[k] = v;
    else delete next[k];
    onChange(next);
  };
  const hover = speed.hover === true;
  return (
    <div>
      <FieldLabel>Speed (ft.)</FieldLabel>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {(['walk', 'fly', 'swim', 'climb', 'burrow'] as const).map((k) => (
          <div key={k}>
            <div className="mb-0.5 font-display text-[10px] uppercase tracking-wider text-ink-mute">{k}</div>
            <input
              type="number"
              min={0}
              value={get(k) || ''}
              onChange={(e) => setNum(k, Number(e.target.value) || 0)}
              className={inputClass}
              placeholder="0"
            />
          </div>
        ))}
      </div>
      <label className="mt-2 flex cursor-pointer select-none items-center gap-1.5 font-display text-[10px] uppercase tracking-wider text-ink-soft">
        <input
          type="checkbox"
          checked={hover}
          onChange={(e) => {
            const next = { ...speed };
            if (e.target.checked) next.hover = true;
            else delete next.hover;
            onChange(next);
          }}
          className="accent-crimson"
        />
        Fly speed hovers
      </label>
    </div>
  );
}

function SkillsEditor({
  skills,
  onChange,
}: {
  skills: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
}) {
  const text = Object.entries(skills)
    .map(([k, v]) => `${k.split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')} ${v >= 0 ? '+' : ''}${v}`)
    .join(', ');
  const [draft, setDraft] = useState(text);

  useEffect(() => {
    setDraft(text);
  }, [text]);

  const commit = (raw: string) => {
    const next: Record<string, number> = {};
    raw
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((entry) => {
        const m = entry.match(/^([A-Za-z][A-Za-z ]*?)\s*([+-]?\d+)$/);
        if (!m) return;
        const name = m[1].trim().toLowerCase().replace(/\s+/g, '_');
        const bonus = Number(m[2]);
        if (Number.isFinite(bonus)) next[name] = bonus;
      });
    onChange(next);
  };

  return (
    <div>
      <FieldLabel>Skills</FieldLabel>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        placeholder="Perception +5, Stealth +6"
        className={inputClass}
      />
      <p className="mt-0.5 font-serif text-[10px] italic text-ink-mute">
        Comma-separated, e.g. <span className="not-italic">Perception +5, Stealth +6</span>.
      </p>
    </div>
  );
}

function HomebrewEditor({
  monster,
  onChange,
  onDelete,
}: {
  monster: HomebrewMonster;
  onChange: (patch: Partial<HomebrewMonster>) => void;
  onDelete: () => void;
}) {
  const setCr = (label: string) => {
    const value = CR_LABEL_TO_VALUE[label];
    if (value == null) return;
    onChange({ challenge_rating: label, cr: value });
  };

  const setSave = (key: keyof HomebrewMonster, raw: string) => {
    if (raw === '') onChange({ [key]: null } as Partial<HomebrewMonster>);
    else {
      const n = Number(raw);
      onChange({ [key]: Number.isFinite(n) ? n : null } as Partial<HomebrewMonster>);
    }
  };

  return (
    <div className="space-y-3 border-t border-wine/40 bg-wine/[0.03] p-3 text-xs">
      <TextField
        label="Name"
        value={monster.name}
        onChange={(v) => onChange({ name: v })}
        placeholder="Awakened Mossback"
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <FieldLabel>Size</FieldLabel>
          <select
            value={monster.size}
            onChange={(e) => onChange({ size: e.target.value })}
            className={inputClass}
          >
            {SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>Type</FieldLabel>
          <select
            value={monster.type}
            onChange={(e) => onChange({ type: e.target.value })}
            className={inputClass}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <TextField
          label="Subtype"
          value={monster.subtype}
          onChange={(v) => onChange({ subtype: v })}
          placeholder="optional"
        />
        <TextField
          label="Alignment"
          value={monster.alignment}
          onChange={(v) => onChange({ alignment: v })}
          placeholder="lawful good"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <NumberField
          label="Armor Class"
          value={monster.armor_class}
          onChange={(v) => onChange({ armor_class: v })}
          min={0}
        />
        <TextField
          label="AC Note"
          value={monster.armor_desc}
          onChange={(v) => onChange({ armor_desc: v })}
          placeholder="natural armor"
        />
        <NumberField
          label="Hit Points"
          value={monster.hit_points}
          onChange={(v) => onChange({ hit_points: v })}
          min={0}
        />
        <TextField
          label="Hit Dice"
          value={monster.hit_dice}
          onChange={(v) => onChange({ hit_dice: v })}
          placeholder="3d8+6"
        />
      </div>

      <SpeedEditor speed={monster.speed} onChange={(v) => onChange({ speed: v })} />

      <div>
        <FieldLabel>Ability Scores</FieldLabel>
        <div className="grid grid-cols-6 gap-1">
          {([
            ['Str', 'strength'],
            ['Dex', 'dexterity'],
            ['Con', 'constitution'],
            ['Int', 'intelligence'],
            ['Wis', 'wisdom'],
            ['Cha', 'charisma'],
          ] as const).map(([label, key]) => (
            <div key={key} className="text-center">
              <div className="mb-0.5 font-display text-[10px] uppercase tracking-wider text-ink-mute">
                {label}
              </div>
              <input
                type="number"
                min={1}
                max={30}
                value={monster[key]}
                onChange={(e) => onChange({ [key]: Number(e.target.value) || 10 } as Partial<HomebrewMonster>)}
                className={`${inputClass} text-center`}
              />
            </div>
          ))}
        </div>
      </div>

      <div>
        <FieldLabel>Saving Throws (optional)</FieldLabel>
        <div className="grid grid-cols-6 gap-1">
          {([
            ['Str', 'strength_save'],
            ['Dex', 'dexterity_save'],
            ['Con', 'constitution_save'],
            ['Int', 'intelligence_save'],
            ['Wis', 'wisdom_save'],
            ['Cha', 'charisma_save'],
          ] as const).map(([label, key]) => (
            <div key={key} className="text-center">
              <div className="mb-0.5 font-display text-[10px] uppercase tracking-wider text-ink-mute">
                {label}
              </div>
              <input
                type="number"
                value={monster[key] ?? ''}
                onChange={(e) => setSave(key, e.target.value)}
                placeholder="—"
                className={`${inputClass} text-center`}
              />
            </div>
          ))}
        </div>
      </div>

      <SkillsEditor skills={monster.skills} onChange={(v) => onChange({ skills: v })} />

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <TextField
          label="Damage Vulnerabilities"
          value={monster.damage_vulnerabilities}
          onChange={(v) => onChange({ damage_vulnerabilities: v })}
          placeholder="fire"
        />
        <TextField
          label="Damage Resistances"
          value={monster.damage_resistances}
          onChange={(v) => onChange({ damage_resistances: v })}
          placeholder="cold; bludgeoning from nonmagical attacks"
        />
        <TextField
          label="Damage Immunities"
          value={monster.damage_immunities}
          onChange={(v) => onChange({ damage_immunities: v })}
          placeholder="poison"
        />
        <TextField
          label="Condition Immunities"
          value={monster.condition_immunities}
          onChange={(v) => onChange({ condition_immunities: v })}
          placeholder="charmed, frightened"
        />
        <TextField
          label="Senses"
          value={monster.senses}
          onChange={(v) => onChange({ senses: v })}
          placeholder="darkvision 60 ft., passive Perception 12"
        />
        <TextField
          label="Languages"
          value={monster.languages}
          onChange={(v) => onChange({ languages: v })}
          placeholder="Common, Sylvan"
        />
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <FieldLabel>Challenge Rating</FieldLabel>
          <select
            value={monster.challenge_rating}
            onChange={(e) => setCr(e.target.value)}
            className={inputClass}
          >
            {CR_OPTIONS.map((o) => (
              <option key={o.label} value={o.label}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <TextField
          label="Source / Note"
          value={monster.source}
          onChange={(v) => onChange({ source: v })}
          placeholder="Homebrew"
        />
      </div>

      <ActionListEditor
        label="Special Abilities"
        entries={monster.special_abilities}
        onChange={(v) => onChange({ special_abilities: v })}
      />
      <ActionListEditor
        label="Actions"
        entries={monster.actions}
        onChange={(v) => onChange({ actions: v })}
      />
      <ActionListEditor
        label="Bonus Actions"
        entries={monster.bonus_actions}
        onChange={(v) => onChange({ bonus_actions: v })}
      />
      <ActionListEditor
        label="Reactions"
        entries={monster.reactions}
        onChange={(v) => onChange({ reactions: v })}
      />

      <div className="space-y-2">
        <TextField
          label="Legendary Description"
          value={monster.legendary_desc}
          onChange={(v) => onChange({ legendary_desc: v })}
          placeholder="The dragon can take 3 legendary actions…"
        />
        <ActionListEditor
          label="Legendary Actions"
          entries={monster.legendary_actions}
          onChange={(v) => onChange({ legendary_actions: v })}
        />
      </div>

      <div>
        <FieldLabel>Lore (optional)</FieldLabel>
        <textarea
          value={monster.desc}
          onChange={(e) => onChange({ desc: e.target.value })}
          placeholder="Flavor text shown under Lore in the statblock."
          rows={3}
          className={`${inputClass} resize-y leading-relaxed`}
        />
      </div>

      <div className="flex justify-end pt-1">
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-crimson hover:text-crimson/70"
        >
          <Trash2 size={12} /> Delete Monster
        </button>
      </div>
    </div>
  );
}

export function HomebrewManager({
  homebrewMonsters,
  onChange,
}: {
  homebrewMonsters: HomebrewMonster[];
  onChange: (next: HomebrewMonster[]) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const add = () => {
    const next = blankHomebrewMonster();
    onChange([next, ...homebrewMonsters]);
    setExpanded((s) => {
      const n = new Set(s);
      n.add(next.slug);
      return n;
    });
  };

  const update = (slug: string, patch: Partial<HomebrewMonster>) => {
    onChange(homebrewMonsters.map((m) => (m.slug === slug ? { ...m, ...patch } : m)));
  };

  const remove = (slug: string) => {
    const m = homebrewMonsters.find((x) => x.slug === slug);
    if (!m) return;
    const hasContent = (m.name || '').trim().length > 0;
    if (hasContent && !confirm(`Delete "${m.name}"? This cannot be undone.`)) return;
    onChange(homebrewMonsters.filter((x) => x.slug !== slug));
    setExpanded((cur) => {
      const n = new Set(cur);
      n.delete(slug);
      return n;
    });
  };

  const toggleExpand = (slug: string) =>
    setExpanded((s) => {
      const n = new Set(s);
      if (n.has(slug)) n.delete(slug);
      else n.add(slug);
      return n;
    });

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-serif text-xs italic text-ink-soft">
          Build custom monsters for this campaign. They join the random roller pool and render with the
          same statblock as SRD creatures.
        </p>
        <button
          type="button"
          onClick={add}
          className="flex flex-shrink-0 items-center gap-1.5 rounded border border-wine/60 px-3 py-1 font-display text-xs uppercase tracking-wider text-wine transition-colors hover:border-wine hover:bg-wine hover:text-parchment"
        >
          <Plus size={12} /> Add Monster
        </button>
      </div>

      {homebrewMonsters.length === 0 ? (
        <div className="rounded border border-dashed border-rule bg-parchment-soft p-6 text-center font-serif text-sm italic text-ink-mute">
          No homebrew monsters yet. Click <span className="font-display not-italic tracking-wider text-wine">Add Monster</span>{' '}
          to create one.
        </div>
      ) : (
        <div className="space-y-1">
          {homebrewMonsters.map((m) => {
            const isOpen = expanded.has(m.slug);
            return (
              <div key={m.slug} className="rounded-sm border border-wine/60 bg-wine/5">
                <div className="flex items-center gap-2 px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => toggleExpand(m.slug)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <Wand2 size={12} className="flex-shrink-0 text-wine" />
                    <span
                      className={`flex-1 truncate font-display text-sm tracking-wide ${
                        m.name ? 'text-ink' : 'italic text-ink-faint'
                      }`}
                    >
                      {m.name || 'Untitled Homebrew'}
                    </span>
                    <span className="hidden font-serif text-[10px] italic text-ink-mute sm:inline">
                      CR {m.challenge_rating} · {m.type}
                    </span>
                    {isOpen ? (
                      <ChevronDown size={12} className="flex-shrink-0 text-ink-faint" />
                    ) : (
                      <ChevronRight size={12} className="flex-shrink-0 text-ink-faint" />
                    )}
                  </button>
                </div>
                {isOpen && (
                  <HomebrewEditor
                    monster={m}
                    onChange={(patch) => update(m.slug, patch)}
                    onDelete={() => remove(m.slug)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-center font-serif text-[10px] italic text-ink-mute">
        Homebrew monsters are saved with this campaign.
      </p>
    </div>
  );
}
