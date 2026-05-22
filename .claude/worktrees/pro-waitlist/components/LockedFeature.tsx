'use client';

import Link from 'next/link';
import { Lock, Sparkles } from 'lucide-react';

export function LockedInline({ label }: { label: string }) {
  return (
    <Link
      href="/account"
      className="text-xs px-2 py-1 rounded border border-dashed border-brass/60 text-brass-deep hover:border-crimson hover:text-crimson font-display uppercase tracking-wider flex items-center gap-1.5"
      title="Join the Pro waitlist to unlock this feature"
    >
      <Lock size={10} /> {label}
      <span className="text-[9px] opacity-70">— Pro</span>
    </Link>
  );
}

export function LockedPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded border border-dashed border-brass/60 bg-brass/5 p-5 text-center space-y-3 my-4">
      <div className="flex items-center justify-center gap-2 text-brass-deep">
        <Lock size={14} />
        <span className="font-display uppercase tracking-wider text-sm">{title} — Pro</span>
      </div>
      <p className="text-sm font-serif italic text-ink-soft max-w-md mx-auto">{children}</p>
      <Link
        href="/account"
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded bg-crimson hover:bg-wine text-parchment font-display uppercase tracking-wider"
      >
        <Sparkles size={12} /> Join the Pro waitlist — $2.99 / month at launch
      </Link>
    </div>
  );
}
