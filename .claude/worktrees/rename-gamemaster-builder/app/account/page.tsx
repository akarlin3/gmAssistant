'use client';

import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Sparkles, Settings, CheckCircle2, XCircle, ExternalLink } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { getFirebaseAuth } from '@/lib/firebase/client';

const PRO_PRICE_LABEL = '$1.99 / month';

const PRO_FEATURES = [
  'AI character-sheet parser (PDF / image / text → editable card)',
  'Name generator (cultures, fantasy races, mass batches)',
  'NPC trait inspires powered by Claude',
  'All future AI-backed features',
];

function AccountPageBody() {
  const router = useRouter();
  const params = useSearchParams();
  const { user, loading, isPro, proSource, subscriptionStatus, currentPeriodEndMs, cancelAtPeriodEnd } = useAuth();
  const [busy, setBusy] = useState<'checkout' | 'portal' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [user, loading, router]);

  const checkoutFlag = params.get('checkout');
  const periodEnd = currentPeriodEndMs ? new Date(currentPeriodEndMs) : null;

  if (loading || !user) {
    return (
      <main className="min-h-screen flex items-center justify-center text-sm text-ink-mute italic font-serif">
        Loading…
      </main>
    );
  }

  const startCheckout = async () => {
    setBusy('checkout');
    setError(null);
    try {
      const idToken = await getFirebaseAuth().currentUser?.getIdToken();
      if (!idToken) throw new Error('Not signed in');
      const res = await fetch('/api/stripe/create-checkout-session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'Could not start checkout');
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not start checkout');
      setBusy(null);
    }
  };

  const openPortal = async () => {
    setBusy('portal');
    setError(null);
    try {
      const idToken = await getFirebaseAuth().currentUser?.getIdToken();
      if (!idToken) throw new Error('Not signed in');
      const res = await fetch('/api/stripe/create-portal-session', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.error || 'Could not open billing portal');
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open billing portal');
      setBusy(null);
    }
  };

  return (
    <main className="min-h-screen p-3 sm:p-5 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="bg-parchment-soft border border-rule rounded-lg shadow-page p-3 sm:p-5 md:p-8 space-y-5">
          <header className="pb-4 border-b border-rule">
            <div className="flex items-center justify-between gap-2 mb-3">
              <Link href="/campaign" className="text-xs text-brass-deep hover:text-crimson font-display uppercase tracking-wider flex items-center gap-1">
                <ArrowLeft size={12} /> Campaigns
              </Link>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl text-crimson tracking-wide">Account</h1>
            <p className="text-sm text-ink-soft italic font-serif mt-1 break-all">{user.email}</p>
          </header>

          {checkoutFlag === 'success' && (
            <div className="rounded border border-crimson/40 bg-crimson/5 p-3 flex items-start gap-2">
              <CheckCircle2 size={16} className="text-crimson flex-shrink-0 mt-0.5" />
              <div className="text-sm font-serif text-ink">
                <p className="font-display uppercase tracking-wider text-xs text-crimson mb-1">Welcome to Pro</p>
                <p className="italic text-ink-soft">
                  Your subscription is active. Pro features will unlock as soon as Stripe&apos;s confirmation reaches us
                  (usually a few seconds).
                </p>
              </div>
            </div>
          )}
          {checkoutFlag === 'cancel' && (
            <div className="rounded border border-rule bg-parchment p-3 flex items-start gap-2">
              <XCircle size={16} className="text-ink-soft flex-shrink-0 mt-0.5" />
              <div className="text-sm font-serif text-ink-soft italic">
                Checkout cancelled — nothing was charged.
              </div>
            </div>
          )}

          <section className="space-y-3">
            <h2 className="font-display tracking-wide text-lg text-ink flex items-center gap-2">
              <Sparkles size={16} className="text-crimson" /> Subscription
            </h2>

            {isPro ? (
              <div className="rounded border border-crimson/40 bg-crimson/5 p-4 space-y-2">
                <div className="font-display uppercase tracking-wider text-xs text-crimson">
                  Pro {proSource === 'comped' ? '(comped account)' : 'subscriber'}
                </div>
                {proSource === 'subscription' && periodEnd && (
                  <p className="text-sm font-serif text-ink-soft">
                    {cancelAtPeriodEnd
                      ? `Your subscription cancels on ${periodEnd.toLocaleDateString()}.`
                      : `Renews on ${periodEnd.toLocaleDateString()}.`}
                    {subscriptionStatus === 'past_due' && (
                      <span className="block text-crimson mt-1">
                        Payment is past due — manage your subscription to retry.
                      </span>
                    )}
                  </p>
                )}
                {proSource === 'comped' && (
                  <p className="text-sm font-serif italic text-ink-soft">
                    You&apos;re on the comped allowlist — no subscription needed.
                  </p>
                )}
                {proSource === 'subscription' && (
                  <button
                    type="button"
                    onClick={openPortal}
                    disabled={busy !== null}
                    className="text-xs px-3 py-1.5 rounded border border-rule bg-parchment hover:bg-parchment-deep font-display uppercase tracking-wider inline-flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Settings size={11} />
                    {busy === 'portal' ? 'Opening…' : 'Manage subscription'}
                    <ExternalLink size={10} className="opacity-60" />
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded border border-brass/40 bg-brass/5 p-4 space-y-3">
                <p className="text-sm font-serif text-ink-soft">
                  Upgrade for {PRO_PRICE_LABEL}. Cancel anytime from this page.
                </p>
                <ul className="text-sm font-serif text-ink space-y-1 list-disc list-inside marker:text-brass-deep">
                  {PRO_FEATURES.map((f) => <li key={f}>{f}</li>)}
                </ul>
                <button
                  type="button"
                  onClick={startCheckout}
                  disabled={busy !== null}
                  className="text-sm px-4 py-2 rounded bg-crimson hover:bg-wine text-parchment font-display uppercase tracking-wider inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Sparkles size={13} />
                  {busy === 'checkout' ? 'Starting checkout…' : `Upgrade to Pro — ${PRO_PRICE_LABEL}`}
                </button>
              </div>
            )}

            {error && <p className="text-sm text-crimson font-serif italic">{error}</p>}
          </section>
        </div>
      </div>
    </main>
  );
}

export default function AccountPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center text-sm text-ink-mute italic font-serif">Loading…</main>
    }>
      <AccountPageBody />
    </Suspense>
  );
}
