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

const TRAVEL_PACE: Array<{ pace: string; perMin: string; perHour: string; perDay: string; effect: string }> = [
  { pace: 'Fast',   perMin: '400 ft', perHour: '4 mi', perDay: '30 mi', effect: '−5 to passive WIS (Perception)' },
  { pace: 'Normal', perMin: '300 ft', perHour: '3 mi', perDay: '24 mi', effect: '—' },
  { pace: 'Slow',   perMin: '200 ft', perHour: '2 mi', perDay: '18 mi', effect: 'Able to use stealth' },
];

const TRAVEL_ACTIVITIES: Array<{ name: string; desc: string }> = [
  { name: 'Navigate', desc: 'Try to keep the group from getting lost — WIS (Survival). Only one navigator at a time.' },
  { name: 'Draw a Map', desc: 'Record the route and significant landmarks as the party travels.' },
  { name: 'Track', desc: 'Follow the trail of a creature — WIS (Survival). DC varies with the surface and age of the tracks.' },
  { name: 'Forage', desc: 'Search for food, water, or fuel while traveling — WIS (Survival), see Foraging below.' },
  { name: 'Stealth', desc: 'Each traveler attempts a DEX (Stealth) check — only at Slow pace, and only when there is cover or concealment.' },
  { name: 'Lookout', desc: 'Watch for danger; the default activity when nothing else is chosen. Bonus to noticing trouble and avoiding surprise.' },
];

const GETTING_LOST: Array<{ terrain: string; dc: string }> = [
  { terrain: 'Forest, swamp, or jungle', dc: '15' },
  { terrain: 'Mountains', dc: '12' },
  { terrain: 'Arctic, coast, desert, grassland, hills, or farmland', dc: '10' },
];

const FORAGING: Array<{ region: string; dc: string }> = [
  { region: 'Abundant food and water', dc: '10' },
  { region: 'Limited food and water',  dc: '15' },
  { region: 'Very little food or water', dc: '20' },
];

const FALLING_BREATH: Array<{ name: string; desc: string }> = [
  { name: 'Falling', desc: '1d6 bludgeoning damage per 10 ft fallen, to a maximum of 20d6. Land prone unless the fall was less than 10 ft or damage was reduced to 0.' },
  { name: 'Holding Breath', desc: 'A creature can hold its breath for 1 + CON modifier minutes (minimum 30 seconds).' },
  { name: 'Suffocating', desc: 'After breath runs out, survives for rounds equal to CON modifier (minimum 1). At the start of the next turn, drops to 0 HP and is dying — and cannot regain HP until it can breathe again.' },
];

const VISION_OUTDOORS: Array<{ name: string; desc: string }> = [
  { name: 'Open Terrain', desc: 'See up to about 2 miles in clear weather — far less in dim light, twilight, or moonlight.' },
  { name: 'Forest or Jungle', desc: 'Visibility usually limited to 60–120 ft by foliage and terrain.' },
  { name: 'Mountain Peak', desc: 'See up to about 40 miles in clear conditions.' },
  { name: 'Light Precipitation', desc: 'Light rain or snow. Disadvantage on WIS (Perception) checks that rely on sight; open flames may sputter.' },
  { name: 'Heavy Precipitation', desc: 'Heavy rain or snowfall lightly obscures the area; sight beyond 100 ft is heavily obscured. Open flames extinguish; WIS (Perception) checks relying on hearing are at disadvantage.' },
  { name: 'Fog', desc: 'Heavily obscures everything within it. Treat targets as if blinded for attacks made into or through fog.' },
];

