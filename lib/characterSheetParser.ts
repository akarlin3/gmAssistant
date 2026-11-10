import { evaluateCharacterSheet } from './characterEvaluator';
import { normalizeCharacter, type Character } from './character-schema';
import { abilityMod } from './pc/derived';
import { emptyPc, makePcId, normalizePc } from './pc/factory';
import { mapParsedToPc } from './pc/from-parser';
import { SKILL_ABILITIES } from './pc/skills';
import {
  ABILITY_NAMES,
  SPELL_SLOT_LEVELS,
  type AbilityName,
  type Attack,
  type CharacterEvaluation,
  type CoinPurse,
  type FeatureEntry,
  type InventoryItem,
  type PcClass,
  type PlayerCharacter,
  type SkillName,
  type SpellSlot,
  type SpellSlotLevel,
} from './pc/types';

export type SheetParseTier = 'tier1' | 'tier2';

export type ParseCharacterSheetOptions = {
  /** Firebase ID token for authenticated GM or Standalone Player requests. */
  idToken?: string;
  /** Campaign share-link capability token for unauthenticated `/player` requests. */
  shareToken?: string;
  /** Optional custom fetch implementation for Tier 2 API fallback. */
  fetchImpl?: typeof fetch;
};

export type ParseCharacterSheetResult = {
  pc: PlayerCharacter;
  evaluation: CharacterEvaluation;
  tier: SheetParseTier;
  isFullStateBackup?: boolean;
};

const DDB_STAT_MAP: Record<number, AbilityName> = {
  1: 'STR',
  2: 'DEX',
  3: 'CON',
  4: 'INT',
  5: 'WIS',
  6: 'CHA',
};

const ALL_SKILLS = Object.keys(SKILL_ABILITIES) as SkillName[];

function parseNum(v: unknown, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const m = v.match(/[+-]?\d+/);
    if (m) return parseInt(m[0], 10);
  }
  return fallback;
}

function matchSkillName(raw: string): SkillName | undefined {
  const norm = raw.trim().toLowerCase().replace(/[^a-z]/g, '');
  return ALL_SKILLS.find((sk) => sk.toLowerCase().replace(/[^a-z]/g, '') === norm);
}

function matchAbilityName(raw: string): AbilityName | undefined {
  const u = raw.trim().toUpperCase();
  if (ABILITY_NAMES.includes(u as AbilityName)) return u as AbilityName;
  const map: Record<string, AbilityName> = {
    STRENGTH: 'STR',
    DEXTERITY: 'DEX',
    CONSTITUTION: 'CON',
    INTELLIGENCE: 'INT',
    WISDOM: 'WIS',
    CHARISMA: 'CHA',
  };
  return map[u];
}

// ---------------------------------------------------------------------------
// Tier 1A: Deterministic JSON Schema Parsers (D&D Beyond, Foundry, Roll20, GM Assistant)
// ---------------------------------------------------------------------------

