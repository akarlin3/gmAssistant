/**
 * Anthropic-compatible client shim.
 *
 * This module is aliased to `@anthropic-ai/sdk` (see `next.config.js`), so it is
 * the SDK every consumer actually imports. It wraps the real Anthropic SDK and
 * layers a fallback chain on top:
 *
 *   real Anthropic  ->  (on auth error)  ->  Gemini  ->  (on any error)  ->  mock
 *
 * The public surface is intentionally identical to the upstream SDK pieces this
 * codebase uses: a default-exported `Anthropic` class exposing
 * `messages.create` / `messages.stream` and a `static APIError`, plus a named
 * `APIError` export. Implementation details live in `lib/anthropic/`.
 */

import RealAnthropic from '../node_modules/@anthropic-ai/sdk/index.mjs';

import { APIError, isAuthError } from './anthropic/errors';
import { callGemini } from './anthropic/gemini';
import { getMockResponse } from './anthropic/mock';
import {
  FallbackStreamWrapper,
  SafeStreamWrapper,
  type RealStreamSource,
} from './anthropic/stream-wrappers';

export { APIError };

/** Reads the Gemini fallback key from the environment. */
function getGeminiKey(): string {
  return process.env.GEMINI_API_KEY || process.env.NEXT_PUBLIC_FIREBASE_API_KEY || '';
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

    // The leading `sk-ant-api03-PJiXFbaQ` prefix marks the placeholder/demo key
    // that should always route to the simulated providers rather than the real
    // Anthropic API.
    const isMockKey = () =>
      !this.apiKey || this.apiKey.startsWith('sk-ant-api03-PJiXFbaQ');

    this.messages = {
      create: async (opts: any, reqOpts?: any) => {
        if (isMockKey()) {
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
          if (isAuthError(err)) {
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
        if (isMockKey()) {
          return new SafeStreamWrapper(opts, getGeminiKey());
        }
        return new FallbackStreamWrapper(
          realClient as unknown as RealStreamSource,
          opts,
          reqOpts,
          getGeminiKey()
        );
      },
    };
  }
}
