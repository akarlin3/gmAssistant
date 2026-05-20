// Per-generator save-to-log storage.
//
// Each generator (Treasure Hoard, Tavern, Names, Dice, etc.) gets its own log
// of recently-saved results, namespaced by LogKind under data.generatorLogs.
// Logs are user-curated — entries arrive only when the user clicks the
// Save-to-log button on a result, not automatically.

export type LogKind =
  // Generators-tab (deterministic) generators
  | 'treasure-hoard'
  | 'trinket'
  | 'mundane-shop'
  | 'magic-shop'
  | 'tavern'
  | 'tavern-name'
  | 'dungeon'
  | 'settlement'
  // AI / external generators living on their own tabs
  | 'names'
  | 'locations'
  | 'monster-roll'
  | 'monster-scale'
  | 'dice';

export type LogEntry = {
  id: string;
  kind: LogKind;
  createdAtMs: number;
  title: string;
  payload: unknown;
};

export type GeneratorLogs = Partial<Record<LogKind, LogEntry[]>>;

export const LOG_CAP_PER_KIND = 20;

export function newLogEntryId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `log_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
}

export function makeLogEntry(kind: LogKind, title: string, payload: unknown): LogEntry {
  return {
    id: newLogEntryId(),
    kind,
    createdAtMs: Date.now(),
    title,
    payload,
  };
}

export function appendToLog(entries: LogEntry[], entry: LogEntry): LogEntry[] {
  return [entry, ...entries].slice(0, LOG_CAP_PER_KIND);
}

export function removeFromLog(entries: LogEntry[], id: string): LogEntry[] {
  return entries.filter((e) => e.id !== id);
}

export function clearLog(): LogEntry[] {
  return [];
}

// Pretty time-ago label for log row timestamps. Stable across the bestiary
// of generators so the log feels uniform.
export function timeAgo(ms: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.floor((now - ms) / 1000));
  if (s < 5) return 'now';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86_400)}d`;
}