function parseDndBeyondJson(rawRoot: Record<string, unknown>): PlayerCharacter {
  const data =
    rawRoot.data && typeof rawRoot.data === 'object'
      ? (rawRoot.data as Record<string, unknown>)
      : rawRoot;

  const base = emptyPc();
  const abilities: Record<AbilityName, number> = {
    STR: 10,
    DEX: 10,
    CON: 10,
    INT: 10,
    WIS: 10,
    CHA: 10,
  };

  if (Array.isArray(data.stats)) {
    for (const s of data.stats) {
      if (!s || typeof s !== 'object') continue;
      const st = s as Record<string, unknown>;
      const ab = DDB_STAT_MAP[Number(st.id)];
      if (ab && typeof st.value === 'number') {
        abilities[ab] = st.value;
      }
    }
  }
  if (Array.isArray(data.bonusStats)) {
    for (const s of data.bonusStats) {
      if (!s || typeof s !== 'object') continue;
      const st = s as Record<string, unknown>;
      const ab = DDB_STAT_MAP[Number(st.id)];
      if (ab && typeof st.value === 'number') {
        abilities[ab] += st.value;
      }
    }
  }
  if (Array.isArray(data.overrideStats)) {
    for (const s of data.overrideStats) {
      if (!s || typeof s !== 'object') continue;
      const st = s as Record<string, unknown>;
      const ab = DDB_STAT_MAP[Number(st.id)];
      if (ab && typeof st.value === 'number' && st.value > 0) {
        abilities[ab] = st.value;
      }
    }
  }

  // Parse modifiers for ability score bonuses, proficiencies, expertise,enses, resistances
  const savingThrows = new Set<AbilityName>();
  const skills = new Set<SkillName>();
  const skillExpertise = new Set<SkillName>();
  const languages = new Set<string>();
  const resistances = new Set<string>();

  if (data.modifiers && typeof data.modifiers === 'object') {
    const modGroups = Object.values(data.modifiers as Record<string, unknown>);
    for (const grp of modGroups) {
      if (!Array.isArray(grp)) continue;
      for (const m of grp) {
        if (!m || typeof m !== 'object') continue;
        const mod = m as Record<string, unknown>;
        const type = String(mod.type || '').toLowerCase();
        const subType = String(mod.subType || '').toLowerCase();
        const friendly = String(mod.friendlySubtypeName || '');
        const val = typeof mod.value === 'number' ? mod.value : 0;

        if (type === 'bonus' && subType.endsWith('-score') && val) {
          const abKey = subType.split('-')[0].toUpperCase();
          const ab = matchAbilityName(abKey);
          if (ab) abilities[ab] += val;
        } else if (type === 'proficiency') {
          if (subType.endsWith('-saving-throws')) {
            const ab = matchAbilityName(subType.replace('-saving-throws', ''));
            if (ab) savingThrows.add(ab);
          } else {
            const sk = matchSkillName(friendly || subType);
            if (sk) skills.add(sk);
          }
        } else if (type === 'expertise') {
          const sk = matchSkillName(friendly || subType);
          if (sk) {
            skills.add(sk);
            skillExpertise.add(sk);
          }
        } else if (type === 'language' && friendly) {
          languages.add(friendly);
        } else if (type === 'resistance' && (friendly || subType)) {
          resistances.add(friendly || subType);
        }
      }
    }
  }

  const classes: PcClass[] = [];
  if (Array.isArray(data.classes)) {
    for (const c of data.classes) {
      if (!c || typeof c !== 'object') continue;
      const clsObj = c as Record<string, unknown>;
      const def = (clsObj.definition as Record<string, unknown>) || {};
      const subDef = (clsObj.subclassDefinition as Record<string, unknown>) || {};
      const name = String(def.name || clsObj.name || 'Adventurer');
      const level = Math.max(1, parseNum(clsObj.level, 1));
      const subclass = subDef.name ? String(subDef.name) : undefined;
      classes.push({ name, level, ...(subclass ? { subclass } : {}) });
    }
  }

  const totalLevel =
    classes.reduce((s, c) => s + c.level, 0) || Math.max(1, parseNum(data.level, 1));

  const conMod = abilityMod(abilities.CON);
  const baseHp = parseNum(data.baseHitPoints, 0);
  const bonusHp = parseNum(data.bonusHitPoints, 0);
  const overrideHp = parseNum(data.overrideHitPoints, 0);
  const removedHp = parseNum(data.removedHitPoints, 0);
  const tempHp = parseNum(data.temporaryHitPoints, 0);

  const maxHp =
    overrideHp > 0
      ? overrideHp
      : baseHp > 0
        ? Math.max(1, baseHp + bonusHp + conMod * totalLevel)
        : 0;
  const currentHp = Math.max(0, maxHp - removedHp);

  const raceObj = (data.race as Record<string, unknown>) || {};
  const race = String(raceObj.fullName || raceObj.baseName || data.race || '');

  const bgObj = (data.background as Record<string, unknown>) || {};
  const bgDef = (bgObj.definition as Record<string, unknown>) || {};
  const background = String(bgDef.name || bgObj.name || '');

  const currenciesObj = (data.currencies as Record<string, unknown>) || {};
  const currency: CoinPurse = {
    cp: parseNum(currenciesObj.cp, 0),
    sp: parseNum(currenciesObj.sp, 0),
    ep: parseNum(currenciesObj.ep, 0),
    gp: parseNum(currenciesObj.gp, 0),
    pp: parseNum(currenciesObj.pp, 0),
  };

  const inventory: InventoryItem[] = [];
  const attacks: Attack[] = [];
  let attunedCount = 0;

  if (Array.isArray(data.inventory)) {
    for (const it of data.inventory) {
      if (!it || typeof it !== 'object') continue;
      const itemObj = it as Record<string, unknown>;
      const def = (itemObj.definition as Record<string, unknown>) || itemObj;
      const name = String(def.name || '');
      if (!name) continue;
      const qty = Math.max(1, parseNum(itemObj.quantity ?? itemObj.qty, 1));
      const equipped = itemObj.equipped === true;
      const attuned = itemObj.isAttuned === true || itemObj.attuned === true;
      if (attuned) attunedCount++;

      inventory.push({
        id: String(itemObj.id || makePcId()),
        name,
        qty,
        ...(typeof def.weight === 'number' ? { weight: def.weight } : {}),
        ...(typeof def.description === 'string'
          ? { description: def.description.replace(/<[^>]+>/g, '').slice(0, 300) }
          : {}),
        equipped,
        attuned,
      });

      if (def.damage && typeof def.damage === 'object' && equipped) {
        const dmg = def.damage as Record<string, unknown>;
        const diceString = String(dmg.diceString || '1d8');
        const dmgType = String(def.damageType || 'slashing');
        attacks.push({
          id: makePcId(),
          name,
          attackBonus: abilityMod(abilities.STR) + 2,
          damageExpr: diceString,
          damageType: dmgType,
          range: def.range ? `${def.range} ft.` : '5 ft.',
        });
      }
    }
  }

  const spellsKnown: string[] = [];
  if (Array.isArray(data.classSpells)) {
    for (const cs of data.classSpells) {
      if (!cs || typeof cs !== 'object') continue;
      const spellsArr = (cs as Record<string, unknown>).spells;
      if (!Array.isArray(spellsArr)) continue;
      for (const sp of spellsArr) {
        if (!sp || typeof sp !== 'object') continue;
        const def = ((sp as Record<string, unknown>).definition as Record<string, unknown>) || {};
        if (def.name) {
          const isConc = def.concentration === true;
          spellsKnown.push(`${def.name}${isConc ? ' [C]' : ''}`);
        }
      }
    }
  }

  return evaluateCharacterSheet({
    ...base,
    name: String(data.name || 'Unnamed'),
    level: totalLevel,
    classes,
    race,
    background,
    abilities,
    proficiencies: {
      ...base.proficiencies,
      savingThrows: Array.from(savingThrows),
      skills: Array.from(skills),
      languages: Array.from(languages),
    },
    ...(skillExpertise.size > 0 ? { skillExpertise: Array.from(skillExpertise) } : {}),
    hp: {
      current: currentHp,
      max: maxHp,
      temp: tempHp,
    },
    ac: parseNum(data.armorClass ?? data.ac, 10 + abilityMod(abilities.DEX)),
    speed: parseNum(
      (data.race as any)?.weightSpeeds?.normal?.walk ?? data.speed,
      30,
    ),
    inspiration: Boolean(data.inspiration),
    inventory,
    attunedCount,
    currency,
    attacks,
    ...(spellsKnown.length > 0 ? { spellsKnown } : {}),
    ...(resistances.size > 0 ? { resistances: Array.from(resistances) } : {}),
  });
}

