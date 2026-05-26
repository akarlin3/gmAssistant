import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { readBearerToken, verifyPro } from '@/lib/verify-pro';
import { enforceRateLimit } from '@/lib/rate-limit';
import { TEMPLATES, buildSystemPrompt, type CampaignData } from '@/lib/vivifyContext';

export const runtime = 'nodejs';
export const maxDuration = 60;

// The system prompt is built server-side from a known template id. The client
// never supplies the system prompt directly — otherwise a Pro user could use
// this endpoint as an unrestricted general-purpose Claude proxy on our bill.
type VivifyRequest = {
  templateId: string;
  input: string;
  data?: CampaignData;
};

const MAX_INPUT_CHARS = 4000;
const MAX_DATA_BYTES = 100_000;

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

  let body: VivifyRequest;
  try {
    body = (await req.json()) as VivifyRequest;
  } catch {
    return jsonError(400, 'Invalid JSON body.');
  }

  const template = TEMPLATES.find((t) => t.id === body.templateId);
  if (!template) return jsonError(400, 'Unknown or missing templateId.');

  const input = typeof body.input === 'string' ? body.input.trim() : '';
  if (!input) return jsonError(400, 'Missing input.');
  if (input.length > MAX_INPUT_CHARS) {
    return jsonError(400, `Input too long (max ${MAX_INPUT_CHARS} characters).`);
  }

  const data: CampaignData =
    body.data && typeof body.data === 'object' && !Array.isArray(body.data) ? body.data : {};
  if (JSON.stringify(data).length > MAX_DATA_BYTES) {
    return jsonError(400, 'Campaign context too large.');
  }

  const systemPrompt = buildSystemPrompt(template, data);

  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sseSend = (event: string, data: object) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        const response = client.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 2048,
          system: systemPrompt,
          messages: [{ role: 'user', content: input }],
        });

        for await (const event of response) {
          if (
            event.type === 'content_block_delta' &&
            event.delta.type === 'text_delta'
          ) {
            sseSend('chunk', { text: event.delta.text });
          } else if (event.type === 'message_stop') {
            sseSend('done', {});
          }
        }

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
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
