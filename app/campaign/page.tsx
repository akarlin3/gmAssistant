'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/firebase/auth-context';
import {
  subscribeToUserCampaigns, createCampaign, updateCampaign,
  archiveCampaign, unarchiveCampaign, deleteCampaign,
  copyCampaign,
  type Campaign,
} from '@/lib/firebase/campaigns';
import { Plus, ScrollText, Pin, Archive, ArchiveRestore, Trash2, ChevronDown, ChevronRight, MoreHorizontal, ExternalLink, Copy, Cloud } from 'lucide-react';
import { AccountMenu } from '@/components/AccountMenu';
import { relativeTime } from '@/lib/relativeTime';

type Status = 'active' | 'hiatus' | 'new' | 'archived';

type Enriched = {
  raw: Campaign;
  pinned: boolean;
  archived: boolean;
  pitch: string;
  pcName: string | null;
  lastPlayed: Date | null;
  status: Status;
  sortKey: number;
  isPlayer: boolean;
};

const STATUS_STYLE: Record<Status, { border: string; bg: string; text: string; label: string }> = {
  active:   { border: 'border-moss/40',  bg: 'bg-moss/5',            text: 'text-moss',       label: 'Active' },
  hiatus:   { border: 'border-brass/40', bg: 'bg-brass/5',           text: 'text-brass-deep', label: 'Hiatus' },
  new:      { border: 'border-rule',     bg: 'bg-parchment-deep/30', text: 'text-ink-soft',   label: 'New' },
  archived: { border: 'border-rule',     bg: 'bg-parchment-deep/30', text: 'text-ink-mute',   label: 'Archived' },
};

const STATUS_ORDER: Record<Status, number> = { active: 0, hiatus: 1, new: 2, archived: 3 };

function enrich(c: Campaign, userId?: string): Enriched {
  const data = (c.data ?? {}) as Record<string, any>;
  const pinned = data.__pinned === true;
  const archived = Boolean(c.archivedAt);
  const isPlayer = userId ? (c.playerIds || []).includes(userId) : false;

  const pitch =
    typeof data.pitch === 'string' ? data.pitch.split('\n')[0].trim() : '';

  const characters = Array.isArray(data.characters) ? data.characters : [];
  const pcName =
    typeof characters[0]?.name === 'string' && characters[0].name.trim()
      ? characters[0].name.trim()
      : null;

  const sessionLogs = Array.isArray(data.sessionLogs) ? data.sessionLogs : [];
  const dates = sessionLogs
    .map((l: any) => (typeof l?.date === 'string' ? l.date : ''))
    .filter(Boolean)
    .sort()
    .reverse();
  const lastPlayedISO = dates[0];
  const lastPlayed = lastPlayedISO
    ? new Date(lastPlayedISO + 'T12:00:00')
    : c.updatedAt
      ? new Date(c.updatedAt.toMillis())
      : null;

  let status: Status;
  if (archived) status = 'archived';
  else if (sessionLogs.length === 0) status = 'new';
  else {
    const days = lastPlayed
      ? Math.floor((Date.now() - lastPlayed.getTime()) / (1000 * 60 * 60 * 24))
      : Infinity;
    status = days < 30 ? 'active' : 'hiatus';
  }

  return { raw: c, pinned, archived, pitch, pcName, lastPlayed, status, sortKey: lastPlayed?.getTime() ?? 0, isPlayer };
}

function sortActive(items: Enriched[]): Enriched[] {
  return [...items].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (a.status !== b.status) return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    return b.sortKey - a.sortKey;
  });
}

