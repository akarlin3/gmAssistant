import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { readBearerToken, verifyPro } from '@/lib/verify-pro';

export const runtime = 'nodejs';
export const maxDuration = 30;

const NAMES_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    names: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          first: { type: 'string' },
          last: { type: 'string' },
          firstCulture: { type: 'string' },
          lastCulture: { type: 'string' },
        },
        required: ['first', 'last', 'firstCulture', 'lastCulture'],
      },
    },
  },
  required: ['names'],
};

const SYSTEM_PROMPT = `You are a fantasy name generator for tabletop RPGs. Given a culture for first names and a culture for surnames (each may be "Random"), generate the requested number of name pairs.

Rules:
- Generate authentic-feeling names drawn from the requested culture's naming conventions. Real-world cultures should use historically grounded names; fantasy cultures (Elven, Dwarven, Orcish, etc.) should follow common genre conventions for that race or tradition.
- When a culture is "Random", pick any culture you like for that part — and vary it across the list so different rows draw from different traditions.
- The first-name and surname cultures may differ; mixed-heritage names are fine.
- "firstCulture" and "lastCulture" should be a short label naming the tradition you actually drew that part from (e.g. "Norse", "Japanese", "Elven"). If the user asked for a specific culture, echo it.
- Do not repeat names across the list.
- If a gender is specified, respect it for the given name. If "Any", produce a mix.
- Some cultures use patronymics, clan names, or no surnames — in those cases, give an authentic surname-equivalent (patronymic, clan, byname). Never leave "last" empty.
- Return ONLY the structured JSON — no commentary.`;

export async function POST(req: NextRequest) {
  const idToken = readBearerToken(req.headers.get('authorization'));
  if (!idToken) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  const verified = await verifyPro(idToken);
  if (!verified.ok) return NextResponse.json({ error: verified.message }, { status: verified.status });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Server missing ANTHROPIC_API_KEY' }, { status: 500 });
  }

  let body: { firstCulture?: unknown; lastCulture?: unknown; gender?: unknown; count?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const clean = (v: unknown, fallback: string, max = 60): string => {
    const s = typeof v === 'string' ? v.trim() : '';
    return (s || fallback).slice(0, max);
  };

  const firstCulture = clean(body.firstCulture, 'Random');
  const lastCulture = clean(body.lastCulture, 'Random');
  const gender = clean(body.gender, 'Any', 20);
  const rawCount = Number(body.count);
  const count = Math.max(1, Math.min(20, Number.isFinite(rawCount) ? Math.floor(rawCount) : 8));

  const userMessage = `Generate ${count} name pair${count === 1 ? '' : 's'}.
First-name culture: ${firstCulture}
Surname culture: ${lastCulture}
Gender: ${gender}`;

  const client = new Anthropic({ apiKey });

  let response: Anthropic.Messages.Message;
  try {
    response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
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
          schema: NAMES_JSON_SCHEMA,
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

  let parsed: { names?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    return NextResponse.json(
      { error: 'Model did not return valid JSON', raw: text.slice(0, 2000) },
      { status: 502 },
    );
  }

  const names = Array.isArray(parsed.names)
    ? (parsed.names as unknown[]).flatMap((row) => {
        if (!row || typeof row !== 'object') return [];
        const r = row as Record<string, unknown>;
        const first = typeof r.first === 'string' ? r.first.trim() : '';
        const last = typeof r.last === 'string' ? r.last.trim() : '';
        if (!first && !last) return [];
        return [{
          first,
          last,
          firstCulture: typeof r.firstCulture === 'string' ? r.firstCulture : '',
          lastCulture: typeof r.lastCulture === 'string' ? r.lastCulture : '',
        }];
      })
    : [];

  return NextResponse.json({
    names,
    usage: {
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
      cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? 0,
      cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
    },
  });
}
