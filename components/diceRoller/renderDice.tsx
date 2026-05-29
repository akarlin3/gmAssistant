// JSX rendering helpers for dice results.
// No 'use client' — this is a pure presentational helper with no hooks/state.

import React from 'react';
import type { DieRoll } from './parser';
import { keptIndices } from './format';

export function renderDiceList(d: DieRoll): React.ReactNode {
  const flags = keptIndices(d);
  return d.rolls.map((roll, i) => {
    const kept = flags[i];
    const isCrit = d.sides === 20 && roll === 20 && kept;
    const isFumble = d.sides === 20 && roll === 1 && kept;
    const cls = !kept
      ? 'text-ink-faint line-through mx-0.5'
      : isCrit
        ? 'text-moss font-semibold mx-0.5'
        : isFumble
          ? 'text-crimson font-semibold mx-0.5'
          : 'text-ink mx-0.5';
    return (
      <span key={i} className={cls}>
        {roll}
      </span>
    );
  });
}
