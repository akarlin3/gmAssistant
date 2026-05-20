// Trap Builder data tables — original content authored for this project.
// Framework inspired by classic TTRPG trap design conventions.

export type Tier = {
  id: string;
  label: string;
  setbackDC: number;
  dangerousDC: number;
  deadlyDC: number;
  setbackDmg: string;
  dangerousDmg: string;
  deadlyDmg: string;
};

export type Severity = { id: string; label: string; note: string };
export type SaveType = { id: string; label: string; note: string };
export type Effect = { text: string; dmg: string };

export const TIERS: Tier[] = [
  { id: 'novice', label: 'Novice (Lv 1-4)',
    setbackDC: 10, dangerousDC: 12, deadlyDC: 14,
    setbackDmg: '1d10', dangerousDmg: '2d10', deadlyDmg: '4d10' },
  { id: 'adept', label: 'Adept (Lv 5-10)',
    setbackDC: 12, dangerousDC: 14, deadlyDC: 16,
    setbackDmg: '2d10', dangerousDmg: '4d10', deadlyDmg: '10d10' },
  { id: 'expert', label: 'Expert (Lv 11-16)',
    setbackDC: 14, dangerousDC: 16, deadlyDC: 18,
    setbackDmg: '4d10', dangerousDmg: '10d10', deadlyDmg: '18d10' },
  { id: 'master', label: 'Master (Lv 17-20)',
    setbackDC: 16, dangerousDC: 18, deadlyDC: 20,
    setbackDmg: '10d10', dangerousDmg: '18d10', deadlyDmg: '24d10' },
];

export const SEVERITIES: Severity[] = [
  { id: 'setback',   label: 'Setback',   note: 'Slows or inconveniences. Few PCs die from a setback trap alone.' },
  { id: 'dangerous', label: 'Dangerous', note: 'Real injury. Could kill a low-HP character outright.' },
  { id: 'deadly',    label: 'Deadly',    note: 'Designed to kill. PCs should be terrified.' },
];

export const TRIGGERS: string[] = [
  'Pressure plate concealed in the floor.',
  'Tripwire stretched across the path.',
  'Opening a door, drawer, or container.',
  'Picking up a specific object.',
  'Speaking a particular word aloud.',
  'Standing in a marked area without the right token.',
  'Removing an object from a pedestal.',
  'Failing to remove an object from a pedestal.',
  'Crossing an invisible magical threshold.',
  'Touching a specific surface with bare skin.',
  'A specific weight on the floor (e.g. anything over 50 lbs).',
  'Failing to disarm an obvious-looking lure trap nearby.',
  'Looking directly at a particular object or symbol.',
  'A precise sequence of failed checks anywhere in the room.',
  'Disturbing dust, water, or other settled material.',
  'A specific time of day or moon phase.',
  'The death of a specific creature in the dungeon.',
  'The destruction of a paired sympathetic object elsewhere.',
  'Closing a door after passing through it.',
  'Drawing a weapon in this room.',
  'Casting any spell in this room.',
  'Moving faster than a walking pace.',
  'Speaking above a whisper.',
  'Two creatures occupying the same square or area.',
];

