import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { readBearerToken, verifyPro } from '@/lib/verify-pro';
import { enforceRateLimit } from '@/lib/rate-limit';
import { TITLE_SYSTEM_PROMPT } from '@/lib/assistant/prompt';

export const runtime = 'nodejs';
export const maxDuration = 30;

const MODEL = 'claude-haiku-4-5-20251001';
const MAX_MESSAGE_CHARS = 2000;

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function fallbackTitle(text: string): string {
  const words = text.trim().split(/\s+/).slice(0, 5).join(' ');
  return words.slice(0, 60) || 'New Conversation';
}

export async function POST(req: NextRequest) {
  const idToken = readBearerToken(req.headers.get('authorization'));
  if (!idToken) return jsonError(401, 'Not signed in');

  const verified = await verifyPro(idToken);
  if (!verified.ok) return jsonError(verified.status, verified.message);

  const burst = enforceRateLimit(verified.uid);
  if (burst) return burst;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError(400, 'Invalid JSON body.');
  }
  const message = String((raw as Record<string, unknown>)?.message ?? '')
    .trim()
    .slice(0, MAX_MESSAGE_CHARS);
  if (!message) return jsonError(400, 'Missing message.');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return Response.json({ title: fallbackTitle(message) });

  try {
    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model: MODEL,
      max_tokens: 24,
      system: TITLE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: message }],
    });
    const text = resp.content
      .map((c) => (c.type === 'text' ? c.text : ''))
      .join('')
      .trim()
      .replace(/^["']|["'.]+$/g, '');
    const title = (text || fallbackTitle(message)).split(/\s+/).slice(0, 6).join(' ').slice(0, 60);
    return Response.json({ title });
  } catch {
    return Response.json({ title: fallbackTitle(message) });
  }
}
