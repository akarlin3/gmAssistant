import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { readBearerToken, verifyPro } from '@/lib/verify-pro';
import { enforceRateLimit } from '@/lib/rate-limit';
import { buildVoiceCheckPrompt } from '@/lib/scene/prompt';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_FIELD_CHARS = 2000;

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(req: NextRequest) {
  const idToken = readBearerToken(req.headers.get('authorization'));
  if (!idToken) return jsonError(401, 'Not signed in');

  const verified = await verifyPro(idToken);
  if (!verified.ok) return jsonError(verified.status, verified.message);

  const limited = enforceRateLimit(verified.uid);
  if (limited) return limited;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return jsonError(500, 'Server missing ANTHROPIC_API_KEY');

  let body: { traits?: unknown; voice?: unknown; line?: unknown };
  try {
    body = (await req.json()) as { traits?: unknown; voice?: unknown; line?: unknown };
  } catch {
    return jsonError(400, 'Invalid JSON body.');
  }

  const traits = typeof body.traits === 'string' ? body.traits.slice(0, MAX_FIELD_CHARS) : '';
  const voice = typeof body.voice === 'string' ? body.voice.slice(0, MAX_FIELD_CHARS) : '';
  const line = typeof body.line === 'string' ? body.line.slice(0, MAX_FIELD_CHARS) : '';
  if (!line) return jsonError(400, 'Missing line.');
  // Nothing to check against — treat as consistent.
  if (!traits && !voice) {
    return new Response(JSON.stringify({ verdict: 'OK' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 128,
      messages: [{ role: 'user', content: buildVoiceCheckPrompt({ traits, voice, line }) }],
    });
    const verdict = resp.content
      .map((c) => (c.type === 'text' ? c.text : ''))
      .join('')
      .trim();
    return new Response(JSON.stringify({ verdict }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message =
      err instanceof Anthropic.APIError
        ? `Claude API error (${err.status}): ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    return jsonError(502, message);
  }
}
