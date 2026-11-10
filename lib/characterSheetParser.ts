import { PDFCheckBox, PDFDocument, PDFDropdown, PDFOptionList, PDFTextField } from 'pdf-lib';
import {
  ABILITY_NAMES,
  type AbilityName,
  type Attack,
  type FeatureEntry,
  type InventoryItem,
  type PcClass,
  type PlayerCharacter,
  type SkillName,
} from './pc/types';
import { ALL_SKILLS } from './pc/skills';
import { emptyPc, makePcId, normalizePc } from './pc/factory';
import { characterToPc } from './pc/from-parser';
import { normalizeCharacter } from './character-schema';
import { evaluateCharacterSheet, type EvaluatedPlayerCharacter } from './characterEvaluator';
import { findMatchingExistingPc, mergeUploadedCharacterSheet } from './characterMerge';
import { GM_ASSISTANT_PDF_META_PREFIX } from './characterPdfExporter';

export type SheetParseTier = 'tier1-lossless' | 'tier1-acroform' | 'tier1-json' | 'tier1-text' | 'tier2-multimodal';

export type CharacterSheetParseOptions = {
  /** Filename hint (e.g. "Aria-Lv5-Sheet.pdf", "ddb-export.json", "sheet.png") */
  filename?: string;
  /** Mime type hint */
  mimeType?: string;
  /** Existing PC to state-preserving delta-merge against */
  existingPc?: Partial<PlayerCharacter> & Record<string, unknown>;
  /** Existing PCs roster to auto-match by targetPcId, targetSlotId, or normalized character name */
  existingPcs?: Array<Partial<PlayerCharacter> & Record<string, unknown>>;
  /** Optional explicit target PC ID when uploading into a specific slot */
  targetPcId?: string;
  /** Optional explicit player slot ID when uploading from /player share view */
  targetSlotId?: string;
  /** Optional Firebase ID token for Tier 2 API fallback */
  authToken?: string;
  /** Optional /player share-link capability token for Tier 2 API fallback */
  shareToken?: string;
  /** Force offline Tier 1 only (never call network Tier 2) */
  offlineOnly?: boolean;
  /** Custom fetch implementation for testing */
  fetchImpl?: typeof fetch;
};

export type CharacterSheetParseResult = {
  pc: EvaluatedPlayerCharacter;
  tier: SheetParseTier;
  mergedWithExisting: boolean;
  matchedPcId?: string;
  previousPcSnapshot?: PlayerCharacter;
};

function decodeUtf8Base64(b64: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(b64, 'base64').toString('utf-8');
  }
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

function uint8ToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...Array.from(chunk));
  }
  return btoa(binary);
}

function isBinaryFileLike(input: unknown): boolean {
  if (!input || typeof input !== 'object') return false;
  if (input instanceof Uint8Array || input instanceof ArrayBuffer) return true;
  if (typeof Blob !== 'undefined' && input instanceof Blob) return true;
  const rec = input as Record<string, unknown>;
  if (rec.bytes instanceof Uint8Array) return true;
  if (typeof rec.arrayBuffer === 'function') return true;
  return false;
}

async function toUint8Array(
  input: Uint8Array | ArrayBuffer | Blob | File | string | Record<string, unknown>,
): Promise<Uint8Array> {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (typeof Blob !== 'undefined' && input instanceof Blob) {
    const buf = await input.arrayBuffer();
    return new Uint8Array(buf);
  }
  if (input && typeof input === 'object') {
    const rec = input as Record<string, unknown>;
    if (rec.bytes instanceof Uint8Array) return rec.bytes;
    if (typeof rec.arrayBuffer === 'function') {
      const buf = await (rec.arrayBuffer as () => Promise<ArrayBuffer>)();
      return new Uint8Array(buf);
    }
  }
  if (typeof input === 'string') {
    return new TextEncoder().encode(input);
  }
  return new Uint8Array(0);
}

