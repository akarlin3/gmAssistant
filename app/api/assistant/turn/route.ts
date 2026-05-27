import { NextRequest } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { readBearerToken, verifyPro } from '@/lib/verify-pro';
import { enforceRateLimit } from '@/lib/rate-limit';
import { enforceAssistantDailyLimit } from '@/lib/assistant/rate-limit';
import { ALL_TOOLS } from '@/lib/assistant/tools/schemas';
import { executeReadTool } from '@/lib/assistant/tools/read-impl';
import { buildSystemPrompt } from '@/lib/assistant/prompt';
import { isReadTool, isWriteTool, type ReadToolName } from '@/lib/assistant/types';
import { isPersonaId, DEFAULT_PERSONA } from '@/lib/assistant/personas';
import type { CampaignSnapshot } from '@/lib/assistant/context';

export const runtime = 'nodejs';
export const maxDuration = 120;

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 2048;
const MAX_BODY_BYTES = 400_000;
const MAX_API_MESSAGES = 80;
const MAX_LOOP_ITERS = 8;

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

type ToolResultInput = {
  toolUseId: string;
  ok: boolean;
  output?: unknown;
  rejectionReason?: string;
};

type TurnEvent =
  | { type: 'user'; text: string }
  | { type: 'tool_results'; results: ToolResultInput[] };

function validatePersona(v: unknown) {
  return isPersonaId(v) ? v : DEFAULT_PERSONA;
}

// Re-execute the unanswered read tool_uses in the last assistant message and
// merge with the user's write decisions, producing a single user message of
// tool_result blocks in the exact order the tool_uses appeared.
function buildToolResultMessage(
  lastAssistant: Anthropic.MessageParam | undefined,
  results: ToolResultInput[],
  snap: CampaignSnapshot,
): Anthropic.MessageParam | { error: string } {
  if (
    !lastAssistant ||
    lastAssistant.role !== 'assistant' ||
    !Array.isArray(lastAssistant.content)
  ) {
    return { error: 'No assistant turn awaiting tool results.' };
  }
  const toolUses = lastAssistant.content.filter(
    (b): b is Anthropic.ToolUseBlock =>
      typeof b === 'object' && b !== null && (b as { type?: string }).type === 'tool_use',
  );
  if (toolUses.length === 0) return { error: 'Last assistant turn had no tool calls.' };

  const byId = new Map(results.map((r) => [r.toolUseId, r]));
  const blocks: Anthropic.ToolResultBlockParam[] = toolUses.map((tu) => {
    if (isReadTool(tu.name)) {
      const out = executeReadTool(
        tu.name as ReadToolName,
        (tu.input ?? {}) as Record<string, unknown>,
        snap,
      );
      return { type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out) };
    }
    // Write tool — resolved by the user.
    const decision = byId.get(tu.id);
    if (!decision || decision.ok === false) {
      const reason = decision?.rejectionReason || 'The user declined this proposal.';
      return { type: 'tool_result', tool_use_id: tu.id, content: reason, is_error: true };
    }
    const content =
      typeof decision.output === 'string'
        ? decision.output
        : JSON.stringify(decision.output ?? { ok: true });
    return { type: 'tool_result', tool_use_id: tu.id, content };
  });

  return { role: 'user', content: blocks };
}

