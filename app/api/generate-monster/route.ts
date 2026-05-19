import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import Anthropic from '@anthropic-ai/sdk';
import { readBearerToken, verifyPro } from '@/lib/verify-pro';
import { CR_TO_XP } from '@/lib/encounterMath';

export const runtime = 'nodejs';
export const maxDuration = 60;

const VALID_CRS = new Set(Object.keys(CR_TO_XP));

const ABILITY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    str: { type: 'integer' },
    dex: { type: 'integer' },
    con: { type: 'integer' },
    int: { type: 'integer' },
    wis: { type: 'integer' },
    cha: { type: 'integer' },
  },
  required: ['str', 'dex', 'con', 'int', 'wis', 'cha'],
};

const NAMED_BLOCK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
  },
  required: ['name', 'description'],
};

const MONSTER_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string' },
    sourceMonster: { type: 'string' },
    scalingNote: { type: 'string' },
    cr: { type: 'string' },
    size: { type: 'string' },
    type: { type: 'string' },
    alignment: { type: 'string' },
    ac: { type: 'string' },
    hp: { type: 'string' },
    speed: { type: 'string' },
    abilities: ABILITY_SCHEMA,
    savingThrows: { type: 'string' },
    skills: { type: 'string' },
    damageResistances: { type: 'string' },
    damageImmunities: { type: 'string' },
    conditionImmunities: { type: 'string' },
    senses: { type: 'string' },
    languages: { type: 'string' },
    traits: { type: 'array', items: NAMED_BLOCK_SCHEMA },
    actions: { type: 'array', items: NAMED_BLOCK_SCHEMA },
    legendaryActions: { type: 'array', items: NAMED_BLOCK_SCHEMA },
  },
  required: [
    'name',
    'sourceMonster',
    'scalingNote',
    'cr',
    'size',
    'type',
    'alignment',
    'ac',
    'hp',
    'speed',
    'abilities',
    'savingThrows',
    'skills',
    'damageResistances',
    'damageImmunities',
    'conditionImmunities',
    'senses',
    'languages',
    'traits',
    'actions',
    'legendaryActions',
  ],
};

type CatalogEntry = { name: string; cr: string; type: string; size: string; tag: string; crNum: number };

const CR_TO_NUM: Record<string, number> = { '0': 0, '1/8': 0.125, '1/4': 0.25, '1/2': 0.5 };
function crToNum(cr: string): number {
  return CR_TO_NUM[cr] ?? Number(cr);
}

function buildCatalog(): CatalogEntry[] {
  const file = path.join(process.cwd(), 'public', 'srd', 'monsters.json');
  const raw = readFileSync(file, 'utf-8');
  const monsters = JSON.parse(raw) as Array<{
    name: string;
    challenge_rating: string;
    type: string;
    size: string;
    desc?: string;
    actions?: Array<{ name: string }>;
    special_abilities?: Array<{ name: string }>;
    legendary_actions?: Array<{ name: string }>;
  }>;

  return monsters
    .filter((m) => VALID_CRS.has(m.challenge_rating))
    .map((m) => {
      let tag = '';
      if (m.desc) {
        const cleaned = m.desc
          .replace(/_/g, '')
          .replace(/\*\*[^*]+\*\*/g, '')
          .replace(/\s+/g, ' ')
          .trim();
        const firstSentence = cleaned.split(/(?<=[.!?])\s/)[0] || cleaned;
        tag = firstSentence.slice(0, 110).trim();
      }
      if (!tag) {
        const abilityNames = [
          ...(m.special_abilities || []).map((a) => a.name),
          ...(m.actions || []).map((a) => a.name).filter((n) => n && n !== 'Multiattack'),
        ];
        tag = abilityNames.slice(0, 3).join(', ').slice(0, 110);
      }
      if ((m.legendary_actions?.length ?? 0) > 0) {
        tag = (tag ? tag + ' · ' : '') + 'legendary';
      }
      return {
        name: m.name,
        cr: m.challenge_rating,
        type: m.type || '',
        size: m.size || '',
        tag,
        crNum: crToNum(m.challenge_rating),
      };
    });
}

let _catalog: CatalogEntry[] | null = null;
function getCatalog(): CatalogEntry[] {
  if (!_catalog) _catalog = buildCatalog();
  return _catalog;
}

function filterCatalogForCR(target: string): CatalogEntry[] {
  const targetNum = crToNum(target);
  const all = getCatalog();
  // Window scales with target CR: low CRs are dense, high CRs sparse.
  const window = targetNum <= 4 ? 4 : targetNum <= 10 ? 6 : 10;
  const lo = targetNum - window;
  const hi = targetNum + window;
  const inWindow = all.filter((m) => m.crNum >= lo && m.crNum <= hi);
  // Cap to avoid bloating the prompt — 600 entries is plenty for matching.
  if (inWindow.length <= 600) return inWindow;
  return inWindow.slice(0, 600);
}

