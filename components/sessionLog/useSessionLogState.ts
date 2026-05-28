import { useMemo, useState } from 'react';
import type { SessionLogEntry } from '@/lib/sessionLog';

export type SessionLogStats = {
  total: number;
  totalDuration: number;
  lastDate: string;
  totalXp: number;
};

export type ComparePair = { left: SessionLogEntry; right: SessionLogEntry };

/**
 * Owns the sorting / stats / editing / compare state for the session log
 * list. Behaviour is identical to the previous inline implementation; it is
 * extracted purely to separate state management from rendering.
 */
export function useSessionLogState(
  entries: SessionLogEntry[],
  onChange: (entries: SessionLogEntry[]) => void,
) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const [compareIds, setCompareIds] = useState<string[]>([]);

  const sorted = useMemo(() => {
    return [...entries].sort((a, b) => {
      if (!!b.pinned !== !!a.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0);
      return b.endedAt - a.endedAt;
    });
  }, [entries]);

  const stats = useMemo<SessionLogStats>(() => {
    const totalDuration = entries.reduce((sum, e) => sum + Math.max(0, e.endedAt - e.startedAt), 0);
    const lastSession = entries.reduce<SessionLogEntry | null>(
      (best, e) => (!best || e.endedAt > best.endedAt) ? e : best, null,
    );
    return {
      total: entries.length,
      totalDuration,
      lastDate: lastSession?.date || '',
      totalXp: entries.reduce((sum, e) => sum + (e.xpAwarded || 0), 0),
    };
  }, [entries]);

  const updateEntry = (id: string, patch: Partial<SessionLogEntry>) => {
    onChange(entries.map(e => e.id === id ? { ...e, ...patch } : e));
  };

  const deleteEntry = (id: string) => {
    const entry = entries.find(e => e.id === id);
    if (!confirm(`Delete "${entry?.title || `Session ${entry?.number || ''}`}"? This cannot be undone.`)) return;
    onChange(entries.filter(e => e.id !== id));
    setCompareIds(ids => ids.filter(x => x !== id));
  };

  const toggleCompare = (id: string) => {
    setCompareIds(ids => {
      if (ids.includes(id)) return ids.filter(x => x !== id);
      if (ids.length >= 2) return [ids[1], id];
      return [...ids, id];
    });
  };

  const clearCompare = () => setCompareIds([]);

  const toggleOpen = (id: string) => setOpenIds(o => ({ ...o, [id]: !o[id] }));
  const beginEdit = (id: string) => {
    setEditingId(id);
    setOpenIds(o => ({ ...o, [id]: true }));
  };

  const compareEntries = useMemo<ComparePair | null>(() => {
    if (compareIds.length !== 2) return null;
    const a = entries.find(e => e.id === compareIds[0]);
    const b = entries.find(e => e.id === compareIds[1]);
    if (!a || !b) return null;
    return a.endedAt < b.endedAt ? { left: a, right: b } : { left: b, right: a };
  }, [compareIds, entries]);

  return {
    editingId,
    openIds,
    compareIds,
    sorted,
    stats,
    compareEntries,
    setEditingId,
    updateEntry,
    deleteEntry,
    toggleCompare,
    clearCompare,
    toggleOpen,
    beginEdit,
  };
}
