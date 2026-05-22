import Stripe from 'stripe';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY env var is not set');
  _stripe = new Stripe(key);
  return _stripe;
}

export function getStripePriceId(): string {
  const id = process.env.STRIPE_PRICE_ID;
  if (!id) throw new Error('STRIPE_PRICE_ID env var is not set');
  return id;
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET env var is not set');
  return secret;
}
