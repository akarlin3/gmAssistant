/**
 * Composite stream wrappers that implement the fallback chain:
 *
 *   real Anthropic  ->  (on auth error)  ->  Gemini  ->  (on any error)  ->  mock
 *
 * Each wrapper exposes the same `AsyncIterable` + `finalMessage()` surface as
 * the real SDK's streaming helper, so consumers iterate uniformly.
 */

import { isAuthError } from './errors';
import { GeminiStreamWrapper } from './gemini';
import { MockStreamWrapper } from './mock';
import type { MessageCreateOptions, MessageResponse, StreamChunk, StreamWrapper } from './types';

/** Tries Gemini streaming, falling back to the simulated mock stream. */
export class SafeStreamWrapper implements StreamWrapper {
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

  async finalMessage(): Promise<MessageResponse> {
    return this.finalMsgPromise;
  }
}

/**
 * A real Anthropic-SDK streaming handle: async-iterable with a `finalMessage()`.
 * Typed against this module's chunk/response shapes since, on the happy path,
 * the wrapper just forwards the upstream chunks through unchanged.
 */
interface RealStreamHandle extends AsyncIterable<StreamChunk> {
  finalMessage(): Promise<MessageResponse>;
}

/**
 * The real Anthropic streaming helper this wrapper delegates to. The upstream
 * SDK's `stream` signature is intentionally not re-stated here (it requires the
 * full request type); we only depend on it returning a {@link RealStreamHandle}.
 */
export interface RealStreamSource {
  messages: {
    stream(options: MessageCreateOptions, requestOptions?: unknown): RealStreamHandle;
  };
}

/**
 * Streams from the real Anthropic client; on an auth error mid-stream it
 * switches to the Gemini/mock {@link SafeStreamWrapper} chain.
 */
export class FallbackStreamWrapper implements StreamWrapper {
  private realClient: RealStreamSource;
  private options: MessageCreateOptions;
  private requestOptions: unknown;
  private geminiKey: string;
  private finalMsgPromise: Promise<MessageResponse>;
  private resolveFinalMsg!: (val: MessageResponse) => void;

  constructor(
    realClient: RealStreamSource,
    options: MessageCreateOptions,
    requestOptions: unknown,
    geminiKey: string
  ) {
    this.realClient = realClient;
    this.options = options;
    this.requestOptions = requestOptions;
    this.geminiKey = geminiKey;
    this.finalMsgPromise = new Promise((resolve) => {
      this.resolveFinalMsg = resolve;
    });
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<StreamChunk> {
    try {
      const stream = this.realClient.messages.stream(this.options, this.requestOptions);
      for await (const chunk of stream) {
        yield chunk;
      }
      this.resolveFinalMsg(await stream.finalMessage());
      return;
    } catch (err) {
      if (isAuthError(err)) {
        console.warn('[AI client] Anthropic API key invalid in stream iterator, trying Gemini fallback...');
        const fallback = new SafeStreamWrapper(this.options, this.geminiKey);
        for await (const chunk of fallback) {
          yield chunk;
        }
        this.resolveFinalMsg(await fallback.finalMessage());
      } else {
        throw err;
      }
    }
  }

  async finalMessage(): Promise<MessageResponse> {
    return this.finalMsgPromise;
  }
}
