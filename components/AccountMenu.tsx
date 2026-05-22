'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ChevronDown, LogOut, Sparkles, Settings, ExternalLink, MailCheck,
  Download, Upload, Trash2, Info, X, Archive, ArchiveRestore, RotateCcw,
  SlidersHorizontal, Copy, Cloud, UploadCloud,
} from 'lucide-react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useAuth } from '@/lib/firebase/auth-context';
import { getDb, getFirebaseAuth } from '@/lib/firebase/client';

const PRO_PRICE_LABEL = '$2.99 / month';
const GITHUB_URL = 'https://github.com/akarlin3/campaign-prep';

export type AccountMenuProps = {
  onExport?: () => void;
  onImport?: () => void;
  onArchive?: () => void;
  isArchived?: boolean;
  onDelete?: () => void;
  onRerunSession0?: () => void;
  onOpenPrepTargets?: () => void;
  onCopy?: () => void;
};

export function AccountMenu({ onExport, onImport, onArchive, isArchived, onDelete, onRerunSession0, onOpenPrepTargets, onCopy }: AccountMenuProps = {}) {
  const { user, isPro, proSource, subscriptionStatus, currentPeriodEndMs, cancelAtPeriodEnd, isOnWaitlist, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
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

  useEffect(() => {
    if (!aboutOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAboutOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [aboutOpen]);

  if (!user) return null;

  const joinWaitlist = async () => {
    setBusy('waitlist');
    setError(null);
    try {
      if (!user?.email) throw new Error('Not signed in');
      await setDoc(doc(getDb(), 'proWaitlist', user.uid), {
        uid: user.uid,
        email: user.email.toLowerCase(),
        displayName: user.displayName ?? null,
        createdAtMs: Date.now(),
        createdAt: serverTimestamp(),
      });
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

  const fireAndClose = (fn?: () => void) => () => {
    setOpen(false);
    fn?.();
  };

  const periodEnd = currentPeriodEndMs ? new Date(currentPeriodEndMs) : null;

  return (
    <>
      <div ref={wrapperRef} className="relative inline-block text-left">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="flex items-center gap-1.5 rounded border border-rule px-2.5 py-1 font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep"
        >
          <span className="hidden max-w-[140px] truncate font-serif normal-case italic tracking-normal text-ink-soft sm:inline">
            {user.email}
          </span>
          <span className="sm:hidden">Account</span>
          {isPro && (
            <span className="rounded-sm border border-crimson/60 bg-crimson/10 px-1 py-0.5 font-display text-[9px] uppercase not-italic tracking-wider text-crimson">
              Pro
            </span>
          )}
          <ChevronDown size={11} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 z-30 mt-2 w-72 space-y-3 rounded border border-rule bg-parchment-soft p-3 shadow-page"
          >
            <div className="break-all font-serif text-xs italic text-ink-soft">{user.email}</div>

            {isPro ? (
              <div className="space-y-1.5 rounded border border-crimson/40 bg-crimson/5 p-2.5">
                <div className="flex items-center gap-1.5">
                  <Sparkles size={12} className="text-crimson" />
                  <span className="font-display text-xs uppercase tracking-wider text-crimson">
                    Pro {proSource === 'comped' ? '(comped)' : 'subscriber'}
                  </span>
                </div>
                {proSource === 'subscription' && periodEnd && (
                  <div className="font-serif text-[11px] text-ink-soft">
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
                    className="flex w-full items-center justify-center gap-1.5 rounded border border-rule bg-parchment px-2 py-1.5 font-display text-xs uppercase tracking-wider hover:bg-parchment-deep disabled:opacity-50"
                  >
                    <Settings size={11} /> {busy === 'portal' ? 'Opening…' : 'Manage Subscription'}
                    <ExternalLink size={10} className="opacity-60" />
                  </button>
                )}
              </div>
            ) : isOnWaitlist ? (
              <div className="space-y-1.5 rounded border border-brass/40 bg-brass/5 p-2.5">
                <div className="flex items-center gap-1.5 font-display text-xs uppercase tracking-wider text-brass-deep">
                  <MailCheck size={12} /> On the waitlist
                </div>
                <p className="font-serif text-[11px] italic leading-snug text-ink-soft">
                  Pro will be {PRO_PRICE_LABEL} when it launches. We&apos;ll email you.
                </p>
              </div>
            ) : (
              <div className="space-y-2 rounded border border-brass/40 bg-brass/5 p-2.5">
                <div className="flex items-center gap-1.5 font-display text-xs uppercase tracking-wider text-brass-deep">
                  <Sparkles size={12} /> Pro — Coming Soon
                </div>
                <p className="font-serif text-[11px] italic leading-snug text-ink-soft">
                  Pro AI tools at {PRO_PRICE_LABEL}. Join the waitlist for launch.
                </p>
                <button
                  type="button"
                  onClick={joinWaitlist}
                  disabled={busy !== null}
                  className="flex w-full items-center justify-center gap-1.5 rounded bg-crimson px-2 py-1.5 font-display text-xs uppercase tracking-wider text-parchment hover:bg-wine disabled:opacity-50"
                >
                  {busy === 'waitlist' ? 'Joining…' : 'Join the waitlist'}
                </button>
              </div>
            )}

            {error && <p className="font-serif text-[11px] italic text-crimson">{error}</p>}

            <div className="space-y-1 border-t border-rule pt-1">
              <div className="px-1 font-display text-[10px] uppercase tracking-wider text-brass-deep">
                Cloud Backups
              </div>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push('/account?action=backup');
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep"
              >
                <UploadCloud size={12} className="text-brass-deep" /> Backup to Google Drive
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  router.push('/account');
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep"
              >
                <Cloud size={12} className="text-brass-deep" /> Manage Cloud Backups
              </button>
            </div>

            {(onExport || onImport || onArchive || onDelete || onRerunSession0 || onOpenPrepTargets || onCopy) && (
              <div className="space-y-1 border-t border-rule pt-1">
                <div className="px-1 font-display text-[10px] uppercase tracking-wider text-brass-deep">
                  Campaign Actions
                </div>
                {onOpenPrepTargets && (
                  <button
                    type="button"
                    onClick={fireAndClose(onOpenPrepTargets)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep"
                  >
                    <SlidersHorizontal size={12} className="text-brass-deep" /> Prep Target Settings
                  </button>
                )}
                {onRerunSession0 && (
                  <button
                    type="button"
                    onClick={fireAndClose(onRerunSession0)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep"
                  >
                    <RotateCcw size={12} className="text-brass-deep" /> Re-run Session 0 Setup
                  </button>
                )}
                {onExport && (
                  <button
                    type="button"
                    onClick={fireAndClose(onExport)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep"
                  >
                    <Download size={12} className="text-brass-deep" /> Export JSON
                  </button>
                )}
                {onImport && (
                  <button
                    type="button"
                    onClick={fireAndClose(onImport)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep"
                  >
                    <Upload size={12} className="text-brass-deep" /> Import JSON
                  </button>
                )}
                {onArchive && (
                  <button
                    type="button"
                    onClick={fireAndClose(onArchive)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep"
                  >
                    {isArchived ? (
                      <><ArchiveRestore size={12} className="text-brass-deep" /> Unarchive Campaign</>
                    ) : (
                      <><Archive size={12} className="text-brass-deep" /> Archive Campaign</>
                    )}
                  </button>
                )}
                {onCopy && (
                  <button
                    type="button"
                    onClick={fireAndClose(onCopy)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep"
                  >
                    <Copy size={12} className="text-brass-deep" /> Copy Campaign
                  </button>
                )}
                {onDelete && (
                  <button
                    type="button"
                    onClick={fireAndClose(onDelete)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-display text-xs uppercase tracking-wider text-crimson hover:bg-crimson hover:text-parchment"
                  >
                    <Trash2 size={12} /> Delete Campaign
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-2 border-t border-rule pt-1">
              <Link
                href="/account"
                onClick={() => setOpen(false)}
                className="font-display text-[11px] uppercase tracking-wider text-ink-soft hover:text-crimson"
              >
                Account page
              </Link>
              <button
                type="button"
                onClick={handleSignOut}
                className="flex items-center gap-1 font-display text-[11px] uppercase tracking-wider text-ink-soft hover:text-crimson"
              >
                <LogOut size={10} /> Sign out
              </button>
            </div>

            <div className="border-t border-rule pt-1">
              <button
                type="button"
                onClick={() => { setOpen(false); setAboutOpen(true); }}
                className="flex items-center gap-1 font-display text-[11px] uppercase tracking-wider text-ink-soft hover:text-crimson"
              >
                <Info size={10} /> About this app
              </button>
            </div>
          </div>
        )}
      </div>

      {aboutOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4 backdrop-blur-[2px]"
          onClick={() => setAboutOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="About this app"
        >
          <div
            className="w-full max-w-md space-y-3 rounded-lg border border-rule bg-parchment p-5 shadow-page"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-display text-lg tracking-wide text-ink">Gamemaster Assistant</h2>
              <button
                type="button"
                onClick={() => setAboutOpen(false)}
                className="text-ink-mute hover:text-crimson"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
            <p className="font-serif text-sm italic text-ink-soft">
              Lazy DM · Collaborative Campaign Design · Proactive Roleplaying
            </p>
            <p className="font-serif text-sm leading-relaxed text-ink-soft">
              A TTRPG campaign-prep webapp that integrates three published methodologies into one
              workflow: Mike Shea&apos;s 8-step session checklist, Collaborative Campaign Design&apos;s
              Session −1 worldbuilding, and the 5 Rules of Proactive Fun for PC goal tracking.
              Built for solo DMs who want their notes synced across devices.
            </p>
            <div className="flex items-center justify-between border-t border-rule pt-2">
              <a
                href={GITHUB_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:text-crimson"
              >
                <ExternalLink size={11} /> Source on GitHub
              </a>
              <button
                type="button"
                onClick={() => setAboutOpen(false)}
                className="rounded border border-rule px-3 py-1 font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
