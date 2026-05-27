import { MONTHLY_CHAR_LIMIT } from './types';

// Server-side TTS quota tracking. There is no Admin SDK in this deployment
// (service-account key creation is blocked by org policy), so usage is stored
// in `usage/{uid}/voice/{YYYY-MM}` and read/written through the Firestore REST
// API using the caller's own ID token — the firestore.rules grant the owner
// read+write on their own usage docs. This is a soft guardrail; the in-memory
// rate limiter (lib/rate-limit.ts) is the hard backstop.

function getProjectId(): string {
  const id = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!id || id === 'undefined' || id.trim() === '') return 'campaign-prep-fc9ed';
  return id;
}

export function currentUsageMonth(now: number = Date.now()): string {
  return new Date(now).toISOString().slice(0, 7); // YYYY-MM
}

export function nextResetDate(now: number = Date.now()): string {
  const d = new Date(now);
  d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(1);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function usageDocUrl(uid: string, month: string): string {
  const pid = getProjectId();
  return `https://firestore.googleapis.com/v1/projects/${pid}/databases/(default)/documents/usage/${uid}/voice/${month}`;
}

async function readChars(uid: string, idToken: string, month: string): Promise<number> {
  const res = await fetch(usageDocUrl(uid, month), {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (res.status === 404) return 0;
  if (!res.ok) {
    // Fail open on a transient read error — the rate limiter still applies.
    console.error('[voice/usage] read failed', res.status);
    return 0;
  }
  const json = (await res.json()) as {
    fields?: { chars?: { integerValue?: string | number } };
  };
  const raw = json.fields?.chars?.integerValue;
  const n = typeof raw === 'string' ? Number(raw) : typeof raw === 'number' ? raw : 0;
  return Number.isFinite(n) ? n : 0;
}

async function writeChars(
  uid: string,
  idToken: string,
  month: string,
  chars: number,
): Promise<void> {
  const res = await fetch(usageDocUrl(uid, month), {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        chars: { integerValue: String(chars) },
        updatedAt: { integerValue: String(Date.now()) },
      },
    }),
  });
  if (!res.ok) {
    console.error('[voice/usage] write failed', res.status, await res.text().catch(() => ''));
  }
}

export type VoiceUsage = {
  used: number;
  limit: number;
  month: string;
  resetDate: string;
};

export async function getVoiceUsage(uid: string, idToken: string): Promise<VoiceUsage> {
  const month = currentUsageMonth();
  const used = await readChars(uid, idToken, month);
  return { used, limit: MONTHLY_CHAR_LIMIT, month, resetDate: nextResetDate() };
}

export type QuotaResult =
  | { ok: true; used: number; limit: number }
  | { ok: false; used: number; limit: number; resetDate: string };

export async function checkAndIncrementVoiceChars(
  uid: string,
  idToken: string,
  chars: number,
): Promise<QuotaResult> {
  const month = currentUsageMonth();
  const current = await readChars(uid, idToken, month);

  if (current + chars > MONTHLY_CHAR_LIMIT) {
    return { ok: false, used: current, limit: MONTHLY_CHAR_LIMIT, resetDate: nextResetDate() };
  }

  const next = current + chars;
  await writeChars(uid, idToken, month, next);
  return { ok: true, used: next, limit: MONTHLY_CHAR_LIMIT };
}