function parseFoundryActorJson(raw: Record<string, unknown>): PlayerCharacter {
  const base = emptyPc();
  const sys = ((raw.system || raw.data) as Record<string, unknown>) || {};
  const abilRaw = (sys.abilities as Record<string, Record<string, unknown>>) || {};

  const abilities: Record<AbilityName, number> = {
    STR: parseNum(abilRaw.str?.value, 10),
    DEX: parseNum(abilRaw.dex?.value, 10),
    CON: parseNum(abilRaw.con?.value, 10),
    INT: parseNum(abilRaw.int?.value, 10),
    WIS: parseNum(abilRaw.wis?.value, 10),
    CHA: parseNum(abilRaw.cha?.value, 10),
  };

  const savingThrows: AbilityName[] = [];
  for (const [k, ab] of [
    ['str', 'STR'],
    ['dex', 'DEX'],
    ['con', 'CON'],
    ['int', 'INT'],
    ['wis', 'WIS'],
    ['cha', 'CHA'],
  ] as const) {
    if (parseNum(abilRaw[k]?.proficient, 0) >= 1) {
      savingThrows.push(ab);
    }
  }

  const FOUNDRY_SKILLS: Record<string, SkillName> = {
    acr: 'Acrobatics',
    ani: 'Animal Handling',
    arc: 'Arcana',
    ath: 'Athletics',
    dec: 'Deception',
    his: 'History',
    ins: 'Insight',
    itm: 'Intimidation',
    inv: 'Investigation',
    med: 'Medicine',
    nat: 'Nature',
    prc: 'Perception',
    prf: 'Performance',
    per: 'Persuasion',
    rel: 'Religion',
    slt: 'Sleight of Hand',
    ste: 'Stealth',
    sur: 'Survival',
  };

  const skills: SkillName[] = [];
  const skillExpertise: SkillName[] = [];
  const skillsRaw = (sys.skills as Record<string, Record<string, unknown>>) || {};
  for (const [code, skName] of Object.entries(FOUNDRY_SKILLS)) {
    const val = Number(skillsRaw[code]?.value ?? skillsRaw[code]?.proficient ?? 0);
    if (val >= 1) skills.push(skName);
    if (val >= 2) skillExpertise.push(skName);
  }

  const attrs = (sys.attributes as Record<string, Record<string, unknown>>) || {};
  const hpRaw = attrs.hp || {};
  const acRaw = attrs.ac || {};
  const moveRaw = attrs.movement || {};
  const details = (sys.details as Record<string, unknown>) || {};
  const currencyRaw = (sys.currency as Record<string, unknown>) || {};

  const classes: PcClass[] = [];
  const inventory: InventoryItem[] = [];
  const features: FeatureEntry[] = [];
  const spellsKnown: string[] = [];
  const attacks: Attack[] = [];
  let attunedCount = 0;

  if (Array.isArray(raw.items)) {
    for (const it of raw.items) {
      if (!it || typeof it !== 'object') continue;
      const item = it as Record<string, unknown>;
      const type = String(item.type || '').toLowerCase();
      const name = String(item.name || '');
      const itemSys = ((item.system || item.data) as Record<string, unknown>) || {};

      if (type === 'class') {
        classes.push({
          name,
          level: Math.max(1, parseNum(itemSys.levels ?? itemSys.level, 1)),
          ...(itemSys.subclass ? { subclass: String(itemSys.subclass) } : {}),
        });
      } else if (type === 'feat' || type === 'feature') {
        features.push({
          id: String(item._id || item.id || makePcId()),
          name,
          source: String(itemSys.requirements || 'Class/Feat'),
          description: String(
            (itemSys.description as any)?.value || itemSys.description || '',
          ).replace(/<[^>]+>/g, ''),
        });
      } else if (type === 'spell') {
        spellsKnown.push(name);
      } else if (['weapon', 'equipment', 'consumable', 'loot', 'tool', 'backpack'].includes(type)) {
        const attuned =
          itemSys.attunement === 2 || itemSys.attuned === true;
        if (attuned) attunedCount++;
        inventory.push({
          id: String(item._id || item.id || makePcId()),
          name,
          qty: Math.max(1, parseNum(itemSys.quantity, 1)),
          equipped: itemSys.equipped === true,
          attuned,
          ...(typeof itemSys.weight === 'number' ? { weight: itemSys.weight } : {}),
        });
        if (type === 'weapon') {
          attacks.push({
            id: makePcId(),
            name,
            attackBonus: parseNum(itemSys.attackBonus, abilityMod(abilities.STR) + 2),
            damageExpr: '1d8',
            damageType: 'slashing',
            range: '5 ft.',
          });
        }
      }
    }
  }

  const totalLevel =
    classes.reduce((s, c) => s + c.level, 0) || Math.max(1, parseNum(details.level, 1));

  return evaluateCharacterSheet({
    ...base,
    name: String(raw.name || 'Unnamed'),
    level: totalLevel,
    classes,
    race: String(
      typeof details.race === 'object' && details.race
        ? (details.race as any).name
        : details.race || '',
    ),
    background: String(
      typeof details.background === 'object' && details.background
        ? (details.background as any).name
        : details.background || '',
    ),
    alignment: String(details.alignment || ''),
    abilities,
    proficiencies: {
      ...base.proficiencies,
      savingThrows,
      skills,
    },
    ...(skillExpertise.length > 0 ? { skillExpertise } : {}),
    hp: {
      current: parseNum(hpRaw.value, parseNum(hpRaw.max, 10)),
      max: parseNum(hpRaw.max, 10),
      temp: parseNum(hpRaw.temp, 0),
    },
    ac: parseNum(acRaw.value ?? acRaw.flat, 10 + abilityMod(abilities.DEX)),
    speed: parseNum(moveRaw.walk, 30),
    inventory,
    attunedCount,
    currency: {
      cp: parseNum(currencyRaw.cp, 0),
      sp: parseNum(currencyRaw.sp, 0),
      ep: parseNum(currencyRaw.ep, 0),
      gp: parseNum(currencyRaw.gp, 0),
      pp: parseNum(currencyRaw.pp, 0),
    },
    features,
    attacks,
    ...(spellsKnown.length > 0 ? { spellsKnown } : {}),
  });
}

