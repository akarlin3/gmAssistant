import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { readBearerToken, verifyPro } from '@/lib/verify-pro';
import { enforceRateLimit } from '@/lib/rate-limit';
import { buildSummarizeTurnsPrompt } from '@/lib/scene/prompt';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'claude-sonnet-4-6';
const MAX_BODY_BYTES = 120_000;

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

  let body: { turns?: unknown };
  try {
    body = (await req.json()) as { turns?: unknown };
  } catch {
    return jsonError(400, 'Invalid JSON body.');
  }

  if (!Array.isArray(body.turns) || body.turns.length === 0) {
    return jsonError(400, 'Missing turns.');
  }
  const turnsJson = JSON.stringify(body.turns);
  if (turnsJson.length > MAX_BODY_BYTES) return jsonError(400, 'Too many turns to summarize.');

  try {
    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      messages: [{ role: 'user', content: buildSummarizeTurnsPrompt(turnsJson) }],
    });
    const summary = resp.content
      .map((c) => (c.type === 'text' ? c.text : ''))
      .join('')
      .trim();
    return new Response(JSON.stringify({ summary }), {
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
