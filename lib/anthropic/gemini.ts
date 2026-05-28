/**
 * Gemini fallback provider for the Anthropic-compatible bridge.
 *
 * Responsibilities:
 *  - translate Anthropic request options into Gemini `generateContent` payloads
 *  - transform Anthropic JSON schemas into Gemini's schema dialect
 *  - call Gemini (buffered and streaming) and re-shape its responses back into
 *    Anthropic-shaped messages/stream chunks
 *
 * Behavior is preserved exactly from the original inline implementation.
 */

import { APIError } from './errors';
import { newMessageId, newToolUseId } from './ids';
import {
  buildMessageResponse,
  type JsonSchema,
  type MessageCreateOptions,
  type MessageResponse,
  type ResponseContentBlock,
  type StreamChunk,
  type StreamWrapper,
} from './types';

const GEMINI_MODEL = 'gemini-2.5-flash';

/** Shapes we read off Gemini responses. */
interface GeminiFunctionCall {
  name: string;
  args?: Record<string, unknown>;
}
interface GeminiPart {
  text?: string;
  functionCall?: GeminiFunctionCall;
}
interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: GeminiPart[] } }>;
}

/** Recursively upper-cases `type` and recurses into properties/items. */
export function toGeminiSchema(schema: JsonSchema | undefined): JsonSchema | undefined {
  if (!schema) return schema;
  const copy: JsonSchema = { ...schema };
  if (typeof copy.type === 'string') {
    copy.type = copy.type.toUpperCase();
  }
  if (copy.properties) {
    const props: Record<string, JsonSchema> = {};
    for (const [k, v] of Object.entries(copy.properties)) {
      props[k] = toGeminiSchema(v) as JsonSchema;
    }
    copy.properties = props;
  }
  if (copy.items) {
    copy.items = toGeminiSchema(copy.items) as JsonSchema;
  }
  return copy;
}

interface GeminiPayload {
  contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>;
  systemInstruction: { parts: Array<{ text: string }> } | undefined;
  tools: Array<{ functionDeclarations: Array<{ name: string; description?: string; parameters?: JsonSchema }> }> | undefined;
  generationConfig: { maxOutputTokens?: number; temperature?: number };
}

export function mapAnthropicToGemini(options: MessageCreateOptions): GeminiPayload {
  let systemInstruction: GeminiPayload['systemInstruction'] = undefined;
  if (options.system) {
    const sysText =
      typeof options.system === 'string'
        ? options.system
        : Array.isArray(options.system)
          ? options.system.map((s) => s.text || s.content || '').join('\n')
          : '';
    if (sysText) {
      systemInstruction = { parts: [{ text: sysText }] };
    }
  }

  const contents = options.messages.map((msg) => {
    const role: 'user' | 'model' = msg.role === 'assistant' ? 'model' : 'user';
    let parts: Array<{ text: string }> = [];
    if (typeof msg.content === 'string') {
      parts = [{ text: msg.content }];
    } else if (Array.isArray(msg.content)) {
      parts = msg.content.map((block) => {
        if (block.type === 'text') {
          return { text: (block as { text: string }).text };
        } else if (block.type === 'tool_use') {
          const b = block as { name: string; input: unknown };
          return { text: `[Tool call proposed: name=${b.name}, input=${JSON.stringify(b.input)}]` };
        } else if (block.type === 'tool_result') {
          return { text: `[Tool result]: ${(block as { content?: unknown }).content}` };
        }
        return { text: JSON.stringify(block) };
      });
    }
    return { role, parts };
  });

  let geminiTools: GeminiPayload['tools'] = undefined;
  if (options.tools && Array.isArray(options.tools)) {
    const functionDeclarations = options.tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: toGeminiSchema(t.input_schema),
    }));
    geminiTools = [{ functionDeclarations }];
  }

  const generationConfig: GeminiPayload['generationConfig'] = {};
  if (options.max_tokens) {
    generationConfig.maxOutputTokens = options.max_tokens;
  }
  if (options.temperature !== undefined) {
    generationConfig.temperature = options.temperature;
  }

  return { contents, systemInstruction, tools: geminiTools, generationConfig };
}

function geminiUrl(method: 'generateContent' | 'streamGenerateContent', geminiKey: string): string {
  const query = method === 'streamGenerateContent' ? `alt=sse&key=${geminiKey}` : `key=${geminiKey}`;
  return `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:${method}?${query}`;
}

export async function callGemini(
  options: MessageCreateOptions,
  geminiKey: string
): Promise<MessageResponse> {
  if (!geminiKey) {
    throw new APIError(403, 'Missing Gemini API Key');
  }

  const payload = mapAnthropicToGemini(options);
  const response = await fetch(geminiUrl('generateContent', geminiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new APIError(response.status, `Gemini generateContent failed: ${response.status} ${errText}`);
  }

  const json = (await response.json()) as GeminiResponse;
  const parts = json.candidates?.[0]?.content?.parts || [];

  const content: ResponseContentBlock[] = [];
  let accumulatedText = '';
  for (const p of parts) {
    if (p.text) {
      accumulatedText += p.text;
    }
    if (p.functionCall) {
      content.push({
        type: 'tool_use',
        id: newToolUseId(),
        name: p.functionCall.name,
        input: p.functionCall.args || {},
      });
    }
  }

  if (accumulatedText) {
    content.unshift({ type: 'text', text: accumulatedText });
  }

  return buildMessageResponse(GEMINI_MODEL, content, newMessageId);
}

export class GeminiStreamWrapper implements StreamWrapper {
  private options: MessageCreateOptions;
  private geminiKey: string;
  private finalMsgPromise: Promise<MessageResponse>;
  private resolveFinalMsg!: (val: MessageResponse) => void;

  constructor(options: MessageCreateOptions, geminiKey: string) {
    this.options = options;
    this.geminiKey = geminiKey;
    this.finalMsgPromise = new Promise((resolve) => {
      this.resolveFinalMsg = resolve;
    });
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<StreamChunk> {
    const payload = mapAnthropicToGemini(this.options);
    const response = await fetch(geminiUrl('streamGenerateContent', this.geminiKey), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new APIError(response.status, `Gemini stream failed: ${response.status} ${errText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Gemini response has no body reader');

    const decoder = new TextDecoder();
    let buffer = '';
    let accumulatedText = '';
    const functionCalls: GeminiFunctionCall[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (!dataStr) continue;
            try {
              const chunk = JSON.parse(dataStr) as GeminiResponse;
              const part = chunk.candidates?.[0]?.content?.parts?.[0];
              if (part) {
                if (part.text) {
                  accumulatedText += part.text;
                  yield {
                    type: 'content_block_delta',
                    index: 0,
                    delta: { type: 'text_delta', text: part.text },
                  };
                }
                if (part.functionCall) {
                  functionCalls.push(part.functionCall);
                }
              }
            } catch {
              // Ignore partial JSON chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const content: ResponseContentBlock[] = [];
    if (accumulatedText) {
      content.push({ type: 'text', text: accumulatedText });
    }
    for (const fc of functionCalls) {
      content.push({
        type: 'tool_use',
        id: newToolUseId(),
        name: fc.name,
        input: fc.args || {},
      });
    }

    const finalMsg = buildMessageResponse(GEMINI_MODEL, content, newMessageId);

    yield { type: 'message_stop' };

    this.resolveFinalMsg(finalMsg);
  }

  async finalMessage(): Promise<MessageResponse> {
    return this.finalMsgPromise;
  }
}
