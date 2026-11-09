import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { readBearerToken, verifyPro } from '@/lib/verify-pro';
import { enforceRateLimit } from '@/lib/rate-limit';
import { buildLoreRagContext, type LoreRagMode } from '@/lib/loreRagContext';

export const runtime = 'nodejs';
export const maxDuration = 60;

type LoreRagRequest = {
  mode: LoreRagMode;
  selectedLocationId?: string;
  targetCr?: string;
  customNotes?: string;
  data?: Record<string, any>;
};

const VALID_MODES = new Set<LoreRagMode>(['rumors', 'deltas', 'statblock', 'item']);
const MAX_DATA_BYTES = 120_000;

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

  let body: LoreRagRequest;
  try {
    body = (await req.json()) as LoreRagRequest;
  } catch {
    return jsonError(400, 'Invalid JSON body.');
  }

  if (!body.mode || !VALID_MODES.has(body.mode)) {
    return jsonError(400, 'Invalid or missing mode.');
  }

  const data =
    body.data && typeof body.data === 'object' && !Array.isArray(body.data) ? body.data : {};
  if (JSON.stringify(data).length > MAX_DATA_BYTES) {
    return jsonError(400, 'Campaign context too large.');
  }

  const bundle = buildLoreRagContext(data, { selectedLocationId: body.selectedLocationId });
  const userPrompt = bundle.promptForMode(
    body.mode,
    typeof body.customNotes === 'string' ? body.customNotes.slice(0, 1000) : '',
    typeof body.targetCr === 'string' ? body.targetCr.slice(0, 10) : '2'
  );

  const client = new Anthropic({ apiKey });

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system:
        'You are the Lore-Grounded RAG Prep & Stat-Block Assistant for a tabletop RPG campaign. Always ground every name, rumor, consequence, stat block, and item mechanic in the provided Module 2 Lore Graph (@EntityName links) and Module 3 Faction Clocks. Wrap GM-only secrets in ||spoiler|| delimiters.',
      messages: [{ role: 'user', content: userPrompt }],
    });

    const text = msg.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n');

    return new Response(JSON.stringify({ markdown: text }), {
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
    return jsonError(500, message);
  }
}
