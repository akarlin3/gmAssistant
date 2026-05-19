'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut, Sparkles, Settings, ExternalLink, MailCheck } from 'lucide-react';
import { useAuth } from '@/lib/firebase/auth-context';
import { getFirebaseAuth } from '@/lib/firebase/client';

const PRO_PRICE_LABEL = '$2.99 / month';

export function AccountMenu() {
  const { user, isPro, proSource, subscriptionStatus, currentPeriodEndMs, cancelAtPeriodEnd, isOnWaitlist, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<'waitlist' | 'portal' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!user) return null;

  const joinWaitlist = async () => {
    setBusy('waitlist');
    setError(null);
    try {
      const idToken = await getFirebaseAuth().currentUser?.getIdToken();
      if (!idToken) throw new Error('Not signed in');
      const res = await fetch('/api/waitlist/join', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not join waitlist');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join waitlist');
    } finally {
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

  const handleSignOut = async () => {
    await logout();
    router.replace('/login');
  };

  const periodEnd = currentPeriodEndMs ? new Date(currentPeriodEndMs) : null;

  return (
    <div ref={wrapperRef} className="relative inline-block text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="text-xs px-2.5 py-1 rounded border border-rule text-ink-soft hover:bg-parchment-deep font-display uppercase tracking-wider flex items-center gap-1.5"
      >
        <span className="max-w-[140px] truncate normal-case tracking-normal font-serif italic text-ink-soft hidden sm:inline">
          {user.email}
        </span>
        <span className="sm:hidden">Account</span>
        {isPro && (
          <span className="text-[9px] not-italic px-1 py-0.5 rounded-sm border border-crimson/60 bg-crimson/10 text-crimson font-display uppercase tracking-wider">
            Pro
          </span>
        )}
        <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-72 rounded border border-rule bg-parchment-soft shadow-page p-3 space-y-3 z-30"
        >
          <div className="text-xs font-serif italic text-ink-soft break-all">{user.email}</div>

          {isPro ? (
            <div className="rounded border border-crimson/40 bg-crimson/5 p-2.5 space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Sparkles size={12} className="text-crimson" />
                <span className="text-xs font-display uppercase tracking-wider text-crimson">
                  Pro {proSource === 'comped' ? '(comped)' : 'subscriber'}
                </span>
              </div>
              {proSource === 'subscription' && periodEnd && (
                <div className="text-[11px] text-ink-soft font-serif">
                  {cancelAtPeriodEnd
                    ? `Cancels on ${periodEnd.toLocaleDateString()}`
                    : `Renews on ${periodEnd.toLocaleDateString()}`}
                  {subscriptionStatus === 'past_due' && (
                    <span className="block text-crimson">Payment past due — manage to retry.</span>
                  )}
                </div>
              )}
              {proSource === 'subscription' && (
                <button
                  type="button"
                  onClick={openPortal}
                  disabled={busy !== null}
                  className="w-full text-xs px-2 py-1.5 rounded border border-rule bg-parchment hover:bg-parchment-deep font-display uppercase tracking-wider flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  <Settings size={11} /> {busy === 'portal' ? 'Opening…' : 'Manage Subscription'}
                  <ExternalLink size={10} className="opacity-60" />
                </button>
              )}
            </div>
          ) : isOnWaitlist ? (
            <div className="rounded border border-brass/40 bg-brass/5 p-2.5 space-y-1.5">
              <div className="text-xs font-display uppercase tracking-wider text-brass-deep flex items-center gap-1.5">
                <MailCheck size={12} /> On the waitlist
              </div>
              <p className="text-[11px] font-serif italic text-ink-soft leading-snug">
                Pro will be {PRO_PRICE_LABEL} when it launches. We&apos;ll email you.
              </p>
            </div>
          ) : (
            <div className="rounded border border-brass/40 bg-brass/5 p-2.5 space-y-2">
              <div className="text-xs font-display uppercase tracking-wider text-brass-deep flex items-center gap-1.5">
                <Sparkles size={12} /> Pro — Coming Soon
              </div>
              <p className="text-[11px] font-serif italic text-ink-soft leading-snug">
                Pro AI tools at {PRO_PRICE_LABEL}. Join the waitlist for launch.
              </p>
              <button
                type="button"
                onClick={joinWaitlist}
                disabled={busy !== null}
                className="w-full text-xs px-2 py-1.5 rounded bg-crimson hover:bg-wine text-parchment font-display uppercase tracking-wider flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {busy === 'waitlist' ? 'Joining…' : 'Join the waitlist'}
              </button>
            </div>
          )}

          {error && <p className="text-[11px] text-crimson font-serif italic">{error}</p>}

          <div className="flex items-center justify-between gap-2 pt-1 border-t border-rule">
            <Link
              href="/account"
              onClick={() => setOpen(false)}
              className="text-[11px] text-ink-soft hover:text-crimson font-display uppercase tracking-wider"
            >
              Account page
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              className="text-[11px] text-ink-soft hover:text-crimson font-display uppercase tracking-wider flex items-center gap-1"
            >
              <LogOut size={10} /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
