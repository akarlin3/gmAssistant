import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { readBearerToken } from '@/lib/verify-pro';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const idToken = readBearerToken(req.headers.get('authorization'));
  if (!idToken) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  let decoded: { uid: string; email?: string; name?: string };
  try {
    decoded = await getAdminAuth().verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
  }
  const { uid, email, name } = decoded;
  if (!email) return NextResponse.json({ error: 'Account missing email' }, { status: 400 });

  const db = getAdminDb();
  const ref = db.collection('proWaitlist').doc(uid);
  const existing = await ref.get();

  if (existing.exists) {
    return NextResponse.json({ alreadyOnWaitlist: true });
  }

  await ref.set({
    uid,
    email: email.toLowerCase(),
    displayName: name ?? null,
    createdAtMs: Date.now(),
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ alreadyOnWaitlist: false });
}
