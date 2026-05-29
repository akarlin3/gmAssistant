'use client';

import { useMemo, useCallback } from 'react';
import { TARGETS, getTarget, countFilled, SECTION_ID_BY_KEY, PHASE_ID_BY_KEY, type PrepTargetKey, type PrepTargetOverrides } from '@/lib/prepTargets';
import type { Mode } from '@/lib/modes';

type NextUpCandidate = {
  id: PrepTargetKey;
  label: string;
  current: number;
  target: number;
  sectionId: string;
  phaseId: string;
};

export function useNextUp(
  state: Record<string, any>,
  soloMode: boolean,
  prepTargetOverrides: PrepTargetOverrides,
  getFilteredPrepArray: (key: PrepTargetKey, rawArray: any[]) => any[],
): NextUpCandidate | null {
  return useMemo(() => {
    const candidates: NextUpCandidate[] = [];
    for (const [k, t] of Object.entries(TARGETS)) {
      const key = k as PrepTargetKey;
      const target = getTarget(key, soloMode, prepTargetOverrides);
      if (target === 0) continue;
      const current = countFilled(key, getFilteredPrepArray(key, state[key]), state.player);
      if (current < target) {
        candidates.push({
          id: key, label: t.label, current, target,
          sectionId: SECTION_ID_BY_KEY[key] ?? key,
          phaseId: PHASE_ID_BY_KEY[key] ?? 'p0',
        });
      }
    }
    candidates.sort((a, b) => {
      const gapA = a.target - a.current;
      const gapB = b.target - b.current;
      if (gapA !== gapB) return gapB - gapA;
      return a.current - b.current;
    });
    return candidates[0] ?? null;
  }, [state, soloMode, prepTargetOverrides, getFilteredPrepArray]);
}

export function useJumpToNextUp(
  nextUp: NextUpCandidate | null,
  setMode: React.Dispatch<React.SetStateAction<Mode>>,
  setSubview: React.Dispatch<React.SetStateAction<string>>,
  setPhaseOpen: React.Dispatch<React.SetStateAction<Record<string, boolean>>>,
  setOpen: React.Dispatch<React.SetStateAction<Record<string, boolean>>>,
) {
  return useCallback(() => {
    if (!nextUp) return;
    let targetMode: Mode = 'prep';
    let targetSubview = 'flow';
    if (nextUp.phaseId === 'p0') { targetMode = 'plan'; targetSubview = 'pitch'; }
    else if (nextUp.phaseId === 'p1') { targetMode = 'plan'; targetSubview = 'worldbuild'; }
    else if (nextUp.phaseId === 'p2') { targetMode = 'plan'; targetSubview = 'party'; }
    else if (nextUp.phaseId === 'p4') { targetMode = 'prep'; targetSubview = 'clocks'; }
    else if (nextUp.phaseId === 'p5') { targetMode = 'prep'; targetSubview = 'arc'; }
    else if (nextUp.phaseId === 'p6') { targetMode = 'prep'; targetSubview = 'ending'; }
    setMode(targetMode);
    setSubview(targetSubview);
    setPhaseOpen(p => ({ ...p, [nextUp.phaseId]: true }));
    setOpen(o => ({ ...o, [nextUp.sectionId]: true }));
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.getElementById(`section-${nextUp.sectionId}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }));
  }, [nextUp, setMode, setSubview, setPhaseOpen, setOpen]);
}
