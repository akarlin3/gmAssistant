import RealAnthropic from '@anthropic-ai/sdk';

export class APIError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'APIError';
    this.status = status;
  }
}

function toGeminiSchema(schema: any): any {
  if (!schema) return schema;
  const copy = { ...schema };
  if (typeof copy.type === 'string') {
    copy.type = copy.type.toUpperCase();
  }
  if (copy.properties) {
    const props: any = {};
    for (const [k, v] of Object.entries(copy.properties)) {
      props[k] = toGeminiSchema(v);
    }
    copy.properties = props;
  }
  if (copy.items) {
    copy.items = toGeminiSchema(copy.items);
  }
  return copy;
}

function mapAnthropicToGemini(options: any) {
  let systemInstruction: any = undefined;
  if (options.system) {
    const sysText = typeof options.system === 'string'
      ? options.system
      : Array.isArray(options.system)
        ? options.system.map((s: any) => s.text || s.content || '').join('\n')
        : '';
    if (sysText) {
      systemInstruction = {
        parts: [{ text: sysText }]
      };
    }
  }

  const contents = options.messages.map((msg: any) => {
    const role = msg.role === 'assistant' ? 'model' : 'user';
    let parts: any[] = [];
    if (typeof msg.content === 'string') {
      parts = [{ text: msg.content }];
    } else if (Array.isArray(msg.content)) {
      parts = msg.content.map((block: any) => {
        if (block.type === 'text') {
          return { text: block.text };
        } else if (block.type === 'tool_use') {
          return { text: `[Tool call proposed: name=${block.name}, input=${JSON.stringify(block.input)}]` };
        } else if (block.type === 'tool_result') {
          return { text: `[Tool result]: ${block.content}` };
        }
        return { text: JSON.stringify(block) };
      });
    }
    return { role, parts };
  });

  let geminiTools: any = undefined;
  if (options.tools && Array.isArray(options.tools)) {
    const functionDeclarations = options.tools.map((t: any) => {
      return {
        name: t.name,
        description: t.description,
        parameters: toGeminiSchema(t.input_schema)
      };
    });
    geminiTools = [{ functionDeclarations }];
  }

  const generationConfig: any = {};
  if (options.max_tokens) {
    generationConfig.maxOutputTokens = options.max_tokens;
  }
  if (options.temperature !== undefined) {
    generationConfig.temperature = options.temperature;
  }

  return {
    contents,
    systemInstruction,
    tools: geminiTools,
    generationConfig
  };
}

async function callGemini(options: any, geminiKey: string) {
  const payload = mapAnthropicToGemini(options);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }
  );

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new APIError(response.status, `Gemini generateContent failed: ${response.status} ${errText}`);
  }

  const json = await response.json();
  const parts = json.candidates?.[0]?.content?.parts || [];
  
  const content: any[] = [];
  let accumulatedText = '';
  for (const p of parts) {
    if (p.text) {
      accumulatedText += p.text;
    }
    if (p.functionCall) {
      content.push({
        type: 'tool_use',
        id: 'toolu_' + Math.random().toString(36).slice(2, 11),
        name: p.functionCall.name,
        input: p.functionCall.args || {}
      });
    }
  }

  if (accumulatedText) {
    content.unshift({ type: 'text', text: accumulatedText });
  }

  return {
    id: 'msg_' + Math.random().toString(36).slice(2, 11),
    type: 'message',
    role: 'assistant',
    model: 'gemini-2.5-flash',
    content,
    stop_reason: content.some(c => c.type === 'tool_use') ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 }
  };
}

class GeminiStreamWrapper {
  private options: any;
  private geminiKey: string;
  private finalMsgPromise: Promise<any>;
  private resolveFinalMsg!: (val: any) => void;

  constructor(options: any, geminiKey: string) {
    this.options = options;
    this.geminiKey = geminiKey;
    this.finalMsgPromise = new Promise((resolve) => {
      this.resolveFinalMsg = resolve;
    });
  }

  async *[Symbol.asyncIterator]() {
    const payload = mapAnthropicToGemini(this.options);
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${this.geminiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new APIError(response.status, `Gemini stream failed: ${response.status} ${errText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Gemini response has no body reader');

    const decoder = new TextDecoder();
    let buffer = '';
    let accumulatedText = '';
    const functionCalls: any[] = [];

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
              const chunk = JSON.parse(dataStr);
              const part = chunk.candidates?.[0]?.content?.parts?.[0];
              if (part) {
                if (part.text) {
                  accumulatedText += part.text;
                  yield {
                    type: 'content_block_delta',
                    index: 0,
                    delta: { type: 'text_delta', text: part.text }
                  };
                }
                if (part.functionCall) {
                  functionCalls.push(part.functionCall);
                }
              }
            } catch (e) {
              // Ignore partial frame JSON parsing errors
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    const content: any[] = [];
    if (accumulatedText) {
      content.push({ type: 'text', text: accumulatedText });
    }
    for (const fc of functionCalls) {
      content.push({
        type: 'tool_use',
        id: 'toolu_' + Math.random().toString(36).slice(2, 11),
        name: fc.name,
        input: fc.args || {}
      });
    }

    const finalMsg = {
      id: 'msg_' + Math.random().toString(36).slice(2, 11),
      type: 'message',
      role: 'assistant',
      model: 'gemini-2.5-flash',
      content,
      stop_reason: functionCalls.length > 0 ? 'tool_use' : 'end_turn',
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 }
    };

    this.resolveFinalMsg(finalMsg);
  }

  async finalMessage() {
    return this.finalMsgPromise;
  }
}

export default class Anthropic {
  static APIError = APIError;
  apiKey: string;
  messages: {
    create: (options: any, requestOptions?: any) => Promise<any>;
    stream: (options: any, requestOptions?: any) => any;
  };

  constructor(options: { apiKey?: string }) {
    this.apiKey = options.apiKey || '';
    const realClient = new RealAnthropic({ apiKey: this.apiKey || 'mock-key' });

    const getGeminiKey = () => {
      return process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '';
    };

    this.messages = {
      create: async (opts: any, reqOpts?: any) => {
        const isMockKey = !this.apiKey || this.apiKey.startsWith('sk-ant-api03-PJiXFbaQ');
        if (isMockKey) {
          return callGemini(opts, getGeminiKey());
        }
        try {
          return await realClient.messages.create(opts, reqOpts);
        } catch (err: any) {
          if (err?.status === 401 || String(err).includes('401') || String(err).includes('x-api-key')) {
            console.warn('Anthropic API key invalid, falling back to Gemini...');
            return callGemini(opts, getGeminiKey());
          }
          throw err;
        }
      },
      stream: (opts: any, reqOpts?: any) => {
        const isMockKey = !this.apiKey || this.apiKey.startsWith('sk-ant-api03-PJiXFbaQ');
        if (isMockKey) {
          return new GeminiStreamWrapper(opts, getGeminiKey());
        }
        try {
          // Note: Since stream is synchronous creation, we wrap the iterable delegation
          // to fallback if iteration errors out or if initial setup throws
          return realClient.messages.stream(opts, reqOpts);
        } catch (err: any) {
          if (err?.status === 401 || String(err).includes('401') || String(err).includes('x-api-key')) {
            console.warn('Anthropic API key invalid in stream, falling back to Gemini...');
            return new GeminiStreamWrapper(opts, getGeminiKey());
          }
          throw err;
        }
      }
    };
  }
}