export async function POST(req: NextRequest) {
  const idToken = readBearerToken(req.headers.get('authorization'));
  if (!idToken) return jsonError(401, 'Not signed in');

  const verified = await verifyPro(idToken);
  if (!verified.ok) return jsonError(verified.status, verified.message);

  const burst = enforceRateLimit(verified.uid);
  if (burst) return burst;
  const daily = enforceAssistantDailyLimit(verified.uid);
  if (daily) return daily;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return jsonError(500, 'Server missing ANTHROPIC_API_KEY');

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonError(400, 'Invalid JSON body.');
  }
  if (JSON.stringify(raw ?? {}).length > MAX_BODY_BYTES) {
    return jsonError(400, 'Conversation context too large.');
  }

  const body = (raw ?? {}) as Record<string, unknown>;
  const snap = body.campaign as CampaignSnapshot | undefined;
  if (!snap || typeof snap !== 'object' || !Array.isArray(snap.npcs)) {
    return jsonError(400, 'Missing campaign snapshot.');
  }
  const persona = validatePersona(body.persona);
  const event = body.event as TurnEvent | undefined;
  if (!event || (event.type !== 'user' && event.type !== 'tool_results')) {
    return jsonError(400, 'Missing or invalid turn event.');
  }

  const priorMessages = Array.isArray(body.apiMessages)
    ? (body.apiMessages as Anthropic.MessageParam[])
    : [];
  if (priorMessages.length > MAX_API_MESSAGES) {
    return jsonError(400, 'Conversation too long. Start a new conversation.');
  }

  const messages: Anthropic.MessageParam[] = [...priorMessages];

  if (event.type === 'user') {
    const text = typeof event.text === 'string' ? event.text.trim() : '';
    if (!text) return jsonError(400, 'Empty message.');
    messages.push({ role: 'user', content: text });
  } else {
    const results = Array.isArray(event.results) ? event.results : [];
    const built = buildToolResultMessage(messages[messages.length - 1], results, snap);
    if ('error' in built) return jsonError(400, built.error);
    messages.push(built);
  }

  const systemPrompt = buildSystemPrompt({
    campaignTitle: snap.title,
    settingSummary: snap.settingSummary,
    persona,
    currentDay: snap.currentDay,
  });

  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const sseSend = (e: string, data: object) => {
        controller.enqueue(encoder.encode(`event: ${e}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      try {
        let finalText = '';
        // Read tool calls executed this turn, surfaced for display.
        const readCalls: Array<{ id: string; name: string; input: unknown; output: unknown }> = [];
        // Write tool calls awaiting user approval.
        let proposals: Array<{ id: string; name: string; input: unknown }> = [];

        for (let iter = 0; iter < MAX_LOOP_ITERS; iter++) {
          const turn = client.messages.stream({
            model: MODEL,
            max_tokens: MAX_TOKENS,
            system: systemPrompt,
            tools: ALL_TOOLS,
            messages,
          });

          for await (const ev of turn) {
            if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
              sseSend('chunk', { text: ev.delta.text });
            }
          }

          const msg = await turn.finalMessage();
          messages.push({ role: 'assistant', content: msg.content });

          const turnText = msg.content
            .filter((b): b is Anthropic.TextBlock => b.type === 'text')
            .map((b) => b.text)
            .join('');
          finalText = turnText;

          const toolUses = msg.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
          );
          if (toolUses.length === 0) break; // final answer

          const writes = toolUses.filter((t) => isWriteTool(t.name));

          if (writes.length === 0) {
            // Pure-read turn: auto-execute and feed results back, then loop.
            const resultBlocks: Anthropic.ToolResultBlockParam[] = toolUses.map((tu) => {
              const out = executeReadTool(
                tu.name as ReadToolName,
                (tu.input ?? {}) as Record<string, unknown>,
                snap,
              );
              readCalls.push({ id: tu.id, name: tu.name, input: tu.input, output: out });
              return { type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(out) };
            });
            messages.push({ role: 'user', content: resultBlocks });
            continue;
          }

          // Writes present → pause for user approval. Record reads (for display)
          // but do NOT answer them; the next turn re-executes them server-side.
          for (const tu of toolUses) {
            if (isReadTool(tu.name)) {
              const out = executeReadTool(
                tu.name as ReadToolName,
                (tu.input ?? {}) as Record<string, unknown>,
                snap,
              );
              readCalls.push({ id: tu.id, name: tu.name, input: tu.input, output: out });
            }
          }
          proposals = writes.map((tu) => ({ id: tu.id, name: tu.name, input: tu.input }));
          break;
        }

        sseSend('done', {
          assistantText: finalText,
          readCalls,
          proposals,
          apiMessages: messages,
        });
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
