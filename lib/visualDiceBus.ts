// Strictly local, in-memory visual dice event bus.
//
// SECURITY INVARIANT:
// - Lives exclusively in the current tab's JavaScript memory (`Set` of listeners).
// - NEVER writes to `pcWritebacks`, `Firestore`, `BroadcastChannel`, or `localStorage`.
// - Allows `secretRoll: true` rolls to animate ONLY on the rolling user's screen
//   without ever leaving the local client.

import type { RollEvent } from '@/lib/pc/types';

type LocalVisualRollListener = (roll: RollEvent) => void;

const listeners = new Set<LocalVisualRollListener>();

export function emitLocalVisualRoll(roll: RollEvent): void {
  if (!roll || listeners.size === 0) return;
  for (const fn of listeners) {
    try {
      fn(roll);
    } catch {
      // Ignore UI listener errors
    }
  }
}

export function subscribeLocalVisualRolls(listener: LocalVisualRollListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Returns `true` ONLY when a roll is public (`secretRoll !== true`) and safe to
 * broadcast across shared table roll feeds (`rollEvents`).
 */
export function shouldBroadcastVisualRoll(roll: RollEvent | null | undefined): boolean {
  if (!roll || typeof roll !== 'object') return false;
  return roll.secretRoll !== true;
}

/**
 * Strips any `secretRoll: true` roll events before outbound serialization.
 */
export function filterPublicVisualRolls(rolls: ReadonlyArray<RollEvent> | undefined): RollEvent[] {
  if (!Array.isArray(rolls)) return [];
  return rolls.filter((r) => shouldBroadcastVisualRoll(r));
}