function parseRoll20Json(raw: Record<string, unknown>): PlayerCharacter {
  const base = emptyPc();
  const attribMap = new Map<string, { current: string; max: string }>();

  const charObj =
    raw.character && typeof raw.character === 'object'
      ? (raw.character as Record<string, unknown>)
      : raw;

  if (Array.isArray(charObj.attribs)) {
    for (const a of charObj.attribs) {
      if (!a || typeof a !== 'object') continue;
      const o = a as Record<string, unknown>;
      const key = String(o.name || '').toLowerCase();
      if (key) {
        attribMap.set(key, {
          current: String(o.current ?? ''),
          max: String(o.max ?? ''),
        });
      }
    }
  }

  const getAttr = (k: string, fb = ''): string => attribMap.get(k)?.current || fb;

  const abilities: Record<AbilityName, number> = {
    STR: parseNum(getAttr('strength') || charObj.strength, 10),
    DEX: parseNum(getAttr('dexterity') || charObj.dexterity, 10),
    CON: parseNum(getAttr('constitution') || charObj.constitution, 10),
    INT: parseNum(getAttr('intelligence') || charObj.intelligence, 10),
    WIS: parseNum(getAttr('wisdom') || charObj.wisdom, 10),
    CHA: parseNum(getAttr('charisma') || charObj.charisma, 10),
  };

  const className = getAttr('class') || String(charObj.class || 'Fighter');
  const level = Math.max(
    1,
    parseNum(getAttr('level') || getAttr('base_level') || charObj.level, 1),
  );
  const subclass = getAttr('subclass') || undefined;

  const hpSlot = attribMap.get('hp');
  const hpCurrent = parseNum(hpSlot?.current || charObj.hp, 10);
  const hpMax = parseNum(hpSlot?.max || hpSlot?.current || charObj.hp_max || charObj.hp, hpCurrent);

  return evaluateCharacterSheet({
    ...base,
    name: String(charObj.name || getAttr('character_name') || 'Unnamed'),
    level,
    classes: [{ name: className, level, ...(subclass ? { subclass } : {}) }],
    race: getAttr('race') || String(charObj.race || ''),
    background: getAttr('background') || String(charObj.background || ''),
    alignment: getAttr('alignment') || String(charObj.alignment || ''),
    abilities,
    hp: {
      current: hpCurrent,
      max: hpMax,
      temp: parseNum(getAttr('hp_temp'), 0),
    },
    ac: parseNum(getAttr('ac') || charObj.ac, 10 + abilityMod(abilities.DEX)),
    speed: parseNum(getAttr('speed') || charObj.speed, 30),
  });
}

export function parseCharacterJsonString(jsonText: string): {
  pc: PlayerCharacter;
  isFullStateBackup: boolean;
} {
  const parsed = JSON.parse(jsonText);
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid JSON character sheet');
  }

  const obj = parsed as Record<string, unknown>;

  // 1. D&D Beyond JSON format
  if (
    (obj.data && typeof obj.data === 'object' && Array.isArray((obj.data as any).stats)) ||
    (Array.isArray(obj.stats) && Array.isArray(obj.classes) && 'baseHitPoints' in obj)
  ) {
    return { pc: parseDndBeyondJson(obj), isFullStateBackup: false };
  }

  // 2. Foundry VTT Actor JSON format
  if (
    (obj.type === 'character' && (obj.system || obj.data)) ||
    (obj.system && typeof obj.system === 'object' && (obj.system as any).abilities?.str)
  ) {
    return { pc: parseFoundryActorJson(obj), isFullStateBackup: false };
  }

  // 3. Roll20 Character JSON format
  if (
    Array.isArray(obj.attribs) ||
    (obj.character && typeof obj.character === 'object' && Array.isArray((obj.character as any).attribs))
  ) {
    return { pc: parseRoll20Json(obj), isFullStateBackup: false };
  }

  // 4. Legacy Character parser schema (`classLevel` string + `abilities.str` strings)
  if (
    typeof obj.classLevel === 'string' &&
    obj.abilities &&
    typeof (obj.abilities as any).str === 'string'
  ) {
    const legacy = normalizeCharacter(obj);
    return { pc: evaluateCharacterSheet(mapParsedToPc(legacy)), isFullStateBackup: false };
  }

  // 5. Wrapped `{ pc: ... }` or `{ pcs: [...] }` or `{ character: ... }`
  const target =
    obj.pc && typeof obj.pc === 'object'
      ? (obj.pc as Record<string, unknown>)
      : Array.isArray(obj.pcs) && obj.pcs.length > 0
        ? (obj.pcs[0] as Record<string, unknown>)
        : obj.character && typeof obj.character === 'object'
          ? (obj.character as Record<string, unknown>)
          : obj;

  const isFullStateBackup =
    target._fullStateBackup === true ||
    Boolean(target.hp && target.abilities && target.proficiencies && target.deathSaves);

  const pc = evaluateCharacterSheet(target as Partial<PlayerCharacter> & Record<string, unknown>);
  return { pc, isFullStateBackup };
}