const WEATHER_HAZARDS: Array<{ name: string; desc: string }> = [
  { name: 'Extreme Heat (above 100°F)', desc: 'CON save at the end of each hour (DC 5, +1 per previous save this day) or gain 1 level of exhaustion. Disadvantage on the save when wearing medium or heavy armor, or heavy clothing. Resistance or immunity to fire damage ignores this.' },
  { name: 'Extreme Cold (below 0°F)', desc: 'CON save at the end of each hour (DC 10) or gain 1 level of exhaustion. Resistance or immunity to cold damage ignores this.' },
  { name: 'Strong Wind', desc: 'Disadvantage on ranged attacks and on WIS (Perception) checks that rely on hearing. Extinguishes open flames, disperses fog, and forces flying creatures to land at the end of their turn or fall.' },
  { name: 'Heavy Precipitation', desc: 'Each foot of fallen snow counts as 2 ft of movement. See Vision Outdoors for sight effects.' },
  { name: 'High Altitude (above 10,000 ft)', desc: 'Each hour of travel counts as 2 hours for exhaustion purposes. Creatures acclimate after 30 days at altitude. Above 20,000 ft, no creature can acclimate.' },
];

const MOUNTS: Array<{ name: string; speed: string; notes: string }> = [
  { name: 'Riding Horse', speed: '60 ft', notes: 'Standard mount; can carry an adult human.' },
  { name: 'Warhorse',     speed: '60 ft', notes: 'Trained for combat.' },
  { name: 'Pony',         speed: '40 ft', notes: 'Mount for Small races.' },
  { name: 'Mule',         speed: '40 ft', notes: 'Surefooted; doubled carrying capacity.' },
  { name: 'Camel',        speed: '50 ft', notes: 'Desert travel; resists thirst.' },
  { name: 'Elephant',     speed: '40 ft', notes: 'Huge; can carry a howdah.' },
  { name: 'Mastiff',      speed: '40 ft', notes: 'Mount for halflings and other Small folk.' },
];

