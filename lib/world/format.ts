// Living World Tick — free-tier briefing formatting + shared change helpers.

import type { Briefing, BriefingChange } from './types';

function num(v: unknown): number {
  return typeof v === 'number' ? v : 0;
}

/** One-line factual summary of a single change (free tier). */
export function formatChange(c: BriefingChange): string {
  switch (c.type) {
    case 'clockAdvanced':
      return `clock advanced from ${num(c.before.filled)} to ${num(c.after.filled)} segments (${c.reason})`;
    case 'downtimeResolved':
      return `downtime progress ${num(c.before.progress)}% → ${num(c.after.progress)}% (${c.reason})`;
    case 'agendaProgress':
      return `agenda progress ${num(c.before.progress)}% → ${num(c.after.progress)}% (${c.reason})`;
    case 'renownShift':
      return `renown shifted from ${num(c.before.value ?? c.before.renown)} to ${num(c.after.value ?? c.after.renown)} (${c.reason})`;
  }
}

/** Plain-text briefing, e.g. for the Vivify prompt's CHANGES_JSON fallback. */
export function briefingToText(briefing: Briefing): string {
  return briefing.changes.map((c) => `- ${c.entityName}: ${formatChange(c)}`).join('\n');
}