// ---------------------------------------------------------------------------
// Tier 1B: Deterministic Client-Side PDF Parser (AcroForm + Text Layer)
// ---------------------------------------------------------------------------

function decodePdfLiteralString(raw: string): string {
  // Handle UTF-16BE BOM (\xfe\xff or \376\377)
  let s = raw;
  // Unescape octal \ddd and standard escapes
  s = s.replace(/\\([0-7]{1,3}|[nrtbf()\\])/g, (_m, esc: string) => {
    if (esc === 'n') return '\n';
    if (esc === 'r') return '\r';
    if (esc === 't') return '\t';
    if (esc === 'b') return '\b';
    if (esc === 'f') return '\f';
    if (esc === '(' || esc === ')' || esc === '\\') return esc;
    return String.fromCharCode(parseInt(esc, 8));
  });

  if (s.length >= 2 && s.charCodeAt(0) === 0xfe && s.charCodeAt(1) === 0xff) {
    let out = '';
    for (let i = 2; i + 1 < s.length; i += 2) {
      const code = (s.charCodeAt(i) << 8) | s.charCodeAt(i + 1);
      if (code > 0) out += String.fromCharCode(code);
    }
    return out.trim();
  }
  return s.replace(/\0/g, '').trim();
}

function decodePdfHexString(hex: string): string {
  const clean = hex.replace(/\s+/g, '');
  if (clean.toUpperCase().startsWith('FEFF')) {
    let out = '';
    for (let i = 4; i + 3 < clean.length; i += 4) {
      const code = parseInt(clean.slice(i, i + 4), 16);
      if (code > 0) out += String.fromCharCode(code);
    }
    return out.trim();
  }
  let out = '';
  for (let i = 0; i + 1 < clean.length; i += 2) {
    const code = parseInt(clean.slice(i, i + 2), 16);
    if (code > 0) out += String.fromCharCode(code);
  }
  return out.trim();
}

async function decompressBytes(compressed: Uint8Array, format: 'deflate' | 'deflate-raw'): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === 'undefined') return null;
  try {
    const ds = new DecompressionStream(format);
    const writer = ds.writable.getWriter();
    writer.write(new Uint8Array(compressed)).catch(() => {});
    writer.close().catch(() => {});

    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
        if (total > 8 * 1024 * 1024) break;
      }
    }
    const result = new Uint8Array(total);
    let offset = 0;
    for (const c of chunks) {
      result.set(c, offset);
      offset += c.byteLength;
    }
    return result;
  } catch {
    return null;
  }
}

async function extractPdfDecodedCorpus(bytes: Uint8Array): Promise<string> {
  const latin1Decoder = new TextDecoder('latin1');
  const rawText = latin1Decoder.decode(bytes);
  const parts: string[] = [rawText];

  // Locate FlateDecode streams and decompress them so object streams & text layers are visible
  const streamRegex = /stream\r?\n/g;
  let match: RegExpExecArray | null;
  let streamCount = 0;

  while ((match = streamRegex.exec(rawText)) !== null && streamCount < 120) {
    const startIdx = match.index + match[0].length;
    const endIdx = rawText.indexOf('endstream', startIdx);
    if (endIdx === -1) break;

    let sliceEnd = endIdx;
    if (rawText[sliceEnd - 1] === '\n') sliceEnd--;
    if (rawText[sliceEnd - 1] === '\r') sliceEnd--;

    const len = sliceEnd - startIdx;
    if (len > 0 && len < 2 * 1024 * 1024) {
      const headerWindow = rawText.slice(Math.max(0, match.index - 250), match.index);
      if (/FlateDecode/i.test(headerWindow)) {
        streamCount++;
        const sub = bytes.subarray(startIdx, sliceEnd);
        const decompressed =
          (await decompressBytes(sub, 'deflate')) ||
          (await decompressBytes(sub, 'deflate-raw'));
        if (decompressed && decompressed.byteLength > 0) {
          parts.push(latin1Decoder.decode(decompressed));
        }
      }
    }
  }

  return parts.join('\n');
}

export function extractAcroFormFieldsFromCorpus(corpus: string): Record<string, string> {
  const fields: Record<string, string> = {};

  // Match dictionary blocks `<< ... >>` or object bodies containing both `/T` and `/V`
  const dictRegex = /<<([\s\S]*?)>>/g;
  let m: RegExpExecArray | null;
  while ((m = dictRegex.exec(corpus)) !== null) {
    const body = m[1];
    if (!body.includes('/T')) continue;

    const tLit = body.match(/\/T\s*\(((?:\\.|[^\\)])*)\)/);
    const tHex = !tLit ? body.match(/\/T\s*<([0-9A-Fa-f\s]+)>/) : null;
    const rawName = tLit
      ? decodePdfLiteralString(tLit[1])
      : tHex
        ? decodePdfHexString(tHex[1])
        : '';
    if (!rawName) continue;

    let val = '';
    const vLit = body.match(/\/V\s*\(((?:\\.|[^\\)])*)\)/);
    const vHex = !vLit ? body.match(/\/V\s*<([0-9A-Fa-f\s]+)>/) : null;
    const vName = !vLit && !vHex ? body.match(/\/V\s*\/([^\s/>[\]()]+)/) : null;

    if (vLit) {
      val = decodePdfLiteralString(vLit[1]);
    } else if (vHex) {
      val = decodePdfHexString(vHex[1]);
    } else if (vName) {
      val = vName[1];
    }

    if (val && val !== 'Off' && val !== 'No') {
      fields[rawName.trim()] = val.trim();
    }
  }

  return fields;
}

