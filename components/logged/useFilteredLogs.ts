import { useMemo } from 'react';
import type { LogEntry, LogKind } from '@/lib/generators/log';
import { matchesCategory, type CategoryValue } from './categories';

/** Returns true if the entry matches the free-text search query. */
function matchesSearch(entry: LogEntry, query: string): boolean {
  const q = query.toLowerCase();
  return (
    entry.title.toLowerCase().includes(q) ||
    entry.kind.toLowerCase().includes(q) ||
    JSON.stringify(entry.payload).toLowerCase().includes(q)
  );
}

export type FilteredLogs = {
  /** Every entry across all kinds, newest first. */
  allEntries: LogEntry[];
  /** `allEntries` narrowed by the active category and search query. */
  filteredEntries: LogEntry[];
};

/**
 * Flattens the per-kind log map into a single newest-first list and applies the
 * active category + search filters. Behavior matches the original inline memos.
 */
export function useFilteredLogs(
  logs: Partial<Record<LogKind, LogEntry[]>>,
  activeCategory: CategoryValue,
  searchQuery: string,
): FilteredLogs {
  const allEntries = useMemo(() => {
    const entries: LogEntry[] = [];
    Object.values(logs).forEach((kindEntries) => {
      if (Array.isArray(kindEntries)) {
        entries.push(...kindEntries);
      }
    });
    return entries.sort((a, b) => b.createdAtMs - a.createdAtMs);
  }, [logs]);

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim();
    return allEntries.filter((e) => {
      if (!matchesCategory(e.kind, activeCategory)) return false;
      if (!query) return true;
      return matchesSearch(e, query);
    });
  }, [allEntries, activeCategory, searchQuery]);

  return { allEntries, filteredEntries };
}
