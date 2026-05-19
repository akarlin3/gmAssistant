import { jwtVerify, createRemoteJWKSet, type JWTPayload } from 'jose';
import { evaluatePro, isProEmail, PRO_EMAILS, UserDoc } from './pro-status';

export { isProEmail, PRO_EMAILS };

export type VerifyProResult =
  | { ok: true; email: string; uid: string }
  | { ok: false; status: number; message: string };

const FIREBASE_JWKS_URL =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

let _jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
function getJwks() {
  if (!_jwks) _jwks = createRemoteJWKSet(new URL(FIREBASE_JWKS_URL));
  return _jwks;
}

function getProjectId(): string | null {
  return process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || null;
}

export async function verifyPro(idToken: string): Promise<VerifyProResult> {
  const projectId = getProjectId();
  if (!projectId) {
    console.error('[verifyPro] NEXT_PUBLIC_FIREBASE_PROJECT_ID not set');
    return { ok: false, status: 500, message: 'Server misconfigured' };
  }

  let payload: JWTPayload;
  try {
    const verified = await jwtVerify(idToken, getJwks(), {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    payload = verified.payload;
  } catch (e) {
    console.error('[verifyPro] jwtVerify failed:', e);
    return { ok: false, status: 401, message: 'Invalid auth token' };
  }

  const uid = typeof payload.sub === 'string' ? payload.sub : '';
  const email = (typeof payload.email === 'string' ? payload.email : '').toLowerCase();
  if (!uid) return { ok: false, status: 401, message: 'Could not resolve uid from token' };
  if (!email) return { ok: false, status: 401, message: 'Could not resolve email from token' };

  if (PRO_EMAILS.has(email)) return { ok: true, email, uid };

  const doc = await fetchUserDoc(projectId, uid, idToken);
  const { isPro } = evaluatePro(email, doc);
  if (!isPro) return { ok: false, status: 403, message: 'Pro only' };
  return { ok: true, email, uid };
}

async function fetchUserDoc(
  projectId: string,
  uid: string,
  idToken: string,
): Promise<Partial<UserDoc> | null> {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${idToken}` } });
  } catch (e) {
    console.error('[verifyPro] Firestore REST fetch failed:', e);
    return null;
  }
  if (res.status === 404) return null;
  if (!res.ok) {
    console.error('[verifyPro] Firestore REST returned', res.status, await safeText(res));
    return null;
  }
  const json = (await res.json()) as { fields?: Record<string, FirestoreValue> };
  return decodeFirestoreFields(json.fields);
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

type FirestoreValue =
  | { stringValue: string }
  | { integerValue: string | number }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null }
  | { timestampValue: string }
  | { mapValue: { fields?: Record<string, FirestoreValue> } }
  | { arrayValue: { values?: FirestoreValue[] } };

function decodeFirestoreFields(
  fields: Record<string, FirestoreValue> | undefined,
): Partial<UserDoc> | null {
  if (!fields) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    out[k] = decodeFirestoreValue(v);
  }
  return out as Partial<UserDoc>;
}

function decodeFirestoreValue(v: FirestoreValue): unknown {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('mapValue' in v) return decodeFirestoreFields(v.mapValue.fields);
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeFirestoreValue);
  return undefined;
}

export function readBearerToken(authHeader: string | null): string {
  if (!authHeader) return '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
}
