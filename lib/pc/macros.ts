// Auto-macro generation from a PC's attacks. Each attack produces two stable
// macros (a to-hit and a damage roll) keyed by the attack id so re-syncing is
// idempotent. Macros are stored per-PC at `data.pcMacros[pcId]` and surfaced in
// the Session Mode dice tray under a PC-grouped header.
//
// We reuse the existing dice `Macro` shape ({ id, name, formula }) from the
// DiceRoller rather than inventing a parallel { label, expr } type, so the same
// roller can execute PC macros and ad-hoc macros alike.

import { formatMod } from './derived';
import type { PlayerCharacter } from './types';

export type Macro = { id: string; name: string; formula: string };

export type PcMacros = Record<string, Macro[]>;

const ATTACK_PREFIX = 'attack:';

export function attackMacrosFor(pc: PlayerCharacter): Macro[] {
  return pc.attacks.flatMap((a) => {
    const macros: Macro[] = [
      {
        id: `${ATTACK_PREFIX}${a.id}:hit`,
        name: `${a.name} — Attack`,
        formula: `1d20${formatMod(a.attackBonus)}`,
      },
    ];
    if (a.damageExpr && a.damageExpr.trim()) {
      macros.push({
        id: `${ATTACK_PREFIX}${a.id}:dmg`,
        name: `${a.name} — Damage${a.damageType ? ` (${a.damageType})` : ''}`,
        formula: a.damageExpr.trim(),
      });
    }
    return macros;
  });
}

// Rebuilds the attack-derived macros for one PC while preserving any
// non-attack (manually-added) macros that may live in the same bucket.
export function syncAttackMacros(
  pc: PlayerCharacter,
  pcMacros: PcMacros,
): PcMacros {
  const existing = pcMacros[pc.id] ?? [];
  const nonAttack = existing.filter((m) => !m.id.startsWith(ATTACK_PREFIX));
  return { ...pcMacros, [pc.id]: [...nonAttack, ...attackMacrosFor(pc)] };
}

// Drops a PC's macro bucket entirely (used when a PC is deleted).
export function dropPcMacros(pcId: string, pcMacros: PcMacros): PcMacros {
  if (!(pcId in pcMacros)) return pcMacros;
  const next = { ...pcMacros };
  delete next[pcId];
  return next;
}
