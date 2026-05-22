'use client';

import { ChevronDown, ChevronRight, X, Plus, Trash2 } from 'lucide-react';
import type { Character, Attack } from '@/lib/character-schema';

type Props = {
  data: Character;
  open: boolean;
  onToggleOpen: () => void;
  onChange: (next: Character) => void;
  onRemove: () => void;
};

const Field = ({
  value,
  onChange,
  placeholder,
  rows = 1,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  rows?: number;
}) => (
  <textarea
    value={value || ''}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    rows={rows}
    className="w-full bg-transparent border-b border-rule text-ink font-serif placeholder:text-ink-faint placeholder:italic focus:border-crimson focus:outline-none resize-none px-1 py-1 text-sm whitespace-pre-wrap break-words [field-sizing:content]"
  />
);

const CardLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="text-xs text-brass-deep font-display uppercase tracking-wider mb-0.5">
    {children}
  </div>
);

const SubSection = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="border-t border-rule pt-2.5 mt-2.5 space-y-2">
    <div className="text-xs text-crimson font-display uppercase tracking-wider">{title}</div>
    {children}
  </div>
);

const AbilityBox = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) => (
  <div className="border border-rule rounded bg-parchment-soft p-1.5 text-center">
    <div className="text-[10px] font-display uppercase tracking-wider text-brass-deep">
      {label}
    </div>
    <input
      type="text"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder="—"
      className="w-full bg-transparent text-center text-sm font-serif text-ink placeholder:text-ink-faint focus:outline-none focus:border-crimson border-b border-transparent"
    />
  </div>
);