export const EFFECTS: Effect[] = [
  { text: 'Swinging blade or pendulum strikes from the wall or ceiling.', dmg: 'slashing' },
  { text: 'Volley of darts or arrows from concealed apertures.',          dmg: 'piercing' },
  { text: "Spike pit opens beneath the victim's feet.",                   dmg: 'piercing' },
  { text: 'Falling block of stone or metal drops from above.',            dmg: 'bludgeoning' },
  { text: 'Crushing walls close on the victim from both sides.',          dmg: 'bludgeoning' },
  { text: 'Floor section drops away into a pit.',                         dmg: 'bludgeoning' },
  { text: 'Net descends and ensnares the victim.',                        dmg: 'restraint' },
  { text: 'Poisoned needle pricks the hand of whoever triggers it.',      dmg: 'poison' },
  { text: 'Cloud of poison gas fills the area.',                          dmg: 'poison' },
  { text: 'Acid sprays from concealed nozzles.',                          dmg: 'acid' },
  { text: 'Burst of flame erupts from the floor.',                        dmg: 'fire' },
  { text: 'Jet of scalding steam vents from the wall.',                   dmg: 'fire' },
  { text: 'Shard of ice or freezing mist hits the victim.',               dmg: 'cold' },
  { text: 'Lightning arcs between two metal contacts.',                   dmg: 'lightning' },
  { text: 'Concussive force blast pushes the victim back violently.',     dmg: 'thunder' },
  { text: 'Necrotic energy drains life from the victim.',                 dmg: 'necrotic' },
  { text: 'Radiant blast from a holy or unholy symbol.',                  dmg: 'radiant' },
  { text: "Psychic shriek floods the victim's mind.",                     dmg: 'psychic' },
  { text: 'Force projectile slams into the victim from nowhere.',         dmg: 'force' },
  { text: 'Magical glyph triggers, dealing elemental damage of choice.',  dmg: 'choice' },
  { text: 'Magical alarm shrieks, alerting nearby inhabitants.',          dmg: 'alarm' },
  { text: 'Teleport circle sends the victim to a known location.',        dmg: 'teleport' },
  { text: 'Illusion makes solid stone seem like an open passage.',        dmg: 'illusion' },
  { text: "Hold person effect immobilizes the victim.",                   dmg: 'condition' },
  { text: 'Sleep effect drops anyone in the area.',                       dmg: 'condition' },
  { text: 'Polymorph effect turns the victim into a harmless animal.',    dmg: 'condition' },
  { text: 'Animated weapon attacks until destroyed.',                     dmg: 'varies' },
  { text: 'Summons a guardian creature appropriate to the dungeon.',      dmg: 'creature' },
  { text: 'Floor becomes greased; everyone makes a save or falls prone.', dmg: 'condition' },
  { text: 'A localized darkness or silence effect activates.',            dmg: 'condition' },
];

export const SAVES: SaveType[] = [
  { id: 'dex',         label: 'Dexterity',     note: 'Dodge, leap aside, snatch hand back.' },
  { id: 'con',         label: 'Constitution',  note: 'Resist poison, gas, or biological effect.' },
  { id: 'str',         label: 'Strength',      note: 'Hold a door, brace against force, climb out.' },
  { id: 'int',         label: 'Intelligence',  note: 'Recognize the pattern, disbelieve illusion.' },
  { id: 'wis',         label: 'Wisdom',        note: 'Sense the wrongness, resist mental influence.' },
  { id: 'cha',         label: 'Charisma',      note: 'Resist magical compulsion or possession.' },
  { id: 'attack',      label: 'Attack Roll',   note: 'Trap rolls to hit; no save.' },
  { id: 'half',        label: 'Half on Save',  note: 'Save halves damage, failure full.' },
  { id: 'none_full',   label: 'Negates on Save', note: 'Save negates entirely.' },
  { id: 'no_save',     label: 'No Save',       note: 'Effect happens regardless; play it narratively.' },
];

export const DETECTIONS: string[] = [
  'Wisdom (Perception) — notice the disturbed dust, scratches, or pressure-plate seam.',
  'Wisdom (Perception) — spot the tripwire, glint of metal, or unusual draft.',
  'Investigation — examine the floor or walls deliberately for a triggering mechanism.',
  'Investigation — recognize this kind of trap from training or prior encounter.',
  'Arcana — detect lingering magical residue or recognize a glyph.',
  'Religion — recognize the holy or unholy aspect of a divine trap.',
  "Thieves' tools — disassemble suspect surfaces to find the mechanism.",
  'Passive Perception — notice automatically if higher than the DC.',
  'Detect magic spell — reveals the magical aura of an enchanted trap.',
  'Tapping or probing the floor and walls with a 10-foot pole.',
  'Watching the room itself trigger when something else moves through (animals, dust, etc.).',
  'Cannot be detected before triggering — only by clear signs of past victims.',
];

