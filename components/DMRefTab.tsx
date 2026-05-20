'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import conditionsData from '@/lib/srd/conditions.json';

type Condition = { index: string; name: string; desc: string[] };
const CONDITIONS = conditionsData as Condition[];

const ACTIONS: Array<{ name: string; desc: string }> = [
  { name: 'Attack', desc: 'Make one melee or ranged attack. Some features grant more attacks with this action.' },
  { name: 'Cast a Spell', desc: 'Cast a spell with a casting time of 1 action. Bonus-action and reaction spells use their own timings.' },
  { name: 'Dash', desc: 'Gain extra movement equal to your speed this turn. Increases by any modifiers to your speed.' },
  { name: 'Disengage', desc: 'Your movement does not provoke opportunity attacks for the rest of the turn.' },
  { name: 'Dodge', desc: 'Until your next turn, attack rolls against you have disadvantage (if you can see the attacker) and you make DEX saves with advantage. Lost if incapacitated or speed = 0.' },
  { name: 'Help', desc: 'Aid an ally with a task (they get advantage on the next ability check) or distract a foe within 5 ft (the next attack roll against it before your next turn has advantage).' },
  { name: 'Hide', desc: 'Make a DEX (Stealth) check against the passive WIS (Perception) of those who might notice you.' },
  { name: 'Ready', desc: 'Choose a trigger and a reaction (move up to your speed, or take an action). React when the trigger fires before the start of your next turn. Holding a spell requires concentration.' },
  { name: 'Search', desc: 'Devote attention to finding something — WIS (Perception) or INT (Investigation) as appropriate.' },
  { name: 'Use an Object', desc: 'Interact with a second object on your turn, or use an object that requires an action to operate.' },
];

const EXTRA_TURN: Array<{ name: string; desc: string }> = [
  { name: 'Bonus Action', desc: 'You can take one bonus action on your turn, only when a feature, spell, or rule says you can.' },
  { name: 'Reaction', desc: 'An instant response triggered by a circumstance — once per round. Most common: opportunity attack when a hostile creature you can see leaves your reach.' },
  { name: 'Free Object Interaction', desc: 'Interact with one object or feature of the environment for free (draw a weapon, open a door, withdraw an item).' },
  { name: 'Movement', desc: 'Move up to your speed, split across the turn however you like. Difficult terrain costs 1 extra foot per foot moved.' },
];

const COVER: Array<{ name: string; desc: string }> = [
  { name: 'Half Cover', desc: '+2 to AC and DEX saves. Body blocked by low wall, large furniture, narrow tree, creature.' },
  { name: 'Three-Quarters Cover', desc: '+5 to AC and DEX saves. Behind a portcullis, arrow slit, thick tree trunk.' },
  { name: 'Total Cover', desc: 'Cannot be targeted directly by an attack or a spell. Must be entirely concealed.' },
];

const VISION: Array<{ name: string; desc: string }> = [
  { name: 'Bright Light', desc: 'Most creatures see normally. Sunlight, daylight, or a well-lit area.' },
  { name: 'Dim Light (Lightly Obscured)', desc: 'Disadvantage on WIS (Perception) checks that rely on sight. Twilight, moonlight, dim torchlight beyond its bright radius.' },
  { name: 'Darkness (Heavily Obscured)', desc: 'Effectively blinded. Attacks against targets in darkness have disadvantage; attacks from inside have advantage (and disadvantage cancels).' },
  { name: 'Darkvision', desc: 'See in dim light within range as bright, and in darkness as dim (shades of gray). Cannot discern color in darkness.' },
  { name: 'Blindsight', desc: 'Perceive surroundings without sight within range.' },
  { name: 'Truesight', desc: 'See in normal and magical darkness, see invisible creatures, detect illusions and shapechangers, see into the Ethereal Plane.' },
];