export default function CharacterCard({ data, open, onToggleOpen, onChange, onRemove }: Props) {
  const set = <K extends keyof Character>(k: K, v: Character[K]) =>
    onChange({ ...data, [k]: v });

  const setAbility = (k: keyof Character['abilities'], v: string) =>
    onChange({ ...data, abilities: { ...data.abilities, [k]: v } });

  const setCurrency = (k: keyof Character['currency'], v: string) =>
    onChange({ ...data, currency: { ...data.currency, [k]: v } });

  const setSpellcasting = (k: keyof Character['spellcasting'], v: string) =>
    onChange({ ...data, spellcasting: { ...data.spellcasting, [k]: v } });

  const updateAttack = (i: number, patch: Partial<Attack>) => {
    const next = [...data.attacks];
    next[i] = { ...next[i], ...patch };
    onChange({ ...data, attacks: next });
  };
  const addAttack = () =>
    onChange({ ...data, attacks: [...data.attacks, { name: '', bonus: '', damage: '', notes: '' }] });
  const removeAttack = (i: number) =>
    onChange({ ...data, attacks: data.attacks.filter((_, j) => j !== i) });

  const headerLabel = [data.name || 'Unnamed', data.classLevel]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="rounded border border-rule bg-parchment shadow-card">
      <div className="flex items-center gap-2 p-2.5">
        <button onClick={onToggleOpen} className="text-brass-deep hover:text-crimson flex-shrink-0">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>
        <div className="flex-1 min-w-0 font-display tracking-wide text-sm text-ink truncate">
          {headerLabel}
        </div>
        <button
          onClick={onRemove}
          className="text-ink-mute hover:text-crimson flex-shrink-0"
          title="Remove character"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {open && (
        <div className="px-3 pb-3 border-t border-rule pt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <CardLabel>Name</CardLabel>
              <Field value={data.name} onChange={(v) => set('name', v)} placeholder="Character name" />
            </div>
            <div>
              <CardLabel>Player</CardLabel>
              <Field value={data.player} onChange={(v) => set('player', v)} placeholder="Player name" />
            </div>
            <div>
              <CardLabel>Race</CardLabel>
              <Field value={data.race} onChange={(v) => set('race', v)} placeholder="e.g. Half-Elf" />
            </div>
            <div>
              <CardLabel>Class / Level</CardLabel>
              <Field value={data.classLevel} onChange={(v) => set('classLevel', v)} placeholder="e.g. Wizard 5" />
            </div>
            <div>
              <CardLabel>Background</CardLabel>
              <Field value={data.background} onChange={(v) => set('background', v)} placeholder="e.g. Sage" />
            </div>
            <div>
              <CardLabel>Alignment</CardLabel>
              <Field value={data.alignment} onChange={(v) => set('alignment', v)} placeholder="e.g. NG" />
            </div>
            <div className="col-span-2">
              <CardLabel>Experience</CardLabel>
              <Field value={data.experience} onChange={(v) => set('experience', v)} placeholder="XP / milestone" />
            </div>
          </div>

          <SubSection title="Ability Scores">
            <div className="grid grid-cols-6 gap-1.5">
              <AbilityBox label="Str" value={data.abilities.str} onChange={(v) => setAbility('str', v)} />
              <AbilityBox label="Dex" value={data.abilities.dex} onChange={(v) => setAbility('dex', v)} />
              <AbilityBox label="Con" value={data.abilities.con} onChange={(v) => setAbility('con', v)} />
              <AbilityBox label="Int" value={data.abilities.int} onChange={(v) => setAbility('int', v)} />
              <AbilityBox label="Wis" value={data.abilities.wis} onChange={(v) => setAbility('wis', v)} />
              <AbilityBox label="Cha" value={data.abilities.cha} onChange={(v) => setAbility('cha', v)} />
            </div>
            <div>
              <CardLabel>Saving Throw Proficiencies</CardLabel>
              <Field value={data.saves} onChange={(v) => set('saves', v)} placeholder="Wisdom, Charisma" />
            </div>
          </SubSection>

          <SubSection title="Combat">
            <div className="grid grid-cols-4 gap-2">
              <div>
                <CardLabel>AC</CardLabel>
                <Field value={data.ac} onChange={(v) => set('ac', v)} placeholder="—" />
              </div>
              <div>
                <CardLabel>HP / Max</CardLabel>
                <div className="flex gap-1 items-baseline">
                  <Field value={data.hp} onChange={(v) => set('hp', v)} placeholder="cur" />
                  <span className="text-ink-mute">/</span>
                  <Field value={data.hpMax} onChange={(v) => set('hpMax', v)} placeholder="max" />
                </div>
              </div>
              <div>
                <CardLabel>Initiative</CardLabel>
                <Field value={data.initiative} onChange={(v) => set('initiative', v)} placeholder="+0" />
              </div>
              <div>
                <CardLabel>Speed</CardLabel>
                <Field value={data.speed} onChange={(v) => set('speed', v)} placeholder="30 ft" />
              </div>
              <div>
                <CardLabel>Prof Bonus</CardLabel>
                <Field value={data.profBonus} onChange={(v) => set('profBonus', v)} placeholder="+2" />
              </div>
              <div>
                <CardLabel>Hit Dice</CardLabel>
                <Field value={data.hitDice} onChange={(v) => set('hitDice', v)} placeholder="5d8" />
              </div>
              <div className="col-span-2">
                <CardLabel>Passive Perception</CardLabel>
                <Field
                  value={data.passivePerception}
                  onChange={(v) => set('passivePerception', v)}
                  placeholder="10"
                />
              </div>
            </div>

            <div>
              <CardLabel>Attacks & Cantrips</CardLabel>
              <div className="space-y-1.5">
                {data.attacks.map((atk, i) => (
                  <div key={i} className="grid grid-cols-12 gap-1.5 items-center">
                    <div className="col-span-4">
                      <Field
                        value={atk.name}
                        onChange={(v) => updateAttack(i, { name: v })}
                        placeholder="Name"
                      />
                    </div>
                    <div className="col-span-2">
                      <Field
                        value={atk.bonus}
                        onChange={(v) => updateAttack(i, { bonus: v })}
                        placeholder="+5"
                      />
                    </div>
                    <div className="col-span-2">
                      <Field
                        value={atk.damage}
                        onChange={(v) => updateAttack(i, { damage: v })}
                        placeholder="1d8+3 sl"
                      />
                    </div>
                    <div className="col-span-3">
                      <Field
                        value={atk.notes}
                        onChange={(v) => updateAttack(i, { notes: v })}
                        placeholder="notes"
                      />
                    </div>
                    <button
                      onClick={() => removeAttack(i)}
                      className="col-span-1 text-ink-mute hover:text-crimson"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                <button
                  onClick={addAttack}
                  className="text-xs text-brass-deep hover:text-crimson flex items-center gap-1 font-display uppercase tracking-wider"
                >
                  <Plus size={12} /> Add Attack
                </button>
              </div>
            </div>
          </SubSection>

          <SubSection title="Skills, Languages & Proficiencies">
            <div>
              <CardLabel>Skills</CardLabel>
              <Field
                value={data.skills}
                onChange={(v) => set('skills', v)}
                placeholder="Perception +5, expertise: Stealth +9, ..."
                rows={2}
              />
            </div>
            <div>
              <CardLabel>Languages</CardLabel>
              <Field value={data.languages} onChange={(v) => set('languages', v)} placeholder="Common, Elvish, ..." />
            </div>
            <div>
              <CardLabel>Other Proficiencies</CardLabel>
              <Field
                value={data.proficiencies}
                onChange={(v) => set('proficiencies', v)}
                placeholder="Armor, weapons, tools"
                rows={2}
              />
            </div>
          </SubSection>

          <SubSection title="Equipment & Currency">
            <Field
              value={data.equipment}
              onChange={(v) => set('equipment', v)}
              placeholder="One item per line"
              rows={4}
            />
            <div className="grid grid-cols-5 gap-1.5">
              <AbilityBox label="CP" value={data.currency.cp} onChange={(v) => setCurrency('cp', v)} />
              <AbilityBox label="SP" value={data.currency.sp} onChange={(v) => setCurrency('sp', v)} />
              <AbilityBox label="EP" value={data.currency.ep} onChange={(v) => setCurrency('ep', v)} />
              <AbilityBox label="GP" value={data.currency.gp} onChange={(v) => setCurrency('gp', v)} />
              <AbilityBox label="PP" value={data.currency.pp} onChange={(v) => setCurrency('pp', v)} />
            </div>
          </SubSection>

          <SubSection title="Spellcasting">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <CardLabel>Ability</CardLabel>
                <Field
                  value={data.spellcasting.ability}
                  onChange={(v) => setSpellcasting('ability', v)}
                  placeholder="Int"
                />
              </div>
              <div>
                <CardLabel>Save DC</CardLabel>
                <Field
                  value={data.spellcasting.saveDC}
                  onChange={(v) => setSpellcasting('saveDC', v)}
                  placeholder="14"
                />
              </div>
              <div>
                <CardLabel>Attack Bonus</CardLabel>
                <Field
                  value={data.spellcasting.attackBonus}
                  onChange={(v) => setSpellcasting('attackBonus', v)}
                  placeholder="+6"
                />
              </div>
            </div>
            <div>
              <CardLabel>Slots</CardLabel>
              <Field
                value={data.spellcasting.slots}
                onChange={(v) => setSpellcasting('slots', v)}
                placeholder="L1: 4, L2: 3"
              />
            </div>
            <div>
              <CardLabel>Spells</CardLabel>
              <Field
                value={data.spells}
                onChange={(v) => set('spells', v)}
                placeholder="One per line. [P] for prepared."
                rows={6}
              />
            </div>
          </SubSection>

          <SubSection title="Features & Traits">
            <Field
              value={data.features}
              onChange={(v) => set('features', v)}
              placeholder="One feature per line"
              rows={5}
            />
          </SubSection>

          <SubSection title="Personality">
            <div>
              <CardLabel>Personality Traits</CardLabel>
              <Field value={data.personality} onChange={(v) => set('personality', v)} placeholder="..." rows={2} />
            </div>
            <div>
              <CardLabel>Ideals</CardLabel>
              <Field value={data.ideals} onChange={(v) => set('ideals', v)} placeholder="..." rows={2} />
            </div>
            <div>
              <CardLabel>Bonds</CardLabel>
              <Field value={data.bonds} onChange={(v) => set('bonds', v)} placeholder="..." rows={2} />
            </div>
            <div>
              <CardLabel>Flaws</CardLabel>
              <Field value={data.flaws} onChange={(v) => set('flaws', v)} placeholder="..." rows={2} />
            </div>
            <div>
              <CardLabel>Appearance</CardLabel>
              <Field value={data.appearance} onChange={(v) => set('appearance', v)} placeholder="..." rows={2} />
            </div>
            <div>
              <CardLabel>Backstory</CardLabel>
              <Field value={data.backstory} onChange={(v) => set('backstory', v)} placeholder="..." rows={4} />
            </div>
          </SubSection>

          <SubSection title="Notes">
            <Field value={data.notes} onChange={(v) => set('notes', v)} placeholder="Anything else" rows={3} />
          </SubSection>
        </div>
      )}
    </div>
  );
}