export const DISARMS: string[] = [
  "Thieves' tools — disable the trigger mechanism.",
  "Thieves' tools — wedge the pressure plate or cut the wire.",
  'Arcana — counter the enchantment.',
  'Dispel magic — cast on the trap to suppress or end the effect.',
  'Religion — perform a counter-ritual against a divine trap.',
  'Strength — physically wreck the mechanism (may trigger it once).',
  "Brick up, wedge, or block the trap's effect-source.",
  'Cover or weigh down the pressure plate before crossing.',
  'Step over the tripwire (no roll needed if seen).',
  'Speak the counter-phrase inscribed nearby.',
  'Cannot be disarmed — must be bypassed or endured.',
  'Disarmable only by carrying a specific item (key, sigil, token).',
];

export const LOCATIONS: string[] = [
  'Across a corridor approach to a guarded room.',
  'Around a treasure pedestal or chest.',
  'In front of a door of obvious importance.',
  'At the threshold of a stairway down.',
  'In a narrow corridor with no room to maneuver.',
  'In a wide chamber, harder to predict where it triggers.',
  'On a ceremonial dais or platform.',
  'In a chokepoint where the party must pass single-file.',
  'In a place that looks deliberately easy — a lure.',
  'In a place that looks safe — disguised completely.',
];

// ---- Trap entity ----

export type Trap = {
  id: string;
  name: string;
  description: string;
  trigger: string;
  effect: string;
  damageType: string;
  tier: string;       // tier id
  severity: string;   // severity id
  saveType: string;   // save id
  saveDC: number;
  damageDice: string; // e.g. '4d10'
  detection: string;
  detectionDC: number;
  disarm: string;
  disarmDC: number;
  location: string;
  notes: string;
  createdAt: number;
};

// ---- Helpers ----

export function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

// Generate a complete random trap at a given tier
export function rollTrap(tierId?: string): Trap {
  const tier = tierId
    ? (TIERS.find(t => t.id === tierId) ?? TIERS[0])
    : pick(TIERS);
  const severity = pick(SEVERITIES);
  const effect = pick(EFFECTS);
  const save = pick(SAVES);
  const location = pick(LOCATIONS);

  const dcKey = `${severity.id}DC` as 'setbackDC' | 'dangerousDC' | 'deadlyDC';
  const dmgKey = `${severity.id}Dmg` as 'setbackDmg' | 'dangerousDmg' | 'deadlyDmg';

  return {
    id: uid(),
    name: deriveName(effect.text),
    description: '',
    trigger: pick(TRIGGERS),
    effect: effect.text,
    damageType: effect.dmg,
    tier: tier.id,
    severity: severity.id,
    saveType: save.id,
    saveDC: tier[dcKey],
    damageDice: tier[dmgKey],
    detection: pick(DETECTIONS),
    detectionDC: tier[dcKey],
    disarm: pick(DISARMS),
    disarmDC: tier[dcKey],
    location,
    notes: '',
    createdAt: Date.now(),
  };
}

// Derive a short name from the effect text — first 4 meaningful words.
function deriveName(effectText: string): string {
  const cleaned = effectText.replace(/^(a |an |the )/i, '');
  const words = cleaned.split(/\s+/).slice(0, 4).join(' ');
  return words.replace(/[.,;:].*$/, '').replace(/^\w/, c => c.toUpperCase());
}

export function emptyTrap(): Trap {
  return {
    id: uid(),
    name: '',
    description: '',
    trigger: '',
    effect: '',
    damageType: '',
    tier: 'novice',
    severity: 'setback',
    saveType: 'dex',
    saveDC: 10,
    damageDice: '1d10',
    detection: '',
    detectionDC: 10,
    disarm: '',
    disarmDC: 10,
    location: '',
    notes: '',
    createdAt: Date.now(),
  };
}
