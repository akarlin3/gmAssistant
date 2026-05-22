import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { readBearerToken } from '@/lib/verify-pro';
import { getAdminAuth, getAdminDb } from '@/lib/firebase/admin';
import { getStripe, getStripePriceId } from '@/lib/stripe';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const idToken = readBearerToken(req.headers.get('authorization'));
  if (!idToken) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  let decoded: { uid: string; email?: string };
  try {
    decoded = await getAdminAuth().verifyIdToken(idToken);
  } catch {
    return NextResponse.json({ error: 'Invalid auth token' }, { status: 401 });
  }
  const { uid, email } = decoded;
  if (!email) return NextResponse.json({ error: 'Account missing email' }, { status: 400 });

  const origin = req.nextUrl.origin;
  const db = getAdminDb();
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  const existing = userSnap.exists ? userSnap.data() : null;

  const stripe = getStripe();

  let customerId: string | undefined = existing?.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email,
      metadata: { firebaseUid: uid },
    });
    customerId = customer.id;
    await Promise.all([
      userRef.set(
        {
          uid,
          email: email.toLowerCase(),
          stripeCustomerId: customerId,
          updatedAtMs: Date.now(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      ),
      db.collection('stripeCustomers').doc(customerId).set({ uid }),
    ]);
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: uid,
    line_items: [{ price: getStripePriceId(), quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${origin}/account?checkout=success`,
    cancel_url: `${origin}/account?checkout=cancel`,
    subscription_data: {
      metadata: { firebaseUid: uid },
    },
  });

  if (!session.url) {
    return NextResponse.json({ error: 'Stripe did not return a checkout URL' }, { status: 502 });
  }

  return NextResponse.json({ url: session.url });
}