export default function CampaignListPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    const unsub = subscribeToUserCampaigns(
      user.uid,
      (items) => { setCampaigns(items); setLoading(false); setError(null); },
      (err) => { setError(err.message); setLoading(false); }
    );
    return unsub;
  }, [user]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(null);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const { active, archived } = useMemo(() => {
    if (!user) return { active: [], archived: [] };
    const enriched = campaigns.map(c => enrich(c, user.uid));
    return {
      active: sortActive(enriched.filter((e) => !e.archived)),
      archived: enriched
        .filter((e) => e.archived)
        .sort((a, b) => b.sortKey - a.sortKey),
    };
  }, [campaigns]);

  const handleCreate = async () => {
    if (!user) return;
    try {
      const id = await createCampaign(user.uid);
      router.push(`/campaign/${id}`);
    } catch (e: any) {
      setError(e?.message || 'Failed to create campaign');
    }
  };

  const handleArchive = async (c: Campaign) => {
    if (!confirm(`Archive "${c.name}"? It will be hidden from your main list — you can restore it from the Archived section.`)) return;
    try { await archiveCampaign(c.id); } catch (e: any) { setError(e?.message || 'Archive failed'); }
  };
  const handleUnarchive = async (c: Campaign) => {
    try { await unarchiveCampaign(c.id); } catch (e: any) { setError(e?.message || 'Unarchive failed'); }
  };
  const handleDelete = async (c: Campaign) => {
    if (!confirm(`Delete "${c.name}"? This cannot be undone.`)) return;
    try { await deleteCampaign(c.id); } catch (e: any) { setError(e?.message || 'Delete failed'); }
  };
  const handleCopy = async (c: Campaign) => {
    if (!confirm(`Create a copy of "${c.name}"?`)) return;
    try {
      const id = await copyCampaign(c.id);
      router.push(`/campaign/${id}`);
    } catch (e: any) {
      setError(e?.message || 'Failed to copy campaign');
    }
  };
  const togglePin = async (e: Enriched) => {
    const nextData = { ...(e.raw.data ?? {}), __pinned: !e.pinned };
    try { await updateCampaign(e.raw.id, { data: nextData }); } catch (err: any) { setError(err?.message || 'Pin failed'); }
  };

  if (authLoading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center font-serif text-sm italic text-ink-mute">
        Loading…
      </main>
    );
  }

  const renderRow = (e: Enriched, archivedRow: boolean) => {
    const c = e.raw;
    const sty = STATUS_STYLE[e.status];
    return (
      <div
        key={c.id}
        className={`group relative flex items-stretch rounded border border-rule shadow-card transition-colors ${archivedRow ? 'bg-parchment/60 hover:bg-parchment' : 'bg-parchment hover:border-crimson/60 hover:bg-parchment-deep/50'}`}
      >
        <Link href={`/campaign/${c.id}`} className="min-w-0 flex-1 p-3 sm:p-4">
          <div className="flex min-w-0 items-center gap-2">
            <ScrollText size={16} className={`flex-shrink-0 ${archivedRow ? 'text-brass-deep' : 'text-crimson'}`} />
            <span className={`min-w-0 flex-1 truncate font-display tracking-wide transition-colors ${archivedRow ? 'text-ink-soft group-hover:text-ink' : 'text-ink group-hover:text-crimson'}`}>
              {c.name}
            </span>
            <span className={`rounded-sm border px-1.5 py-0.5 font-display text-[10px] uppercase tracking-wider ${sty.border} ${sty.bg} ${sty.text} flex-shrink-0`}>
              {sty.label}
            </span>
            {e.isPlayer && (
              <span className="rounded-sm border border-wine/40 bg-wine/10 text-wine px-1.5 py-0.5 font-display text-[10px] uppercase tracking-wider flex-shrink-0">
                Player
              </span>
            )}
            {e.pinned && (
              <Pin size={12} className="flex-shrink-0 text-brass-deep" fill="currentColor" />
            )}
          </div>

          {e.pitch && (
            <div className="ml-6 mt-1 line-clamp-1 font-serif text-sm italic text-ink-soft">
              {e.pitch}
            </div>
          )}

          <div className="ml-6 mt-1 flex flex-wrap items-center gap-2 font-serif text-xs italic text-brass-deep">
            {e.pcName && <span>PC: {e.pcName}</span>}
            {e.pcName && <span className="text-ink-faint">·</span>}
            <span>Last played: {relativeTime(e.lastPlayed)}</span>
          </div>
        </Link>

        <div className="flex flex-shrink-0 items-center gap-0.5 self-start pr-2 pt-2 sm:pr-3 sm:pt-3">
          <div className="relative" ref={menuOpen === c.id ? menuRef : undefined}>
            <button
              type="button"
              aria-label="Campaign actions"
              onClick={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                setMenuOpen(menuOpen === c.id ? null : c.id);
              }}
              className="rounded p-1.5 text-ink-mute transition-colors hover:bg-parchment-deep hover:text-ink"
            >
              <MoreHorizontal size={14} />
            </button>
            {menuOpen === c.id && (
              <div className="absolute right-0 z-20 mt-1 w-44 rounded border border-rule bg-parchment py-1 text-xs shadow-page">
                {!archivedRow && (
                  <button
                    type="button"
                    onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); togglePin(e); setMenuOpen(null); }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-ink hover:bg-parchment-deep"
                  >
                    <Pin size={12} className="text-brass-deep" />
                    {e.pinned ? 'Unpin' : 'Pin'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); archivedRow ? handleUnarchive(c) : handleArchive(c); setMenuOpen(null); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-ink hover:bg-parchment-deep"
                >
                  {archivedRow ? <ArchiveRestore size={12} className="text-brass-deep" /> : <Archive size={12} className="text-brass-deep" />}
                  {archivedRow ? 'Unarchive' : 'Archive'}
                </button>
                <a
                  href={`/campaign/${c.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(ev) => { ev.stopPropagation(); setMenuOpen(null); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-ink hover:bg-parchment-deep"
                >
                  <ExternalLink size={12} className="text-brass-deep" />
                  Open in new tab
                </a>
                <button
                  type="button"
                  onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); handleCopy(c); setMenuOpen(null); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-ink hover:bg-parchment-deep"
                >
                  <Copy size={12} className="text-brass-deep" />
                  Make a copy
                </button>
                <div className="my-1 border-t border-rule" />
                <button
                  type="button"
                  onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); handleDelete(c); setMenuOpen(null); }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-crimson hover:bg-crimson hover:text-parchment"
                >
                  <Trash2 size={12} />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <main className="min-h-screen p-3 sm:p-5 md:p-8">
      <div className="mx-auto max-w-3xl">
        <div className="space-y-4 rounded-lg border border-rule bg-parchment-soft p-3 shadow-page sm:p-5 md:p-8">
          <header className="flex items-start justify-between gap-3 border-b border-rule pb-4">
            <div className="min-w-0">
              <div className="font-display text-xs uppercase tracking-[0.3em] text-brass-deep">
                Gamemaster Assistant
              </div>
              <h1 className="mt-1 font-display text-2xl tracking-wide text-crimson sm:text-3xl">Your Campaigns</h1>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/account?action=backup"
                className="hidden sm:inline-flex items-center gap-1.5 rounded border border-rule px-2.5 py-1 font-display text-xs uppercase tracking-wider text-ink-soft hover:bg-parchment-deep hover:text-crimson transition-colors"
                title="Back up all campaigns to Google Drive"
              >
                <Cloud size={12} className="text-brass-deep" /> Back up to Drive
              </Link>
              <AccountMenu />
            </div>
          </header>

          <button onClick={handleCreate} className="flex w-full items-center justify-center gap-2 rounded border-2 border-dashed border-brass/60 p-5 font-display text-sm uppercase tracking-wider text-brass-deep transition-colors hover:border-crimson hover:bg-parchment hover:text-crimson">
            <Plus size={16} /> New Campaign
          </button>

          {error && <p className="font-serif text-sm text-crimson">{error}</p>}

          {loading ? (
            <p className="py-6 text-center font-serif text-sm italic text-ink-mute">Consulting the tomes…</p>
          ) : (
            <>
              {active.length > 0 ? (
                <div className="space-y-2">
                  {active.map((e) => renderRow(e, false))}
                </div>
              ) : archived.length === 0 ? (
                <p className="py-6 text-center font-serif text-sm italic text-ink-mute">No campaigns yet — begin your first above.</p>
              ) : (
                <p className="py-6 text-center font-serif text-sm italic text-ink-mute">No active campaigns — all are archived.</p>
              )}

              {archived.length > 0 && (
                <div className="space-y-2 border-t border-rule pt-2">
                  <button
                    type="button"
                    onClick={() => setShowArchived((v) => !v)}
                    className="flex w-full items-center gap-2 font-display text-xs uppercase tracking-wider text-brass-deep hover:text-crimson"
                    aria-expanded={showArchived}
                  >
                    {showArchived ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    Archived ({archived.length})
                  </button>
                  {showArchived && (
                    <div className="space-y-2">
                      {archived.map((e) => renderRow(e, true))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
