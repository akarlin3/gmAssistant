'use client';

import { useMemo, useCallback } from 'react';
import { parseMonsterName } from '@/lib/sessionLog';
import type { PrepTargetKey } from '@/lib/prepTargets';

/**
 * Computes the set of prep items that have already been "used" in past session
 * logs (by ID or name). Feeds `getFilteredPrepArray` so prep sections only
 * show items that still need to be addressed.
 */
export function useUsedPrep(state: Record<string, any>) {
  return useMemo(() => {
    const sessionLogsV2 = (state.sessionLogV2 || []) as any[];
    const linkedNpcIds = new Set<string>();
    const linkedNpcNames = new Set<string>();
    const linkedLocIds = new Set<string>();
    const linkedLocNames = new Set<string>();
    const linkedMonsterIds = new Set<string>();
    const linkedMonsterNames = new Set<string>();
    const linkedLootIds = new Set<string>();
    const linkedLootNames = new Set<string>();
    const usedScenes = new Set<string>();
    const usedSecrets = new Set<string>();

    for (const entry of sessionLogsV2) {
      if (entry.scenesUsed) {
        for (const scene of entry.scenesUsed) {
          if (scene) usedScenes.add(scene.trim());
        }
      }
      if (entry.secretsRevealed) {
        for (const secret of entry.secretsRevealed) {
          if (secret) usedSecrets.add(secret.trim());
        }
      }
      if (entry.linkedPrepItems) {
        for (const item of entry.linkedPrepItems) {
          if (!item) continue;
          const id = (item.id || '').trim();
          const name = (item.snapshotName || '').trim();
          if (item.type === 'npc') {
            if (id) linkedNpcIds.add(id);
            if (name) linkedNpcNames.add(name);
          } else if (item.type === 'location') {
            if (id) linkedLocIds.add(id);
            if (name) linkedLocNames.add(name);
          } else if (item.type === 'encounter') {
            if (id) linkedMonsterIds.add(id);
            if (name) linkedMonsterNames.add(name);
          } else if (item.type === 'loot') {
            if (id) linkedLootIds.add(id);
            if (name) linkedLootNames.add(name);
          }
        }
      }
    }

    return {
      linkedNpcIds, linkedNpcNames,
      linkedLocIds, linkedLocNames,
      linkedMonsterIds, linkedMonsterNames,
      linkedLootIds, linkedLootNames,
      usedScenes, usedSecrets,
    };
  }, [state.sessionLogV2]);
}

export type UsedPrep = ReturnType<typeof useUsedPrep>;

/**
 * Returns a version of a prep array with already-used items filtered out.
 * Memoized as a stable callback so downstream useMemos don't re-fire unless
 * the `usedPrep` sets themselves change.
 */
export function useGetFilteredPrepArray(usedPrep: UsedPrep) {
  return useCallback((key: PrepTargetKey, rawArray: any[]) => {
    if (!Array.isArray(rawArray)) return rawArray;
    if (key === 'scenes') {
      return rawArray.filter((s: string) => !usedPrep.usedScenes.has(s.trim()));
    }
    if (key === 'secrets') {
      return rawArray.filter((s: string) => !usedPrep.usedSecrets.has(s.trim()));
    }
    if (key === 'locations') {
      return rawArray.filter((l: any) => !usedPrep.linkedLocIds.has(l.id) && !usedPrep.linkedLocNames.has(l.name));
    }
    if (key === 'npcs') {
      return rawArray.filter((n: any) => !usedPrep.linkedNpcIds.has(n.id) && !usedPrep.linkedNpcNames.has(n.name));
    }
    if (key === 'monsters') {
      return rawArray.filter((m: string) => !usedPrep.linkedMonsterIds.has(m) && !usedPrep.linkedMonsterNames.has(parseMonsterName(m)));
    }
    if (key === 'items') {
      return rawArray.filter(item => {
        if (typeof item === 'object' && item) {
          const isAssigned = !!item.assignedPlayerId;
          const id = String(item.id || '').trim();
          const name = String(item.name || '').trim();
          const isLinked = usedPrep.linkedLootIds.has(id) || usedPrep.linkedLootNames.has(name);
          return !isAssigned && !isLinked;
        }
        if (typeof item === 'string') {
          const trimmed = item.trim();
          const isLinked = usedPrep.linkedLootIds.has(trimmed) || usedPrep.linkedLootNames.has(trimmed);
          return !isLinked;
        }
        return true;
      });
    }
    return rawArray;
  }, [usedPrep]);
}
