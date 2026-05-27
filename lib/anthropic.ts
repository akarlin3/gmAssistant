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
  if (!geminiKey) {
    throw new APIError(403, 'Missing Gemini API Key');
  }

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

function getMockResponse(options: any) {
  const content: any[] = [];
  const lastUserMsg = [...options.messages].reverse().find((m: any) => m.role === 'user');
  const userText = typeof lastUserMsg?.content === 'string'
    ? lastUserMsg.content
    : Array.isArray(lastUserMsg?.content)
      ? lastUserMsg.content.map((c: any) => c.text || '').join(' ')
      : 'hello';

  let responseText = `[Simulated Assistant in Development Mode]\n`;
  responseText += `Hello! Your API keys are either missing or restricted, so I am running in simulated development mode. You asked: "${userText.slice(0, 100)}..."\n\n`;

  if (userText.toLowerCase().includes('npc') || userText.toLowerCase().includes('character')) {
    responseText += `Here is a simulated NPC proposal for your campaign:`;
    content.push({
      type: 'tool_use',
      id: 'toolu_' + Math.random().toString(36).slice(2, 11),
      name: 'createNpc',
      input: {
        name: 'Gromph Baenre',
        title: 'Archmage of Menzoberranzan',
        traits: 'Ambitious, cold, calculating, intensely intelligent',
        voice: 'Raspy, slow, menacingly formal',
        goals: 'Maintain political power and unlock ancient shadow magic'
      }
    });
  } else if (userText.toLowerCase().includes('secret') || userText.toLowerCase().includes('clue')) {
    responseText += `Here is a simulated secret proposal for your session prep:`;
    content.push({
      type: 'tool_use',
      id: 'toolu_' + Math.random().toString(36).slice(2, 11),
      name: 'createSecret',
      input: {
        rawText: 'The Archmage is secretly smuggling shadow daggers into the city.'
      }
    });
  } else {
    responseText += `I can help you build NPCs, write secrets, outline scenes, or prep your sessions! Try asking me to "create an NPC" or "generate a secret" to see how tool proposals work.`;
  }

  content.unshift({ type: 'text', text: responseText });

  return {
    id: 'msg_' + Math.random().toString(36).slice(2, 11),
    type: 'message',
    role: 'assistant',
    model: 'mock-assistant',
    content,
    stop_reason: content.some(c => c.type === 'tool_use') ? 'tool_use' : 'end_turn',
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 }
  };
}

class MockStreamWrapper {
  private options: any;
  private finalMsgPromise: Promise<any>;
  private resolveFinalMsg!: (val: any) => void;

  constructor(options: any) {
    this.options = options;
    this.finalMsgPromise = new Promise((resolve) => {
      this.resolveFinalMsg = resolve;
    });
  }

  async *[Symbol.asyncIterator]() {
    const mock = getMockResponse(this.options);
    const textBlock = mock.content.find(c => c.type === 'text');
    const text = textBlock ? textBlock.text : '';

    const chunks = text.split(/(\s+)/);
    for (const chunk of chunks) {
      if (!chunk) continue;
      yield {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'text_delta', text: chunk }
      };
      await new Promise(resolve => setTimeout(resolve, 30));
    }

    yield {
      type: 'message_stop'
    };

    this.resolveFinalMsg(mock);
  }

  async finalMessage() {
    return this.finalMsgPromise;
  }
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
              // Ignore partial JSON chunks
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

    yield {
      type: 'message_stop'
    };

    this.resolveFinalMsg(finalMsg);
  }

  async finalMessage() {
    return this.finalMsgPromise;
  }
}

class SafeStreamWrapper {
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
    if (!this.geminiKey) {
      console.warn('[Writeback Reconciler / AI] Missing Gemini key, using simulated mock stream.');
      const mockStream = new MockStreamWrapper(this.options);
      for await (const chunk of mockStream) {
        yield chunk;
      }
      this.resolveFinalMsg(await mockStream.finalMessage());
      return;
    }

    try {
      const geminiStream = new GeminiStreamWrapper(this.options, this.geminiKey);
      for await (const chunk of geminiStream) {
        yield chunk;
      }
      this.resolveFinalMsg(await geminiStream.finalMessage());
    } catch (err) {
      console.warn('[Writeback Reconciler / AI] Gemini stream failed, using simulated mock stream fallback:', err);
      const mockStream = new MockStreamWrapper(this.options);
      for await (const chunk of mockStream) {
        yield chunk;
      }
      this.resolveFinalMsg(await mockStream.finalMessage());
    }
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
          try {
            return await callGemini(opts, getGeminiKey());
          } catch (geminiErr) {
            console.warn('[AI client] Gemini create failed, falling back to simulated mock:', geminiErr);
            return getMockResponse(opts);
          }
        }
        try {
          return await realClient.messages.create(opts, reqOpts);
        } catch (err: any) {
          if (err?.status === 401 || String(err).includes('401') || String(err).includes('x-api-key')) {
            console.warn('[AI client] Anthropic API key invalid, trying Gemini fallback...');
            try {
              return await callGemini(opts, getGeminiKey());
            } catch (geminiErr) {
              console.warn('[AI client] Gemini fallback failed, using simulated mock:', geminiErr);
              return getMockResponse(opts);
            }
          }
          throw err;
        }
      },
      stream: (opts: any, reqOpts?: any) => {
        const isMockKey = !this.apiKey || this.apiKey.startsWith('sk-ant-api03-PJiXFbaQ');
        if (isMockKey) {
          return new SafeStreamWrapper(opts, getGeminiKey());
        }
        try {
          return realClient.messages.stream(opts, reqOpts);
        } catch (err: any) {
          if (err?.status === 401 || String(err).includes('401') || String(err).includes('x-api-key')) {
            console.warn('[AI client] Anthropic API key invalid in stream, trying Gemini fallback...');
            return new SafeStreamWrapper(opts, getGeminiKey());
          }
          throw err;
        }
      }
    };
  }
}