const DC_TIERS: Array<{ dc: string; tier: string; note: string }> = [
  { dc: '5',  tier: 'Very Easy',          note: 'A character with relevant skill expects to succeed.' },
  { dc: '10', tier: 'Easy',               note: 'Anyone can attempt with a fair chance.' },
  { dc: '15', tier: 'Medium',             note: 'Some training or talent is needed.' },
  { dc: '20', tier: 'Hard',               note: 'Real skill and a good roll required.' },
  { dc: '25', tier: 'Very Hard',          note: 'High-end characters only — magic helps.' },
  { dc: '30', tier: 'Nearly Impossible',  note: 'A lifetime story-worthy attempt.' },
];

const SKILLS: Array<{ ability: 'STR' | 'DEX' | 'CON' | 'INT' | 'WIS' | 'CHA'; names: string[] }> = [
  { ability: 'STR', names: ['Athletics'] },
  { ability: 'DEX', names: ['Acrobatics', 'Sleight of Hand', 'Stealth'] },
  { ability: 'CON', names: [] },
  { ability: 'INT', names: ['Arcana', 'History', 'Investigation', 'Nature', 'Religion'] },
  { ability: 'WIS', names: ['Animal Handling', 'Insight', 'Medicine', 'Perception', 'Survival'] },
  { ability: 'CHA', names: ['Deception', 'Intimidation', 'Performance', 'Persuasion'] },
];

const EXHAUSTION: Array<{ lvl: number; effect: string }> = [
  { lvl: 1, effect: 'Disadvantage on ability checks' },
  { lvl: 2, effect: 'Speed halved' },
  { lvl: 3, effect: 'Disadvantage on attack rolls and saving throws' },
  { lvl: 4, effect: 'Hit point maximum halved' },
  { lvl: 5, effect: 'Speed reduced to 0' },
  { lvl: 6, effect: 'Death' },
];

const RESTS: Array<{ name: string; desc: string }> = [
  { name: 'Short Rest', desc: '1 hour of light activity. Spend Hit Dice to heal (roll + CON mod per die). Restores some class features.' },
  { name: 'Long Rest', desc: '8 hours, at most 2 hours of light activity. Restores all HP and half of total Hit Dice (min 1). Once per 24 hours.' },
];

const SHORT_MADNESS: Array<{ range: string; effect: string }> = [
  { range: '01–20',  effect: 'Wanders aimlessly for 1 minute; cannot take actions or reactions.' },
  { range: '21–30',  effect: 'Falls prone and weeps uncontrollably for 1 minute.' },
  { range: '31–40',  effect: 'Frightened; must use its action and movement each round to flee the source of its fear.' },
  { range: '41–50',  effect: 'Babbles incoherently for 1 minute; cannot speak or cast spells with verbal components.' },
  { range: '51–60',  effect: 'Must use its action each round to attack the nearest creature.' },
  { range: '61–70',  effect: 'Suffers vivid hallucinations; disadvantage on ability checks for 1 minute.' },
  { range: '71–75',  effect: 'Does whatever anyone tells it to do that is not obviously self-destructive, for 1 minute.' },
  { range: '76–80',  effect: 'Overpowering urge to eat something strange (dirt, slime, offal) for 1 minute.' },
  { range: '81–90',  effect: 'Stunned for 1 minute.' },
  { range: '91–100', effect: 'Falls unconscious for 1 minute.' },
];

const LONG_MADNESS: Array<{ range: string; effect: string }> = [
  { range: '01–10',  effect: 'Compelled to repeat a specific activity over and over — washing hands, counting coins, praying, sorting objects.' },
  { range: '11–20',  effect: 'Vivid hallucinations; disadvantage on ability checks.' },
  { range: '21–30',  effect: 'Extreme paranoia; disadvantage on WIS and CHA checks.' },
  { range: '31–40',  effect: 'Strong revulsion toward something (usually the source of the madness).' },
  { range: '41–45',  effect: 'Powerful delusion — chooses a potion type and believes they are constantly under its effects.' },
  { range: '46–55',  effect: 'Attaches to a "lucky charm" (object or person); disadvantage on rolls while more than 30 ft from it.' },
  { range: '56–65',  effect: 'Blind (25%) or deaf (75%).' },
  { range: '66–75',  effect: 'Involuntary tremors — disadvantage on attack rolls, ability checks, and saves using STR or DEX.' },
  { range: '76–85',  effect: 'Partial amnesia; knows their own identity but cannot recall others or what happened in the last day.' },
  { range: '86–90',  effect: 'On taking damage, must make a DC 15 WIS save or be affected as by the confusion spell for 1 minute.' },
  { range: '91–95',  effect: 'Loses the ability to speak.' },
  { range: '96–100', effect: 'Falls unconscious; cannot be roused by jostling or damage.' },
];