export function extractTextLayerFromCorpus(corpus: string): string {
  const chunks: string[] = [];

  // Extract text from BT ... ET blocks
  const btEtRegex = /BT\b([\s\S]*?)\bET\b/g;
  let btMatch: RegExpExecArray | null;
  while ((btMatch = btEtRegex.exec(corpus)) !== null) {
    const block = btMatch[1];
    const tokenRegex = /\(((?:\\.|[^\\)])*)\)\s*Tj|\[([\s\S]*?)\]\s*TJ/g;
    let tok: RegExpExecArray | null;
    const lineParts: string[] = [];
    while ((tok = tokenRegex.exec(block)) !== null) {
      if (tok[1] !== undefined) {
        lineParts.push(decodePdfLiteralString(tok[1]));
      } else if (tok[2] !== undefined) {
        const inner = tok[2];
        const innerLitRegex = /\(((?:\\.|[^\\)])*)\)/g;
        let inMatch: RegExpExecArray | null;
        let run = '';
        while ((inMatch = innerLitRegex.exec(inner)) !== null) {
          run += decodePdfLiteralString(inMatch[1]);
        }
        if (run) lineParts.push(run);
      }
    }
    if (lineParts.length > 0) {
      chunks.push(lineParts.join(' '));
    }
  }

  return chunks.join('\n');
}

