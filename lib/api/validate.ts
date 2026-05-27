// Lightweight request-validation helpers for the AI routes. Kept dependency-
// free (no schema lib) to match the existing manual-validation style in these
// handlers.

// campaignContext is built client-side from the user's own campaign and is
// otherwise unbounded — cap its serialized size so a single request can't push
// an enormous token payload to the model.
const MAX_CONTEXT_BYTES = 100_000;

export function contextTooLarge(ctx: unknown): boolean {
  if (ctx === undefined || ctx === null) return false;
  try {
    return JSON.stringify(ctx).length > MAX_CONTEXT_BYTES;
  } catch {
    // Circular / non-serializable input is itself invalid.
    return true;
  }
}
