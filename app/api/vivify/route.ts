import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { readBearerToken, verifyPro } from '@/lib/verify-pro';

export const runtime = 'nodejs';
export const maxDuration = 60;

type VivifyRequest = {
  systemPrompt: string;
  userMessage: string;
};

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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return jsonError(500, 'Server missing ANTHROPIC_API_KEY');

  let body: VivifyRequest;
  try {
    body = (await req.json()) as VivifyRequest;
  } catch {
    return jsonError(400, 'Invalid JSON body.');
  }

  if (!body.systemPrompt || !body.userMessage) {
    return jsonError(400, 'Missing systemPrompt or userMessage.');
  }

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
          system: body.systemPrompt,
          messages: [{ role: 'user', content: body.userMessage }],
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