const INDEFINITE_MADNESS: Array<{ range: string; effect: string }> = [
  { range: '01–15',  effect: '"I must eat strange food."' },
  { range: '16–25',  effect: '"I believe odd theories and see hidden significance in mundane events."' },
  { range: '26–30',  effect: '"I am driven by a compulsion I cannot resist."' },
  { range: '31–35',  effect: '"I suffer from an extreme phobia."' },
  { range: '36–45',  effect: '"I am filled with unreasoning hatred toward a specific kind of creature."' },
  { range: '46–55',  effect: '"I have a powerful urge to lie, even when there is no reason to."' },
  { range: '56–65',  effect: '"I attempt bizarre things for no reason."' },
  { range: '66–75',  effect: '"I cannot bear to be parted from any of my possessions."' },
  { range: '76–85',  effect: '"I see things that are not there."' },
  { range: '86–90',  effect: '"I cannot tell the difference between dreams and waking life."' },
  { range: '91–95',  effect: '"I refuse to acknowledge a particular person as the person they claim to be."' },
  { range: '96–100', effect: '"I cannot shake the feeling that everything around me is a hallucination."' },
];

function Section({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded border border-rule bg-parchment-soft">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
      >
        {open ? (
          <ChevronDown size={14} className="text-ink-mute" />
        ) : (
          <ChevronRight size={14} className="text-ink-mute" />
        )}
        <span className="font-display tracking-wide text-ink">{title}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 border-t border-rule/60 pt-3 space-y-2 text-xs text-ink-soft font-serif">
          {children}
        </div>
      )}
    </div>
  );
}