export function parsePdfDeterministicFromCorpus(corpus: string): PlayerCharacter | null {
  const fields = extractAcroFormFieldsFromCorpus(corpus);
  const fieldEntries = Object.entries(fields);

  const getField = (...candidates: string[]): string => {
    for (const cand of candidates) {
      if (fields[cand]) return fields[cand];
      const lower = cand.toLowerCase();
      const found = fieldEntries.find(([k]) => k.toLowerCase() === lower);
      if (found && found[1]) return found[1];
    }
    return '';
  };

  if (fieldEntries.length >= 3) {
    const name = getField(
      'CharacterName',
      'CharacterName 2',
      'Character Name',
      'PC Name',
      'Name',
    );
    const classLevel = getField(
      'ClassLevel',
      'Class & Level',
      'Class and Level',
      'Class',
    );
    const race = getField('Race ', 'Race', 'Species', 'Ancestry');
    const background = getField('Background', 'BG');
    const alignment = getField('Alignment');
    const player = getField('PlayerName', 'Player Name', 'Player');

    const str = getField('STR', 'Strength', 'Score_STR');
    const dex = getField('DEX', 'Dexterity', 'Score_DEX');
    const con = getField('CON', 'Constitution', 'Score_CON');
    const int = getField('INT', 'Intelligence', 'Score_INT');
    const wis = getField('WIS', 'Wisdom', 'Score_WIS');
    const cha = getField('CHA', 'Charisma', 'Score_CHA');

    const rawAbilityModifiers: Partial<Record<AbilityName, number>> = {};
    for (const [ab, keys] of [
      ['STR', ['STRmod', 'STRMod', 'Strength Modifier']],
      ['DEX', ['DEXmod', 'DEXmod ', 'DEXMod', 'Dexterity Modifier']],
      ['CON', ['CONmod', 'CONMod', 'Constitution Modifier']],
      ['INT', ['INTmod', 'INTMod', 'Intelligence Modifier']],
      ['WIS', ['WISmod', 'WISMod', 'Wisdom Modifier']],
      ['CHA', ['CHamod', 'CHAmod', 'CHAMod', 'Charisma Modifier']],
    ] as const) {
      const mStr = getField(...keys);
      if (mStr && /[+-]?\d+/.test(mStr)) {
        rawAbilityModifiers[ab] = parseNum(mStr, 0);
      }
    }

    const ac = getField('AC', 'Armor Class', 'ArmorClass');
    const hpMax = getField('HPMax', 'Max HP', 'HP Max');
    const hpCurrent = getField('HPCurrent', 'Current HP', 'HP Current', 'HP');
    const hpTemp = getField('HPTemp', 'Temp HP');
    const speed = getField('Speed', 'Movement');
    const initiative = getField('Initiative', 'Init');
    const profBonus = getField('ProfBonus', 'Proficiency Bonus');
    const hdTotal = getField('HDTotal', 'Hit Dice Total');
    const hdDie = getField('HD', 'Hit Dice');

    // Collect weapons/attacks
    const attacks: Character['attacks'] = [];
    for (const idx of ['', ' 2', ' 3', ' 4', '1', '2', '3']) {
      const wName = getField(`Wpn Name${idx}`, `Weapon Name ${idx.trim()}`);
      const wAtk = getField(`Wpn${idx.trim() || '1'} AtkBonus`, `Wpn AtkBonus${idx}`);
      const wDmg = getField(`Wpn${idx.trim() || '1'} Damage`, `Wpn Damage${idx}`);
      if (wName) {
        attacks.push({
          name: wName,
          bonus: wAtk || '+0',
          damage: wDmg || '1d6',
          notes: '',
        });
      }
    }

    // Collect proficient saves & skills from AcroForm checkboxes
    const saveProfs: string[] = [];
    for (const [ab, label] of [
      ['STR', 'Strength'],
      ['DEX', 'Dexterity'],
      ['CON', 'Constitution'],
      ['INT', 'Intelligence'],
      ['WIS', 'Wisdom'],
      ['CHA', 'Charisma'],
    ] as const) {
      const chk = getField(`Check Box ${ab}`, `Save_${ab}`, `${label} Save Prof`);
      if (chk && chk !== 'Off') saveProfs.push(ab);
    }

    const skillProfs: string[] = [];
    for (const sk of ALL_SKILLS) {
      const chk = getField(`${sk} Prof`, `Skill_${sk}`, `Check_${sk}`);
      if (chk && chk !== 'Off') skillProfs.push(sk);
    }

    // Collect spells from AcroForm fields `Spells 1014`..`Spells 1099` or `Spell_1`..
    const spellEntries: string[] = [];
    for (const [k, v] of fieldEntries) {
      if (/^Spells?\s+\d+/i.test(k) && v) {
        spellEntries.push(v);
      }
    }

    // Collect spell slots from AcroForm `SlotsTotal 19`..`SlotsTotal 27` (WotC 2014 sheet)
    const spellSlots: Partial<Record<SpellSlotLevel, SpellSlot>> = {};
    for (let lvl = 1; lvl <= 9; lvl++) {
      const wotcFieldIdx = 18 + lvl; // 19 = Lvl 1, 20 = Lvl 2, ...
      const totalStr = getField(`SlotsTotal ${wotcFieldIdx}`, `SpellSlots_${lvl}`, `Slots_${lvl}`);
      const remStr = getField(`SlotsRemaining ${wotcFieldIdx}`, `SlotsUsed_${lvl}`);
      const maxSlots = parseNum(totalStr, 0);
      if (maxSlots > 0) {
        const rem = remStr ? parseNum(remStr, maxSlots) : maxSlots;
        const used = Math.max(0, Math.min(maxSlots, maxSlots - rem));
        spellSlots[lvl as SpellSlotLevel] = { max: maxSlots, used };
      }
    }

    const charRecord: Character = normalizeCharacter({
      name,
      player,
      race,
      classLevel,
      background,
      alignment,
      abilities: {
        str: str || '10',
        dex: dex || '10',
        con: con || '10',
        int: int || '10',
        wis: wis || '10',
        cha: cha || '10',
      },
      saves: getField('SavingThrows', 'Saves') || saveProfs.join(', '),
      skills: getField('Skills') || skillProfs.join(', '),
      ac,
      hp: hpCurrent,
      hpMax: hpMax || hpCurrent,
      initiative,
      speed,
      profBonus,
      hitDice: hdDie || hdTotal,
      attacks,
      equipment: getField('Equipment', 'Inventory'),
      currency: {
        cp: getField('CP'),
        sp: getField('SP'),
        ep: getField('EP'),
        gp: getField('GP'),
        pp: getField('PP'),
      },
      features: [
        getField('Features and Traits', 'FeaturesTraits', 'Features'),
        getField('Feat+Traits'),
      ]
        .filter(Boolean)
        .join('\n'),
      personality: getField('PersonalityTraits ', 'PersonalityTraits'),
      ideals: getField('Ideals'),
      bonds: getField('Bonds'),
      flaws: getField('Flaws'),
      spells: [getField('Spells'), ...spellEntries].filter(Boolean).join('\n'),
      notes: getField('Backstory', 'Notes', 'Allies'),
    });

    const mapped = mapParsedToPc(charRecord);
    if (hpTemp) {
      mapped.hp.temp = Math.max(0, parseNum(hpTemp, 0));
    }
    if (Object.keys(spellSlots).length > 0) {
      mapped.spellSlots = spellSlots;
    }
    const cp = parseNum(getField('CP'), 0);
    const sp = parseNum(getField('SP'), 0);
    const ep = parseNum(getField('EP'), 0);
    const gp = parseNum(getField('GP'), 0);
    const pp = parseNum(getField('PP'), 0);
    if (cp || sp || ep || gp || pp) {
      mapped.currency = { cp, sp, ep, gp, pp };
    }

    const hasMeaningfulData =
      Boolean(mapped.name && mapped.name !== 'Unnamed') &&
      (mapped.classes.length > 0 ||
        mapped.hp.max > 0 ||
        Object.values(mapped.abilities).some((v) => v !== 10));

    if (hasMeaningfulData) {
      return evaluateCharacterSheet({
        ...mapped,
        ...(Object.keys(rawAbilityModifiers).length > 0
          ? { abilityModifiers: rawAbilityModifiers as Record<AbilityName, number> }
          : {}),
      });
    }
  }

  // Fallback within Tier 1: Check structured text layer in PDF
  const textLayer = extractTextLayerFromCorpus(corpus) || corpus;
  const nameMatch = textLayer.match(/(?:Character\s*Name|Name)\s*[:=-]\s*([^\n\r]+)/i);
  const classMatch = textLayer.match(/(?:Class\s*(?:&|and)?\s*Level|Class)\s*[:=-]\s*([^\n\r]+)/i);
  const raceMatch = textLayer.match(/(?:Race|Species|Ancestry)\s*[:=-]\s*([^\n\r]+)/i);
  const bgMatch = textLayer.match(/Background\s*[:=-]\s*([^\n\r]+)/i);
  const acMatch = textLayer.match(/(?:Armor\s*Class|AC)\s*[:=-]?\s*(\d{1,2})/i);
  const hpMatch = textLayer.match(/(?:Max\s*HP|HP\s*Max|Hit\s*Points|HP)\s*[:=-]?\s*(\d{1,4})(?:\s*\/\s*(\d{1,4}))?/i);
  const speedMatch = textLayer.match(/Speed\s*[:=-]?\s*(\d{1,3})/i);

  const abilityScores: Partial<Record<AbilityName, number>> = {};
  for (const [ab, pattern] of [
    ['STR', /\b(?:STR|Strength)\s*[:=-]?\s*(\d{1,2})\b/i],
    ['DEX', /\b(?:DEX|Dexterity)\s*[:=-]?\s*(\d{1,2})\b/i],
    ['CON', /\b(?:CON|Constitution)\s*[:=-]?\s*(\d{1,2})\b/i],
    ['INT', /\b(?:INT|Intelligence)\s*[:=-]?\s*(\d{1,2})\b/i],
    ['WIS', /\b(?:WIS|Wisdom)\s*[:=-]?\s*(\d{1,2})\b/i],
    ['CHA', /\b(?:CHA|Charisma)\s*[:=-]?\s*(\d{1,2})\b/i],
  ] as const) {
    const m = textLayer.match(pattern);
    if (m) abilityScores[ab] = parseInt(m[1], 10);
  }

  if (nameMatch && (classMatch || Object.keys(abilityScores).length >= 3 || hpMatch)) {
    const hp1 = hpMatch ? parseInt(hpMatch[1], 10) : 0;
    const hp2 = hpMatch && hpMatch[2] ? parseInt(hpMatch[2], 10) : hp1;
    const parsedChar = normalizeCharacter({
      name: nameMatch[1].trim(),
      classLevel: classMatch ? classMatch[1].trim() : 'Fighter 1',
      race: raceMatch ? raceMatch[1].trim() : '',
      background: bgMatch ? bgMatch[1].trim() : '',
      ac: acMatch ? acMatch[1] : '10',
      hp: String(hp1),
      hpMax: String(hp2),
      speed: speedMatch ? speedMatch[1] : '30',
      abilities: {
        str: String(abilityScores.STR ?? 10),
        dex: String(abilityScores.DEX ?? 10),
        con: String(abilityScores.CON ?? 10),
        int: String(abilityScores.INT ?? 10),
        wis: String(abilityScores.WIS ?? 10),
        cha: String(abilityScores.CHA ?? 10),
      },
    });
    return evaluateCharacterSheet(mapParsedToPc(parsedChar));
  }

  return null;
}

