'use client';

import { useMemo, useCallback, useEffect } from 'react';
import { buildEntityIndex, findEntity } from '@/lib/wiki/entities';
import {
  createRelationship,
  createEdge as createEdgeRel,
  updateRelationship as updateRelInList,
  addRelationship as addRelToList,
  removeRelationship as removeRelFromList,
  acceptSuggestion as acceptSugInList,
  rejectSuggestion as rejectSugFromList,
} from '@/lib/wiki/relationships';
import { scanTextForSuggestions, pruneExpiredSuggestions } from '@/lib/wiki/suggest';
import type { EntityType as WikiEntityType, Relationship as WikiRelationship } from '@/lib/wiki/types';
import type { WikiContextValue } from '@/components/wiki/WikiContext';
import type { Mode } from '@/lib/modes';

type NavigateFn = (target: { mode: Mode; subview?: string; characterId?: string }) => void;

// Wiki entity type → the campaign `data.*` array that stores those records.
// Used by updateEntityState to patch a canonical entity in place (mirrors the
// collections buildEntityIndex reads from). Types without a stable backing
// array are intentionally absent — state editing is a no-op for them.
const TYPE_TO_COLLECTION: Partial<Record<WikiEntityType, string>> = {
  npc: 'npcs',
  faction: 'factions',
  location: 'locations',
  pc: 'characters',
  factionClock: 'clocks',
};

export function useWikiValue(
  state: Record<string, any>,
  setState: React.Dispatch<React.SetStateAction<Record<string, any>>>,
  navigateTo: NavigateFn,
  scrollToAnchor: (anchor: string) => void,
) {
  // One-time prune of suggestions older than 30 days (auto-reject).
  useEffect(() => {
    setState((s) => {
      if (!Array.isArray(s.relationships) || s.relationships.length === 0) return s;
      const { relationships, changed } = pruneExpiredSuggestions(s.relationships);
      return changed ? { ...s, relationships } : s;
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const wikiIndex = useMemo(() => buildEntityIndex(state), [state]);
  const wikiRelationships = useMemo<WikiRelationship[]>(
    () => (Array.isArray(state.relationships) ? state.relationships : []),
    [state.relationships],
  );

  const navigateToEntity = useCallback((type: WikiEntityType, id: string) => {
    if (type === 'pc') {
      navigateTo({ mode: 'plan', subview: 'party', characterId: id });
      setTimeout(() => scrollToAnchor(`pc:${id}`), 80);
      return;
    }
    navigateTo({ mode: 'plan', subview: 'worldbuild' });
    setTimeout(() => {
      const el = document.getElementById(`entity-${id}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rescanForSuggestions = useCallback((): number => {
    let added = 0;
    setState((s) => {
      const sources: string[] = [];
      for (const e of (Array.isArray(s.sessionLogV2) ? s.sessionLogV2 : [])) {
        if (e && typeof e.recap === 'string') sources.push(e.recap);
      }
      if (typeof s.__sessionScratchpad === 'string') sources.push(s.__sessionScratchpad);
      for (const sc of (Array.isArray(s.sceneSessions) ? s.sceneSessions : [])) {
        if (!sc) continue;
        if (typeof sc.partyState === 'string') sources.push(sc.partyState);
        if (typeof sc.summary === 'string') sources.push(sc.summary);
        for (const t of (Array.isArray(sc.turns) ? sc.turns : [])) {
          if (t && typeof t.pcAction === 'string') sources.push(t.pcAction);
          if (t && typeof t.outcome === 'string') sources.push(t.outcome);
          if (t?.response && typeof t.response.sensory === 'string') sources.push(t.response.sensory);
        }
      }
      const idx = buildEntityIndex(s);
      const existing: WikiRelationship[] = Array.isArray(s.relationships) ? s.relationships : [];
      const found = scanTextForSuggestions(sources.join('\n\n'), idx, existing);
      if (found.length === 0) return s;
      added = found.length;
      return { ...s, relationships: [...existing, ...found] };
    });
    return added;
  }, [setState]);

  const wikiValue = useMemo<WikiContextValue>(() => ({
    index: wikiIndex,
    relationships: wikiRelationships,
    addRelationship: (from, to, kind, notes) =>
      setState((s) => ({
        ...s,
        relationships: addRelToList(
          Array.isArray(s.relationships) ? s.relationships : [],
          createRelationship(from, to, kind, notes),
        ),
      })),
    createEdge: (from, to, kind, init) =>
      setState((s) => ({
        ...s,
        relationships: addRelToList(
          Array.isArray(s.relationships) ? s.relationships : [],
          createEdgeRel(from, to, kind, init),
        ),
      })),
    updateRelationship: (id, patch) =>
      setState((s) => ({
        ...s,
        relationships: updateRelInList(
          Array.isArray(s.relationships) ? s.relationships : [],
          id,
          patch,
        ),
      })),
    removeRelationship: (id) =>
      setState((s) => ({
        ...s,
        relationships: removeRelFromList(Array.isArray(s.relationships) ? s.relationships : [], id),
      })),
    updateEntityState: (type, id, patch) => {
      const collection = TYPE_TO_COLLECTION[type];
      if (!collection) return; // no canonical backing array — nothing to patch
      setState((s) => {
        const arr = Array.isArray(s[collection]) ? s[collection] : [];
        let changed = false;
        const next = arr.map((item: Record<string, unknown>) => {
          if (!item || item.id !== id) return item;
          changed = true;
          return { ...item, ...patch };
        });
        return changed ? { ...s, [collection]: next } : s;
      });
    },
    getEntityState: (type, id) => {
      const collection = TYPE_TO_COLLECTION[type];
      if (!collection) return undefined;
      const arr = Array.isArray(state[collection]) ? state[collection] : [];
      return arr.find((item: Record<string, unknown>) => item && item.id === id);
    },
    acceptSuggestion: (id) =>
      setState((s) => ({
        ...s,
        relationships: acceptSugInList(Array.isArray(s.relationships) ? s.relationships : [], id),
      })),
    rejectSuggestion: (id) =>
      setState((s) => ({
        ...s,
        relationships: rejectSugFromList(Array.isArray(s.relationships) ? s.relationships : [], id),
      })),
    navigateToEntity,
    resolve: (type, id) => findEntity(wikiIndex, type, id),
    rescan: rescanForSuggestions,
  }), [state, wikiIndex, wikiRelationships, navigateToEntity, rescanForSuggestions, setState]);

  return { wikiIndex, wikiRelationships, wikiValue, navigateToEntity, rescanForSuggestions };
}