const VEHICLES: Array<{ name: string; perHour: string; perDay: string }> = [
  { name: 'Carriage or Wagon', perHour: '—',      perDay: '~9 mi' },
  { name: 'Rowboat',           perHour: '1.5 mi', perDay: '36 mi' },
  { name: 'Keelboat',          perHour: '1 mi',   perDay: '24 mi' },
  { name: 'Sailing Ship',      perHour: '2 mi',   perDay: '48 mi' },
  { name: 'Longship',          perHour: '3 mi',   perDay: '72 mi' },
  { name: 'Warship',           perHour: '2.5 mi', perDay: '60 mi' },
  { name: 'Galley',            perHour: '4 mi',   perDay: '96 mi' },
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
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
      >
        {open ? (
          <ChevronDown size={14} className="text-ink-mute" />
        ) : (
          <ChevronRight size={14} className="text-ink-mute" />
        )}
        <span className="font-display tracking-wide text-ink">{title}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-rule/60 p-3 font-serif text-xs text-ink-soft">
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
    return <p className="italic text-ink-mute">No matching conditions.</p>;
  }
  return (
    <div className="space-y-3">
      {matches.map((c) => (
        <div key={c.index}>
          <div className="font-display tracking-wide text-ink">{c.name}</div>
          <ul className="list-inside list-disc space-y-0.5 text-ink-soft marker:text-brass-deep/60">
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
        <thead className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
          <tr>
            <th className="whitespace-nowrap pb-1 pr-3 text-left font-normal">d100</th>
            <th className="pb-1 text-left font-normal">Effect</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.range} className="border-t border-rule/60 align-top">
              <td className="whitespace-nowrap py-1 pr-3 font-display text-ink">{r.range}</td>
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
          <Search size={14} className="flex-shrink-0 text-ink-mute" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search conditions…"
            className="flex-1 rounded-sm border border-rule bg-parchment px-2 py-1.5 font-serif text-sm text-ink placeholder-ink-faint focus:border-brass-deep focus:outline-none"
          />
        </div>
        <p className="mt-1.5 font-serif text-[10px] italic text-ink-mute">
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
            <thead className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
              <tr>
                <th className="pb-1 pr-3 text-left font-normal">DC</th>
                <th className="pb-1 pr-3 text-left font-normal">Tier</th>
                <th className="pb-1 text-left font-normal">Notes</th>
              </tr>
            </thead>
            <tbody>
              {DC_TIERS.map((r) => (
                <tr key={r.dc} className="border-t border-rule/60">
                  <td className="py-1 pr-3 font-display text-ink">{r.dc}</td>
                  <td className="py-1 pr-3 text-ink">{r.tier}</td>
                  <td className="py-1 italic text-ink-soft">{r.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Skills by Ability">
        <div className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
          {SKILLS.map((s) => (
            <div key={s.ability} className="flex gap-2">
              <span className="w-9 font-display tracking-wider text-brass-deep">{s.ability}</span>
              <span className="text-ink-soft">
                {s.names.length ? (
                  s.names.join(', ')
                ) : (
                  <span className="italic text-ink-mute">(no skills — saves only)</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Exhaustion">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
              <tr>
                <th className="pb-1 pr-3 text-left font-normal">Level</th>
                <th className="pb-1 text-left font-normal">Effect</th>
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
        <p className="italic text-ink-mute">
          Each level is cumulative. A long rest removes 1 level (food and water required).
        </p>
      </Section>

      <Section title="Rests">
        <KVList rows={RESTS} />
      </Section>

      <Section title="Travel Pace">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
              <tr>
                <th className="pb-1 pr-3 text-left font-normal">Pace</th>
                <th className="pb-1 pr-3 text-left font-normal">Per Min</th>
                <th className="pb-1 pr-3 text-left font-normal">Per Hour</th>
                <th className="pb-1 pr-3 text-left font-normal">Per Day</th>
                <th className="pb-1 text-left font-normal">Effect</th>
              </tr>
            </thead>
            <tbody>
              {TRAVEL_PACE.map((r) => (
                <tr key={r.pace} className="border-t border-rule/60">
                  <td className="py-1 pr-3 font-display text-ink">{r.pace}</td>
                  <td className="whitespace-nowrap py-1 pr-3 text-ink-soft">{r.perMin}</td>
                  <td className="whitespace-nowrap py-1 pr-3 text-ink-soft">{r.perHour}</td>
                  <td className="whitespace-nowrap py-1 pr-3 text-ink-soft">{r.perDay}</td>
                  <td className="py-1 italic text-ink-soft">{r.effect}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="italic text-ink-mute">
          Difficult terrain halves these distances. A vehicle or mount may impose a different pace.
        </p>
      </Section>

      <Section title="Travel Activities">
        <KVList rows={TRAVEL_ACTIVITIES} />
        <p className="italic text-ink-mute">
          A traveler can do one activity at a time (lookout is the default). Talking and remaining alert do not count as activities.
        </p>
      </Section>

      <Section title="Forced March">
        <p>
          Travel beyond 8 hours in a day is a forced march. At the end of each additional hour, each traveler makes a CON save (DC 10 + 1 per extra hour) or gains 1 level of exhaustion. Mounts and vehicles cannot avoid the save unless rules state otherwise.
        </p>
      </Section>

      <Section title="Getting Lost">
        <p className="italic text-ink-mute">
          When the party lacks a reliable route, the navigator makes a WIS (Survival) check against the terrain DC. On a failure, the party travels in the wrong direction (DM picks).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
              <tr>
                <th className="pb-1 pr-3 text-left font-normal">Terrain</th>
                <th className="pb-1 text-left font-normal">DC</th>
              </tr>
            </thead>
            <tbody>
              {GETTING_LOST.map((r) => (
                <tr key={r.terrain} className="border-t border-rule/60 align-top">
                  <td className="py-1 pr-3 text-ink-soft">{r.terrain}</td>
                  <td className="whitespace-nowrap py-1 font-display text-ink">{r.dc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Foraging">
        <p className="italic text-ink-mute">
          One forager at a time may make a WIS (Survival) check while traveling. On a success, they find 1d6 + WIS modifier pounds of food and gallons of water that day.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
              <tr>
                <th className="pb-1 pr-3 text-left font-normal">Region</th>
                <th className="pb-1 text-left font-normal">DC</th>
              </tr>
            </thead>
            <tbody>
              {FORAGING.map((r) => (
                <tr key={r.region} className="border-t border-rule/60 align-top">
                  <td className="py-1 pr-3 text-ink-soft">{r.region}</td>
                  <td className="whitespace-nowrap py-1 font-display text-ink">{r.dc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="italic text-ink-mute">
          A character needs 1 lb of food and 1 gallon of water per day (½ gal in cool climates, 2 gal in hot).
        </p>
      </Section>

      <Section title="Falling, Holding Breath, &amp; Suffocation">
        <KVList rows={FALLING_BREATH} />
      </Section>

      <Section title="Vision Outdoors">
        <KVList rows={VISION_OUTDOORS} />
      </Section>

      <Section title="Weather Hazards">
        <KVList rows={WEATHER_HAZARDS} />
      </Section>

      <Section title="Mounts &amp; Vehicles">
        <div className="font-display tracking-wide text-ink">Mounts</div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
              <tr>
                <th className="pb-1 pr-3 text-left font-normal">Mount</th>
                <th className="pb-1 pr-3 text-left font-normal">Speed</th>
                <th className="pb-1 text-left font-normal">Notes</th>
              </tr>
            </thead>
            <tbody>
              {MOUNTS.map((r) => (
                <tr key={r.name} className="border-t border-rule/60 align-top">
                  <td className="whitespace-nowrap py-1 pr-3 font-display text-ink">{r.name}</td>
                  <td className="whitespace-nowrap py-1 pr-3 text-ink-soft">{r.speed}</td>
                  <td className="py-1 text-ink-soft">{r.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="italic text-ink-mute">
          A mount may move at twice its speed (gallop) for up to 1 hour, then must rest.
        </p>
        <div className="pt-1 font-display tracking-wide text-ink">Vehicles</div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="font-display text-[10px] uppercase tracking-wider text-brass-deep">
              <tr>
                <th className="pb-1 pr-3 text-left font-normal">Vehicle</th>
                <th className="pb-1 pr-3 text-left font-normal">Per Hour</th>
                <th className="pb-1 text-left font-normal">Per Day</th>
              </tr>
            </thead>
            <tbody>
              {VEHICLES.map((r) => (
                <tr key={r.name} className="border-t border-rule/60 align-top">
                  <td className="whitespace-nowrap py-1 pr-3 font-display text-ink">{r.name}</td>
                  <td className="whitespace-nowrap py-1 pr-3 text-ink-soft">{r.perHour}</td>
                  <td className="whitespace-nowrap py-1 text-ink-soft">{r.perDay}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="italic text-ink-mute">
          Ship daily distances assume favorable wind and crew. Galleys and longships may be rowed at reduced pace when becalmed.
        </p>
      </Section>

      <Section title="Madness — Short-Term">
        <p className="italic text-ink-mute">
          Triggered by a brief shock (frightful sight, magical effect). Lasts 1 minute.
        </p>
        <RangeTable rows={SHORT_MADNESS} />
      </Section>

      <Section title="Madness — Long-Term">
        <p className="italic text-ink-mute">
          Caused by prolonged exposure to a maddening influence or a deeply traumatic event. Lasts 1d10 × 10 hours.
        </p>
        <RangeTable rows={LONG_MADNESS} />
      </Section>

      <Section title="Madness — Indefinite">
        <p className="italic text-ink-mute">
          A new flaw the character takes on after a profound mental insult. Lasts until removed by <span className="not-italic">greater restoration</span>, <span className="not-italic">heal</span>, or similar magic.
        </p>
        <RangeTable rows={INDEFINITE_MADNESS} />
      </Section>

      <p className="text-center font-serif text-[10px] italic text-ink-mute">
        Reference text adapted from the D&amp;D 5e SRD 5.1 © Wizards of the Coast, CC-BY-4.0.
      </p>
    </div>
  );
}
