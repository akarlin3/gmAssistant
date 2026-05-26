import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { normalizeCharacter } from '@/lib/character-schema';
import { readBearerToken, verifyPro } from '@/lib/verify-pro';
import { enforceRateLimit } from '@/lib/rate-limit';
import {
  buildSidekickPrefill,
  getClassInfo,
  getSpellListInfo,
  getBaseCreature,
  type SidekickClass,
  type SpellList,
  type SidekickBaseId,
} from '@/lib/sidekicks';

export const runtime = 'nodejs';
export const maxDuration = 60;

const CHARACTER_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    race: { type: 'string' },
    alignment: { type: 'string' },
    abilities: {
      type: 'object',
      additionalProperties: false,
      properties: {
        str: { type: 'string' },
        dex: { type: 'string' },
        con: { type: 'string' },
        int: { type: 'string' },
        wis: { type: 'string' },
        cha: { type: 'string' },
      },
      required: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
    },
    skills: { type: 'string' },
    languages: { type: 'string' },
    equipment: { type: 'string' },
    attacks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          bonus: { type: 'string' },
          damage: { type: 'string' },
          notes: { type: 'string' },
        },
        required: ['name', 'bonus', 'damage', 'notes'],
      },
    },
    spells: { type: 'string' },
    personality: { type: 'string' },
    ideals: { type: 'string' },
    bonds: { type: 'string' },
    flaws: { type: 'string' },
    appearance: { type: 'string' },
    backstory: { type: 'string' },
  },
  required: [
    'name', 'race', 'alignment', 'abilities',
    'skills', 'languages', 'equipment', 'attacks', 'spells',
    'personality', 'ideals', 'bonds', 'flaws', 'appearance', 'backstory',
  ],
};

const SYSTEM_PROMPT = `You are a Dungeons & Dragons 5e sidekick generator using the rules from Tasha's Cauldron of Everything (pp. 142–149).

You will be given:
- A sidekick class (Expert / Spellcaster / Warrior) and, if Spellcaster, a spell list (Mage = Wizard list, Healer = Cleric list, Prodigy = Bard list).
- A starting level (1–20).
- A base humanoid stat block (Commoner / Guard / Bandit / Acolyte / Scout / Tribal Warrior) — these set the starting ability scores you should work from.
- A concept the player typed (one-line backstory or character idea).

Your job: flesh out the sidekick. Return ONLY the structured JSON. Do NOT compute HP, AC, proficiency bonus, saves, hit dice, spell slots, class features, or any rules math — those are calculated by the app from the class table and will be merged in.

Conventions:
- "name" should fit the concept and culture implied by it. Be evocative, not generic.
- "race" picks a humanoid race consistent with the concept (Human, Half-Elf, Hill Dwarf, etc.). Just the race name, no subrace details.
- "alignment" is a two-letter or short alignment (e.g. "LG", "CN", "TN").
- "abilities" — adjust the base stat block's ability scores to fit the concept and class. Keep them realistic (8–16 range for a low-level sidekick; you may increase as appropriate for level via ASIs). Format each value as "SCORE (+MOD)" e.g. "14 (+2)" or "8 (-1)". Always include both score and modifier.
- "skills" — list the proficient skills with their final modifiers, comma-separated. Pick skills appropriate to the class and concept. Format: "Perception +3, Stealth +5".
- "languages" — comma-separated. At minimum include Common.
- "equipment" — multiline list. Include the base stat block's gear plus 1–4 personal items that suit the concept. Don't include duplicates.
- "attacks" — 1–4 weapon attacks or cantrips appropriate for the class and equipment. "notes" can hold range, properties, or "Cantrip / DC X" style info. You don't need to calculate exact bonuses — give plausible numbers based on the abilities you set and a +2 to +6 proficiency bonus depending on level.
- "spells" — only fill for Spellcaster. Provide a multiline list of cantrips and spells the sidekick knows, formatted "Cantrip — Light", "Lvl 1 — Healing Word", etc. Number of cantrips/spells should reasonably match the level. For non-spellcasters, return "".
- "personality", "ideals", "bonds", "flaws" — short single sentences that fit the concept.
- "appearance" — 1–3 sentences, vivid and specific.
- "backstory" — 2–5 sentences expanding on the concept. Make the connection to the PCs explicit (how they joined, why they stay).

Do not invent class features, spell slot tables, or proficiency math — leave those to the app's prefill.`;

