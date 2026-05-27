// Living World Tick — undo.
//
// Reverts the most recent briefing by replaying its changes in reverse and
// restoring each entity's `before` snapshot, then rolls the in-world day back
// to the briefing's `fromDay` and drops it from the log. Restores against the
// same real entities the tick advanced (clocks, downtime, factions, agendas).

import { readWorldClock, type BriefingChange } from './types';

type AnyData = Record<string, any>;

export function canUndo(data: AnyData | null | undefined): boolean {
  return readWorldClock(data).briefingLog.length > 0;
}

export function undoLastBriefing(data: AnyData): AnyData {
  const next: AnyData = structuredClone(data);
  next.worldClock = structuredClone(readWorldClock(data));

  const briefing = next.worldClock.briefingLog.at(-1);
  if (!briefing) throw new Error('No briefing to undo');

  // Apply changes in reverse, restoring `before` state.
  for (const change of [...briefing.changes].reverse()) {
    restoreChange(next, change);
  }

  next.worldClock.currentDay = briefing.fromDay;
  next.worldClock.briefingLog = next.worldClock.briefingLog.slice(0, -1);
  return next;
}

function restoreChange(data: AnyData, change: BriefingChange) {
  switch (change.type) {
    case 'clockAdvanced': {
      const fc = (Array.isArray(data.clocks) ? data.clocks : []).find(
        (c: any) => c.id === change.entityId,
      );
      if (fc) Object.assign(fc, change.before);
      return;
    }
    case 'downtimeResolved': {
      const dt = (Array.isArray(data.downtime) ? data.downtime : []).find(
        (d: any) => d.id === change.entityId,
      );
      if (dt) Object.assign(dt, change.before);
      return;
    }
    case 'agendaProgress': {
      const agenda = (data.worldClock.agendas as any[]).find((a) => a.id === change.entityId);
      if (agenda) Object.assign(agenda, change.before);
      return;
    }
    case 'renownShift': {
      const f = (Array.isArray(data.factions) ? data.factions : []).find(
        (x: any) => x.id === change.entityId,
      );
      if (f) Object.assign(f, change.before);
      return;
    }
  }
}
