export const PRO_EMAILS = new Set(['averykarlin3@gmail.com']);

export function isProEmail(email: string | null | undefined): boolean {
  return !!email && PRO_EMAILS.has(email.toLowerCase());
}

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid';

export type UserDoc = {
  uid: string;
  email: string;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  subscriptionStatus?: SubscriptionStatus;
  currentPeriodEndMs?: number;
  cancelAtPeriodEnd?: boolean;
  updatedAtMs?: number;
};

const ACTIVE_STATUSES: SubscriptionStatus[] = ['active', 'trialing'];

export type ProSource = 'none' | 'comped' | 'subscription';

export function evaluatePro(
  email: string | null | undefined,
  doc: Pick<UserDoc, 'subscriptionStatus' | 'currentPeriodEndMs'> | null | undefined,
  now: number = Date.now(),
): { isPro: boolean; source: ProSource } {
  if (isProEmail(email)) return { isPro: true, source: 'comped' };
  if (
    doc?.subscriptionStatus &&
    ACTIVE_STATUSES.includes(doc.subscriptionStatus) &&
    typeof doc.currentPeriodEndMs === 'number' &&
    doc.currentPeriodEndMs > now
  ) {
    return { isPro: true, source: 'subscription' };
  }
  return { isPro: false, source: 'none' };
}