function parseIntSafe(val: unknown, fallback = 0): number {
  if (typeof val === 'number' && Number.isFinite(val)) return Math.round(val);
  if (typeof val === 'string') {
    const cleaned = val.replace(/[^\d+-]/g, '');
    const parsed = parseInt(cleaned, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

// ============================================================================
// Tier 1 JSON Parser (GM Assistant, D&D Beyond, Foundry VTT, Roll20)
// ============================================================================

const DDB_STAT_ID_MAP: Record<number, AbilityName> = {
  1: 'STR',
  2: 'DEX',
  3: 'CON',
  4: 'INT',
  5: 'WIS',
  6: 'CHA',
};

const FOUNDRY_ABILITY_MAP: Record<string, AbilityName> = {
  str: 'STR',
  dex: 'DEX',
  con: 'CON',
  int: 'INT',
  wis: 'WIS',
  cha: 'CHA',
};

function matchSkillName(raw: string): SkillName | null {
  const clean = raw.trim().toLowerCase().replace(/[_-]/g, ' ');
  const aliases: Record<string, SkillName> = {
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
  if (aliases[clean]) return aliases[clean];
  for (const sk of ALL_SKILLS) {
    if (sk.toLowerCase() === clean || clean.includes(sk.toLowerCase())) {
      return sk;
    }
  }
  return null;
}

function parseDndBeyondJson(raw: Record<string, unknown>): Partial<PlayerCharacter> {
  const data = (raw.data && typeof raw.data === 'object' ? raw.data : raw) as Record<string, unknown>;
  const abilities: Record<AbilityName, number> = {
    STR: 10,
    DEX: 10,
    CON: 10,
    INT: 10,
    WIS: 10,
    CHA: 10,
  };

  if (Array.isArray(data.stats)) {
    for (const st of data.stats) {
      if (st && typeof st === 'object') {
        const s = st as Record<string, unknown>;
        const ab = DDB_STAT_ID_MAP[Number(s.id)];
        if (ab && typeof s.value === 'number') {
          abilities[ab] = s.value;
        }
      }
    }
  }
  if (Array.isArray(data.bonusStats)) {
    for (const st of data.bonusStats) {
      if (st && typeof st === 'object') {
        const s = st as Record<string, unknown>;
        const ab = DDB_STAT_ID_MAP[Number(s.id)];
        if (ab && typeof s.value === 'number') {
          abilities[ab] += s.value;
        }
      }
    }
  }
  if (Array.isArray(data.overrideStats)) {
    for (const st of data.overrideStats) {
      if (st && typeof st === 'object') {
        const s = st as Record<string, unknown>;
        const ab = DDB_STAT_ID_MAP[Number(s.id)];
        if (ab && typeof s.value === 'number' && s.value > 0) {
          abilities[ab] = s.value;
        }
      }
    }
  }

  const classes: PcClass[] = [];
  if (Array.isArray(data.classes)) {
    for (const c of data.classes) {
      if (c && typeof c === 'object') {
        const clsObj = c as Record<string, unknown>;
        const def = (clsObj.definition as Record<string, unknown>) || {};
        const subDef = (clsObj.subclassDefinition as Record<string, unknown>) || {};
        classes.push({
          name: String(def.name || clsObj.name || 'Adventurer'),
          level: parseIntSafe(clsObj.level, 1),
          ...(subDef.name ? { subclass: String(subDef.name) } : {}),
        });
      }
    }
  }

  const totalLevel =
    classes.reduce((sum, c) => sum + c.level, 0) || parseIntSafe(data.level, 1);

  const raceObj = (data.race as Record<string, unknown>) || {};
  const race = String(raceObj.fullName || raceObj.baseName || data.race || '');

  const bgObj = (data.background as Record<string, unknown>) || {};
  const bgDef = (bgObj.definition as Record<string, unknown>) || {};
  const background = String(bgDef.name || bgObj.name || data.background || '');

  const baseHp = parseIntSafe(data.baseHitPoints, 0) + parseIntSafe(data.bonusHitPoints, 0);
  const overrideHp = parseIntSafe(data.overrideHitPoints, 0);
  const conMod = Math.floor((abilities.CON - 10) / 2);
  const maxHp = overrideHp > 0 ? overrideHp : Math.max(1, baseHp + conMod * totalLevel);
  const removedHp = parseIntSafe(data.removedHitPoints, 0);
  const currentHp = Math.max(0, maxHp - removedHp);
  const tempHp = parseIntSafe(data.temporaryHitPoints, 0);

  const inventory: InventoryItem[] = [];
  const attacks: Attack[] = [];
  if (Array.isArray(data.inventory)) {
    for (const it of data.inventory) {
      if (it && typeof it === 'object') {
        const itemObj = it as Record<string, unknown>;
        const def = (itemObj.definition as Record<string, unknown>) || itemObj;
        const name = String(def.name || 'Item');
        const qty = parseIntSafe(itemObj.quantity ?? itemObj.qty, 1);
        const equipped = itemObj.equipped === true;
        const attuned = itemObj.isAttuned === true || itemObj.attuned === true;
        inventory.push({
          id: makePcId(),
          name,
          qty,
          equipped,
          attuned,
          ...(typeof def.weight === 'number' ? { weight: def.weight } : {}),
        });
        if (def.damage && typeof def.damage === 'object') {
          const dmg = def.damage as Record<string, unknown>;
          attacks.push({
            id: makePcId(),
            name,
            attackBonus: Math.floor((abilities.STR - 10) / 2) + Math.floor((totalLevel - 1) / 4) + 2,
            damageExpr: String(dmg.diceString || '1d8'),
            damageType: String(def.damageType || 'slashing').toLowerCase(),
            range: def.range ? `${def.range} ft.` : '5 ft.',
          });
        }
      }
    }
  }

  const currencies = (data.currencies as Record<string, unknown>) || {};
  const currency = {
    cp: parseIntSafe(currencies.cp, 0),
    sp: parseIntSafe(currencies.sp, 0),
    ep: parseIntSafe(currencies.ep, 0),
    gp: parseIntSafe(currencies.gp, 0),
    pp: parseIntSafe(currencies.pp, 0),
  };

  const spellsKnown: string[] = [];
  if (Array.isArray(data.classSpells)) {
    for (const cs of data.classSpells) {
      const csObj = (cs as Record<string, unknown>) || {};
      if (Array.isArray(csObj.spells)) {
        for (const sp of csObj.spells) {
          const spDef = ((sp as Record<string, unknown>)?.definition as Record<string, unknown>) || {};
          if (spDef.name) spellsKnown.push(String(spDef.name));
        }
      }
    }
  }

  return {
    name: String(data.name || 'Unnamed Hero'),
    level: totalLevel,
    classes,
    race,
    background,
    abilities,
    hp: { current: currentHp, max: maxHp, temp: tempHp },
    ac: parseIntSafe(data.armorClass, 10 + Math.floor((abilities.DEX - 10) / 2)),
    speed: parseIntSafe(
      ((data.race as Record<string, unknown>)?.weightSpeeds as Record<string, Record<string, unknown>>)?.normal?.walk,
      30,
    ),
    inventory,
    attacks,
    currency,
    spellsKnown,
  };
}

function parseFoundryActorJson(raw: Record<string, unknown>): Partial<PlayerCharacter> {
  const sys = (raw.system as Record<string, unknown>) || (raw.data as Record<string, unknown>) || {};
  const abilities: Record<AbilityName, number> = {
    STR: 10,
    DEX: 10,
    CON: 10,
    INT: 10,
    WIS: 10,
    CHA: 10,
  };
  const savingThrows: AbilityName[] = [];

  const sysAbilities = (sys.abilities as Record<string, Record<string, unknown>>) || {};
  for (const [k, abName] of Object.entries(FOUNDRY_ABILITY_MAP)) {
    const entry = sysAbilities[k] || sysAbilities[abName];
    if (entry && typeof entry === 'object') {
      abilities[abName] = parseIntSafe(entry.value, 10);
      if (Number(entry.proficient) >= 1) {
        savingThrows.push(abName);
      }
    }
  }

  const skills: SkillName[] = [];
  const skillExpertise: SkillName[] = [];
  const sysSkills = (sys.skills as Record<string, Record<string, unknown>>) || {};
  for (const [skKey, skVal] of Object.entries(sysSkills)) {
    const matched = matchSkillName(skKey);
    if (matched && skVal && typeof skVal === 'object') {
      const val = Number(skVal.value ?? skVal.proficient ?? 0);
      if (val >= 1) skills.push(matched);
      if (val >= 2) skillExpertise.push(matched);
    }
  }

  const attrs = (sys.attributes as Record<string, Record<string, unknown>>) || {};
  const hpObj = attrs.hp || {};
  const acObj = attrs.ac || {};
  const moveObj = attrs.movement || {};
  const details = (sys.details as Record<string, unknown>) || {};

  const classes: PcClass[] = [];
  const inventory: InventoryItem[] = [];
  const attacks: Attack[] = [];
  const features: FeatureEntry[] = [];
  const spellsKnown: string[] = [];

  if (Array.isArray(raw.items)) {
    for (const item of raw.items) {
      if (!item || typeof item !== 'object') continue;
      const it = item as Record<string, unknown>;
      const itSys = (it.system as Record<string, unknown>) || {};
      const type = String(it.type || '').toLowerCase();
      const name = String(it.name || '');

      if (type === 'class') {
        classes.push({
          name,
          level: parseIntSafe(itSys.levels ?? itSys.level, 1),
          ...(itSys.subclass ? { subclass: String(itSys.subclass) } : {}),
        });
      } else if (type === 'spell') {
        if (name) spellsKnown.push(name);
      } else if (type === 'feat' || type === 'feature') {
        features.push({
          id: makePcId(),
          name,
          source: String(itSys.requirements || 'Class/Feat'),
          description: String(
            (itSys.description as Record<string, unknown>)?.value || itSys.description || '',
          ).replace(/<[^>]+>/g, ''),
        });
      } else if (type === 'weapon' || type === 'equipment' || type === 'loot' || type === 'consumable') {
        inventory.push({
          id: makePcId(),
          name,
          qty: parseIntSafe(itSys.quantity, 1),
          equipped: itSys.equipped === true,
          attuned: itSys.attunement === 2 || itSys.attuned === true,
          ...(typeof itSys.weight === 'number' ? { weight: itSys.weight } : {}),
        });
        if (type === 'weapon') {
          attacks.push({
            id: makePcId(),
            name,
            attackBonus: parseIntSafe(itSys.attackBonus, 5),
            damageExpr: '1d8',
            damageType: 'slashing',
            range: '5 ft.',
          });
        }
      }
    }
  }

  const totalLevel =
    classes.reduce((sum, c) => sum + c.level, 0) || parseIntSafe(details.level, 1);
  const currObj = (sys.currency as Record<string, unknown>) || {};

  return {
    name: String(raw.name || 'Unnamed Hero'),
    level: totalLevel,
    classes,
    race: String(
      (details.race as Record<string, unknown>)?.name || details.race || details.species || '',
    ),
    background: String(
      (details.background as Record<string, unknown>)?.name || details.background || '',
    ),
    alignment: String(details.alignment || ''),
    abilities,
    proficiencies: {
      savingThrows,
      skills,
      languages: [],
      tools: [],
      armor: [],
      weapons: [],
    },
    skillExpertise,
    hp: {
      current: parseIntSafe(hpObj.value, 10),
      max: parseIntSafe(hpObj.max, 10),
      temp: parseIntSafe(hpObj.temp, 0),
    },
    ac: parseIntSafe(acObj.value ?? acObj.flat, 10),
    speed: parseIntSafe(moveObj.walk ?? attrs.speed?.value, 30),
    inventory,
    attacks,
    features,
    spellsKnown,
    currency: {
      cp: parseIntSafe(currObj.cp, 0),
      sp: parseIntSafe(currObj.sp, 0),
      ep: parseIntSafe(currObj.ep, 0),
      gp: parseIntSafe(currObj.gp, 0),
      pp: parseIntSafe(currObj.pp, 0),
    },
  };
}

function parseRoll20Json(raw: Record<string, unknown>): Partial<PlayerCharacter> {
  const charRoot =
    raw.character && typeof raw.character === 'object'
      ? (raw.character as Record<string, unknown>)
      : raw;
  const attribs = Array.isArray(charRoot.attribs)
    ? (charRoot.attribs as Array<Record<string, unknown>>)
    : [];

  const attrMap = new Map<string, { current: string; max: string }>();
  for (const a of attribs) {
    if (a && typeof a.name === 'string') {
      attrMap.set(a.name.toLowerCase(), {
        current: String(a.current ?? ''),
        max: String(a.max ?? ''),
      });
    }
  }

  const getAttr = (key: string, fb = '') => attrMap.get(key.toLowerCase())?.current || fb;

  const abilities: Record<AbilityName, number> = {
    STR: parseIntSafe(getAttr('strength', '10'), 10),
    DEX: parseIntSafe(getAttr('dexterity', '10'), 10),
    CON: parseIntSafe(getAttr('constitution', '10'), 10),
    INT: parseIntSafe(getAttr('intelligence', '10'), 10),
    WIS: parseIntSafe(getAttr('wisdom', '10'), 10),
    CHA: parseIntSafe(getAttr('charisma', '10'), 10),
  };

  const hpEntry = attrMap.get('hp');
  const maxHp = parseIntSafe(hpEntry?.max || getAttr('hp_max', '10'), 10);
  const currentHp = parseIntSafe(hpEntry?.current || String(maxHp), maxHp);
  const level = parseIntSafe(getAttr('level', '1'), 1);
  const className = getAttr('class', 'Fighter');

  return {
    name: String(charRoot.name || getAttr('character_name', 'Unnamed Hero')),
    level,
    classes: className ? [{ name: className, level }] : [],
    race: getAttr('race') || getAttr('species'),
    background: getAttr('background'),
    alignment: getAttr('alignment'),
    abilities,
    hp: {
      current: currentHp,
      max: maxHp,
      temp: parseIntSafe(getAttr('hp_temp', '0'), 0),
    },
    ac: parseIntSafe(getAttr('ac', '10'), 10),
    speed: parseIntSafe(getAttr('speed', '30'), 30),
    currency: {
      cp: parseIntSafe(getAttr('cp', '0'), 0),
      sp: parseIntSafe(getAttr('sp', '0'), 0),
      ep: parseIntSafe(getAttr('ep', '0'), 0),
      gp: parseIntSafe(getAttr('gp', '0'), 0),
      pp: parseIntSafe(getAttr('pp', '0'), 0),
    },
  };
}

export function parseJsonCharacterSheetTier1(
  jsonInput: string | Record<string, unknown>,
): PlayerCharacter {
  const obj =
    typeof jsonInput === 'string'
      ? (JSON.parse(jsonInput) as Record<string, unknown>)
      : jsonInput;

  // 1. D&D Beyond JSON format (`stats` array with numeric IDs 1..6 or `data.stats`)
  const ddbCandidate = (obj.data && typeof obj.data === 'object' ? obj.data : obj) as Record<
    string,
    unknown
  >;
  if (Array.isArray(ddbCandidate.stats) && ddbCandidate.stats.length >= 6) {
    return normalizePc(parseDndBeyondJson(obj));
  }

  // 2. Foundry VTT Actor JSON format (`system.abilities.str` or `type === 'character'`)
  if (
    (obj.system && typeof obj.system === 'object' && (obj.system as Record<string, unknown>).abilities) ||
    (obj.type === 'character' && obj.data && typeof obj.data === 'object')
  ) {
    return normalizePc(parseFoundryActorJson(obj));
  }

  // 3. Roll20 Character JSON format (`attribs` array)
  if (
    Array.isArray(obj.attribs) ||
    (obj.character &&
      typeof obj.character === 'object' &&
      Array.isArray((obj.character as Record<string, unknown>).attribs))
  ) {
    return normalizePc(parseRoll20Json(obj));
  }

  // 4. Legacy GM Assistant `Character` schema (`classLevel`, `hpMax`, `profBonus`)
  if (
    typeof obj.classLevel === 'string' ||
    typeof obj.hpMax !== 'undefined' ||
    typeof obj.profBonus !== 'undefined'
  ) {
    const legacyChar = normalizeCharacter(obj);
    return characterToPc(legacyChar);
  }

  // 5. Native GM Assistant `PlayerCharacter` JSON
  return normalizePc(obj);
}

// ============================================================================
// Tier 1 PDF Parser (Lossless Metadata + AcroForm Fields + Text Layer)
// ============================================================================

function overlayAcroFormEditsOntoPc(
  basePc: PlayerCharacter,
  fieldMap: Map<string, string>,
): PlayerCharacter {
  const get = (...keys: string[]) => {
    for (const k of keys) {
      const v = fieldMap.get(k.toLowerCase());
      if (v !== undefined) return v;
    }
    return undefined;
  };
  const pc = normalizePc(basePc);

  const name = get('pc_name', 'charactername');
  if (name) pc.name = name;

  const species = get('pc_species', 'race', 'race ');
  if (species && species !== '-') pc.race = species;

  const bg = get('pc_background', 'background');
  if (bg && bg !== '-') pc.background = bg;

  const align = get('pc_alignment', 'alignment');
  if (align && align !== '-') pc.alignment = align;

  const levelStr = get('pc_level', 'level');
  if (levelStr) pc.level = Math.max(1, Math.min(20, parseIntSafe(levelStr, pc.level)));

  for (const ab of ABILITY_NAMES) {
    const scoreStr = get(`ab_${ab}`, ab);
    if (scoreStr) {
      pc.abilities[ab] = Math.max(1, Math.min(30, parseIntSafe(scoreStr, pc.abilities[ab])));
    }
  }

  const hpCur = get('hp_current', 'hpcurrent');
  if (hpCur !== undefined) pc.hp.current = parseIntSafe(hpCur, pc.hp.current);

  const hpMax = get('hp_max', 'hpmax');
  if (hpMax !== undefined) pc.hp.max = parseIntSafe(hpMax, pc.hp.max);

  const hpTemp = get('hp_temp', 'hptemp');
  if (hpTemp !== undefined) pc.hp.temp = parseIntSafe(hpTemp, pc.hp.temp);

  const ac = get('ac');
  if (ac !== undefined) pc.ac = parseIntSafe(ac, pc.ac);

  const init = get('initiative', 'init');
  if (init !== undefined) pc.initiativeMod = parseIntSafe(init, pc.initiativeMod);

  const speed = get('speed');
  if (speed !== undefined) pc.speed = parseIntSafe(speed, pc.speed);

  const exh = get('exhaustion');
  if (exh !== undefined) {
    pc.exhaustion = Math.max(0, Math.min(6, parseIntSafe(exh, pc.exhaustion))) as PlayerCharacter['exhaustion'];
  }

  const insp = get('inspiration');
  if (insp !== undefined) {
    pc.inspiration = insp === 'true' || insp === 'Yes' || insp === 'On' || insp === '1';
  }

  for (const ck of ['cp', 'sp', 'ep', 'gp', 'pp'] as const) {
    const cVal = get(`coin_${ck}`, ck);
    if (cVal !== undefined) {
      if (!pc.currency) {
        pc.currency = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
      }
      pc.currency[ck] = Math.max(0, parseIntSafe(cVal, pc.currency[ck]));
    }
  }

  return pc;
}

function mapAcroFormFieldsToPc(fieldMap: Map<string, string>): Partial<PlayerCharacter> {
  const findField = (candidates: string[]): string => {
    for (const c of candidates) {
      const exact = fieldMap.get(c.toLowerCase());
      if (exact !== undefined && exact.trim() !== '') return exact.trim();
    }
    for (const [k, v] of fieldMap.entries()) {
      if (!v || !v.trim()) continue;
      for (const c of candidates) {
        if (k === c.toLowerCase() || k.replace(/[^a-z0-9]/g, '') === c.toLowerCase().replace(/[^a-z0-9]/g, '')) {
          return v.trim();
        }
      }
    }
    return '';
  };

  const name = findField([
    'pc_name',
    'CharacterName',
    'CharacterName 2',
    'Character Name',
    'Name',
    'charname',
  ]);
  const classLevelRaw = findField([
    'pc_class_level',
    'ClassLevel',
    'Class & Level',
    'Class and Level',
    'Class',
  ]);
  const levelRaw = findField(['pc_level', 'Level', 'TotalLevel', 'CharacterLevel']);
  const race = findField(['pc_species', 'Race', 'Race ', 'Species', 'Ancestry']);
  const background = findField(['pc_background', 'Background']);
  const alignment = findField(['pc_alignment', 'Alignment']);

  const abilities: Record<AbilityName, number> = {
    STR: parseIntSafe(findField(['ab_STR', 'STR', 'Strength', 'STRscore']), 10),
    DEX: parseIntSafe(findField(['ab_DEX', 'DEX', 'Dexterity', 'DEXscore']), 10),
    CON: parseIntSafe(findField(['ab_CON', 'CON', 'Constitution', 'CONscore']), 10),
    INT: parseIntSafe(findField(['ab_INT', 'INT', 'Intelligence', 'INTscore']), 10),
    WIS: parseIntSafe(findField(['ab_WIS', 'WIS', 'Wisdom', 'WISscore']), 10),
    CHA: parseIntSafe(findField(['ab_CHA', 'CHA', 'Charisma', 'CHAscore']), 10),
  };

  const maxHp = parseIntSafe(
    findField(['hp_max', 'HPMax', 'MaxHP', 'Max HP', 'HP Max']),
    0,
  );
  const currentHp = parseIntSafe(
    findField(['hp_current', 'HPCurrent', 'CurrentHP', 'Current HP', 'HP']),
    maxHp,
  );
  const tempHp = parseIntSafe(
    findField(['hp_temp', 'HPTemp', 'TempHP', 'Temporary HP']),
    0,
  );

  const ac = parseIntSafe(findField(['ac', 'AC', 'ArmorClass', 'Armor Class']), 10);
  const speed = parseIntSafe(findField(['speed', 'Speed', 'Movement']), 30);
  const initiativeMod = parseIntSafe(
    findField(['initiative', 'Initiative', 'Init']),
    Math.floor((abilities.DEX - 10) / 2),
  );

  const savingThrows: AbilityName[] = [];
  for (const ab of ABILITY_NAMES) {
    const profVal = findField([
      `save_prof_${ab}`,
      `ST ${ab}`,
      `${ab}SaveProf`,
      `Check Box ${ab}`,
    ]);
    if (profVal === 'true' || profVal === 'Yes' || profVal === 'On' || profVal === '1') {
      savingThrows.push(ab);
    }
  }

  const skills: SkillName[] = [];
  for (const sk of ALL_SKILLS) {
    const profVal = findField([`skill_prof_${sk}`, `${sk}Prof`, `${sk} Check`]);
    if (profVal === 'true' || profVal === 'Yes' || profVal === 'On' || profVal === '1') {
      skills.push(sk);
    }
  }

  const attacks: Attack[] = [];
  for (let i = 1; i <= 5; i++) {
    const wpnName = findField([
      `Wpn Name ${i === 1 ? '' : i}`.trim(),
      `Wpn Name ${i}`,
      `Weapon ${i}`,
      `attack_name_${i}`,
    ]);
    if (wpnName) {
      const atkBonus = parseIntSafe(
        findField([`Wpn${i} AtkBonus`, `Wpn${i} AtkBonus `, `attack_bonus_${i}`]),
        5,
      );
      const dmgRaw = findField([`Wpn${i} Damage`, `Wpn${i} Damage `, `attack_dmg_${i}`]) || '1d8';
      const parts = dmgRaw.split(/\s+/);
      attacks.push({
        id: makePcId(),
        name: wpnName,
        attackBonus: atkBonus,
        damageExpr: parts[0] || '1d8',
        damageType: parts.slice(1).join(' ') || 'slashing',
        range: '5 ft.',
      });
    }
  }

  const equipRaw = findField(['equipment_text', 'Equipment', 'Inventory']);
  const inventory: InventoryItem[] = equipRaw
    ? equipRaw
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter((s) => s && s !== 'No equipment listed')
        .map((itemStr) => {
          const equipped = itemStr.includes('[E]');
          const attuned = itemStr.includes('[A]');
          const clean = itemStr.replace(/\[E\]|\[A\]/g, '').trim();
          const qtyMatch = clean.match(/^(\d+)x\s+(.+)$/i);
          return {
            id: makePcId(),
            name: qtyMatch ? qtyMatch[2].trim() : clean,
            qty: qtyMatch ? parseIntSafe(qtyMatch[1], 1) : 1,
            equipped,
            attuned,
          };
        })
    : [];

  const spellsRaw = findField(['spells_known', 'Spells', 'SpellList']);
  const spellsKnown = spellsRaw
    ? spellsRaw
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter((s) => s && s !== 'No spells recorded')
    : [];

  const currency = {
    cp: parseIntSafe(findField(['coin_cp', 'CP']), 0),
    sp: parseIntSafe(findField(['coin_sp', 'SP']), 0),
    ep: parseIntSafe(findField(['coin_ep', 'EP']), 0),
    gp: parseIntSafe(findField(['coin_gp', 'GP']), 0),
    pp: parseIntSafe(findField(['coin_pp', 'PP']), 0),
  };

  const parsedClasses = classLevelRaw
    ? classLevelRaw
        .split(/[\/,]/)
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => {
          const m = part.match(/^(.+?)\s*(\d{1,2})$/);
          if (m) {
            return {
              name: m[1].trim() || 'Adventurer',
              level: Math.max(1, Math.min(20, parseIntSafe(m[2], 1))),
            };
          }
          const numMatch = part.match(/(\d{1,2})/);
          return {
            name: part.replace(/\d+/g, '').trim() || 'Adventurer',
            level: numMatch ? Math.max(1, Math.min(20, parseIntSafe(numMatch[1], 1))) : 1,
          };
        })
    : [];

  const levelFromClass =
    parsedClasses.length > 0
      ? parsedClasses.reduce((sum, c) => sum + c.level, 0)
      : 1;
  const level = parseIntSafe(levelRaw, levelFromClass);

  return {
    name,
    level,
    ...(parsedClasses.length > 0 ? { classes: parsedClasses } : {}),
    race,
    background,
    alignment,
    abilities,
    proficiencies: {
      savingThrows,
      skills,
      languages: ['Common'],
      tools: [],
      armor: [],
      weapons: [],
    },
    hp: {
      current: currentHp,
      max: maxHp,
      temp: tempHp,
    },
    ac,
    speed,
    initiativeMod,
    attacks,
    inventory,
    spellsKnown,
    currency,
    notes: findField(['notes_text', 'Features and Traits', 'Backstory']),
  } as Partial<PlayerCharacter>;
}

function extractTextFromPdfBytes(bytes: Uint8Array): string {
  const rawLatin1 = new TextDecoder('latin1').decode(bytes);
  const chunks: string[] = [];
  // Extract PDF literal string tokens (...)
  const regex = /\(([^()\\]*(?:\\.[^()\\]*)*)\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(rawLatin1)) !== null) {
    const s = match[1]
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\');
    if (s.trim().length > 1) {
      chunks.push(s.trim());
    }
  }
  return chunks.join(' ');
}

function parsePdfTextLayerHeuristic(text: string): Partial<PlayerCharacter> | null {
  if (!text || text.trim().length < 20) return null;

  const nameMatch = text.match(/(?:Character Name|Name)\s*[:|-]?\s*([A-Za-z0-9' -]{2,35})/i);
  const levelMatch = text.match(/(?:Level|Lv\.?)\s*[:|-]?\s*(\d{1,2})/i);
  const classMatch = text.match(
    /\b(Barbarian|Bard|Cleric|Druid|Fighter|Monk|Paladin|Ranger|Rogue|Sorcerer|Warlock|Wizard|Artificer)\b/i,
  );
  const raceMatch = text.match(
    /\b(Human|Elf|Dwarf|Halfling|Dragonborn|Gnome|Half-Elf|Half-Orc|Tiefling|Aasimar|Goliath)\b/i,
  );

  if (!nameMatch && !classMatch) return null;

  const abilities: Record<AbilityName, number> = {
    STR: 10,
    DEX: 10,
    CON: 10,
    INT: 10,
    WIS: 10,
    CHA: 10,
  };
  for (const ab of ABILITY_NAMES) {
    const m = text.match(new RegExp(`\\b${ab}\\s*[:|-]?\\s*(\\d{1,2})\\b`, 'i'));
    if (m) abilities[ab] = Math.max(1, Math.min(30, parseIntSafe(m[1], 10)));
  }

  const hpMatch = text.match(/\bHP\s*[:|-]?\s*(\d{1,3})(?:\s*\/\s*(\d{1,3}))?/i);
  const acMatch = text.match(/\bAC\s*[:|-]?\s*(\d{1,2})\b/i);
  const lvl = levelMatch ? Math.max(1, Math.min(20, parseIntSafe(levelMatch[1], 1))) : 1;

  return {
    name: nameMatch ? nameMatch[1].trim() : `${classMatch?.[1] ?? 'Hero'}`,
    level: lvl,
    classes: classMatch ? [{ name: classMatch[1], level: lvl }] : [],
    race: raceMatch ? raceMatch[1] : '',
    background: '',
    abilities,
    hp: {
      current: hpMatch ? parseIntSafe(hpMatch[1], 10) : 10,
      max: hpMatch ? parseIntSafe(hpMatch[2] ?? hpMatch[1], 10) : 10,
      temp: 0,
    },
    ac: acMatch ? parseIntSafe(acMatch[1], 10) : 10,
    speed: 30,
  };
}

export async function parsePdfCharacterSheetTier1(
  bytes: Uint8Array,
): Promise<{
  pc: PlayerCharacter | null;
  partial: PlayerCharacter | null;
  tier: SheetParseTier;
  complete: boolean;
}> {
  try {
    const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: true });

    // Extract all AcroForm fields first (useful both for lossless overlay and standalone AcroForm sheets)
    const fieldMap = new Map<string, string>();
    try {
      const form = pdfDoc.getForm();
      const fields = form.getFields();
      for (const field of fields) {
        const fName = field.getName().toLowerCase();
        if (field instanceof PDFTextField) {
          fieldMap.set(fName, field.getText() ?? '');
        } else if (field instanceof PDFCheckBox) {
          fieldMap.set(fName, field.isChecked() ? 'true' : 'false');
        } else if (field instanceof PDFDropdown || field instanceof PDFOptionList) {
          const sel = field.getSelected();
          fieldMap.set(fName, Array.isArray(sel) ? sel.join(', ') : String(sel ?? ''));
        }
      }
    } catch {
      // Ignore if PDF has no AcroForm dictionary
    }

    // 1. Check for embedded gmAssistant lossless JSON metadata
    const subject = pdfDoc.getSubject() ?? '';
    const keywords = pdfDoc.getKeywords() ?? '';
    const rawLatin1 = new TextDecoder('latin1').decode(bytes);
    const metaCandidates = [subject, keywords, rawLatin1];

    for (const candidate of metaCandidates) {
      const idx = candidate.indexOf(GM_ASSISTANT_PDF_META_PREFIX);
      if (idx !== -1) {
        const afterPrefix = candidate.slice(idx + GM_ASSISTANT_PDF_META_PREFIX.length);
        const b64Match = afterPrefix.match(/^[A-Za-z0-9+/=]+/);
        if (b64Match) {
          try {
            const jsonStr = decodeUtf8Base64(b64Match[0]);
            const parsed = JSON.parse(jsonStr) as PlayerCharacter;
            const overlaid = overlayAcroFormEditsOntoPc(parsed, fieldMap);
            return {
              pc: overlaid,
              partial: overlaid,
              tier: 'tier1-lossless',
              complete: true,
            };
          } catch {
            // Continue if metadata token was truncated
          }
        }
      }
    }

    // 2. Check AcroForm fields (fillable WotC 2014/2024, D&D Beyond, MPMB, etc.)
    if (fieldMap.size > 0) {
      const mapped = mapAcroFormFieldsToPc(fieldMap);
      const hasName = Boolean(mapped.name && mapped.name.trim().length > 0);
      const hasStats =
        (mapped.classes && mapped.classes.length > 0) ||
        (mapped.hp && mapped.hp.max > 0) ||
        Object.values(mapped.abilities ?? {}).some((v) => v !== 10);

      if (hasName || hasStats) {
        const pc = normalizePc({
          ...emptyPc(),
          ...mapped,
          name: mapped.name || 'Imported Character',
        });
        return {
          pc,
          partial: pc,
          tier: 'tier1-acroform',
          complete: hasName && hasStats,
        };
      }
    }

    // 3. Check structured text layer in the PDF
    const extractedText = extractTextFromPdfBytes(bytes);
    const textHeuristic = parsePdfTextLayerHeuristic(extractedText);
    if (textHeuristic) {
      const pc = normalizePc({
        ...emptyPc(),
        ...textHeuristic,
      });
      return {
        pc,
        partial: pc,
        tier: 'tier1-text',
        complete: Boolean(pc.name && pc.classes.length > 0),
      };
    }

    return { pc: null, partial: null, tier: 'tier1-text', complete: false };
  } catch {
    return { pc: null, partial: null, tier: 'tier1-text', complete: false };
  }
}

// ============================================================================
// Tier 2 Multimodal LLM Fallback Client (`/api/parse-character-sheet`)
// ============================================================================

async function invokeTier2MultimodalFallback(
  bytes: Uint8Array,
  mimeType: string,
  options: CharacterSheetParseOptions,
): Promise<PlayerCharacter> {
  const fetchFn = options.fetchImpl ?? (typeof fetch !== 'undefined' ? fetch : undefined);
  if (!fetchFn) {
    throw new Error('Tier 2 multimodal fallback requires fetch in this environment.');
  }

  const base64Data = uint8ToBase64(bytes);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.authToken) {
    headers.Authorization = `Bearer ${options.authToken}`;
  }
  if (options.shareToken) {
    headers['x-share-token'] = options.shareToken;
  }

  const res = await fetchFn('/api/parse-character-sheet', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      fileData: base64Data,
      mimeType,
      shareToken: options.shareToken,
    }),
  });

  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new Error(
      (errBody as Record<string, string>)?.error ||
        `Character sheet parser returned HTTP ${res.status}`,
    );
  }

  const data = (await res.json()) as {
    pc?: Partial<PlayerCharacter>;
    character?: Record<string, unknown>;
  };

  if (data.pc && typeof data.pc === 'object') {
    return normalizePc(data.pc);
  }
  if (data.character && typeof data.character === 'object') {
    return characterToPc(normalizeCharacter(data.character));
  }
  throw new Error('Failed to parse character sheet from Tier 2 response.');
}

