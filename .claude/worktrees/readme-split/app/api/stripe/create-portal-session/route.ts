import { NextRequest, NextResponse } from 'next/server';
import { readBearerToken } from '@/lib/verify-pro';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { getStripe } from '@/lib/stripe';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const idToken = readBearerToken(req.headers.get('authorization'));
  if (!idToken) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  let uid: string;
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
  }

  const userSnap = await getAdminDb().collection('users').doc(uid).get();
  const customerId = userSnap.exists ? (userSnap.data()?.stripeCustomerId as string | undefined) : undefined;
  if (!customerId) {
    return NextResponse.json({ error: 'No subscription found' }, { status: 400 });
  }

  const session = await getStripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${req.nextUrl.origin}/account`,
  });

  return NextResponse.json({ url: session.url });
}
