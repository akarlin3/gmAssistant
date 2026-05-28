'use client';

import Link from 'next/link';
import { Lock, Sparkles } from 'lucide-react';

export function LockedInline({ label }: { label: string }) {
  return (
    <Link
      href="/account"
      className="flex items-center gap-1.5 rounded border border-dashed border-brass/60 px-2 py-1 font-display text-xs uppercase tracking-wider text-brass-deep hover:border-crimson hover:text-crimson"
      title="Join the Pro waitlist to unlock this feature"
    >
      <Lock size={10} /> {label}
      <span className="text-[9px] opacity-70">— Pro</span>
    </Link>
  );
}

export function LockedPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="my-4 space-y-3 rounded border border-dashed border-brass/60 bg-brass/5 p-5 text-center">
      <div className="flex items-center justify-center gap-2 text-brass-deep">
        <Lock size={14} />
        <span className="font-display text-sm uppercase tracking-wider">{title} — Pro</span>
      </div>
      <p className="mx-auto max-w-md font-serif text-sm italic text-ink-soft">{children}</p>
      <Link
        href="/account"
        className="gm-shimmer inline-flex items-center gap-1.5 rounded bg-crimson px-3 py-1.5 font-display text-xs uppercase tracking-wider text-parchment hover:bg-wine"
      >
        <Sparkles size={12} /> Join the Pro waitlist — $3.99 / month at launch
      </Link>
    </div>
  );
}
