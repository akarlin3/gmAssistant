// B-06: "Last played" must reflect actual play, not casual viewing.
//
// We track two distinct timestamps inside campaign `data`:
//   - __lastSessionAt: stamped only when a Run Session starts/ends. This is
//     what the campaign list shows as "Last played".
//   - __lastOpenedAt:  stamped whenever the editor is opened. Surfaced only on
//     hover / debug — never as "Last played".
//
// Both are epoch-millisecond numbers so they survive Firestore's plain-object
// `data` field without needing server timestamps.

export const LAST_SESSION_KEY = '__lastSessionAt';
export const LAST_OPENED_KEY = '__lastOpenedAt';

type DataLike = Record<string, any> | null | undefined;
type CampaignLike = { data?: DataLike };

export function markOpened<T extends Record<string, any>>(data: T, now: number = Date.now()): T {
  return { ...data, [LAST_OPENED_KEY]: now };
}

export function markSessionPlayed<T extends Record<string, any>>(data: T, now: number = Date.now()): T {
  return { ...data, [LAST_SESSION_KEY]: now };
}

// Latest ISO date string across the legacy v1 and v2 session logs, or null.
function latestSessionLogMs(data: Record<string, any>): number | null {
  let best: number | null = null;
  const consider = (iso: unknown) => {
    if (typeof iso !== 'string' || !iso) return;
    const ms = new Date(iso + 'T12:00:00').getTime();
    if (Number.isFinite(ms) && (best === null || ms > best)) best = ms;
  };
  if (Array.isArray(data.sessionLogs)) for (const l of data.sessionLogs) consider(l?.date);
  if (Array.isArray(data.sessionLogV2)) for (const l of data.sessionLogV2) consider(l?.date);
  return best;
}

// The campaign's "Last played" moment. Prefers the explicit __lastSessionAt
// stamp; falls back to the newest session-log date for campaigns created
// before the stamp existed. Crucially it never falls back to `updatedAt`, so
// merely opening/editing a campaign does not move "Last played".
export function getLastSessionAt(campaign: CampaignLike): number | null {
  const data = campaign?.data ?? {};
  if (typeof data[LAST_SESSION_KEY] === 'number') return data[LAST_SESSION_KEY];
  return latestSessionLogMs(data);
}

export function getLastOpenedAt(campaign: CampaignLike): number | null {
  const data = campaign?.data ?? {};
  return typeof data[LAST_OPENED_KEY] === 'number' ? data[LAST_OPENED_KEY] : null;
}

export function lastSessionDate(campaign: CampaignLike): Date | null {
  const ms = getLastSessionAt(campaign);
  return ms === null ? null : new Date(ms);
}

export function lastOpenedDate(campaign: CampaignLike): Date | null {
  const ms = getLastOpenedAt(campaign);
  return ms === null ? null : new Date(ms);
}
