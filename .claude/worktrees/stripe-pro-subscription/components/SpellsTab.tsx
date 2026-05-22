'use client';

import { useState, useMemo } from 'react';
import { Search, Star, ChevronDown, ChevronRight, Plus, Trash2, Wand2 } from 'lucide-react';
import spellsData from '@/lib/srd/spells.json';

export type Spell = {
  index: string;
  name: string;
  level: number;
  school: string;
  classes: string[];
  ritual: boolean;
  concentration: boolean;
  casting_time: string;
  range: string;
  components: string[];
  material: string | null;
  duration: string;
  desc: string[];
  higher_level: string[];
  homebrew?: boolean;
};

const ALL_SRD_SPELLS = spellsData as Spell[];
const SCHOOLS = ['Abjuration', 'Conjuration', 'Divination', 'Enchantment', 'Evocation', 'Illusion', 'Necromancy', 'Transmutation'];
const CLASSES = ['Bard', 'Cleric', 'Druid', 'Paladin', 'Ranger', 'Sorcerer', 'Warlock', 'Wizard'];
const COMPONENTS = ['V', 'S', 'M'];
const LEVELS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

function makeHomebrewId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `hb-${crypto.randomUUID()}`;
  }
  return `hb-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function blankHomebrew(): Spell {
  return {
    index: makeHomebrewId(),
    name: '',
    level: 1,
    school: 'Evocation',
    classes: [],
    ritual: false,
    concentration: false,
    casting_time: '1 action',
    range: '',
    components: [],
    material: null,
    duration: 'Instantaneous',
    desc: [],
    higher_level: [],
    homebrew: true,
  };
}

function toggleInSet<T>(set: Set<T>, val: T): Set<T> {
  const next = new Set(set);
  if (next.has(val)) next.delete(val);
  else next.add(val);
  return next;
}

function toggleInList<T>(list: T[], val: T): T[] {
  return list.includes(val) ? list.filter((v) => v !== val) : [...list, val];
}

const Chip = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    onClick={onClick}
    className={`px-2 py-0.5 rounded-sm border font-display uppercase tracking-wider transition-colors ${
      active
        ? 'bg-crimson border-crimson text-parchment'
        : 'border-rule text-ink-soft hover:bg-parchment-deep'
    }`}
  >
    {children}
  </button>
);

export default function SpellsTab({
  favorites,
  onFavoritesChange,
  homebrewSpells,
  onHomebrewSpellsChange,
}: {
  favorites: string[];
  onFavoritesChange: (next: string[]) => void;
  homebrewSpells: Spell[];
  onHomebrewSpellsChange: (next: Spell[]) => void;
}) {
  const [q, setQ] = useState('');
  const [levels, setLevels] = useState<Set<number>>(new Set());
  const [schools, setSchools] = useState<Set<string>>(new Set());
  const [classes, setClasses] = useState<Set<string>>(new Set());
  const [conc, setConc] = useState(false);
  const [rit, setRit] = useState(false);
  const [favOnly, setFavOnly] = useState(false);
  const [hbOnly, setHbOnly] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const favSet = useMemo(() => new Set(favorites), [favorites]);

  const allSpells = useMemo(
    () => [...homebrewSpells, ...ALL_SRD_SPELLS],
    [homebrewSpells]
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return allSpells.filter((s) => {
      if (favOnly && !favSet.has(s.index)) return false;
      if (hbOnly && !s.homebrew) return false;
      if (needle && !s.name.toLowerCase().includes(needle)) return false;
      if (levels.size && !levels.has(s.level)) return false;
      if (schools.size && !schools.has(s.school)) return false;
      if (classes.size && !s.classes.some((c) => classes.has(c))) return false;
      if (conc && !s.concentration) return false;
      if (rit && !s.ritual) return false;
      return true;
    });
  }, [q, levels, schools, classes, conc, rit, favOnly, hbOnly, favSet, allSpells]);

  const toggleFav = (idx: string) => {
    onFavoritesChange(favSet.has(idx) ? favorites.filter((f) => f !== idx) : [...favorites, idx]);
  };

  const toggleExpand = (idx: string) => setExpanded((s) => toggleInSet(s, idx));

  const addHomebrew = () => {
    const next = blankHomebrew();
    onHomebrewSpellsChange([next, ...homebrewSpells]);
    setExpanded((s) => {
      const n = new Set(s);
      n.add(next.index);
      return n;
    });
    if (favOnly) setFavOnly(false);
  };

  const updateHomebrew = (idx: string, patch: Partial<Spell>) => {
    onHomebrewSpellsChange(homebrewSpells.map((s) => (s.index === idx ? { ...s, ...patch } : s)));
  };

  const deleteHomebrew = (idx: string) => {
    const s = homebrewSpells.find((x) => x.index === idx);
    if (!s) return;
    const hasContent = (s.name || '').trim() || s.desc.some((p) => p.trim());
    if (hasContent && !confirm(`Delete "${s.name || 'this homebrew spell'}"? This cannot be undone.`)) return;
    onHomebrewSpellsChange(homebrewSpells.filter((x) => x.index !== idx));
    if (favSet.has(idx)) onFavoritesChange(favorites.filter((f) => f !== idx));
    setExpanded((cur) => {
      const n = new Set(cur);
      n.delete(idx);
      return n;
    });
  };

  const clearAll = () => {
    setQ('');
    setLevels(new Set());
    setSchools(new Set());
    setClasses(new Set());
    setConc(false);
    setRit(false);
    setFavOnly(false);
    setHbOnly(false);
  };

  const anyFilter = !!(q || levels.size || schools.size || classes.size || conc || rit || favOnly || hbOnly);

  return (
    <div className="space-y-3">
      <div className="rounded border border-rule bg-parchment-soft p-3 space-y-2 text-xs">
        <div className="flex items-center gap-2">
          <Search size={14} className="text-ink-mute flex-shrink-0" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${allSpells.length} spells…`}
            className="flex-1 bg-parchment border border-rule rounded-sm px-2 py-1.5 text-sm text-ink placeholder-ink-faint font-serif focus:border-brass-deep focus:outline-none"
          />
        </div>

        <FilterRow label="Level">
          {LEVELS.map((l) => (
            <Chip key={l} active={levels.has(l)} onClick={() => setLevels((s) => toggleInSet(s, l))}>
              {l === 0 ? 'Cant' : l}
            </Chip>
          ))}
        </FilterRow>

        <FilterRow label="School">
          {SCHOOLS.map((s) => (
            <Chip key={s} active={schools.has(s)} onClick={() => setSchools((cur) => toggleInSet(cur, s))}>
              {s.slice(0, 4)}
            </Chip>
          ))}
        </FilterRow>

        <FilterRow label="Class">
          {CLASSES.map((c) => (
            <Chip key={c} active={classes.has(c)} onClick={() => setClasses((cur) => toggleInSet(cur, c))}>
              {c.slice(0, 3)}
            </Chip>
          ))}
        </FilterRow>

        <div className="flex flex-wrap items-center gap-1">
          <Chip active={conc} onClick={() => setConc((v) => !v)}>Concentration</Chip>
          <Chip active={rit} onClick={() => setRit((v) => !v)}>Ritual</Chip>
          <Chip active={favOnly} onClick={() => setFavOnly((v) => !v)}>
            <span className="inline-flex items-center gap-1">
              <Star size={10} fill={favOnly ? 'currentColor' : 'none'} /> Favorites ({favorites.length})
            </span>
          </Chip>
          <Chip active={hbOnly} onClick={() => setHbOnly((v) => !v)}>
            <span className="inline-flex items-center gap-1">
              <Wand2 size={10} /> Homebrew ({homebrewSpells.length})
            </span>
          </Chip>
          <div className="flex-1" />
          {anyFilter && (
            <button
              onClick={clearAll}
              className="text-ink-mute hover:text-crimson font-display uppercase tracking-wider px-1"
            >
              Clear
            </button>
          )}
          <span className="text-ink-mute font-display tracking-wider ml-2">
            {filtered.length} / {allSpells.length}
          </span>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={addHomebrew}
          className="text-xs px-3 py-1 rounded border border-wine/60 text-wine hover:bg-wine hover:text-parchment hover:border-wine font-display uppercase tracking-wider flex items-center gap-1.5 transition-colors"
        >
          <Plus size={12} /> Add Homebrew Spell
        </button>
      </div>

      <div className="space-y-1">
        {filtered.map((s) => {
          const isFav = favSet.has(s.index);
          const isOpen = expanded.has(s.index);
          const isHB = !!s.homebrew;
          return (
            <div
              key={s.index}
              className={`rounded-sm border ${
                isHB
                  ? 'border-wine/60 bg-wine/5'
                  : isFav
                  ? 'border-brass-deep/60 bg-brass/5'
                  : 'border-rule bg-parchment-soft'
              }`}
            >
              <div className="flex items-center gap-2 px-2 py-1.5">
                <button
                  onClick={() => toggleFav(s.index)}
                  className={isFav ? 'text-brass-deep' : 'text-ink-faint hover:text-brass-deep'}
                  aria-label={isFav ? `Unfavorite ${s.name || 'spell'}` : `Favorite ${s.name || 'spell'}`}
                >
                  <Star size={14} fill={isFav ? 'currentColor' : 'none'} />
                </button>
                <button
                  onClick={() => toggleExpand(s.index)}
                  className="flex-1 flex items-center gap-2 text-left min-w-0"
                >
                  <span className="font-display text-[10px] text-ink-mute w-6 flex-shrink-0 text-center">
                    {s.level === 0 ? 'C' : s.level}
                  </span>
                  <span
                    className={`font-display tracking-wide text-sm flex-1 truncate ${
                      s.name ? 'text-ink' : 'text-ink-faint italic'
                    }`}
                  >
                    {s.name || (isHB ? 'Untitled Homebrew' : '')}
                  </span>
                  {isHB && (
                    <span
                      className="text-[10px] text-wine font-display tracking-wider inline-flex items-center gap-0.5"
                      title="Homebrew"
                    >
                      <Wand2 size={10} /> HB
                    </span>
                  )}
                  <span className="text-[10px] text-ink-mute italic font-serif hidden sm:inline">
                    {s.school}
                  </span>
                  {s.concentration && (
                    <span
                      className="text-[10px] text-wine font-display tracking-wider"
                      title="Concentration"
                    >
                      Conc
                    </span>
                  )}
                  {s.ritual && (
                    <span
                      className="text-[10px] text-moss font-display tracking-wider"
                      title="Ritual"
                    >
                      Rit
                    </span>
                  )}
                  {isOpen ? (
                    <ChevronDown size={12} className="text-ink-faint flex-shrink-0" />
                  ) : (
                    <ChevronRight size={12} className="text-ink-faint flex-shrink-0" />
                  )}
                </button>
              </div>
              {isOpen &&
                (isHB ? (
                  <HomebrewEditor
                    spell={s}
                    onChange={(patch) => updateHomebrew(s.index, patch)}
                    onDelete={() => deleteHomebrew(s.index)}
                  />
                ) : (
                  <div className="px-3 pb-3 pt-2 border-t border-rule/60 space-y-2 text-xs text-ink-soft font-serif">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-0.5">
                      <Meta label="Casting Time">{s.casting_time}</Meta>
                      <Meta label="Range">{s.range}</Meta>
                      <Meta label="Duration">{s.duration}</Meta>
                      <Meta label="Components">
                        {s.components.join(', ')}
                        {s.material ? ` (${s.material})` : ''}
                      </Meta>
                      <div className="sm:col-span-2">
                        <Meta label="Classes">{s.classes.join(', ')}</Meta>
                      </div>
                    </div>
                    {s.desc.map((p, i) => (
                      <p key={i} className="leading-relaxed">
                        {p}
                      </p>
                    ))}
                    {s.higher_level.length > 0 && (
                      <div className="border-l-2 border-brass-deep/40 pl-2">
                        <div className="text-brass-deep font-display tracking-wider uppercase text-[10px] mb-1">
                          At Higher Levels
                        </div>
                        {s.higher_level.map((p, i) => (
                          <p key={i} className="leading-relaxed">
                            {p}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="text-center text-xs text-ink-mute italic font-serif py-8">
            No spells match.
          </div>
        )}
      </div>

      <p className="text-[10px] text-ink-mute italic font-serif text-center">
        SRD spell text from the D&amp;D 5e SRD 5.1 © Wizards of the Coast, CC-BY-4.0. Homebrew spells are saved with this campaign.
      </p>
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="text-[10px] text-brass-deep font-display uppercase tracking-wider mr-1 w-14">
        {label}
      </span>
      {children}
    </div>
  );
}

function Meta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <span className="text-brass-deep font-display tracking-wider uppercase text-[10px] mr-1">
        {label}:
      </span>
      <span className="text-ink">{children}</span>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-brass-deep font-display tracking-wider uppercase text-[10px] mb-1">
      {children}
    </div>
  );
}

const inputClass =
  'w-full bg-parchment border border-rule rounded-sm px-2 py-1.5 text-sm text-ink placeholder-ink-faint font-serif focus:border-brass-deep focus:outline-none';

function HomebrewEditor({
  spell,
  onChange,
  onDelete,
}: {
  spell: Spell;
  onChange: (patch: Partial<Spell>) => void;
  onDelete: () => void;
}) {
  const setDesc = (v: string) => onChange({ desc: v === '' ? [] : v.split(/\n{2,}/) });
  const setHigher = (v: string) => onChange({ higher_level: v === '' ? [] : v.split(/\n{2,}/) });

  return (
    <div className="px-3 pb-3 pt-3 border-t border-wine/40 space-y-2.5 text-xs bg-wine/[0.03]">
      <div>
        <FieldLabel>Name</FieldLabel>
        <input
          type="text"
          value={spell.name}
          onChange={(e) => onChange({ name: e.target.value })}
          placeholder="Spell name"
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <FieldLabel>Level</FieldLabel>
          <select
            value={spell.level}
            onChange={(e) => onChange({ level: Number(e.target.value) })}
            className={inputClass}
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>
                {l === 0 ? 'Cantrip' : `Level ${l}`}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>School</FieldLabel>
          <select
            value={spell.school}
            onChange={(e) => onChange({ school: e.target.value })}
            className={inputClass}
          >
            {SCHOOLS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <FieldLabel>Classes</FieldLabel>
        <div className="flex flex-wrap gap-1">
          {CLASSES.map((c) => (
            <Chip
              key={c}
              active={spell.classes.includes(c)}
              onClick={() => onChange({ classes: toggleInList(spell.classes, c) })}
            >
              {c}
            </Chip>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <FieldLabel>Casting Time</FieldLabel>
          <input
            type="text"
            value={spell.casting_time}
            onChange={(e) => onChange({ casting_time: e.target.value })}
            placeholder="1 action"
            className={inputClass}
          />
        </div>
        <div>
          <FieldLabel>Range</FieldLabel>
          <input
            type="text"
            value={spell.range}
            onChange={(e) => onChange({ range: e.target.value })}
            placeholder="60 feet"
            className={inputClass}
          />
        </div>
        <div>
          <FieldLabel>Duration</FieldLabel>
          <input
            type="text"
            value={spell.duration}
            onChange={(e) => onChange({ duration: e.target.value })}
            placeholder="Instantaneous"
            className={inputClass}
          />
        </div>
        <div>
          <FieldLabel>Components</FieldLabel>
          <div className="flex gap-1 pt-1">
            {COMPONENTS.map((c) => (
              <Chip
                key={c}
                active={spell.components.includes(c)}
                onClick={() => onChange({ components: toggleInList(spell.components, c) })}
              >
                {c}
              </Chip>
            ))}
          </div>
        </div>
      </div>

      {spell.components.includes('M') && (
        <div>
          <FieldLabel>Material Components</FieldLabel>
          <input
            type="text"
            value={spell.material || ''}
            onChange={(e) => onChange({ material: e.target.value || null })}
            placeholder="e.g. a pinch of phosphorus"
            className={inputClass}
          />
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <Chip active={spell.concentration} onClick={() => onChange({ concentration: !spell.concentration })}>
          Concentration
        </Chip>
        <Chip active={spell.ritual} onClick={() => onChange({ ritual: !spell.ritual })}>
          Ritual
        </Chip>
      </div>

      <div>
        <FieldLabel>Description</FieldLabel>
        <textarea
          value={spell.desc.join('\n\n')}
          onChange={(e) => setDesc(e.target.value)}
          placeholder="Spell description. Separate paragraphs with a blank line."
          rows={5}
          className={`${inputClass} resize-y leading-relaxed`}
        />
      </div>

      <div>
        <FieldLabel>At Higher Levels (optional)</FieldLabel>
        <textarea
          value={spell.higher_level.join('\n\n')}
          onChange={(e) => setHigher(e.target.value)}
          placeholder="What changes when cast at a higher slot."
          rows={2}
          className={`${inputClass} resize-y leading-relaxed`}
        />
      </div>

      <div className="flex justify-end pt-1">
        <button
          onClick={onDelete}
          className="text-xs text-crimson hover:text-crimson/70 font-display uppercase tracking-wider flex items-center gap-1"
        >
          <Trash2 size={12} /> Delete Spell
        </button>
      </div>
    </div>
  );
}
