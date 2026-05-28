/**
 * Minimal structural types for the Anthropic-compatible bridge.
 *
 * These describe only the shapes this shim actually reads or produces. They
 * intentionally stay loose (e.g. `[key: string]: unknown` passthroughs) so
 * that callers can keep passing the full Anthropic request/response objects
 * unchanged — the goal is to replace pervasive `any` with narrowable types,
 * not to lock down the entire SDK surface.
 */

/** A JSON-schema-ish object as accepted by Anthropic tool `input_schema`. */
export interface JsonSchema {
  type?: string;
  properties?: Record<string, JsonSchema>;
  items?: JsonSchema;
  [key: string]: unknown;
}

export interface TextBlock {
  type: 'text';
  text: string;
}

export interface ToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultBlock {
  type: 'tool_result';
  content?: unknown;
  [key: string]: unknown;
}

/** Any content block we might read off an incoming message. */
export type ContentBlock =
  | TextBlock
  | ToolUseBlock
  | ToolResultBlock
  | { type: string; [key: string]: unknown };

/** Content blocks we emit on a response message. */
export type ResponseContentBlock = TextBlock | ToolUseBlock;

export interface MessageParam {
  role: 'user' | 'assistant' | string;
  content: string | ContentBlock[];
}

export interface ToolParam {
  name: string;
  description?: string;
  input_schema?: JsonSchema;
  [key: string]: unknown;
}

export type SystemPrompt =
  | string
  | Array<{ text?: string; content?: string; [key: string]: unknown }>;

/** The subset of Anthropic `messages.create`/`stream` options we inspect. */
export interface MessageCreateOptions {
  system?: SystemPrompt;
  messages: MessageParam[];
  tools?: ToolParam[];
  max_tokens?: number;
  temperature?: number;
  [key: string]: unknown;
}

/** The Anthropic-shaped response message this shim returns. */
export interface MessageResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  model: string;
  content: ResponseContentBlock[];
  stop_reason: 'tool_use' | 'end_turn';
  stop_sequence: null;
  usage: { input_tokens: number; output_tokens: number };
}

/** A streaming chunk this shim yields (content delta or terminal stop). */
export type StreamChunk =
  | {
      type: 'content_block_delta';
      index: number;
      delta: { type: 'text_delta'; text: string };
    }
  | { type: 'message_stop' };

/** Common surface shared by every stream wrapper in this module. */
export interface StreamWrapper extends AsyncIterable<StreamChunk> {
  finalMessage(): Promise<MessageResponse>;
}

/** Builds an Anthropic-shaped response message from response content. */
export function buildMessageResponse(
  model: string,
  content: ResponseContentBlock[],
  newMessageId: () => string
): MessageResponse {
  return {
    id: newMessageId(),
    type: 'message',
    role: 'assistant',
    model,
    content,
    stop_reason: content.some((c) => c.type === 'tool_use') ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  };
}
