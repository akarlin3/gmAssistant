'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { recalculatePartyState } from '@/lib/sessionLog';
import { markSessionPlayed } from '@/lib/lastPlayed';
import { buildEntityIndex } from '@/lib/wiki/entities';
import { scanTextForSuggestions } from '@/lib/wiki/suggest';
import type { Relationship as WikiRelationship } from '@/lib/wiki/types';
import type { Character } from '@/lib/character-schema';

export function useHandleEndSession(
  state: Record<string, any>,
  get: (k: string, fb: any) => any,
  name: string,
  playMode: string,
  soloMode: boolean,
  done: Record<string, boolean>,
  saveToDB: (payload: { name: string; data: Record<string, any>; done: Record<string, boolean> }) => Promise<void>,
  campaignId: string,
  router: ReturnType<typeof useRouter>,
  characters: Character[],
  saveTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>,
  setState: React.Dispatch<React.SetStateAction<Record<string, any>>>,
) {
  return useCallback(async () => {
    const sessionId = get('__activeSessionId', `session_${Date.now()}`) as string;
    const startedAt = get('__sessionStartedAt', Date.now()) as number;
    const endedAt = Date.now();
    const scratchpad = get('__sessionScratchpad', '') as string;
    const events = get('__sessionChangeEvents', []) as any[];
    const existingEntries = get('sessionLogV2', []) as any[];

    const keptEvents = events.filter((e: any) => !e.dismissed);
    const nextNumber = Math.max(0, ...existingEntries.map(e => e.number || 0)) + 1;
    const strongStartDelivered = !!get('__sessionStrongStartDelivered', false);
    const strongStartText = ((get('strongStart', '') as string) || '').trim();

    const entry: any = {
      id: sessionId,
      number: nextNumber,
      date: new Date().toISOString().split('T')[0],
      startedAt,
      endedAt,
      title: `Session ${nextNumber}`,
      recap: scratchpad || '',
      events: keptEvents,
      secretsRevealed: keptEvents.filter((e: any) => e.kind === 'secret_revealed').map((e: any) => e.summary),
      scenesUsed: keptEvents.filter((e: any) => e.kind === 'scene_used').map((e: any) => e.summary.replace(/^Used scene:\s*/, '')),
      goalUpdates: keptEvents.filter((e: any) => e.kind === 'goal_status').map((e: any) => {
        const [goalText] = e.summary.split(': ');
        const fromTo = e.summary.split(': ')[1] || '';
        const [from, to] = fromTo.split(' → ');
        return { goal: goalText || '', from: from || String(e.before ?? ''), to: to || String(e.after ?? '') };
      }),
    };
    if (strongStartDelivered && strongStartText) {
      entry.strongStart = strongStartText;
    }

    const updatedSessionLog = [...existingEntries, entry];
    const { partyXP, partyInventory, updatedCharacters } = recalculatePartyState(updatedSessionLog, characters);

    const sessionGivenItems = (get('__sessionItemsGiven', []) as string[]) || [];
    const rawItems = (get('items', []) as any[]) || [];
    const updatedItems = rawItems.map((item, idx) => {
      if (typeof item === 'object' && item) {
        if (sessionGivenItems.includes(item.name)) {
          return { ...item, assignedPlayerId: item.assignedPlayerId || 'party' };
        }
      } else if (typeof item === 'string') {
        if (sessionGivenItems.includes(item)) {
          return { id: `item_${idx}_${Date.now().toString(36).slice(-2)}`, name: item, assignedPlayerId: 'party' };
        }
      }
      return item;
    });

    const rawTreasure = (get('treasure', []) as string[]) || [];
    const updatedTreasure = rawTreasure.filter(t => !sessionGivenItems.includes(t));

    let nextState: Record<string, any> = {
      ...state,
      sessionLogV2: updatedSessionLog,
      partyXP,
      partyInventory,
      characters: updatedCharacters,
      items: updatedItems,
      treasure: updatedTreasure,
    };
    if (strongStartDelivered && strongStartText) {
      nextState.strongStart = '';
    }
    delete nextState.__activeSessionId;
    delete nextState.__sessionStartedAt;
    delete nextState.__sessionEndedAt;
    delete nextState.__sessionChangeEvents;
    delete nextState.__sessionScratchpad;
    delete nextState.__sessionUsedScenes;
    delete nextState.__sessionItemsGiven;
    delete nextState.__sessionStrongStartDelivered;
    nextState.__runSessionOpen = false;
    nextState = markSessionPlayed(nextState);

    // Phase 4 — auto-suggest relationships from this session's notes.
    try {
      const idx = buildEntityIndex(nextState);
      const existingRels: WikiRelationship[] = Array.isArray(nextState.relationships) ? nextState.relationships : [];
      const newSuggestions = scanTextForSuggestions(entry.recap || '', idx, existingRels);
      if (newSuggestions.length > 0) {
        nextState.relationships = [...existingRels, ...newSuggestions];
      }
    } catch {
      // Suggestion scanning is best-effort; never block ending a session.
    }

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    setState(nextState);

    try {
      await saveToDB({ name, data: { ...nextState, mode: playMode, __soloMode: soloMode }, done });
    } catch (err) {
      console.error("Failed to save ended session to DB", err);
    }

    router.push(`/campaign/${campaignId}/recap/${sessionId}`);
  }, [state, get, name, playMode, soloMode, done, saveToDB, campaignId, router, characters, saveTimeoutRef, setState]);
}
