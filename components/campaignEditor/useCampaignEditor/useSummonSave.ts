'use client';

import { useState, useRef, useCallback } from 'react';
import { pickPrimaryRef, setLastUsed, type GeneratorMeta, type PrepSection } from '@/lib/generators/sectionMap';
import { applySummonAction, type SummonSaveAction } from '@/lib/generators/summon-actions';
import type { EntityRef } from '@/lib/generators/types';

export function useSummonSave(
  setState: React.Dispatch<React.SetStateAction<Record<string, any>>>,
  scrollToEntity: (id: string) => void,
  flashHighlight: (id: string) => void,
) {
  const [summonState, setSummonState] = useState<{ section: PrepSection; generator: GeneratorMeta } | null>(null);
  const [summonToast, setSummonToast] = useState<{ text: string; primaryEntityId: string } | null>(null);
  const summonToastTimerRef = useRef<NodeJS.Timeout | null>(null);

  const handlePostSummonSave = useCallback(
    (section: PrepSection, generator: GeneratorMeta, refs: EntityRef[]) => {
      const primary = pickPrimaryRef(refs, generator.kind);
      if (!primary) return;
      scrollToEntity(primary.entityId);
      flashHighlight(primary.entityId);
      const counts = refs.reduce<Record<string, number>>((acc, r) => {
        acc[r.entityKey] = (acc[r.entityKey] || 0) + 1;
        return acc;
      }, {});
      const order: Array<[string, string, string]> = [
        ['locations', 'Location', 'Locations'], ['npcs', 'NPC', 'NPCs'],
        ['items', 'Item', 'Items'], ['monsters', 'Monster', 'Monsters'],
        ['homebrewMonsters', 'Bestiary Entry', 'Bestiary Entries'],
      ];
      const parts: string[] = [];
      for (const [key, sing, plur] of order) {
        const n = counts[key];
        if (n) parts.push(`${n} ${n === 1 ? sing : plur}`);
      }
      const text = parts.length ? `Saved: ${parts.join(', ')}` : 'Saved';
      if (summonToastTimerRef.current) clearTimeout(summonToastTimerRef.current);
      setSummonToast({ text, primaryEntityId: primary.entityId });
      summonToastTimerRef.current = setTimeout(() => setSummonToast(null), 3000);
    },
    [scrollToEntity, flashHighlight],
  );

  const onSummonSave = useCallback(
    (section: PrepSection, generator: GeneratorMeta, action: SummonSaveAction) => {
      let savedRefs: EntityRef[] = [];
      setState((s) => {
        const { next, refs } = applySummonAction(s, action);
        savedRefs = refs;
        return setLastUsed(next, section, generator.kind) as typeof s;
      });
      requestAnimationFrame(() => handlePostSummonSave(section, generator, savedRefs));
    },
    [setState, handlePostSummonSave],
  );

  return { summonState, setSummonState, summonToast, setSummonToast, summonToastTimerRef, handlePostSummonSave, onSummonSave };
}