export async function POST(req: NextRequest) {
  const idToken = readBearerToken(req.headers.get('authorization'));
  if (!idToken) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const verified = await verifyPro(idToken);
  if (!verified.ok) return NextResponse.json({ error: verified.message }, { status: verified.status });

  const limited = enforceRateLimit(verified.uid);
  if (limited) return limited;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Server missing ANTHROPIC_API_KEY' }, { status: 500 });
  }

  let body: {
    classId?: unknown;
    level?: unknown;
    spellList?: unknown;
    baseId?: unknown;
    concept?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const classId = (() => {
    const s = typeof body.classId === 'string' ? body.classId : '';
    if (s === 'expert' || s === 'spellcaster' || s === 'warrior') return s as SidekickClass;
    return null;
  })();
  if (!classId) return NextResponse.json({ error: 'Invalid class' }, { status: 400 });

  const rawLevel = Number(body.level);
  const level = Math.max(1, Math.min(20, Number.isFinite(rawLevel) ? Math.floor(rawLevel) : 1));

  const spellList = (() => {
    const s = typeof body.spellList === 'string' ? body.spellList : '';
    if (s === 'mage' || s === 'healer' || s === 'prodigy') return s as SpellList;
    return '' as const;
  })();
  if (classId === 'spellcaster' && !spellList) {
    return NextResponse.json({ error: 'Spellcaster requires a spell list' }, { status: 400 });
  }

  const baseId = (() => {
    const s = typeof body.baseId === 'string' ? body.baseId : '';
    if (
      s === 'commoner' || s === 'guard' || s === 'bandit'
      || s === 'acolyte' || s === 'scout' || s === 'tribal-warrior'
    ) return s as SidekickBaseId;
    return null;
  })();
  if (!baseId) return NextResponse.json({ error: 'Invalid base creature' }, { status: 400 });

  const concept = typeof body.concept === 'string' ? body.concept.trim().slice(0, 2000) : '';
  if (!concept) return NextResponse.json({ error: 'Concept is required' }, { status: 400 });

  const cls = getClassInfo(classId);
  const base = getBaseCreature(baseId);
  const spellLine = classId === 'spellcaster' && spellList
    ? `Spell list: ${getSpellListInfo(spellList).name} (${getSpellListInfo(spellList).list} list, spellcasting ability ${getSpellListInfo(spellList).ability}).`
    : 'Not a spellcaster.';

  const userMessage =
    `Class: ${cls.name} (Hit Die d${cls.hitDie}, saves ${cls.saves}).\n` +
    `${spellLine}\n` +
    `Starting level: ${level}.\n` +
    `Base stat block: ${base.name} — Str ${base.abilities.str}, Dex ${base.abilities.dex}, Con ${base.abilities.con}, Int ${base.abilities.int}, Wis ${base.abilities.wis}, Cha ${base.abilities.cha}; AC ${base.baseAC} (${base.acNote}); ${base.notes}\n` +
    `Concept: ${concept}\n\n` +
    `Generate the sidekick.`;

  const client = new Anthropic({ apiKey });

  let response: Anthropic.Messages.Message;
  try {
    response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      output_config: {
        format: {
          type: 'json_schema',
          schema: CHARACTER_JSON_SCHEMA,
        },
      },
      messages: [{ role: 'user', content: userMessage }],
    });
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      return NextResponse.json(
        { error: `Claude API error (${err.status}): ${err.message}` },
        { status: 502 },
      );
    }
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const text = response.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  let aiFields: Record<string, unknown>;
  try {
    aiFields = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: 'Model did not return valid JSON', raw: text.slice(0, 2000) },
      { status: 502 },
    );
  }

  // Merge: app-computed mechanics (HP/AC/PB/slots/features) + AI-generated narrative.
  const pre = buildSidekickPrefill({ classId, level, spellList, baseId });
  const merged = {
    name: typeof aiFields.name === 'string' ? aiFields.name : '',
    player: '',
    race: typeof aiFields.race === 'string' ? aiFields.race : pre.race,
    classLevel: pre.classLevel,
    background: pre.background,
    alignment: typeof aiFields.alignment === 'string' ? aiFields.alignment : '',
    experience: '',
    abilities: (() => {
      const a = (aiFields.abilities as Record<string, unknown>) || {};
      const pick = (k: keyof typeof pre.abilities) =>
        typeof a[k] === 'string' && a[k] ? (a[k] as string) : pre.abilities[k];
      return {
        str: pick('str'),
        dex: pick('dex'),
        con: pick('con'),
        int: pick('int'),
        wis: pick('wis'),
        cha: pick('cha'),
      };
    })(),
    saves: pre.saves,
    ac: pre.ac,
    hp: pre.hp,
    hpMax: pre.hpMax,
    initiative: pre.initiative,
    speed: pre.speed,
    profBonus: pre.profBonus,
    hitDice: pre.hitDice,
    skills: typeof aiFields.skills === 'string' ? aiFields.skills : pre.skills,
    passivePerception: '',
    languages: typeof aiFields.languages === 'string' ? aiFields.languages : pre.languages,
    proficiencies: pre.proficiencies,
    attacks: Array.isArray(aiFields.attacks) ? aiFields.attacks : [],
    equipment: typeof aiFields.equipment === 'string' ? aiFields.equipment : pre.equipment,
    currency: { cp: '', sp: '', ep: '', gp: '', pp: '' },
    features: pre.features,
    personality: typeof aiFields.personality === 'string' ? aiFields.personality : '',
    ideals: typeof aiFields.ideals === 'string' ? aiFields.ideals : '',
    bonds: typeof aiFields.bonds === 'string' ? aiFields.bonds : '',
    flaws: typeof aiFields.flaws === 'string' ? aiFields.flaws : '',
    appearance: typeof aiFields.appearance === 'string' ? aiFields.appearance : '',
    backstory: typeof aiFields.backstory === 'string' ? aiFields.backstory : '',
    spellcasting: pre.spellcasting,
    spells: (() => {
      if (classId !== 'spellcaster') return '';
      const aiSpells = typeof aiFields.spells === 'string' ? aiFields.spells.trim() : '';
      return aiSpells ? `${aiSpells}\n\n${pre.spells}` : pre.spells;
    })(),
    notes: pre.notes,
  };

  const character = normalizeCharacter(merged);

  return NextResponse.json({
    character,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
    },
  });
}