const SCALING_REFERENCE = `Scaling rules (5e-style targets):
- Proficiency Bonus by CR — 0-4: +2, 5-8: +3, 9-12: +4, 13-16: +5, 17-20: +6, 21-24: +7, 25-28: +8, 29-30: +9.
- Attack bonus ≈ PB + ability mod. Save DC = 8 + PB + ability mod.
- HP targets: CR 1/4≈12-35, CR 1≈51-70, CR 5≈116-130, CR 10≈191-205, CR 15≈266-280, CR 20≈341-355.
- AC targets: CR 0-4≈13, CR 5-10≈15, CR 11-16≈17, CR 17+≈18-19.
- Per-round damage: CR 1/4≈3-5, CR 1≈9-14, CR 5≈33-38, CR 10≈63-68, CR 15≈100-105, CR 20≈153-158.
- CR 9+ solo bosses: prefer multiattack and include legendary actions when the source had them or the concept warrants.
- CR <5: single attack is normal; legendaryActions should be [].`;

const SYSTEM_HEADER = `You are a 5e tabletop RPG monster builder. The user gives you a free-text monster concept and a target Challenge Rating. Your job:

1. Read the user's concept and find the SINGLE closest existing monster from the catalog below. Match on creature type / role / theme, not just CR. Put that monster's exact catalog name in "sourceMonster".
2. Build a full statblock for the concept at the requested target CR, scaled from the source monster's profile. Use the source as a structural anchor — borrow its attack patterns, defensive shape, and signature traits, then re-skin and re-scale them to the concept and target CR.
3. In "scalingNote", state the source monster, its native CR, the delta to target CR, and the 2-3 key scaling moves you made.

${SCALING_REFERENCE}

Formatting rules:
- "cr": echo the user's requested CR exactly (one of "0", "1/8", "1/4", "1/2", "1"..."30").
- "ac" includes the value and optionally armor type, e.g. "16 (natural armor)".
- "hp" includes total and hit dice formula, e.g. "127 (15d10 + 45)".
- "speed" is a comma list, e.g. "30 ft., fly 60 ft.".
- "abilities" are integer ability scores (3-30), not modifiers.
- Empty string "" if a field doesn't apply (savingThrows, skills, damageResistances, damageImmunities, conditionImmunities). "senses" should always include "passive Perception X".
- "traits" are passive features. "actions" are turn actions. For attacks use the canonical "Melee Weapon Attack: +X to hit, reach Y ft., one target. Hit: Z (NdM+K) DAMAGE_TYPE damage." form, with rider effects (saves, conditions) inline.
- Pick the closest catalog name even if imperfect — note any mismatch in scalingNote. Do not invent monsters outside the catalog for sourceMonster.
- Return ONLY the structured JSON.`;

export async function POST(req: NextRequest) {
  const idToken = readBearerToken(req.headers.get('authorization'));
  if (!idToken) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const verified = await verifyPro(idToken);
  if (!verified.ok) return NextResponse.json({ error: verified.message }, { status: verified.status });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Server missing ANTHROPIC_API_KEY' }, { status: 500 });
  }

  let body: { description?: unknown; cr?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const description = typeof body.description === 'string' ? body.description.trim().slice(0, 600) : '';
  if (!description) {
    return NextResponse.json({ error: 'Description is required' }, { status: 400 });
  }

  const rawCr = typeof body.cr === 'string' ? body.cr.trim() : '';
  if (!VALID_CRS.has(rawCr)) {
    return NextResponse.json(
      { error: `Invalid CR "${rawCr}". Must be one of 0, 1/8, 1/4, 1/2, 1, 2, ..., 30.` },
      { status: 400 },
    );
  }

  let catalogLines: string;
  try {
    const entries = filterCatalogForCR(rawCr);
    catalogLines = entries
      .map((m) => `${m.name} | CR ${m.cr} | ${m.size} ${m.type}${m.tag ? ` — ${m.tag}` : ''}`)
      .join('\n');
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'catalog load failed';
    return NextResponse.json({ error: `Monster catalog unavailable: ${msg}` }, { status: 500 });
  }

  const systemPrompt = `${SYSTEM_HEADER}

Monster catalog (name | CR | size+type — short tag), restricted to candidates near target CR ${rawCr}:
${catalogLines}`;

  const userMessage = `Concept: ${description}
Target CR: ${rawCr}

Find the closest source monster from the catalog, then build a full statblock at CR ${rawCr} scaled from it.`;

  const client = new Anthropic({ apiKey });

  let response: Anthropic.Messages.Message;
  try {
    response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ],
      output_config: {
        format: {
          type: 'json_schema',
          schema: MONSTER_SCHEMA,
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

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: 'Model did not return valid JSON', raw: text.slice(0, 2000) },
      { status: 502 },
    );
  }

  return NextResponse.json({
    monster: parsed,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
    },
  });
}