/**
 * Universal Two-Tier Hybrid Character Sheet Parser:
 *
 * - Tier 1 (Client-Side Deterministic): Instant, free, offline-capable extraction
 *   for `.json` (D&D Beyond, Foundry, Roll20, GM Assistant) and fillable/structured `.pdf`
 *   (WotC 2014/2024 AcroForm, D&D Beyond PDF, MPMB).
 * - Tier 2 (Multimodal LLM Fallback via `/api/parse-character-sheet`): Invoked automatically
 *   for screenshots/photos (`.png`, `.jpg`, `.jpeg`, `.webp`) or flattened PDFs where
 *   Tier 1 extraction is incomplete.
 */
export async function parseCharacterSheetFile(
  file: File,
  options: ParseCharacterSheetOptions = {},
): Promise<ParseCharacterSheetResult> {
  const fileName = (file.name || '').toLowerCase();
  const mime = (file.type || '').toLowerCase();

  // 1. Tier 1 JSON deterministic parser
  if (fileName.endsWith('.json') || mime === 'application/json') {
    const text = await file.text();
    const { pc, isFullStateBackup } = parseCharacterJsonString(text);
    return {
      pc,
      evaluation: pc.evaluation!,
      tier: 'tier1',
      isFullStateBackup,
    };
  }

  // 2. Tier 1 PDF AcroForm + structured text deterministic parser
  if (fileName.endsWith('.pdf') || mime === 'application/pdf') {
    try {
      const buf = new Uint8Array(await file.arrayBuffer());
      const corpus = await extractPdfDecodedCorpus(buf);
      const tier1Pc = parsePdfDeterministicFromCorpus(corpus);
      if (tier1Pc) {
        return {
          pc: tier1Pc,
          evaluation: tier1Pc.evaluation!,
          tier: 'tier1',
        };
      }
    } catch (err) {
      console.warn('[characterSheetParser] Tier 1 PDF extraction incomplete, falling back to Tier 2:', err);
    }
  }

  // 3. Tier 2 Multimodal LLM Fallback (`/api/parse-character-sheet`)
  const fetchFn = options.fetchImpl ?? fetch;
  const form = new FormData();
  form.append('file', file);
  if (options.shareToken) {
    form.append('shareToken', options.shareToken);
  }

  const headers: Record<string, string> = {};
  if (options.idToken) {
    headers.Authorization = `Bearer ${options.idToken}`;
  }
  if (options.shareToken) {
    headers['X-Share-Token'] = options.shareToken;
  }

  const res = await fetchFn('/api/parse-character-sheet', {
    method: 'POST',
    headers,
    body: form,
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || `Sheet parse failed (${res.status})`);
  }

  const pc = body.pc
    ? evaluateCharacterSheet(body.pc)
    : evaluateCharacterSheet(mapParsedToPc(normalizeCharacter(body.character)));

  return {
    pc,
    evaluation: pc.evaluation!,
    tier: 'tier2',
  };
}
