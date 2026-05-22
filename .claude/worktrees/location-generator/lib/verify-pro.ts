export const PRO_EMAILS = new Set(['averykarlin3@gmail.com']);

export function isProEmail(email: string | null | undefined): boolean {
  return !!email && PRO_EMAILS.has(email.toLowerCase());
}

export type VerifyProResult =
  | { ok: true; email: string }
  | { ok: false; status: number; message: string };

export async function verifyPro(idToken: string): Promise<VerifyProResult> {
  const fbKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!fbKey) return { ok: false, status: 500, message: 'Server missing Firebase config' };

  const lookup = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${fbKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    },
  );
  if (!lookup.ok) return { ok: false, status: 401, message: 'Invalid auth token' };
  const data = (await lookup.json()) as { users?: Array<{ email?: string }> };
  const email = (data?.users?.[0]?.email || '').toLowerCase();
  if (!email) return { ok: false, status: 401, message: 'Could not resolve email from token' };
  if (!PRO_EMAILS.has(email)) return { ok: false, status: 403, message: 'Pro only' };
  return { ok: true, email };
}

export function readBearerToken(authHeader: string | null): string {
  if (!authHeader) return '';
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
}
