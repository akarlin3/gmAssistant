import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { normalizeCharacter } from '@/lib/character-schema';
import { readBearerToken, verifyPro } from '@/lib/verify-pro';

export const runtime = 'nodejs';
export const maxDuration = 60;

const CHARACTER_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    player: { type: 'string' },
    race: { type: 'string' },
    classLevel: { type: 'string' },
    background: { type: 'string' },
    alignment: { type: 'string' },
    experience: { type: 'string' },
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
    saves: { type: 'string' },
    ac: { type: 'string' },
    hp: { type: 'string' },
    hpMax: { type: 'string' },
    initiative: { type: 'string' },
    speed: { type: 'string' },
    profBonus: { type: 'string' },
    hitDice: { type: 'string' },
    skills: { type: 'string' },
    passivePerception: { type: 'string' },
    languages: { type: 'string' },
    proficiencies: { type: 'string' },
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
    equipment: { type: 'string' },
    currency: {
      type: 'object',
      additionalProperties: false,
      properties: {
        cp: { type: 'string' },
        sp: { type: 'string' },
        ep: { type: 'string' },
        gp: { type: 'string' },
        pp: { type: 'string' },
      },
      required: ['cp', 'sp', 'ep', 'gp', 'pp'],
    },
    features: { type: 'string' },
    personality: { type: 'string' },
    ideals: { type: 'string' },
    bonds: { type: 'string' },
    flaws: { type: 'string' },
    appearance: { type: 'string' },
    backstory: { type: 'string' },
    spellcasting: {
      type: 'object',
      additionalProperties: false,
      properties: {
        ability: { type: 'string' },
        saveDC: { type: 'string' },
        attackBonus: { type: 'string' },
        slots: { type: 'string' },
      },
      required: ['ability', 'saveDC', 'attackBonus', 'slots'],
    },
    spells: { type: 'string' },
    notes: { type: 'string' },
  },
  required: [
    'name', 'player', 'race', 'classLevel', 'background', 'alignment', 'experience',
    'abilities', 'saves', 'ac', 'hp', 'hpMax', 'initiative', 'speed', 'profBonus', 'hitDice',
    'skills', 'passivePerception', 'languages', 'proficiencies', 'attacks',
    'equipment', 'currency', 'features',
    'personality', 'ideals', 'bonds', 'flaws', 'appearance', 'backstory',
    'spellcasting', 'spells', 'notes',
  ],
};

const SYSTEM_PROMPT = `You are a tabletop RPG character sheet parser. The user will provide a character sheet (PDF, image, or text — typically D&D 5e but possibly another system or homebrew). Extract every field you can find into the structured output.

Conventions:
- Use "" for any field that does not appear on the sheet. Never invent data.
- "classLevel" combines class and level, e.g. "Wizard 5" or "Fighter 3 / Rogue 2" for multiclass.
- "abilities" values include the score and modifier in parens: e.g. "16 (+3)". If only the modifier is shown, write e.g. "(+3)".
- "saves" is a comma-separated list of proficient saving throws, e.g. "Wisdom, Charisma". Include modifiers if visible: "Wisdom +5, Charisma +3".
- "skills" lists proficient skills comma-separated. Prefix expertise entries with "expertise: ", e.g. "Perception +5, expertise: Stealth +9, Arcana +3".
- "hp" is the current value if shown, "hpMax" is the maximum. If only one number is on the sheet, put it in hpMax and leave hp as "".
- "attacks" is a list of weapon, cantrip, or unarmed attacks. Use "notes" for range, properties, or any extra detail.
- "equipment" is multiline, one item per line. Preserve quantities, e.g. "Potion of Healing (3)".
- "features" is multiline. Format each as "Feature Name. Description." with the source in parens if known, e.g. "Sneak Attack. Once per turn... (Rogue 1)".
- "spells" is multiline, one spell per line, formatted "Lvl N — Spell Name" or "Cantrip — Spell Name". Prefix prepared spells with "[P] " and always-prepared/at-will with "[A] ".
- "spellcasting.slots" is a compact summary, e.g. "L1: 4, L2: 3, L3: 2".
- Preserve homebrew names, custom items, and unusual mechanics verbatim — do not normalize them to canonical 5e equivalents.
- Strip newlines from single-line fields. Use newlines freely in "equipment", "features", "spells", "backstory", "notes".`;

export async function POST(req: NextRequest) {
  const idToken = readBearerToken(req.headers.get('authorization'));
  if (!idToken) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const verified = await verifyPro(idToken);
  if (!verified.ok) return NextResponse.json({ error: verified.message }, { status: verified.status });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Server missing ANTHROPIC_API_KEY' }, { status: 500 });
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  }
  if (file.size === 0) {
    return NextResponse.json({ error: 'File is empty' }, { status: 400 });
  }
  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 25 MB)' }, { status: 413 });
  }

  const buf = Buffer.from(await file.arrayBuffer());
  const mime = file.type || '';

  let fileBlock: Anthropic.Messages.ContentBlockParam;
  if (mime === 'application/pdf') {
    fileBlock = {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: buf.toString('base64') },
    };
  } else if (mime === 'image/png' || mime === 'image/jpeg' || mime === 'image/webp' || mime === 'image/gif') {
    fileBlock = {
      type: 'image',
      source: { type: 'base64', media_type: mime, data: buf.toString('base64') },
    };
  } else {
    const text = buf.toString('utf-8');
    if (!text.trim()) {
      return NextResponse.json({ error: `Unsupported file type: ${mime || 'unknown'}` }, { status: 415 });
    }
    fileBlock = { type: 'text', text: `Character sheet content:\n\n${text}` };
  }

  const client = new Anthropic({ apiKey });

  let response: Anthropic.Messages.Message;
  try {
    response = await client.messages.create({
      model: 'claude-opus-4-7',
      max_tokens: 8192,
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
      messages: [
        {
          role: 'user',
          content: [
            fileBlock,
            { type: 'text', text: 'Extract this character sheet into the structured schema.' },
          ],
        },
      ],
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

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: 'Model did not return valid JSON', raw: text.slice(0, 2000) },
      { status: 502 },
    );
  }

  const character = normalizeCharacter(parsed);

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
