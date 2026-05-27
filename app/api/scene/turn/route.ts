import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { readBearerToken, verifyPro } from '@/lib/verify-pro';
import { enforceRateLimit } from '@/lib/rate-limit';
import {
  buildSceneTurnPrompt,
  buildSceneTurnRetryPrompt,
  type SceneTurnRequest,
} from '@/lib/scene/prompt';
import { extractJson, validateSceneTurnResponse } from '@/lib/scene/schema';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MODEL = 'claude-sonnet-4-6';
const MAX_ACTION_CHARS = 2000;
const MAX_BODY_BYTES = 120_000;

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Validate the structured request the client assembles (see lib/scene/context).
// The client never sends a raw system prompt — the server owns it — so this
// endpoint can't be repurposed as a general Claude proxy.
function validateRequest(
  raw: unknown,
): { ok: true; req: SceneTurnRequest } | { ok: false; message: string } {
  if (typeof raw !== 'object' || raw === null)
    return { ok: false, message: 'Invalid request body.' };
  const b = raw as Record<string, unknown>;

  const location = b.location as Record<string, unknown> | undefined;
  if (!location || typeof location.name !== 'string') {
    return { ok: false, message: 'Missing location.' };
  }
  if (!Array.isArray(b.npcs)) return { ok: false, message: 'Missing npcs.' };
  const newAction = typeof b.newAction === 'string' ? b.newAction.trim() : '';
  if (!newAction) return { ok: false, message: 'Missing newAction.' };
  if (newAction.length > MAX_ACTION_CHARS) {
    return { ok: false, message: `Action too long (max ${MAX_ACTION_CHARS} characters).` };
  }

  const npcs = (b.npcs as Array<Record<string, unknown>>).map((n) => ({
    id: typeof n.id === 'string' ? n.id : '',
    name: typeof n.name === 'string' ? n.name : '',
    traits: typeof n.traits === 'string' ? n.traits : '',
    voice: typeof n.voice === 'string' ? n.voice : '',
    goals: typeof n.goals === 'string' ? n.goals : '',
  }));

  const recentTurns = Array.isArray(b.recentTurns)
    ? (b.recentTurns as Array<Record<string, unknown>>).map((t) => ({
        pcAction: typeof t.pcAction === 'string' ? t.pcAction : '',
        response: t.response as SceneTurnRequest['recentTurns'][number]['response'],
        outcome: typeof t.outcome === 'string' ? t.outcome : undefined,
      }))
    : [];

  return {
    ok: true,
    req: {
      location: {
        id: typeof location.id === 'string' ? location.id : '',
        name: location.name,
        description: typeof location.description === 'string' ? location.description : '',
      },
      npcs,
      partyState: typeof b.partyState === 'string' ? b.partyState : '',
      earlierSummary: typeof b.earlierSummary === 'string' ? b.earlierSummary : null,
      recentTurns,
      newAction,
    },
  };
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

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonError(400, 'Invalid JSON body.');
  }
  if (JSON.stringify(rawBody ?? {}).length > MAX_BODY_BYTES) {
    return jsonError(400, 'Scene context too large.');
  }

  const validated = validateRequest(rawBody);
  if (!validated.ok) return jsonError(400, validated.message);

  const { req: sceneReq } = validated;
  const systemPrompt = buildSceneTurnPrompt(sceneReq);
  const presentNpcIds = sceneReq.npcs.map((n) => n.id).filter(Boolean);

  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sseSend = (event: string, data: object) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        // Pass 1 — stream so the UI shows live progress.
        let accumulated = '';
        const response = client.messages.stream({
          model: MODEL,
          max_tokens: 1536,
          system: systemPrompt,
          messages: [{ role: 'user', content: sceneReq.newAction }],
        });
        for await (const event of response) {
          if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
            accumulated += event.delta.text;
            sseSend('chunk', { text: event.delta.text });
          }
        }

        let parsed = validateSceneTurnResponse(extractJson(accumulated), presentNpcIds);

        // Pass 2 — one corrective retry if the JSON didn't validate.
        if (!parsed.ok) {
          const retry = await client.messages.create({
            model: MODEL,
            max_tokens: 1536,
            system: systemPrompt,
            messages: [
              { role: 'user', content: sceneReq.newAction },
              { role: 'assistant', content: accumulated },
              { role: 'user', content: buildSceneTurnRetryPrompt(parsed.errors) },
            ],
          });
          const retryText = retry.content.map((c) => (c.type === 'text' ? c.text : '')).join('');
          parsed = validateSceneTurnResponse(extractJson(retryText), presentNpcIds);
        }

        if (!parsed.ok) {
          sseSend('error', {
            error: `The model could not produce a valid scene turn: ${parsed.errors.join('; ')}`,
          });
        } else {
          sseSend('turn', { response: parsed.value });
        }
        sseSend('done', {});
        controller.close();
      } catch (err) {
        const message =
          err instanceof Anthropic.APIError
            ? `Claude API error (${err.status}): ${err.message}`
            : err instanceof Error
              ? err.message
              : String(err);
        sseSend('error', { error: message });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
