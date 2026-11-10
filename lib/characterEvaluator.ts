import { abilityMod, formatMod, proficiencyBonusForLevel } from './pc/derived';
import { normalizePc } from './pc/factory';
import { SKILL_ABILITIES } from './pc/skills';
import {
  ABILITY_NAMES,
  SPELL_SLOT_LEVELS,
  type AbilityName,
  type CharacterAuditNote,
  type CharacterDerivedStats,
  type CharacterEvaluation,
  type DefensiveProfile,
  type DefensiveSaveEntry,
  type PactMagicSlots,
  type PartyRole,
  type PcClass,
  type PcResourcePool,
  type PlayerCharacter,
  type SkillName,
  type SpellSlot,
  type SpellSlotLevel,
} from './pc/types';

// Standard 5e Full/Multiclass Spell Slot Table (caster levels 1..20)
const STANDARD_SPELL_SLOTS_TABLE: Record<number, number[]> = {
  1: [2],
  2: [3],
  3: [4, 2],
  4: [4, 3],
  5: [4, 3, 2],
  6: [4, 3, 3],
  7: [4, 3, 3, 1],
  8: [4, 3, 3, 2],
  9: [4, 3, 3, 3, 1],
  10: [4, 3, 3, 3, 2],
  11: [4, 3, 3, 3, 2, 1],
  12: [4, 3, 3, 3, 2, 1],
  13: [4, 3, 3, 3, 2, 1, 1],
  14: [4, 3, 3, 3, 2, 1, 1],
  15: [4, 3, 3, 3, 2, 1, 1, 1],
  16: [4, 3, 3, 3, 2, 1, 1, 1],
  17: [4, 3, 3, 3, 2, 1, 1, 1, 1],
  18: [4, 3, 3, 3, 3, 1, 1, 1, 1],
  19: [4, 3, 3, 3, 3, 2, 1, 1, 1],
  20: [4, 3, 3, 3, 3, 2, 2, 1, 1],
};

// Warlock Pact Magic Table (warlock levels 1..20)
const WARLOCK_PACT_TABLE: Record<number, { slots: number; level: SpellSlotLevel }> = {
  1: { slots: 1, level: 1 },
  2: { slots: 2, level: 1 },
  3: { slots: 2, level: 2 },
  4: { slots: 2, level: 2 },
  5: { slots: 2, level: 3 },
  6: { slots: 2, level: 3 },
  7: { slots: 2, level: 4 },
  8: { slots: 2, level: 4 },
  9: { slots: 2, level: 5 },
  10: { slots: 2, level: 5 },
  11: { slots: 3, level: 5 },
  12: { slots: 3, level: 5 },
  13: { slots: 3, level: 5 },
  14: { slots: 3, level: 5 },
  15: { slots: 3, level: 5 },
  16: { slots: 3, level: 5 },
  17: { slots: 4, level: 5 },
  18: { slots: 4, level: 5 },
  19: { slots: 4, level: 5 },
  20: { slots: 4, level: 5 },
};

const CLASS_HIT_DIE: Record<string, number> = {
  barbarian: 12,
  fighter: 10,
  paladin: 10,
  ranger: 10,
  artificer: 8,
  bard: 8,
  cleric: 8,
  druid: 8,
  monk: 8,
  rogue: 8,
  warlock: 8,
  sorcerer: 6,
  wizard: 6,
};

const CLASS_SPELLCASTING_ABILITY: Record<string, AbilityName> = {
  artificer: 'INT',
  wizard: 'INT',
  cleric: 'WIS',
  druid: 'WIS',
  ranger: 'WIS',
  bard: 'CHA',
  paladin: 'CHA',
  sorcerer: 'CHA',
  warlock: 'CHA',
};

const CLASS_DEFAULT_SAVES: Record<string, [AbilityName, AbilityName]> = {
  barbarian: ['STR', 'CON'],
  bard: ['DEX', 'CHA'],
  cleric: ['WIS', 'CHA'],
  druid: ['INT', 'WIS'],
  fighter: ['STR', 'CON'],
  monk: ['STR', 'DEX'],
  paladin: ['WIS', 'CHA'],
  ranger: ['STR', 'DEX'],
  rogue: ['DEX', 'INT'],
  sorcerer: ['CON', 'CHA'],
  warlock: ['WIS', 'CHA'],
  wizard: ['INT', 'WIS'],
  artificer: ['CON', 'INT'],
};

const KNOWN_CONCENTRATION_SPELLS = [
  'barkskin',
  'banishment',
  'BIGBY',
  'bless',
  'blur',
  'call lightning',
  'cloud of daggers',
  'conjure animals',
  'conjure woodland beings',
  'Concentration',
  'dancing lights',
  'darkness',
  'detect magic',
  'enhance ability',
  'entangle',
  'faerie fire',
  'fear',
  'flaming sphere',
  'fly',
  'fog cloud',
  'globe of invulnerability',
  'greater invisibility',
  'guidance',
  'haste',
  'heat metal',
  'heroism',
  'hex',
  'hold monster',
  'hold person',
  'hunger of hadar',
  "hunter's mark",
  'hunters mark',
  'hypnotic pattern',
  'invisibility',
  'levitate',
  'moonbeam',
  'pass without trace',
  'polymorph',
  'protection from evil and good',
  'resistance',
  'shield of faith',
  'silence',
  'slow',
  'Spike Growth',
  'spirit guardians',
  'spiritual weapon',
  'suggestion',
  'sunbeam',
  'tasha\'s hideous laughter',
  'wall of fire',
  'wall of force',
  'wall of stone',
  'web',
  'witch bolt',
].map((s) => s.toLowerCase());

