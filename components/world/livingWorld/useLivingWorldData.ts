import { useEffect, useMemo, useState } from 'react';
import { applyTicks, previewTicks, clockName, downtimeName } from '@/lib/world/tick';
import { undoLastBriefing, canUndo } from '@/lib/world/undo';
import {
  readWorldClock,
  makeWorldId,
  type WorldClock,
  type TickRule,
  type TickTargetType,
  type NpcAgenda,
  type FactionClockEntity,
  type DowntimeEntity,
  type FactionEntity,
  type NpcEntity,
} from '@/lib/world/types';
import { makeEntityId } from '@/lib/playerMode/share';
import { readArray } from './helpers';
import type { GetFn, SetFn, PreviewState } from './types';

/** Downtime entries may carry a UI-only `archived` flag the engine ignores. */
type DowntimeWithArchive = DowntimeEntity & { archived?: boolean };

export type LivingWorldData = {
  clocks: FactionClockEntity[];
  downtime: DowntimeEntity[];
  factions: FactionEntity[];
  npcs: NpcEntity[];
  wc: WorldClock;
  preview: PreviewState;
  setPreview: (p: PreviewState) => void;
  canUndoNow: boolean;
  entityNameFor: (type: TickTargetType, id: string) => string;
  openPreview: (toDay: number, label: string) => void;
  applyPreview: () => void;
  onUndo: () => void;
  addRule: (rule: Omit<TickRule, 'id'>) => void;
  updateRule: (id: string, patch: Partial<TickRule>) => void;
  removeRule: (id: string) => void;
  addAgenda: (agenda: Omit<NpcAgenda, 'id'>) => void;
  updateAgenda: (id: string, patch: Partial<NpcAgenda>) => void;
  removeAgenda: (id: string) => void;
  setBriefingNarrative: (briefingId: string, narrative: string) => void;
};

export function useLivingWorldData(get: GetFn, setVal: SetFn): LivingWorldData {
  // Backfill stable ids on the entities the engine FKs, so rules/agendas can
  // reference them. Downtime entries already carry ids.
  useEffect(() => {
    for (const key of ['clocks', 'factions', 'npcs']) {
      const arr = get(key, []);
      if (!Array.isArray(arr)) continue;
      let changed = false;
      const next = arr.map((e: any) => {
        if (e && typeof e === 'object' && !Array.isArray(e) && !e.id) {
          changed = true;
          return { ...e, id: makeEntityId() };
        }
        return e;
      });
      if (changed) setVal(key, next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clocks = readArray<FactionClockEntity>(get, 'clocks');
  const downtime = readArray<DowntimeWithArchive>(get, 'downtime').filter((d) => d && !d.archived);
  const factions = readArray<FactionEntity>(get, 'factions');
  const npcs = readArray<NpcEntity>(get, 'npcs');

  const wc: WorldClock = useMemo(
    () => readWorldClock({ worldClock: get('worldClock', null) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(get('worldClock', null))],
  );

  const [preview, setPreview] = useState<PreviewState>(null);

  // Snapshot of the engine-relevant slice of campaign data.
  const buildData = (): Record<string, any> => ({
    worldClock: wc,
    clocks: get('clocks', []),
    downtime: get('downtime', []),
    factions: get('factions', []),
    npcs: get('npcs', []),
  });

  const writeBack = (next: Record<string, any>) => {
    setVal('clocks', next.clocks);
    setVal('downtime', next.downtime);
    setVal('factions', next.factions);
    setVal('worldClock', next.worldClock);
  };

  const updateClock = (updater: (clock: WorldClock) => void) => {
    const draft = structuredClone(wc);
    updater(draft);
    setVal('worldClock', draft);
  };

  // --- Advance / preview / apply -----------------------------------------
  const openPreview = (toDay: number, label: string) => {
    if (toDay <= wc.currentDay) return;
    const { changes, rngSeed } = previewTicks({ data: buildData(), toDay });
    setPreview({ toDay, label, changes, rngSeed });
  };

  const applyPreview = () => {
    if (!preview) return;
    const { data: next, briefing } = applyTicks({
      data: buildData(),
      toDay: preview.toDay,
      rngSeed: preview.rngSeed,
    });
    writeBack(next);
    setVal('__livingWorldBriefingPendingId', briefing.id);
    setPreview(null);
  };

  const onUndo = () => {
    if (!canUndo(buildData())) return;
    const next = undoLastBriefing(buildData());
    writeBack(next);
    setVal('__livingWorldBriefingPendingId', '');
  };

  // --- Tick rules ---------------------------------------------------------
  const addRule = (rule: Omit<TickRule, 'id'>) => {
    updateClock((c) => {
      c.tickRules.push({ ...rule, id: makeWorldId() });
    });
  };
  const updateRule = (id: string, patch: Partial<TickRule>) => {
    updateClock((c) => {
      const r = c.tickRules.find((x) => x.id === id);
      if (r) Object.assign(r, patch);
    });
  };
  const removeRule = (id: string) => {
    updateClock((c) => {
      c.tickRules = c.tickRules.filter((x) => x.id !== id);
    });
  };

  // --- Agendas ------------------------------------------------------------
  const addAgenda = (agenda: Omit<NpcAgenda, 'id'>) => {
    updateClock((c) => {
      c.agendas.push({ ...agenda, id: makeWorldId() });
    });
  };
  const updateAgenda = (id: string, patch: Partial<NpcAgenda>) => {
    updateClock((c) => {
      const a = c.agendas.find((x) => x.id === id);
      if (a) Object.assign(a, patch);
    });
  };
  const removeAgenda = (id: string) => {
    updateClock((c) => {
      c.agendas = c.agendas.filter((x) => x.id !== id);
    });
  };

  const setBriefingNarrative = (briefingId: string, narrative: string) => {
    updateClock((c) => {
      const b = c.briefingLog.find((x) => x.id === briefingId);
      if (b) b.narrative = narrative;
    });
  };

  const entityNameFor = (type: TickTargetType, id: string): string => {
    if (type === 'factionClock') {
      const fc = clocks.find((c) => c.id === id);
      return fc ? clockName(fc) : 'Unknown clock';
    }
    if (type === 'downtime') {
      const dt = downtime.find((d) => d.id === id);
      return dt ? downtimeName(dt) : 'Unknown downtime';
    }
    const f = factions.find((x) => x.id === id);
    return f?.name || 'Unknown faction';
  };

  return {
    clocks,
    downtime,
    factions,
    npcs,
    wc,
    preview,
    setPreview,
    canUndoNow: canUndo(buildData()),
    entityNameFor,
    openPreview,
    applyPreview,
    onUndo,
    addRule,
    updateRule,
    removeRule,
    addAgenda,
    updateAgenda,
    removeAgenda,
    setBriefingNarrative,
  };
}
