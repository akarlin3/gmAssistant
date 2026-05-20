'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Copy, Printer, Award, Check } from 'lucide-react';
import type { Campaign } from '@/lib/firebase/campaigns';
import type { SessionLogEntry } from '@/lib/sessionLog';
import { formatDuration } from '@/lib/sessionLog';
import type { ChangeEvent, ChangeEventKind } from '@/lib/sessionEvents';
import { CHANGE_EVENT_LABELS } from '@/lib/sessionEvents';

type Props = {
  campaign: Campaign;
  entry: SessionLogEntry;
};

// DM-only event kinds — hidden by default, surfaced behind toggles.
const FACTION_KINDS: ReadonlySet<ChangeEventKind> = new Set(['faction_clock_ticked']);
const RENOWN_KINDS: ReadonlySet<ChangeEventKind> = new Set(['renown_changed']);

// Player-visible kinds, always shown.
const VISIBLE_KINDS: ReadonlySet<ChangeEventKind> = new Set([
  'scene_used',
  'secret_revealed',
  'goal_status',
  'magic_item_given',
  'monster_added',
  'npc_added',
  'npc_edited',
  'other',
]);

function formatHumanDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric', month: 'long', day: 'numeric',
  });
}

export default function RecapView({ campaign, entry }: Props) {
  const router = useRouter();
  const search = useSearchParams();
  const [copied, setCopied] = useState(false);

  const showSecrets = search.get('secrets') === '1';
  const showFactions = search.get('factions') === '1';
  const showRenown = search.get('renown') === '1';

  const setToggle = useCallback((key: 'secrets' | 'factions' | 'renown', on: boolean) => {
    const params = new URLSearchParams(search.toString());
    if (on) params.set(key, '1');
    else params.delete(key);
    const qs = params.toString();
    router.replace(qs ? `?${qs}` : '?', { scroll: false });
  }, [router, search]);

  const visibleEvents = useMemo(() => {
    return entry.events.filter(e => {
      if (e.dismissed) return false;
      if (FACTION_KINDS.has(e.kind)) return showFactions;
      if (RENOWN_KINDS.has(e.kind)) return showRenown;
      return VISIBLE_KINDS.has(e.kind);
    });
  }, [entry.events, showFactions, showRenown]);

  const eventsByKind = useMemo(() => {
    const acc: Record<string, ChangeEvent[]> = {};
    for (const e of visibleEvents) (acc[e.kind] ||= []).push(e);
    return acc;
  }, [visibleEvents]);

  const orderedKinds: ChangeEventKind[] = useMemo(() => {
    const preferred: ChangeEventKind[] = [
      'scene_used', 'secret_revealed', 'goal_status', 'magic_item_given',
      'monster_added', 'npc_added', 'npc_edited',
      'faction_clock_ticked', 'renown_changed', 'other',
    ];
    return preferred.filter(k => (eventsByKind[k]?.length || 0) > 0);
  }, [eventsByKind]);

  const titleLine = entry.title?.trim()
    ? `Session ${entry.number} — ${entry.title.trim()}`
    : `Session ${entry.number}`;
  const subtitle = `${formatHumanDate(entry.date)} · ${formatDuration(Math.max(0, entry.endedAt - entry.startedAt))}`;

  const recapParagraphs = useMemo(() => {
    const text = (entry.recap || '').trim();
    if (!text) return [];
    return text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  }, [entry.recap]);

  const markdown = useMemo(() => {
    const lines: string[] = [];
    lines.push(`# ${titleLine}`);
    lines.push(`*${subtitle}*`);
    lines.push('');
    if (recapParagraphs.length > 0) {
      for (const p of recapParagraphs) {
        lines.push(p);
        lines.push('');
      }
    }
    if (entry.xpAwarded) {
      lines.push(`**XP Awarded:** ${entry.xpAwarded.toLocaleString()}`);
      lines.push('');
    }
    if (orderedKinds.length > 0) {
      lines.push('## What Happened');
      lines.push('');
      for (const kind of orderedKinds) {
        const list = eventsByKind[kind] || [];
        const label = CHANGE_EVENT_LABELS[kind] || kind;
        for (const e of list) lines.push(`- ${label}: ${e.summary}`);
      }
      lines.push('');
    }
    if (showSecrets && entry.secretsRevealed.length > 0) {
      lines.push('## Secrets Revealed');
      lines.push('');
      for (const s of entry.secretsRevealed) lines.push(`- ${s}`);
      lines.push('');
    }
    if (entry.goalUpdates.length > 0) {
      lines.push('## Goal Updates');
      lines.push('');
      for (const g of entry.goalUpdates) lines.push(`- ${g.goal}: ${g.from} → ${g.to}`);
      lines.push('');
    }
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }, [titleLine, subtitle, recapParagraphs, entry.xpAwarded, entry.secretsRevealed,
      entry.goalUpdates, orderedKinds, eventsByKind, showSecrets]);

  const copyMarkdown = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(markdown);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }, [markdown]);

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  const handlePrint = () => window.print();

  return (
    <main className="min-h-screen bg-parchment text-ink">
      <style jsx global>{`
        @media print {
          .recap-no-print { display: none !important; }
          body, main { background: #fff !important; color: #000 !important; }
          .recap-page section { page-break-before: always; }
          .recap-page section:first-of-type { page-break-before: avoid; }
          .recap-page h1, .recap-page h2 { page-break-after: avoid; }
          .recap-page p { orphans: 3; widows: 3; }
        }
      `}</style>

      <div className="recap-no-print sticky top-0 z-10 border-b border-rule bg-parchment/95 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 py-2 flex items-center gap-3">
          <Link
            href={`/campaign/${campaign.id}`}
            className="inline-flex items-center gap-1 text-xs text-ink-soft hover:text-crimson font-display uppercase tracking-wider"
          >
            <ArrowLeft size={14} /> Back
          </Link>
          <div className="flex-1 min-w-0 text-xs text-ink-mute font-serif truncate">
            {campaign.name || 'Campaign'}
          </div>
          <button
            onClick={copyMarkdown}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-brass-deep/60 bg-brass/15 text-brass-deep hover:bg-brass hover:text-parchment font-display uppercase tracking-wider"
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? 'Copied' : 'Copy Markdown'}
          </button>
          <button
            onClick={handlePrint}
            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-rule text-ink-soft hover:bg-parchment-deep font-display uppercase tracking-wider"
          >
            <Printer size={12} /> Print
          </button>
        </div>
      </div>

      <article className="recap-page max-w-3xl mx-auto px-4 py-8 space-y-6">
        <header className="space-y-1">
          <h1 className="font-display text-2xl text-ink tracking-wide">{titleLine}</h1>
          <p className="text-sm text-ink-mute font-serif italic">{subtitle}</p>
          {entry.xpAwarded ? (
            <div className="inline-flex items-center gap-1 mt-1 text-xs text-brass-deep font-display uppercase tracking-wider">
              <Award size={12} /> {entry.xpAwarded.toLocaleString()} XP awarded
            </div>
          ) : null}
        </header>

        {recapParagraphs.length > 0 ? (
          <section className="space-y-3">
            {recapParagraphs.map((p, i) => (
              <p key={i} className="text-base font-serif text-ink leading-relaxed whitespace-pre-wrap">{p}</p>
            ))}
          </section>
        ) : (
          <section>
            <p className="italic text-ink-mute font-serif text-sm">No recap was written for this session.</p>
          </section>
        )}

        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule pb-2">
            <h2 className="font-display text-lg text-ink tracking-wide">What Happened</h2>
            <div className="recap-no-print flex flex-wrap items-center gap-3 text-[11px] text-ink-mute font-serif">
              <label className="inline-flex items-center gap-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showSecrets}
                  onChange={(e) => setToggle('secrets', e.target.checked)}
                  className="accent-crimson"
                />
                Show secrets
              </label>
              <label className="inline-flex items-center gap-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showFactions}
                  onChange={(e) => setToggle('factions', e.target.checked)}
                  className="accent-crimson"
                />
                Show faction movements
              </label>
              <label className="inline-flex items-center gap-1 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={showRenown}
                  onChange={(e) => setToggle('renown', e.target.checked)}
                  className="accent-crimson"
                />
                Show renown changes
              </label>
            </div>
          </div>

          {orderedKinds.length === 0 ? (
            <p className="italic text-ink-mute font-serif text-sm">Nothing was logged for this session.</p>
          ) : (
            <div className="space-y-3">
              {orderedKinds.map(kind => (
                <div key={kind}>
                  <div className="text-[10px] text-brass-deep font-display uppercase tracking-wider mb-1">
                    {CHANGE_EVENT_LABELS[kind] || kind}
                  </div>
                  <ul className="space-y-1">
                    {(eventsByKind[kind] || []).map(e => (
                      <li key={e.id} className="text-sm font-serif text-ink-soft flex items-start gap-2">
                        <span className="text-brass-deep flex-shrink-0 mt-1">·</span>
                        <span>{e.summary}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </section>

        {showSecrets && entry.secretsRevealed.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-display text-lg text-ink tracking-wide border-b border-rule pb-2">Secrets Revealed</h2>
            <ul className="space-y-1">
              {entry.secretsRevealed.map((s, i) => (
                <li key={i} className="text-sm font-serif text-ink-soft flex items-start gap-2">
                  <span className="text-brass-deep flex-shrink-0 mt-1">·</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {entry.goalUpdates.length > 0 && (
          <section className="space-y-2">
            <h2 className="font-display text-lg text-ink tracking-wide border-b border-rule pb-2">Goal Updates</h2>
            <ul className="space-y-1">
              {entry.goalUpdates.map((g, i) => (
                <li key={i} className="text-sm font-serif text-ink-soft">
                  <span className="text-ink">{g.goal}:</span>{' '}
                  <span className="text-ink-mute">{g.from} → {g.to}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </article>
    </main>
  );
}