function normKey(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function findPrimaryClass(classes: PcClass[]): string {
  if (!classes.length) return '';
  const sorted = [...classes].sort((a, b) => (b.level || 0) - (a.level || 0));
  return sorted[0].name.trim().toLowerCase();
}

function getBarbarianRages(level: number): number {
  if (level >= 17) return 6;
  if (level >= 12) return 5;
  if (level >= 6) return 4;
  if (level >= 3) return 3;
  return 2;
}

function computeEffectiveCasterLevel(classes: PcClass[]): number {
  let full = 0;
  let half = 0;
  let third = 0;
  let artificer = 0;

  for (const c of classes) {
    const name = c.name.trim().toLowerCase();
    const sub = (c.subclass || '').trim().toLowerCase();
    const lvl = Math.max(0, c.level || 0);

    if (['bard', 'cleric', 'druid', 'sorcerer', 'wizard'].some((k) => name.includes(k))) {
      full += lvl;
    } else if (['paladin', 'ranger'].some((k) => name.includes(k))) {
      half += lvl;
    } else if (name.includes('artificer')) {
      artificer += lvl;
    } else if (
      (name.includes('fighter') && sub.includes('eldritch')) ||
      (name.includes('rogue') && sub.includes('arcane')) ||
      sub.includes('eldritch knight') ||
      sub.includes('arcane trickster')
    ) {
      third += lvl;
    }
  }

  const totalCasterClasses =
    (full > 0 ? 1 : 0) + (half > 0 ? 1 : 0) + (third > 0 ? 1 : 0) + (artificer > 0 ? 1 : 0);

  if (totalCasterClasses === 0) return 0;

  if (totalCasterClasses === 1) {
    if (full > 0) return full;
    if (artificer > 0) return Math.ceil(artificer / 2);
    if (half > 0) return Math.ceil(half / 2);
    if (third > 0) return third >= 3 ? Math.ceil(third / 3) : 0;
  }

  // Multiclass spellcaster formula
  return (
    full +
    Math.floor(half / 2) +
    Math.ceil(artificer / 2) +
    Math.floor(third / 3)
  );
}

export function synthesizeSpellSlotsForClasses(
  classes: PcClass[],
  existingSlots?: Partial<Record<SpellSlotLevel, SpellSlot>>,
): Partial<Record<SpellSlotLevel, SpellSlot>> | undefined {
  const casterLevel = Math.min(20, Math.max(0, computeEffectiveCasterLevel(classes)));
  if (casterLevel <= 0) {
    return existingSlots && Object.keys(existingSlots).length > 0 ? existingSlots : undefined;
  }

  const row = STANDARD_SPELL_SLOTS_TABLE[casterLevel] || [];
  const out: Partial<Record<SpellSlotLevel, SpellSlot>> = { ...(existingSlots || {}) };

  row.forEach((maxSlots, idx) => {
    const lvl = (idx + 1) as SpellSlotLevel;
    if (!SPELL_SLOT_LEVELS.includes(lvl) || maxSlots <= 0) return;
    const prev = out[lvl];
    if (!prev || prev.max <= 0) {
      out[lvl] = { max: maxSlots, used: prev?.used ?? 0 };
    }
  });

  return Object.keys(out).length > 0 ? out : undefined;
}

export function synthesizePactSlotsForClasses(
  classes: PcClass[],
  existingPact?: PactMagicSlots | null,
): PactMagicSlots | undefined {
  const warlock = classes.find((c) => c.name.trim().toLowerCase().includes('warlock'));
  if (!warlock || warlock.level <= 0) {
    return existingPact ?? undefined;
  }
  const lvl = Math.min(20, Math.max(1, warlock.level));
  const pact = WARLOCK_PACT_TABLE[lvl];
  if (!pact) return existingPact ?? undefined;

  if (existingPact && existingPact.max > 0) {
    return existingPact;
  }
  return {
    level: pact.level,
    max: pact.slots,
    used: existingPact?.used ?? 0,
  };
}

export function synthesizeClassResourcePools(pc: PlayerCharacter): PcResourcePool[] {
  const existing = Array.isArray(pc.resourcePools) ? [...pc.resourcePools] : [];
  const byKey = new Map<string, number>();

  existing.forEach((pool, idx) => {
    byKey.set(normKey(pool.id), idx);
    byKey.set(normKey(pool.name), idx);
    if (normKey(pool.name).includes('focus') || normKey(pool.name).includes('kipoint')) {
      byKey.set('focuspoints', idx);
      byKey.set('kipoints', idx);
    }
  });

  const ensurePool = (
    id: string,
    name: string,
    max: number,
    rechargeOn: PcResourcePool['rechargeOn'],
    initialCurrent?: number,
  ) => {
    if (max <= 0) return;
    const nId = normKey(id);
    const nName = normKey(name);
    const existingIdx = byKey.get(nId) ?? byKey.get(nName);
    if (existingIdx !== undefined) {
      const prev = existing[existingIdx];
      if (prev.max <= 0) {
        existing[existingIdx] = {
          ...prev,
          max,
          current: initialCurrent ?? max,
        };
      }
      return;
    }
    const pool: PcResourcePool = {
      id,
      name,
      current: initialCurrent !== undefined ? Math.max(0, Math.min(max, initialCurrent)) : max,
      max,
      rechargeOn,
    };
    const newIdx = existing.length;
    existing.push(pool);
    byKey.set(nId, newIdx);
    byKey.set(nName, newIdx);
  };

  const totalLevel = Math.max(
    1,
    pc.classes.reduce((s, c) => s + (c.level || 0), 0) || pc.level || 1,
  );
  const chaMod = abilityMod(pc.abilities.CHA);
  const wisMod = abilityMod(pc.abilities.WIS);

  // Always ensure Hit Dice resource pool is present and synced with pc.hitDice
  const hdMax = Math.max(totalLevel, pc.hitDice?.max || totalLevel);
  const hdUsed = Math.max(0, pc.hitDice?.used || 0);
  ensurePool('hit-dice', 'Hit Dice', hdMax, 'long', Math.max(0, hdMax - hdUsed));

  for (const cls of pc.classes) {
    const name = cls.name.trim().toLowerCase();
    const sub = (cls.subclass || '').trim().toLowerCase();
    const lvl = Math.max(1, cls.level || 1);

    if (name.includes('fighter')) {
      ensurePool('second-wind', 'Second Wind', lvl >= 10 ? 4 : lvl >= 4 ? 3 : 1, 'short');
      if (lvl >= 2) {
        ensurePool('action-surge', 'Action Surge', lvl >= 17 ? 2 : 1, 'short');
      }
      if (lvl >= 9) {
        ensurePool('indomitable', 'Indomitable', lvl >= 17 ? 3 : lvl >= 13 ? 2 : 1, 'long');
      }
      if (sub.includes('battle master') || sub.includes('battlemaster')) {
        ensurePool(
          'superiority-dice',
          'Superiority Dice',
          lvl >= 15 ? 6 : lvl >= 7 ? 5 : 4,
          'short',
        );
      }
    }

    if (name.includes('barbarian')) {
      ensurePool('rage', 'Rage', getBarbarianRages(lvl), 'long');
    }

    if (name.includes('monk') && lvl >= 2) {
      ensurePool('focus-points', 'Focus / Ki Points', lvl, 'short');
    }

    if (name.includes('bard')) {
      ensurePool(
        'bardic-inspiration',
        'Bardic Inspiration',
        Math.max(1, chaMod),
        lvl >= 5 ? 'short' : 'long',
      );
    }

    if (name.includes('cleric') && lvl >= 2) {
      ensurePool(
        'channel-divinity',
        'Channel Divinity',
        lvl >= 18 ? 3 : lvl >= 6 ? 2 : 1,
        'short',
      );
    }

    if (name.includes('paladin')) {
      ensurePool('lay-on-hands', 'Lay on Hands', lvl * 5, 'long');
      if (lvl >= 3) {
        ensurePool('channel-divinity', 'Channel Divinity', lvl >= 11 ? 2 : 1, 'short');
      }
    }

    if (name.includes('druid') && lvl >= 2) {
      ensurePool('wild-shape', 'Wild Shape', lvl >= 17 ? 4 : lvl >= 6 ? 3 : 2, 'short');
    }

    if (name.includes('sorcerer') && lvl >= 2) {
      ensurePool('sorcery-points', 'Sorcery Points', lvl, 'long');
    }

    if (name.includes('wizard')) {
      ensurePool('arcane-recovery', 'Arcane Recovery', 1, 'long');
    }

    if (name.includes('ranger') && lvl >= 2) {
      ensurePool('favored-enemy', 'Favored Enemy', Math.max(2, proficiencyBonusForLevel(totalLevel)), 'long');
    }

    if (name.includes('warlock') && lvl >= 2) {
      ensurePool('magical-cunning', 'Magical Cunning', 1, 'long');
    }

    if (name.includes('artificer') && lvl >= 7) {
      ensurePool('flash-of-genius', 'Flash of Genius', Math.max(1, abilityMod(pc.abilities.INT)), 'long');
    }
  }

  // Also scan pc.features for explicit resource uses or well-known feature names
  for (const feat of pc.features || []) {
    const fLower = `${feat.name} ${feat.description || ''}`.toLowerCase();
    if (feat.uses && feat.uses.max > 0) {
      const id = feat.id || `feat-${normKey(feat.name)}`;
      const current = Math.max(0, feat.uses.max - (feat.uses.used || 0));
      ensurePool(id, feat.name, feat.uses.max, feat.uses.refresh || 'long', current);
    } else if (fLower.includes('lucky')) {
      ensurePool('lucky-points', 'Luck Points', 3, 'long');
    } else if (fLower.includes('relentless endurance')) {
      ensurePool('relentless-endurance', 'Relentless Endurance', 1, 'long');
    } else if (fLower.includes('fey step') || fLower.includes('misty step')) {
      if (fLower.includes('proficiency bonus')) {
        ensurePool('fey-step', 'Fey Step', proficiencyBonusForLevel(totalLevel), 'long');
      }
    } else if (fLower.includes('war priest')) {
      ensurePool('war-priest', 'War Priest', Math.max(1, wisMod), 'long');
    }
  }

  return existing;
}

function inferSenses(pc: PlayerCharacter): string[] {
  const senses = new Set<string>(pc.senses || []);
  const blob = [
    pc.race,
    pc.notes,
    ...(pc.features || []).map((f) => `${f.name} ${f.description}`),
    ...(pc.classes || []).map((c) => `${c.name} ${c.subclass || ''}`),
  ]
    .join(' ')
    .toLowerCase();

  // Check explicit distance matches first
  const dvMatch = blob.match(/darkvision\s*(?:up to\s*)?(\d+)\s*f(?:ee)?t/i);
  const bsMatch = blob.match(/blindsight\s*(?:up to\s*)?(\d+)\s*f(?:ee)?t/i);
  const tsMatch = blob.match(/tremorsense\s*(?:up to\s*)?(\d+)\s*f(?:ee)?t/i);
  const truesightMatch = blob.match(/truesight\s*(?:up to\s*)?(\d+)\s*f(?:ee)?t/i);

  if (dvMatch) {
    senses.add(`Darkvision ${dvMatch[1]} ft.`);
  } else if (
    ['drow', 'duergar', 'deep gnome', 'svirfneblin', 'gloom stalker', "devil's sight", 'superior darkvision'].some(
      (k) => blob.includes(k),
    )
  ) {
    senses.add('Darkvision 120 ft.');
  } else if (
    [
      'elf',
      'elven',
      'dwarf',
      'dwarven',
      'gnome',
      'tiefling',
      'half-elf',
      'half-orc',
      'orc',
      'aasimar',
      'tabaxi',
      'goblin',
      'bugbear',
      'hobgoblin',
      'kobold',
      'yuan-ti',
      'shadar-kai',
      'eladrin',
      'owlin',
      'dhampir',
      'hexblood',
      'reborn',
      'darkvision',
    ].some((k) => blob.includes(k))
  ) {
    senses.add('Darkvision 60 ft.');
  }

  if (bsMatch) {
    senses.add(`Blindsight ${bsMatch[1]} ft.`);
  } else if (blob.includes('blindsight') || blob.includes('blind fighting')) {
    senses.add('Blindsight 10 ft.');
  }

  if (tsMatch) {
    senses.add(`Tremorsense ${tsMatch[1]} ft.`);
  } else if (blob.includes('tremorsense')) {
    senses.add('Tremorsense 60 ft.');
  }

  if (truesightMatch) {
    senses.add(`Truesight ${truesightMatch[1]} ft.`);
  }

  return Array.from(senses);
}

function inferResistancesAndImmunities(pc: PlayerCharacter): {
  resistances: string[];
  immunities: string[];
} {
  const resistances = new Set<string>(pc.resistances || []);
  const immunities = new Set<string>(pc.immunities || []);

  const blob = [
    pc.race,
    pc.notes,
    ...(pc.features || []).map((f) => `${f.name} ${f.description}`),
    ...(pc.inventory || []).map((i) => `${i.name} ${i.description || ''} ${i.notes || ''}`),
    ...(pc.classes || []).map((c) => `${c.name} ${c.subclass || ''}`),
  ]
    .join(' ')
    .toLowerCase();

  if (blob.includes('tiefling') || blob.includes('hellish resistance')) {
    resistances.add('Fire');
  }
  if (blob.includes('dwarf') || blob.includes('dwarven resilience') || blob.includes('stout')) {
    resistances.add('Poison');
  }
  if (blob.includes('aasimar') || blob.includes('celestial resistance')) {
    resistances.add('Necrotic');
    resistances.add('Radiant');
  }
  if (blob.includes('goliath') || blob.includes("stone's endurance")) {
    // noted as damage reduction
  }
  if (blob.includes('barbarian')) {
    if (blob.includes('bear') && blob.includes('totem')) {
      resistances.add('All except Psychic (while Raging)');
    } else {
      resistances.add('Bludgeoning, Piercing, Slashing (while Raging)');
    }
  }
  if (blob.includes('dragonborn')) {
    if (blob.includes('red') || blob.includes('gold') || blob.includes('brass')) resistances.add('Fire');
    else if (blob.includes('blue') || blob.includes('bronze')) resistances.add('Lightning');
    else if (blob.includes('white') || blob.includes('silver')) resistances.add('Cold');
    else if (blob.includes('black') || blob.includes('copper')) resistances.add('Acid');
    else if (blob.includes('green')) resistances.add('Poison');
  }

  // Explicit "resistance to X" patterns
  const resTypes = ['acid', 'cold', 'fire', 'force', 'lightning', 'necrotic', 'poison', 'psychic', 'radiant', 'thunder'];
  for (const t of resTypes) {
    const cap = t.charAt(0).toUpperCase() + t.slice(1);
    if (
      blob.includes(`resistance to ${t}`) ||
      blob.includes(`${t} resistance`) ||
      blob.includes(`armor of ${t} resistance`) ||
      blob.includes(`ring of ${t} resistance`)
    ) {
      resistances.add(cap);
    }
    if (blob.includes(`immunity to ${t}`) || blob.includes(`immune to ${t}`)) {
      immunities.add(cap);
    }
  }

  const monk = pc.classes.find((c) => c.name.toLowerCase().includes('monk'));
  if (monk && monk.level >= 10) {
    immunities.add('Poison');
    immunities.add('Disease');
  }
  const paladin = pc.classes.find((c) => c.name.toLowerCase().includes('paladin'));
  if (paladin && paladin.level >= 3) {
    immunities.add('Disease');
  }
  if (blob.includes('elf') || blob.includes('fey ancestry')) {
    immunities.add('Magical Sleep');
  }

  return {
    resistances: Array.from(resistances),
    immunities: Array.from(immunities),
  };
}

function inferPartyRoles(pc: PlayerCharacter): PartyRole[] {
  const roles = new Set<PartyRole>();
  const classesLower = pc.classes.map((c) => `${c.name} ${c.subclass || ''}`.toLowerCase());
  const spellsLower = (pc.spellsKnown || []).map((s) => s.toLowerCase());
  const skills = new Set<SkillName>(pc.proficiencies?.skills || []);

  const hasClass = (...keywords: string[]) =>
    classesLower.some((c) => keywords.some((k) => c.includes(k)));

  // Frontline: Heavy/tank classes or high AC + HP
  if (
    hasClass('barbarian', 'fighter', 'paladin', 'moon', 'armorer', 'battle smith', 'forge', 'tempest', 'war', 'twilight') ||
    (pc.ac >= 17 && pc.hp.max >= pc.level * 7)
  ) {
    roles.add('Frontline');
  }

  // Striker: High single-target or weapon/blast damage classes or multiple strong attacks
  if (
    hasClass('rogue', 'ranger', 'paladin', 'fighter', 'monk', 'barbarian', 'warlock', 'sorcerer', 'evocation', 'vengeance', 'assassin', 'gloom stalker', 'hexblade') ||
    (pc.attacks || []).length >= 2
  ) {
    roles.add('Striker');
  }

  // Controller: Crowd/battlefield control casters or control spells
  if (
    hasClass('wizard', 'druid', 'sorcerer', 'bard', 'warlock') ||
    spellsLower.some((s) =>
      ['web', 'hypnotic pattern', 'hold person', 'entangle', 'faerie fire', 'banishment', 'wall of force', 'slow', 'counterspell', 'spike growth', 'spirit guardians', 'sleep', 'darkness', 'hunger of hadar'].some(
        (k) => s.includes(k),
      ),
    )
  ) {
    roles.add('Controller');
  }

  // Support: Healers, buffers, aura providers
  if (
    hasClass('cleric', 'bard', 'druid', 'paladin', 'artificer', 'divine soul', 'celestial', 'mercy') ||
    spellsLower.some((s) =>
      ['cure wounds', 'healing word', 'bless', 'revivify', 'lesser restoration', 'aid', 'haste', 'guidance', 'shield of faith', 'heroism', 'polymorph'].some(
        (k) => s.includes(k),
      ),
    )
  ) {
    roles.add('Support');
  }

  // Utility: Skill monkeys, ritual casters, explorers
  if (
    hasClass('rogue', 'bard', 'wizard', 'artificer', 'ranger', 'knowledge', 'tomelock') ||
    skills.size >= 4 ||
    (pc.skillExpertise && pc.skillExpertise.length > 0)
  ) {
    roles.add('Utility');
  }

  // Face: Social interaction specialists
  const chaMod = abilityMod(pc.abilities.CHA);
  const socialSkills: SkillName[] = ['Persuasion', 'Deception', 'Intimidation', 'Performance'];
  const socialCount = socialSkills.filter((sk) => skills.has(sk)).length;
  if (
    hasClass('bard', 'paladin', 'sorcerer', 'warlock', 'swashbuckler', 'eloquence', 'fey wanderer') ||
    (chaMod >= 2 && socialCount >= 1) ||
    socialCount >= 2
  ) {
    roles.add('Face');
  }

  if (roles.size === 0) {
    roles.add(pc.ac >= 16 ? 'Frontline' : 'Striker');
  }

  return Array.from(roles);
}

function buildDefensiveProfile(
  pc: PlayerCharacter,
  profBonus: number,
  resistances: string[],
  immunities: string[],
  senses: string[],
): DefensiveProfile {
  const saves: DefensiveSaveEntry[] = ABILITY_NAMES.map((ability) => {
    const isProf = (pc.proficiencies?.savingThrows || []).includes(ability);
    // Paladin Aura of Protection at lvl 6+
    const paladinLvl =
      pc.classes.find((c) => c.name.toLowerCase().includes('paladin'))?.level || 0;
    const auraBonus = paladinLvl >= 6 ? Math.max(1, abilityMod(pc.abilities.CHA)) : 0;
    // Monk Diamond Soul at lvl 14+
    const monkLvl = pc.classes.find((c) => c.name.toLowerCase().includes('monk'))?.level || 0;
    const effectiveProf = isProf || monkLvl >= 14;
    const bonus = abilityMod(pc.abilities[ability]) + (effectiveProf ? profBonus : 0) + auraBonus;
    return { ability, bonus };
  });

  const sortedDesc = [...saves].sort((a, b) => b.bonus - a.bonus);
  const sortedAsc = [...saves].sort((a, b) => a.bonus - b.bonus);

  const equippedArmor = (pc.inventory || [])
    .filter((i) => i.equipped)
    .map((i) => i.name)
    .filter((name) =>
      /armor|mail|plate|leather|hide|breastplate|half plate|shield|robe|cloak of protection|ring of protection/i.test(
        name,
      ),
    );

  const acSummary =
    equippedArmor.length > 0
      ? `AC ${pc.ac} (${equippedArmor.slice(0, 2).join(', ')})`
      : `AC ${pc.ac}`;

  return {
    ac: pc.ac,
    acSummary,
    strongestSaves: sortedDesc.slice(0, 2),
    weakestSaves: sortedAsc.slice(0, 2),
    resistances,
    immunities,
    senses,
  };
}

function buildAuditNotes(
  rawInput: Record<string, unknown>,
  pc: PlayerCharacter,
  derivedStats: CharacterDerivedStats,
): CharacterAuditNote[] {
  const notes: CharacterAuditNote[] = [];

  // 1. Attunement cap audit (> 3 attuned items)
  const inventoryAttunedCount = (pc.inventory || []).filter((i) => i.attuned).length;
  const effectiveAttunedCount = Math.max(pc.attunedCount || 0, inventoryAttunedCount);
  const artificerLvl =
    pc.classes.find((c) => c.name.toLowerCase().includes('artificer'))?.level || 0;
  const maxAttunement = artificerLvl >= 18 ? 6 : artificerLvl >= 14 ? 5 : artificerLvl >= 10 ? 4 : 3;

  if (effectiveAttunedCount > maxAttunement) {
    notes.push({
      id: 'audit-attunement-limit',
      severity: 'warning',
      category: 'attunement',
      message: `${effectiveAttunedCount} attuned items detected (exceeds maximum of ${maxAttunement} attunement slots).`,
    });
  }

  // 2. Ability modifier math discrepancy check
  const rawMods = rawInput.abilityModifiers as Record<string, unknown> | undefined;
  if (rawMods && typeof rawMods === 'object') {
    for (const ability of ABILITY_NAMES) {
      const provided = rawMods[ability] ?? rawMods[ability.toLowerCase()];
      if (typeof provided === 'number' && Number.isFinite(provided)) {
        const expected = derivedStats.abilityModifiers[ability];
        if (provided !== expected) {
          notes.push({
            id: `audit-ability-math-${ability.toLowerCase()}`,
            severity: 'warning',
            category: 'ability-math',
            message: `${ability} modifier discrepancy: sheet listed ${formatMod(provided)} for score ${pc.abilities[ability]} (expected ${formatMod(expected)}).`,
          });
        }
      }
    }
  }

  // 3. AC math discrepancy check
  const dexMod = derivedStats.abilityModifiers.DEX;
  const conMod = derivedStats.abilityModifiers.CON;
  const wisMod = derivedStats.abilityModifiers.WIS;
  const isBarbarian = pc.classes.some((c) => c.name.toLowerCase().includes('barbarian'));
  const isMonk = pc.classes.some((c) => c.name.toLowerCase().includes('monk'));

  const invNames = (pc.inventory || []).map((i) => i.name.toLowerCase());
  const hasShield = invNames.some((n) => n.includes('shield'));
  const shieldBonus = hasShield ? 2 : 0;

  let expectedArmoredAc: number | null = null;
  if (invNames.some((n) => n.includes('full plate') || /^plate(\s+armor)?$/.test(n))) {
    expectedArmoredAc = 18 + shieldBonus;
  } else if (invNames.some((n) => n.includes('splint'))) {
    expectedArmoredAc = 17 + shieldBonus;
  } else if (invNames.some((n) => n.includes('chain mail'))) {
    expectedArmoredAc = 16 + shieldBonus;
  } else if (invNames.some((n) => n.includes('half plate'))) {
    expectedArmoredAc = 15 + Math.min(2, dexMod) + shieldBonus;
  } else if (invNames.some((n) => n.includes('breastplate') || n.includes('scale mail'))) {
    expectedArmoredAc = 14 + Math.min(2, dexMod) + shieldBonus;
  } else if (invNames.some((n) => n.includes('studded leather'))) {
    expectedArmoredAc = 12 + dexMod + shieldBonus;
  } else if (invNames.some((n) => n.includes('leather'))) {
    expectedArmoredAc = 11 + dexMod + shieldBonus;
  } else if (isBarbarian) {
    expectedArmoredAc = 10 + dexMod + conMod + shieldBonus;
  } else if (isMonk && !hasShield) {
    expectedArmoredAc = 10 + dexMod + wisMod;
  }

  const rawAcProvided = typeof rawInput.ac === 'number' ? rawInput.ac : undefined;
  if (expectedArmoredAc !== null && rawAcProvided !== undefined && Math.abs(rawAcProvided - expectedArmoredAc) >= 2) {
    notes.push({
      id: 'audit-ac-math-mismatch',
      severity: 'info',
      category: 'ac-math',
      message: `AC math check: sheet AC is ${pc.ac}, whereas standard equipment/unarmored formula predicts ${expectedArmoredAc}.`,
    });
  } else if (pc.ac < 10 + dexMod && expectedArmoredAc === null) {
    notes.push({
      id: 'audit-ac-below-unarmored',
      severity: 'warning',
      category: 'ac-math',
      message: `AC (${pc.ac}) is lower than base Unarmored AC (${10 + dexMod} from 10 + DEX ${formatMod(dexMod)}).`,
    });
  }

  // 4. Concentration spell tag check
  const untaggedConcentrationSpells: string[] = [];
  for (const spell of pc.spellsKnown || []) {
    const lower = spell.toLowerCase();
    const isConc = KNOWN_CONCENTRATION_SPELLS.some((k) => lower.includes(k));
    const hasTag = /\[c\]|\(c\)|concentration/i.test(spell);
    if (isConc && !hasTag) {
      untaggedConcentrationSpells.push(spell.replace(/^\[[PA]\]\s*/i, '').trim());
    }
  }
  if (untaggedConcentrationSpells.length > 0) {
    notes.push({
      id: 'audit-concentration-tags',
      severity: 'info',
      category: 'concentration',
      message: `Concentration spells without explicit [C] tags: ${untaggedConcentrationSpells.slice(0, 5).join(', ')}.`,
    });
  }

  // 5. Level-up / allocation checks
  const classLevelSum = pc.classes.reduce((sum, c) => sum + (c.level || 0), 0);
  if (pc.classes.length > 0 && typeof rawInput.level === 'number' && rawInput.level !== classLevelSum) {
    notes.push({
      id: 'audit-level-mismatch',
      severity: 'warning',
      category: 'level-up',
      message: `Character level (${rawInput.level}) differed from sum of class levels (${classLevelSum}); synced to ${pc.level}.`,
    });
  }

  for (const cls of pc.classes) {
    if (cls.level >= 3 && !cls.subclass) {
      notes.push({
        id: `audit-missing-subclass-${normKey(cls.name)}`,
        severity: 'info',
        category: 'level-up',
        message: `${cls.name} is level ${cls.level} without a recorded subclass.`,
      });
    }
  }

  const rawHd = rawInput.hitDice as Record<string, unknown> | undefined;
  if (rawHd && typeof rawHd.max === 'number' && rawHd.max > 0 && rawHd.max < pc.level) {
    notes.push({
      id: 'audit-hit-dice-level-up',
      severity: 'info',
      category: 'level-up',
      message: `Hit Dice pool was ${rawHd.max}/${pc.level} prior to evaluation; updated to ${pc.hitDice.max}d${pc.hitDice.dieSize}.`,
    });
  }

  return notes;
}

/**
 * Automatic Character Evaluator:
 * - Computes and backfills missing Ability Modifiers, Proficiency Bonus, Passive Perception /
 *   Investigation / Insight, Spell Save DC, Spell Attack Bonus, Initiative bonus, and Carrying Capacity.
 * - Synthesizes standard & Pact Magic spell slots and trackable class resource pools.
 * - Attaches tactical & rules audit (`evaluation` with `partyRoles`, `defensiveProfile`, `auditNotes`).
 */
export function evaluateCharacterSheet(
  input: Partial<PlayerCharacter> & Record<string, unknown>,
): PlayerCharacter {
  const raw = (input || {}) as Record<string, unknown>;
  const pc = normalizePc(input);

  // Support flat convenience HP properties if passed on raw input
  const rawHpObj = (raw.hp as Record<string, unknown>) || {};
  const rawMaxHp =
    typeof rawHpObj.max === 'number'
      ? rawHpObj.max
      : typeof raw.maxHp === 'number'
        ? raw.maxHp
        : pc.hp.max;
  const rawCurrentHp =
    typeof rawHpObj.current === 'number'
      ? rawHpObj.current
      : typeof raw.currentHp === 'number'
        ? raw.currentHp
        : pc.hp.current;
  const rawTempHp =
    typeof rawHpObj.temp === 'number'
      ? rawHpObj.temp
      : typeof raw.tempHp === 'number'
        ? raw.tempHp
        : pc.hp.temp;

  // Backfill ability scores if only abilityModifiers were supplied
  const rawAbilities = (raw.abilities as Record<string, unknown>) || {};
  const rawAbilityMods = (raw.abilityModifiers as Record<string, unknown>) || {};
  const abilities = { ...pc.abilities };
  for (const ab of ABILITY_NAMES) {
    const rawScore = rawAbilities[ab] ?? rawAbilities[ab.toLowerCase()];
    const rawMod = rawAbilityMods[ab] ?? rawAbilityMods[ab.toLowerCase()];
    if (
      (rawScore === undefined || rawScore === null || rawScore === 0) &&
      typeof rawMod === 'number' &&
      Number.isFinite(rawMod)
    ) {
      abilities[ab] = Math.max(1, Math.min(30, 10 + rawMod * 2));
    } else if (typeof rawScore === 'number' && Number.isFinite(rawScore) && rawScore > 0) {
      abilities[ab] = Math.max(1, Math.min(30, Math.round(rawScore)));
    }
  }
  pc.abilities = abilities;

  // Compute total level from classes or explicit level
  const classSum = pc.classes.reduce((sum, c) => sum + (c.level || 0), 0);
  const totalLevel = Math.max(1, Math.min(20, classSum > 0 ? classSum : pc.level || 1));
  pc.level = totalLevel;

  // Backfill default saving throw proficiencies from primary class if none listed
  const primaryClass = findPrimaryClass(pc.classes);
  if (pc.proficiencies.savingThrows.length === 0 && primaryClass) {
    for (const [clsKey, saves] of Object.entries(CLASS_DEFAULT_SAVES)) {
      if (primaryClass.includes(clsKey)) {
        pc.proficiencies.savingThrows = [...saves];
        break;
      }
    }
  }

  // Compute ability modifiers
  const abilityModifiers: Record<AbilityName, number> = {
    STR: abilityMod(pc.abilities.STR),
    DEX: abilityMod(pc.abilities.DEX),
    CON: abilityMod(pc.abilities.CON),
    INT: abilityMod(pc.abilities.INT),
    WIS: abilityMod(pc.abilities.WIS),
    CHA: abilityMod(pc.abilities.CHA),
  };
  pc.abilityModifiers = abilityModifiers;

  // Compute proficiency bonus from total level
  const profBonus = proficiencyBonusForLevel(totalLevel);
  pc.proficiencyBonus = profBonus;

  // Compute HP backfill if maxHp is 0
  const primaryDieSize =
    (primaryClass &&
      Object.entries(CLASS_HIT_DIE).find(([k]) => primaryClass.includes(k))?.[1]) ||
    pc.hitDice?.dieSize ||
    8;

  const estimatedMaxHp =
    rawMaxHp > 0
      ? rawMaxHp
      : Math.max(
          1,
          primaryDieSize +
            abilityModifiers.CON +
            (totalLevel - 1) * (Math.floor(primaryDieSize / 2) + 1 + abilityModifiers.CON),
        );
  const finalCurrentHp =
    raw.currentHp !== undefined || rawHpObj.current !== undefined
      ? rawCurrentHp
      : rawMaxHp > 0
        ? rawMaxHp
        : estimatedMaxHp;

  pc.hp = {
    max: estimatedMaxHp,
    current: finalCurrentHp,
    temp: Math.max(0, rawTempHp),
  };

  // Hit Dice synthesis
  pc.hitDice = {
    dieSize: ([4, 6, 8, 10, 12].includes(primaryDieSize) ? primaryDieSize : 8) as number,
    max: Math.max(totalLevel, pc.hitDice?.max || totalLevel),
    used: Math.min(totalLevel, Math.max(0, pc.hitDice?.used || 0)),
  };

  // Initiative bonus backfill
  const rawInit = raw.initiativeMod ?? raw.initiative;
  const hasExplicitInit =
    typeof rawInit === 'number' && !Number.isNaN(rawInit) && rawInit !== 0;
  const hasAlertFeat = (pc.features || []).some((f) =>
    f.name.toLowerCase().includes('alert'),
  );
  const computedInit = abilityModifiers.DEX + (hasAlertFeat ? profBonus : 0);
  pc.initiativeMod = hasExplicitInit ? Math.round(rawInit as number) : computedInit;

  // AC backfill if left at default 10 or 0
  if (!raw.ac || pc.ac <= 0) {
    pc.ac = Math.max(10, 10 + abilityModifiers.DEX);
  }

  // Passive scores (10 + skill mod + expertise)
  const expertiseSet = new Set<SkillName>(pc.skillExpertise || []);
  const profSkillSet = new Set<SkillName>(pc.proficiencies?.skills || []);
  const computePassive = (skill: SkillName): number => {
    const ab = SKILL_ABILITIES[skill];
    const base = 10 + abilityModifiers[ab];
    const prof = profSkillSet.has(skill) ? profBonus : 0;
    const exp = expertiseSet.has(skill) ? profBonus : 0;
    return base + prof + exp;
  };

  pc.passivePerception =
    typeof raw.passivePerception === 'number' && raw.passivePerception > 0
      ? raw.passivePerception
      : computePassive('Perception');
  pc.passiveInvestigation =
    typeof raw.passiveInvestigation === 'number' && raw.passiveInvestigation > 0
      ? raw.passiveInvestigation
      : computePassive('Investigation');
  pc.passiveInsight =
    typeof raw.passiveInsight === 'number' && raw.passiveInsight > 0
      ? raw.passiveInsight
      : computePassive('Insight');

  // Spellcasting ability, Save DC, and Attack Bonus
  let spellAbility: AbilityName | undefined = pc.spellcastingAbility;
  if (!spellAbility) {
    for (const c of pc.classes) {
      const cLower = c.name.trim().toLowerCase();
      const subLower = (c.subclass || '').trim().toLowerCase();
      const found = Object.entries(CLASS_SPELLCASTING_ABILITY).find(([k]) =>
        cLower.includes(k),
      );
      if (found) {
        spellAbility = found[1];
        break;
      }
      if (subLower.includes('eldritch') || subLower.includes('arcane trickster')) {
        spellAbility = 'INT';
        break;
      }
    }
  }
  if (!spellAbility && (pc.spellsKnown?.length || pc.spellSlots || pc.pactSlots)) {
    // Pick highest mental ability
    const mentals: AbilityName[] = ['INT', 'WIS', 'CHA'];
    mentals.sort((a, b) => pc.abilities[b] - pc.abilities[a]);
    spellAbility = mentals[0];
  }

  let spellSaveDc: number | null = null;
  let spellAttackBonus: number | null = null;
  if (spellAbility) {
    pc.spellcastingAbility = spellAbility;
    const spellMod = abilityModifiers[spellAbility];
    spellSaveDc =
      typeof raw.spellSaveDc === 'number' && raw.spellSaveDc > 0
        ? raw.spellSaveDc
        : 8 + profBonus + spellMod;
    spellAttackBonus =
      typeof raw.spellAttackBonus === 'number'
        ? raw.spellAttackBonus
        : profBonus + spellMod;
    pc.spellSaveDc = spellSaveDc;
    pc.spellAttackBonus = spellAttackBonus;
  }

  // Carrying capacity (STR * 15, doubled for Powerful Build)
  const raceAndFeats = [
    pc.race,
    ...(pc.features || []).map((f) => f.name),
  ]
    .join(' ')
    .toLowerCase();
  const hasPowerfulBuild = [
    'goliath',
    'powerful build',
    'bugbear',
    'firbolg',
    'orc',
    'centaur',
    'loxodon',
  ].some((k) => raceAndFeats.includes(k));
  const carryingCapacity = pc.abilities.STR * 15 * (hasPowerfulBuild ? 2 : 1);
  pc.carryingCapacity = carryingCapacity;

  // Spell Slot & Class Resource Synthesis
  const synthesizedSlots = synthesizeSpellSlotsForClasses(pc.classes, pc.spellSlots);
  if (synthesizedSlots) {
    pc.spellSlots = synthesizedSlots;
  }
  const synthesizedPact = synthesizePactSlotsForClasses(pc.classes, pc.pactSlots);
  if (synthesizedPact) {
    pc.pactSlots = synthesizedPact;
  }
  pc.resourcePools = synthesizeClassResourcePools(pc);

  // Attunement count sync
  const invAttuned = (pc.inventory || []).filter((i) => i.attuned).length;
  const rawAttunedCount =
    typeof raw.attunedCount === 'number' ? raw.attunedCount : pc.attunedCount || 0;
  pc.attunedCount = Math.max(rawAttunedCount, invAttuned);

  // Senses, resistances, immunities
  const senses = inferSenses(pc);
  const { resistances, immunities } = inferResistancesAndImmunities(pc);
  pc.senses = senses;
  pc.resistances = resistances;
  pc.immunities = immunities;

  const derivedStats: CharacterDerivedStats = {
    abilityModifiers,
    proficiencyBonus: profBonus,
    passivePerception: pc.passivePerception,
    passiveInvestigation: pc.passiveInvestigation,
    passiveInsight: pc.passiveInsight,
    spellSaveDc,
    spellAttackBonus,
    initiativeBonus: pc.initiativeMod,
    carryingCapacity,
  };

  const partyRoles = inferPartyRoles(pc);
  const defensiveProfile = buildDefensiveProfile(
    pc,
    profBonus,
    resistances,
    immunities,
    senses,
  );
  const auditNotes = buildAuditNotes(raw, pc, derivedStats);

  const evaluation: CharacterEvaluation = {
    partyRoles,
    defensiveProfile,
    auditNotes,
    derivedStats,
    evaluatedAt: Date.now(),
  };

  pc.evaluation = evaluation;
  return pc;
}
