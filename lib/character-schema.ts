export type Attack = {
  name: string;
  bonus: string;
  damage: string;
  notes: string;
};

export type Character = {
  id: string;
  name: string;
  player: string;
  race: string;
  classLevel: string;
  gestalt: boolean;
  classLevel2: string;
  background: string;
  alignment: string;
  experience: string;
  abilities: {
    str: string;
    dex: string;
    con: string;
    int: string;
    wis: string;
    cha: string;
  };
  saves: string;
  ac: string;
  hp: string;
  hpMax: string;
  initiative: string;
  speed: string;
  profBonus: string;
  hitDice: string;
  skills: string;
  passivePerception: string;
  languages: string;
  proficiencies: string;
  attacks: Attack[];
  equipment: string;
  currency: { cp: string; sp: string; ep: string; gp: string; pp: string };
  features: string;
  personality: string;
  ideals: string;
  bonds: string;
  flaws: string;
  appearance: string;
  backstory: string;
  spellcasting: {
    ability: string;
    saveDC: string;
    attackBonus: string;
    slots: string;
  };
  spells: string;
  notes: string;
};

export function makeCharacterId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `char-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function emptyCharacter(): Character {
  return {
    id: makeCharacterId(),
    name: '',
    player: '',
    race: '',
    classLevel: '',
    gestalt: false,
    classLevel2: '',
    background: '',
    alignment: '',
    experience: '',
    abilities: { str: '', dex: '', con: '', int: '', wis: '', cha: '' },
    saves: '',
    ac: '',
    hp: '',
    hpMax: '',
    initiative: '',
    speed: '',
    profBonus: '',
    hitDice: '',
    skills: '',
    passivePerception: '',
    languages: '',
    proficiencies: '',
    attacks: [],
    equipment: '',
    currency: { cp: '', sp: '', ep: '', gp: '', pp: '' },
    features: '',
    personality: '',
    ideals: '',
    bonds: '',
    flaws: '',
    appearance: '',
    backstory: '',
    spellcasting: { ability: '', saveDC: '', attackBonus: '', slots: '' },
    spells: '',
    notes: '',
  };
}

export function normalizeCharacter(input: unknown): Character {
  const base = emptyCharacter();
  if (!input || typeof input !== 'object') return base;
  const o = input as Record<string, unknown>;
  const abilities = (o.abilities as Record<string, unknown>) || {};
  const currency = (o.currency as Record<string, unknown>) || {};
  const spellcasting = (o.spellcasting as Record<string, unknown>) || {};
  const attacksIn = Array.isArray(o.attacks) ? (o.attacks as unknown[]) : [];

  const asStr = (v: unknown): string =>
    v === null || v === undefined ? '' : typeof v === 'string' ? v : String(v);

  return {
    id: asStr(o.id) || base.id,
    name: asStr(o.name),
    player: asStr(o.player),
    race: asStr(o.race),
    classLevel: asStr(o.classLevel),
    gestalt: o.gestalt === true,
    classLevel2: asStr(o.classLevel2),
    background: asStr(o.background),
    alignment: asStr(o.alignment),
    experience: asStr(o.experience),
    abilities: {
      str: asStr(abilities.str),
      dex: asStr(abilities.dex),
      con: asStr(abilities.con),
      int: asStr(abilities.int),
      wis: asStr(abilities.wis),
      cha: asStr(abilities.cha),
    },
    saves: asStr(o.saves),
    ac: asStr(o.ac),
    hp: asStr(o.hp),
    hpMax: asStr(o.hpMax),
    initiative: asStr(o.initiative),
    speed: asStr(o.speed),
    profBonus: asStr(o.profBonus),
    hitDice: asStr(o.hitDice),
    skills: asStr(o.skills),
    passivePerception: asStr(o.passivePerception),
    languages: asStr(o.languages),
    proficiencies: asStr(o.proficiencies),
    attacks: attacksIn.map((a) => {
      const ao = (a as Record<string, unknown>) || {};
      return {
        name: asStr(ao.name),
        bonus: asStr(ao.bonus),
        damage: asStr(ao.damage),
        notes: asStr(ao.notes),
      };
    }),
    equipment: asStr(o.equipment),
    currency: {
      cp: asStr(currency.cp),
      sp: asStr(currency.sp),
      ep: asStr(currency.ep),
      gp: asStr(currency.gp),
      pp: asStr(currency.pp),
    },
    features: asStr(o.features),
    personality: asStr(o.personality),
    ideals: asStr(o.ideals),
    bonds: asStr(o.bonds),
    flaws: asStr(o.flaws),
    appearance: asStr(o.appearance),
    backstory: asStr(o.backstory),
    spellcasting: {
      ability: asStr(spellcasting.ability),
      saveDC: asStr(spellcasting.saveDC),
      attackBonus: asStr(spellcasting.attackBonus),
      slots: asStr(spellcasting.slots),
    },
    spells: asStr(o.spells),
    notes: asStr(o.notes),
  };
}
