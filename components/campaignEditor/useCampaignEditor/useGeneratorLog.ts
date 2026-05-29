'use client';

import { useCallback, useMemo } from 'react';
import { buildPatch as buildCampaignPatch, type CampaignDestKey, type SelectableItem } from '@/lib/generators/addToCampaign';
import type { GeneratorLogs, LogEntry, LogKind } from '@/lib/generators/log';
import type { ChangeEventKind } from '@/lib/sessionEvents';

/**
 * Provides generator-log helpers: reading/writing per-kind log entries and
 * adding generator results directly to the campaign data lists.
 */
export function useGeneratorLog(
  state: Record<string, any>,
  setVal: (k: string, v: any) => void,
  trackEvent: (kind: ChangeEventKind, summary: string, before?: unknown, after?: unknown) => void,
) {
  const generatorLogs = (state.generatorLogs as GeneratorLogs) || {};

  const logEntriesFor = (kind: LogKind): LogEntry[] => generatorLogs[kind] ?? [];
  const setLogEntriesFor = (kind: LogKind) => (next: LogEntry[]) => {
    setVal('generatorLogs', { ...generatorLogs, [kind]: next });
  };

  const addToCampaignFor = useCallback(
    (kind: LogKind) => (dest: CampaignDestKey, items: SelectableItem[]) => {
      const stateKey = dest === 'session-log' ? '__sessionChangeEvents' : dest;
      const current = (state as Record<string, unknown>)[stateKey];
      const { patch, added } = buildCampaignPatch(current, kind, dest, items);
      if (added === 0) return;
      setVal(stateKey, patch.value);
      if (dest === 'session-log') return;
      const eventKind: ChangeEventKind =
        dest === 'locations' ? 'location_added' :
        dest === 'npcs' ? 'npc_added' :
        dest === 'monsters' ? 'monster_added' :
        dest === 'items' ? 'magic_item_given' :
        'other';
      trackEvent(eventKind, `Added ${added} from ${kind} → ${dest}`);
    },
    [state, trackEvent, setVal],
  );

  const generatorDisabledDests = useMemo(
    () => ({ 'plot-segue': state.__activeSessionId ? [] : (['session-log'] as const) } as Partial<Record<LogKind, readonly CampaignDestKey[]>>),
    [state.__activeSessionId],
  );

  return { generatorLogs, logEntriesFor, setLogEntriesFor, addToCampaignFor, generatorDisabledDests };
}
