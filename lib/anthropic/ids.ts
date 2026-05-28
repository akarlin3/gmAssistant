/**
 * Centralized random-ID generation for the Anthropic-compatible bridge.
 *
 * Historically these IDs were produced inline as
 * `'msg_' + Math.random().toString(36).slice(2, 11)` (and the `toolu_`
 * variant) in several places. Centralizing them keeps the format identical
 * while removing the scattered duplication.
 */

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 11);
}

/** Generates a message id, e.g. `msg_ab12cd34e`. */
export function newMessageId(): string {
  return 'msg_' + randomSuffix();
}

/** Generates a tool-use id, e.g. `toolu_ab12cd34e`. */
export function newToolUseId(): string {
  return 'toolu_' + randomSuffix();
}
