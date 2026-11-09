'use client';

import { useMemo, useCallback, useEffect } from 'react';
import { buildEntityIndex, findEntity } from '@/lib/wiki/entities';
import {
  createRelationship,
  addRelationship as addRelToList,
  removeRelationship as removeRelFromList,
  updateRelationship as updateRelInList,
  acceptSuggestion as acceptSugInList,
  rejectSuggestion as rejectSugFromList,
  mergeProposals as mergeProposalsInList,
} from '@/lib/wiki/relationships';
import { scanTextForSuggestions, pruneExpiredSuggestions } from '@/lib/wiki/suggest';
import type { EntityType as WikiEntityType, Relationship as WikiRelationship } from '@/lib/wiki/types';
import type { WikiContextValue } from '@/components/wiki/WikiContext';
import type { Mode } from '@/lib/modes';

type NavigateFn = (target: { mode: Mode; subview?: string; characterId?: string }) => void;

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
    if (type === 'factionClock') {
      navigateTo({ mode: 'prep', subview: 'clocks' });
      setTimeout(() => {
        const el = document.getElementById(`entity-${id}`) || document.getElementById('section-clocks');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 80);
      return;
    }
    if (type === 'npc' || type === 'location' || type === 'magicItem' || type === 'secret' || type === 'monster') {
      navigateTo({ mode: 'prep', subview: 'flow' });
      setTimeout(() => {
        const el = document.getElementById(`entity-${id}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 80);
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
      // Also scan @tag mentions inside NPCs, Locations, Factions, Clocks, and Custom Items
      for (const n of (Array.isArray(s.npcs) ? s.npcs : [])) {
        if (!n || typeof n !== 'object' || !n.name) continue;
        const fields = [n.goal, n.method, n.knowledge, n.bond, n.flaw, n.notes, n.description]
          .filter((x) => typeof x === 'string' && x.includes('@'));
        if (fields.length > 0) sources.push(`@"${n.name}" ${fields.join(' ')}`);
      }
      for (const l of (Array.isArray(s.locations) ? s.locations : [])) {
        if (!l || typeof l !== 'object' || !l.name) continue;
        const fields = [...(Array.isArray(l.aspects) ? l.aspects : []), l.description, l.factions, l.notes]
          .filter((x) => typeof x === 'string' && x.includes('@'));
        if (fields.length > 0) sources.push(`@"${l.name}" ${fields.join(' ')}`);
      }
      for (const f of (Array.isArray(s.factions) ? s.factions : [])) {
        if (!f || typeof f !== 'object' || !f.name) continue;
        const fields = [f.identity, f.ideology, f.area, f.longGoal, ...(Array.isArray(f.shortGoals) ? f.shortGoals : [])]
          .filter((x) => typeof x === 'string' && x.includes('@'));
        if (fields.length > 0) sources.push(`@"${f.name}" ${fields.join(' ')}`);
      }
      for (const c of (Array.isArray(s.clocks) ? s.clocks : [])) {
        if (!c || typeof c !== 'object' || !c.text) continue;
        const fields = [c.notes, c.triggerNote, c.faction]
          .filter((x) => typeof x === 'string' && x.includes('@'));
        if (fields.length > 0) sources.push(`@"${c.text}" ${fields.join(' ')}`);
      }
      for (const it of (Array.isArray(s.items) ? s.items : [])) {
        if (it && typeof it === 'object' && it.name && typeof it.description === 'string' && it.description.includes('@')) {
          sources.push(`@"${it.name}" ${it.description}`);
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
    removeRelationship: (id) =>
      setState((s) => ({
        ...s,
        relationships: removeRelFromList(Array.isArray(s.relationships) ? s.relationships : [], id),
      })),
    updateRelationship: (id, patch) =>
      setState((s) => ({
        ...s,
        relationships: updateRelInList(Array.isArray(s.relationships) ? s.relationships : [], id, patch),
      })),
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
    proposeRelationships: (proposals) => {
      let added = 0;
      setState((s) => {
        const existing: WikiRelationship[] = Array.isArray(s.relationships) ? s.relationships : [];
        const merged = mergeProposalsInList(existing, proposals);
        added = merged.added;
        return merged.added > 0 ? { ...s, relationships: merged.relationships } : s;
      });
      return added;
    },
    graphPositions:
      state.graphLayout && typeof state.graphLayout === 'object' ? state.graphLayout : undefined,
    setGraphPositions: (positions) =>
      setState((s) => ({ ...s, graphLayout: { ...(s.graphLayout ?? {}), ...positions } })),
    navigateToEntity,
    resolve: (type, id) => findEntity(wikiIndex, type, id),
    rescan: rescanForSuggestions,
  }), [wikiIndex, wikiRelationships, navigateToEntity, rescanForSuggestions, setState, state.graphLayout]);

  return { wikiIndex, wikiRelationships, wikiValue, navigateToEntity, rescanForSuggestions };
}
