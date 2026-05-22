import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import Stripe from 'stripe';
import { getAdminDb } from '@/lib/firebase/admin';
import { getStripe, getStripeWebhookSecret } from '@/lib/stripe';

export const runtime = 'nodejs';

async function resolveUidFromCustomer(customerId: string): Promise<string | null> {
  const db = getAdminDb();
  const mapping = await db.collection('stripeCustomers').doc(customerId).get();
  if (mapping.exists) {
    const uid = mapping.data()?.uid;
    if (typeof uid === 'string') return uid;
  }
  const customer = await getStripe().customers.retrieve(customerId);
  if (customer.deleted) return null;
  const uid = customer.metadata?.firebaseUid;
  if (uid) {
    await db.collection('stripeCustomers').doc(customerId).set({ uid });
    return uid;
  }
  return null;
}

function periodEndMs(sub: Stripe.Subscription): number | null {
  // In the 2026-04-22.dahlia API version, current_period_end lives on each subscription item
  // (a subscription can hold items on different schedules); we use the latest across items.
  const ends = sub.items.data
    .map((i) => i.current_period_end)
    .filter((v): v is number => typeof v === 'number');
  if (ends.length === 0) return null;
  return Math.max(...ends) * 1000;
}

async function applySubscription(uid: string, sub: Stripe.Subscription) {
  const db = getAdminDb();
  const ms = periodEndMs(sub);
  await db.collection('users').doc(uid).set(
    {
      uid,
      stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
      stripeSubscriptionId: sub.id,
      subscriptionStatus: sub.status,
      currentPeriodEndMs: ms ?? FieldValue.delete(),
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      updatedAtMs: Date.now(),
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, getStripeWebhookSecret());
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'invalid signature';
    return NextResponse.json({ error: `Webhook verification failed: ${msg}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const uid = session.client_reference_id || undefined;
        const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
        if (uid && subId) {
          const sub = await getStripe().subscriptions.retrieve(subId);
          await applySubscription(uid, sub);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
        const uid = await resolveUidFromCustomer(customerId);
        if (uid) await applySubscription(uid, sub);
        break;
      }
      case 'invoice.payment_failed':
      case 'invoice.payment_succeeded': {
        // Subscription state changes also fire customer.subscription.updated; nothing extra to do.
        break;
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    return NextResponse.json({ error: `Handler error: ${msg}` }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
