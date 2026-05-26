'use client';

import { useEffect } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[app error boundary]', error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="max-w-md space-y-4 rounded border border-rule bg-parchment p-6 text-center shadow-card">
        <h1 className="font-display text-xl tracking-wide text-crimson">Something went wrong</h1>
        <p className="font-serif text-sm leading-relaxed text-ink-soft">
          An unexpected error interrupted this view. Your campaign data is saved — reloading usually
          fixes it.
        </p>
        {error.digest && (
          <p className="font-serif text-xs italic text-ink-mute">Reference: {error.digest}</p>
        )}
        <div className="flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="rounded border border-brass-deep/60 bg-brass/15 px-3 py-1.5 font-display text-xs uppercase tracking-wider text-brass-deep transition-colors hover:bg-brass hover:text-parchment"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded border border-rule px-3 py-1.5 font-display text-xs uppercase tracking-wider text-ink-soft transition-colors hover:bg-parchment-deep"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
