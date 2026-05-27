import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { readBearerToken, verifyPro } from '@/lib/verify-pro';
import { enforceRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 30;

const LOCATIONS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    locations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: { type: 'string' },
          type: { type: 'string' },
          culture: { type: 'string' },
          blurb: { type: 'string' },
        },
        required: ['name', 'type', 'culture', 'blurb'],
      },
    },
  },
  required: ['locations'],
};

const SYSTEM_PROMPT = `You are a fantasy location generator for tabletop RPGs. Given a location type and a cultural / linguistic tradition (each may be "Random"), generate the requested number of evocative location entries.

Rules:
- "name" should sound like a real place a DM would put on a map — drawn from the requested culture's naming conventions (toponyms, common roots, prefixes/suffixes). Avoid generic English compounds unless the culture is English/Anglo. Real-world cultures use historically grounded forms; fantasy cultures (Elven, Dwarven, Orcish, etc.) follow genre conventions for that race or tradition.
- "type" must be the location category you generated (e.g. "Village", "Ruin", "Tavern / Inn"). If the user asked for a specific type, echo it; if Random, vary across the list so different rows cover different categories.
- "culture" is a short label naming the tradition the name draws from (e.g. "Norse", "Japanese", "Elven"). If the user asked for a specific culture, echo it; if Random, vary widely across the list.
- "blurb" is a single evocative sentence (≤ 22 words) painting a vivid sensory or situational hook — what a traveler notices first, the prevailing mood, or a single arresting detail. No clichés ("nestled in", "bustling"). Avoid restating the name.
- Do not repeat names across the list. Vary scale, tone, and atmosphere.
- Return ONLY the structured JSON — no commentary.`;

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

  let body: { locationType?: unknown; culture?: unknown; count?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const clean = (v: unknown, fallback: string, max = 60): string => {
    const s = typeof v === 'string' ? v.trim() : '';
    return (s || fallback).slice(0, max);
  };

  const locationType = clean(body.locationType, 'Random');
  const culture = clean(body.culture, 'Random');
  const rawCount = Number(body.count);
  const count = Math.max(1, Math.min(20, Number.isFinite(rawCount) ? Math.floor(rawCount) : 8));

  const userMessage = `Generate ${count} location${count === 1 ? '' : 's'}.
Location type: ${locationType}
Cultural / linguistic tradition: ${culture}`;

  const client = new Anthropic({ apiKey });

  let response: Anthropic.Messages.Message;
  try {
    response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
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
          schema: LOCATIONS_JSON_SCHEMA,
        },
      },
      messages: [
        { role: 'user', content: userMessage },
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

  let parsed: { locations?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: 'Model did not return valid JSON', raw: text.slice(0, 2000) },
      { status: 502 },
    );
  }

  const locations = Array.isArray(parsed.locations)
    ? (parsed.locations as unknown[]).flatMap((row) => {
        if (!row || typeof row !== 'object') return [];
        const r = row as Record<string, unknown>;
        const name = typeof r.name === 'string' ? r.name.trim() : '';
        if (!name) return [];
        return [{
          name,
          type: typeof r.type === 'string' ? r.type.trim() : '',
          culture: typeof r.culture === 'string' ? r.culture.trim() : '',
          blurb: typeof r.blurb === 'string' ? r.blurb.trim() : '',
        }];
      })
    : [];

  return NextResponse.json({
    locations,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
    },
  });
}
