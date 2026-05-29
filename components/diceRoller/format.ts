// Pure formatting helpers for dice results (no JSX).
// No 'use client' — pure logic with no React/browser dependencies.

import type { DieRoll, Roll } from './parser';

// ---- Time formatting ------------------------------------------------------

export function relTime(ts: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ts) / 1000));
  if (s < 5) return 'now';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

// ---- Roll text ------------------------------------------------------------

export function rollToText(r: Roll): string {
  const head = `${r.label ? `[${r.label}] ` : ''}${r.formula} = ${r.total}`;
  const parts = r.parts.map((p) => {
    const dice = p.dice.map((d) => `d${d.sides}[${d.rolls.join(',')}]`).join(' ');
    const mod = p.modifier === 0 ? '' : (p.modifier > 0 ? `+${p.modifier}` : `${p.modifier}`);
    return `  ${p.expr} → ${dice}${mod} = ${p.subtotal}`;
  });
  return [head, ...parts].join('\n');
}

// ---- Dice keeping helpers -------------------------------------------------

// Multiset-safe: returns one boolean per roll-index, true if that index was kept.
export function keptIndices(d: DieRoll): boolean[] {
  const used = new Array(d.rolls.length).fill(false);
  const flags = new Array(d.rolls.length).fill(false);
  for (const k of d.kept) {
    const idx = d.rolls.findIndex((v, i) => v === k && !used[i]);
    if (idx !== -1) {
      used[idx] = true;
      flags[idx] = true;
    }
  }
  return flags;
}