function ConditionList({ q }: { q: string }) {
  const needle = q.trim().toLowerCase();
  const matches = needle
    ? CONDITIONS.filter(
        (c) =>
          c.name.toLowerCase().includes(needle) ||
          c.desc.some((d) => d.toLowerCase().includes(needle))
      )
    : CONDITIONS;
  if (matches.length === 0) {
    return <p className="text-ink-mute italic">No matching conditions.</p>;
  }
  return (
    <div className="space-y-3">
      {matches.map((c) => (
        <div key={c.index}>
          <div className="font-display tracking-wide text-ink">{c.name}</div>
          <ul className="space-y-0.5 list-disc list-inside marker:text-brass-deep/60 text-ink-soft">
            {c.desc.map((line, i) => (
              <li key={i}>{line.replace(/^-\s*/, '')}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function KVList({ rows }: { rows: Array<{ name: string; desc: string }> }) {
  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.name}>
          <span className="font-display tracking-wide text-ink">{r.name}.</span>{' '}
          <span className="text-ink-soft">{r.desc}</span>
        </div>
      ))}
    </div>
  );
}

function RangeTable({ rows }: { rows: Array<{ range: string; effect: string }> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="text-brass-deep font-display uppercase tracking-wider text-[10px]">
          <tr>
            <th className="text-left font-normal pb-1 pr-3 whitespace-nowrap">d100</th>
            <th className="text-left font-normal pb-1">Effect</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.range} className="border-t border-rule/60 align-top">
              <td className="py-1 pr-3 font-display text-ink whitespace-nowrap">{r.range}</td>
              <td className="py-1 text-ink-soft">{r.effect}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DMRefTab() {
  const [q, setQ] = useState('');

  return (
    <div className="space-y-3">
      <div className="rounded border border-rule bg-parchment-soft p-3">
        <div className="flex items-center gap-2">
          <Search size={14} className="text-ink-mute flex-shrink-0" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search conditions…"
            className="flex-1 bg-parchment border border-rule rounded-sm px-2 py-1.5 text-sm text-ink placeholder-ink-faint font-serif focus:border-brass-deep focus:outline-none"
          />
        </div>
        <p className="text-[10px] text-ink-mute italic font-serif mt-1.5">
          Search filters the Conditions section.
        </p>
      </div>

      <Section title="Conditions" defaultOpen>
        <ConditionList q={q} />
      </Section>

      <Section title="Actions in Combat">
        <KVList rows={ACTIONS} />
      </Section>

      <Section title="Other Things on Your Turn">
        <KVList rows={EXTRA_TURN} />
      </Section>

      <Section title="Cover">
        <KVList rows={COVER} />
      </Section>

      <Section title="Vision &amp; Light">
        <KVList rows={VISION} />
      </Section>

      <Section title="DC Tiers">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="text-brass-deep font-display uppercase tracking-wider text-[10px]">
              <tr>
                <th className="text-left font-normal pb-1 pr-3">DC</th>
                <th className="text-left font-normal pb-1 pr-3">Tier</th>
                <th className="text-left font-normal pb-1">Notes</th>
              </tr>
            </thead>
            <tbody>
              {DC_TIERS.map((r) => (
                <tr key={r.dc} className="border-t border-rule/60">
                  <td className="py-1 pr-3 font-display text-ink">{r.dc}</td>
                  <td className="py-1 pr-3 text-ink">{r.tier}</td>
                  <td className="py-1 text-ink-soft italic">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Skills by Ability">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
          {SKILLS.map((s) => (
            <div key={s.ability} className="flex gap-2">
              <span className="font-display tracking-wider text-brass-deep w-9">{s.ability}</span>
              <span className="text-ink-soft">
                {s.names.length ? (
                  s.names.join(', ')
                ) : (
                  <span className="text-ink-mute italic">(no skills — saves only)</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Exhaustion">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="text-brass-deep font-display uppercase tracking-wider text-[10px]">
              <tr>
                <th className="text-left font-normal pb-1 pr-3">Level</th>
                <th className="text-left font-normal pb-1">Effect</th>
              </tr>
            </thead>
            <tbody>
              {EXHAUSTION.map((r) => (
                <tr key={r.lvl} className="border-t border-rule/60">
                  <td className="py-1 pr-3 font-display text-ink">{r.lvl}</td>
                  <td className="py-1 text-ink-soft">{r.effect}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-ink-mute italic">
          Each level is cumulative. A long rest removes 1 level (food and water required).
        </p>
      </Section>

      <Section title="Rests">
        <KVList rows={RESTS} />
      </Section>

      <Section title="Madness — Short-Term">
        <p className="text-ink-mute italic">
          Triggered by a brief shock (frightful sight, magical effect). Lasts 1 minute.
        </p>
        <RangeTable rows={SHORT_MADNESS} />
      </Section>

      <Section title="Madness — Long-Term">
        <p className="text-ink-mute italic">
          Caused by prolonged exposure to a maddening influence or a deeply traumatic event. Lasts 1d10 × 10 hours.
        </p>
        <RangeTable rows={LONG_MADNESS} />
      </Section>

      <Section title="Madness — Indefinite">
        <p className="text-ink-mute italic">
          A new flaw the character takes on after a profound mental insult. Lasts until removed by <span className="not-italic">greater restoration</span>, <span className="not-italic">heal</span>, or similar magic.
        </p>
        <RangeTable rows={INDEFINITE_MADNESS} />
      </Section>

      <p className="text-[10px] text-ink-mute italic font-serif text-center">
        Reference text adapted from the D&amp;D 5e SRD 5.1 © Wizards of the Coast, CC-BY-4.0.
      </p>
    </div>
  );
}