/**
 * Unified Two-Tier Hybrid Character Sheet Parser:
 * 1. Accepts `.pdf`, `.json`, and images (`.png`, `.jpg`, `.jpeg`, `.webp`).
 * 2. Tier 1 (Client-Side Deterministic, Instant, Free, Offline-Capable) checks for embedded
 *    `gmAssistant` lossless JSON metadata inside PDFs first, then AcroForm fields / text layers / JSON schemas.
 * 3. Tier 2 (Multimodal LLM Fallback `/api/parse-character-sheet`) runs when uploading images or
 *    flattened PDFs where Tier 1 extraction is incomplete.
 * 4. Automatically runs `evaluateCharacterSheet(parsedPc)` and state-preserving delta merge when an
 *    existing PC matches.
 */
export async function parseCharacterSheet(
  input: Uint8Array | ArrayBuffer | Blob | File | string | Record<string, unknown>,
  options: CharacterSheetParseOptions = {},
): Promise<CharacterSheetParseResult & { evaluation: EvaluatedPlayerCharacter['evaluation']; wasMerged: boolean }> {
  const inputRec = input && typeof input === 'object' ? (input as Record<string, unknown>) : null;
  const filename =
    options.filename ||
    (typeof File !== 'undefined' && input instanceof File ? input.name : '') ||
    (typeof inputRec?.name === 'string' && isBinaryFileLike(input) ? inputRec.name : '') ||
    (typeof inputRec?.filename === 'string' && isBinaryFileLike(input) ? inputRec.filename : '') ||
    '';
  const lowerName = filename.toLowerCase();
  const mimeType =
    options.mimeType ||
    (typeof Blob !== 'undefined' && input instanceof Blob ? input.type : '') ||
    (typeof inputRec?.type === 'string' && isBinaryFileLike(input) ? inputRec.type : '') ||
    (lowerName.endsWith('.pdf')
      ? 'application/pdf'
      : lowerName.endsWith('.json')
        ? 'application/json'
        : lowerName.endsWith('.png')
          ? 'image/png'
          : lowerName.endsWith('.webp')
            ? 'image/webp'
            : lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')
              ? 'image/jpeg'
              : '');

  let rawParsedPc: PlayerCharacter | null = null;
  let tier: SheetParseTier = 'tier1-json';

  // Case A: Direct object or JSON string / .json file
  if (
    input &&
    typeof input === 'object' &&
    !isBinaryFileLike(input)
  ) {
    rawParsedPc = parseJsonCharacterSheetTier1(input as Record<string, unknown>);
    tier = 'tier1-json';
  } else if (
    typeof input === 'string' ||
    mimeType === 'application/json' ||
    lowerName.endsWith('.json')
  ) {
    const jsonText =
      typeof input === 'string'
        ? input
        : new TextDecoder().decode(await toUint8Array(input));
    rawParsedPc = parseJsonCharacterSheetTier1(jsonText);
    tier = 'tier1-json';
  } else {
    const bytes = await toUint8Array(input);
    const isPdf =
      mimeType === 'application/pdf' ||
      lowerName.endsWith('.pdf') ||
      (bytes.length >= 4 &&
        bytes[0] === 0x25 && // %
        bytes[1] === 0x50 && // P
        bytes[2] === 0x44 && // D
        bytes[3] === 0x46);  // F

    if (isPdf) {
      const tier1 = await parsePdfCharacterSheetTier1(bytes);
      if (tier1.pc && (tier1.complete || options.offlineOnly)) {
        rawParsedPc = tier1.pc;
        tier = tier1.tier;
      } else if (!options.offlineOnly) {
        try {
          rawParsedPc = await invokeTier2MultimodalFallback(bytes, 'application/pdf', options);
          tier = 'tier2-multimodal';
        } catch (err) {
          if (tier1.pc) {
            rawParsedPc = tier1.pc;
            tier = tier1.tier;
          } else {
            throw err;
          }
        }
      } else if (tier1.pc) {
        rawParsedPc = tier1.pc;
        tier = tier1.tier;
      } else {
        throw new Error('Could not extract character sheet from flattened PDF while offline.');
      }
    } else {
      // Image upload (.png, .jpg, .jpeg, .webp) -> Tier 2 Multimodal LLM Fallback
      if (options.offlineOnly) {
        throw new Error('Image character sheets require an online connection for multimodal parsing.');
      }
      rawParsedPc = await invokeTier2MultimodalFallback(
        bytes,
        mimeType || 'image/png',
        options,
      );
      tier = 'tier2-multimodal';
    }
  }

  // Run Automatic Character Evaluator immediately after parsing
  const evaluatedPc = evaluateCharacterSheet(rawParsedPc);

  // Check if we should run State-Preserving Delta Merge against an existing PC
  let existingMatch: (Partial<PlayerCharacter> & Record<string, unknown>) | undefined =
    options.existingPc;
  if (!existingMatch && Array.isArray(options.existingPcs) && options.existingPcs.length > 0) {
    const found = findMatchingExistingPc(options.existingPcs, evaluatedPc, {
      targetPcId: options.targetPcId,
      targetSlotId: options.targetSlotId,
    });
    if (found) {
      existingMatch = found.pc;
    }
  }

  if (existingMatch) {
    const previousPcSnapshot = normalizePc(existingMatch);
    const mergedPc = mergeUploadedCharacterSheet(existingMatch, evaluatedPc);
    return {
      pc: mergedPc,
      evaluation: mergedPc.evaluation,
      tier,
      mergedWithExisting: true,
      wasMerged: true,
      matchedPcId: mergedPc.id,
      previousPcSnapshot,
    };
  }

  if (options.targetPcId) {
    evaluatedPc.id = options.targetPcId;
  }
  if (options.targetSlotId && !evaluatedPc.ownership?.playerSlotId) {
    evaluatedPc.ownership = {
      ownerType: 'player',
      playerSlotId: options.targetSlotId,
    };
  }

  return {
    pc: evaluatedPc,
    evaluation: evaluatedPc.evaluation,
    tier,
    mergedWithExisting: false,
    wasMerged: false,
  };
}
