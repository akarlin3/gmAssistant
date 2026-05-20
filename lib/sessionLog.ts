// Phase 3 session log records: rich entries saved when a session ends via
// the finalizer. Kept separate from the legacy `sessionLogs` array (which
// the Track tab still uses) so neither side breaks.

import type { ChangeEvent } from './sessionEvents';

export type GoalUpdate = {
  goal: string;
  from: string;
  to: string;
};

export type SessionLogEntry = {
  id: string;
  number: number;
  date: string;
  startedAt: number;
  endedAt: number;
  title?: string;
  recap: string;
  xpAwarded?: number;
  events: ChangeEvent[];
  secretsRevealed: string[];
  scenesUsed: string[];
  goalUpdates: GoalUpdate[];
  pinned?: boolean;
};

export function formatDuration(ms: number): string {
  if (!isFinite(ms) || ms <= 0) return '0m';
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function nextSessionNumber(existing: SessionLogEntry[]): number {
  if (existing.length === 0) return 1;
  return Math.max(...existing.map(e => e.number || 0)) + 1;
}

export function summarizeEvents(events: ChangeEvent[]): { kept: number; dismissed: number; starred: number } {
  let kept = 0, dismissed = 0, starred = 0;
  for (const e of events) {
    if (e.dismissed) dismissed++;
    else kept++;
    if (e.starred) starred++;
  }
  return { kept, dismissed, starred };
}
