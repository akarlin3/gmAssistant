'use client';

import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { getFirebaseAuth } from '@/lib/firebase/client';
import { LockedInline } from '@/components/LockedFeature';
import { formatChange } from '@/lib/world/format';
import type { Briefing } from '@/lib/world/types';

// Renders a single "While You Were Away" briefing.
//   - Free tier: factual bulleted summary + Pro upsell on the narrative.
//   - Pro tier: a "Narrate" action that streams a Vivify paragraph from
//     /api/world-briefing, persisted back onto the briefing via onNarrative.
export function BriefingView({
  briefing,
  isPro,
  campaignName,
  onNarrative,
  compact = false,
}: {
  briefing: Briefing;
  isPro: boolean;
  campaignName?: string;
  onNarrative?: (briefingId: string, narrative: string) => void;
  compact?: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const narrate = async () => {
    if (loading) return;
    setError(null);
    setLoading(true);
    try {
      const user = getFirebaseAuth().currentUser;
      if (!user) throw new Error('Not signed in');
      const idToken = await user.getIdToken();
      const res = await fetch('/api/world-briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({
          daysElapsed: briefing.toDay - briefing.fromDay,
          changes: briefing.changes,
          campaignName,
        }),
      });
      const json = await res.json().catch(() => ({ error: 'Unknown error' }));
      if (!res.ok) {
        setError(json.error || `HTTP ${res.status}`);
        return;
      }
      if (typeof json.narrative === 'string' && json.narrative.trim()) {
        onNarrative?.(briefing.id, json.narrative.trim());
      } else {
        setError('No narrative returned.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to narrate.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded border border-rule bg-parchment p-4 shadow-card">
      <h3 className="mb-2 font-display text-sm uppercase tracking-wider text-brass-deep">
        While You Were Away (Day {briefing.fromDay} → {briefing.toDay})
      </h3>

      {briefing.narrative ? (
        <p className="mb-3 whitespace-pre-wrap font-serif text-sm italic text-ink">
          {briefing.narrative}
        </p>
      ) : isPro ? (
        <div className="mb-3">
          <button
            onClick={narrate}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded bg-crimson px-3 py-1.5 font-display text-xs uppercase tracking-wider text-parchment hover:bg-wine disabled:opacity-60"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {loading ? 'Narrating…' : 'Narrate With Vivify'}
          </button>
          {error && <p className="mt-1.5 font-serif text-xs text-crimson">{error}</p>}
        </div>
      ) : null}

      {briefing.changes.length === 0 ? (
        <p className="font-serif text-sm italic text-ink-mute">Nothing stirred in the world.</p>
      ) : (
        <ul className={`space-y-1.5 ${compact ? 'text-xs' : 'text-sm'}`}>
          {briefing.changes.map((c, i) => (
            <li key={`${c.entityId}-${i}`} data-briefing-change className="flex gap-2">
              <span className="text-brass">·</span>
              <span className="text-ink">
                <strong className="text-ink">{c.entityName}</strong> — {formatChange(c)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {!isPro && !briefing.narrative && (
        <div className="mt-3">
          <LockedInline label="Narrated Briefing" />
        </div>
      )}
    </div>
  );
}
