'use client';

import { useEffect, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { getDb } from '@/lib/firebase/client';
import { MONTHLY_CHAR_LIMIT } from '@/lib/voice/types';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function nextResetDate(): Date {
  const d = new Date();
  d.setMonth(d.getMonth() + 1, 1);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Shows the signed-in user's monthly TTS character usage. Reads the
// usage/{uid}/voice/{YYYY-MM} doc directly via the Web SDK (the owner can read
// their own usage per firestore.rules).
export function VoiceUsagePanel({ uid }: { uid: string }) {
  const [used, setUsed] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const snap = await getDoc(doc(getDb(), 'usage', uid, 'voice', currentMonth()));
        const chars = snap.exists() ? Number(snap.data()?.chars ?? 0) : 0;
        if (!cancelled) setUsed(Number.isFinite(chars) ? chars : 0);
      } catch {
        if (!cancelled) setUsed(0);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  const reset = nextResetDate();
  const daysUntilReset = Math.max(
    0,
    Math.ceil((reset.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
  );
  const pct =
    used === null ? 0 : Math.min(100, Math.round((used / MONTHLY_CHAR_LIMIT) * 100));

  return (
    <section className="mt-6 rounded-lg border border-rule bg-parchment-soft p-4 sm:p-5">
      <h2 className="mb-1 flex items-center gap-2 font-display text-sm uppercase tracking-wider text-ink">
        <Volume2 size={15} /> Voice Usage
      </h2>
      <p className="mb-3 font-serif text-xs italic text-ink-mute">
        NPC voice synthesis (TTS) characters generated this month.
      </p>

      <div className="flex items-baseline justify-between font-serif text-sm text-ink">
        <span>
          {used === null ? '…' : used.toLocaleString()} /{' '}
          {MONTHLY_CHAR_LIMIT.toLocaleString()} characters
        </span>
        <span className="text-xs text-ink-mute">{pct}%</span>
      </div>
      <div className="mt-1.5 h-2 w-full overflow-hidden rounded bg-parchment-deep">
        <div
          className={`h-full rounded transition-all ${pct >= 100 ? 'bg-crimson' : 'bg-brass'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="mt-2 font-serif text-xs text-ink-mute">
        Resets {reset.toLocaleDateString()} — {daysUntilReset}{' '}
        {daysUntilReset === 1 ? 'day' : 'days'} away.
      </p>
    </section>
  );
}
