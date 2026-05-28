/**
 * Error type and the fragile-but-load-bearing auth-error detection used by the
 * Anthropic bridge. The string-based checks are intentionally preserved
 * verbatim (status 401, or the substrings `'401'` / `'x-api-key'`); they are
 * isolated here so the heuristic lives in exactly one place.
 */

export class APIError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'APIError';
    this.status = status;
  }
}

/**
 * Returns true when an error from the real Anthropic client looks like an
 * authentication failure that should trigger the Gemini fallback.
 */
export function isAuthError(err: unknown): boolean {
  const status = (err as { status?: unknown } | null | undefined)?.status;
  return status === 401 || String(err).includes('401') || String(err).includes('x-api-key');
}
