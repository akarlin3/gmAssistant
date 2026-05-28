/**
 * Simulated "development mode" responses for the Anthropic-compatible bridge.
 *
 * Used when no usable API key (Anthropic or Gemini) is available. The exact
 * text and tool-call fixtures are preserved verbatim from the original inline
 * implementation so downstream output is unchanged.
 */

import { newMessageId, newToolUseId } from './ids';
import {
  buildMessageResponse,
  type ContentBlock,
  type MessageCreateOptions,
  type MessageResponse,
  type ResponseContentBlock,
  type StreamChunk,
  type StreamWrapper,
} from './types';

const MOCK_MODEL = 'mock-assistant';

function lastUserText(options: MessageCreateOptions): string {
  const lastUserMsg = [...options.messages].reverse().find((m) => m.role === 'user');
  return typeof lastUserMsg?.content === 'string'
    ? lastUserMsg.content
    : Array.isArray(lastUserMsg?.content)
      ? (lastUserMsg.content as ContentBlock[])
          .map((c) => (c as { text?: string }).text || '')
          .join(' ')
      : 'hello';
}

export function getMockResponse(options: MessageCreateOptions): MessageResponse {
  const content: ResponseContentBlock[] = [];
  const userText = lastUserText(options);

  let responseText = `[Simulated Assistant in Development Mode]\n`;
  responseText += `Hello! Your API keys are either missing or restricted, so I am running in simulated development mode. You asked: "${userText.slice(0, 100)}..."\n\n`;

  if (userText.toLowerCase().includes('npc') || userText.toLowerCase().includes('character')) {
    responseText += `Here is a simulated NPC proposal for your campaign:`;
    content.push({
      type: 'tool_use',
      id: newToolUseId(),
      name: 'createNpc',
      input: {
        name: 'Gromph Baenre',
        title: 'Archmage of Menzoberranzan',
        traits: 'Ambitious, cold, calculating, intensely intelligent',
        voice: 'Raspy, slow, menacingly formal',
        goals: 'Maintain political power and unlock ancient shadow magic',
      },
    });
  } else if (userText.toLowerCase().includes('secret') || userText.toLowerCase().includes('clue')) {
    responseText += `Here is a simulated secret proposal for your session prep:`;
    content.push({
      type: 'tool_use',
      id: newToolUseId(),
      name: 'createSecret',
      input: {
        rawText: 'The Archmage is secretly smuggling shadow daggers into the city.',
      },
    });
  } else {
    responseText += `I can help you build NPCs, write secrets, outline scenes, or prep your sessions! Try asking me to "create an NPC" or "generate a secret" to see how tool proposals work.`;
  }

  content.unshift({ type: 'text', text: responseText });

  return buildMessageResponse(MOCK_MODEL, content, newMessageId);
}

export class MockStreamWrapper implements StreamWrapper {
  private options: MessageCreateOptions;
  private finalMsgPromise: Promise<MessageResponse>;
  private resolveFinalMsg!: (val: MessageResponse) => void;

  constructor(options: MessageCreateOptions) {
    this.options = options;
    this.finalMsgPromise = new Promise((resolve) => {
      this.resolveFinalMsg = resolve;
    });
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<StreamChunk> {
    const mock = getMockResponse(this.options);
    const textBlock = mock.content.find((c) => c.type === 'text');
    const text = textBlock ? (textBlock as { text: string }).text : '';

    const chunks = text.split(/(\s+)/);
    for (const chunk of chunks) {
      if (!chunk) continue;
      yield {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: chunk },
      };
      await new Promise((resolve) => setTimeout(resolve, 30));
    }

    yield { type: 'message_stop' };

    this.resolveFinalMsg(mock);
  }

  async finalMessage(): Promise<MessageResponse> {
    return this.finalMsgPromise;
  }
}
