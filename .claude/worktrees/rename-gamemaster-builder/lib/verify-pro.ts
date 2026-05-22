import { getAdminAuth, getAdminDb } from './firebase/admin';
import { evaluatePro, isProEmail, PRO_EMAILS, UserDoc } from './pro-status';

export { isProEmail, PRO_EMAILS };

export type VerifyProResult =
  | { ok: true; email: string; uid: string }
  | { ok: false; status: number; message: string };

export async function verifyPro(idToken: string): Promise<VerifyProResult> {
  let decoded: { uid: string; email?: string };
  try {
    decoded = await getAdminAuth().verifyIdToken(idToken);
  } catch {
    return { ok: false, status: 401, message: 'Invalid auth token' };
  }
  const email = (decoded.email || '').toLowerCase();
  if (!email) return { ok: false, status: 401, message: 'Could not resolve email from token' };

  if (PRO_EMAILS.has(email)) return { ok: true, email, uid: decoded.uid };

  const snap = await getAdminDb().collection('users').doc(decoded.uid).get();
  const doc = snap.exists ? (snap.data() as Partial<UserDoc>) : null;
  const { isPro } = evaluatePro(email, doc);
  if (!isPro) return { ok: false, status: 403, message: 'Pro only' };
  return { ok: true, email, uid: decoded.uid };
}

export function readBearerToken(authHeader: string | null): string {
  if (!authHeader) return '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
}
