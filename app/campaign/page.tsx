'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/firebase/auth-context';
import {
  subscribeToUserCampaigns, createCampaign, updateCampaign,
  archiveCampaign, unarchiveCampaign, deleteCampaign,
  type Campaign,
} from '@/lib/firebase/campaigns';
import { Plus, ScrollText, Pin, Archive, ArchiveRestore, Trash2, ChevronDown, ChevronRight, MoreHorizontal, ExternalLink } from 'lucide-react';
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
};

const STATUS_STYLE: Record<Status, { border: string; bg: string; text: string; label: string }> = {
  active:   { border: 'border-moss/40',  bg: 'bg-moss/5',            text: 'text-moss',       label: 'Active' },
  hiatus:   { border: 'border-brass/40', bg: 'bg-brass/5',           text: 'text-brass-deep', label: 'Hiatus' },
  new:      { border: 'border-rule',     bg: 'bg-parchment-deep/30', text: 'text-ink-soft',   label: 'New' },
  archived: { border: 'border-rule',     bg: 'bg-parchment-deep/30', text: 'text-ink-mute',   label: 'Archived' },
};

const STATUS_ORDER: Record<Status, number> = { active: 0, hiatus: 1, new: 2, archived: 3 };

function enrich(c: Campaign): Enriched {
  const data = (c.data ?? {}) as Record<string, any>;
  const pinned = data.__pinned === true;
  const archived = Boolean(c.archivedAt);

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

  return { raw: c, pinned, archived, pitch, pcName, lastPlayed, status, sortKey: lastPlayed?.getTime() ?? 0 };
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
    const enriched = campaigns.map(enrich);
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
  const togglePin = async (e: Enriched) => {
    const nextData = { ...(e.raw.data ?? {}), __pinned: !e.pinned };
    try { await updateCampaign(e.raw.id, { data: nextData }); } catch (err: any) { setError(err?.message || 'Pin failed'); }
  };

  if (authLoading || !user) {
    return (
      <main className="min-h-screen flex items-center justify-center text-sm text-ink-mute italic font-serif">
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
        className={`flex items-stretch rounded border border-rule transition-colors shadow-card group relative ${archivedRow ? 'bg-parchment/60 hover:bg-parchment' : 'bg-parchment hover:bg-parchment-deep/50 hover:border-crimson/60'}`}
      >
        <Link href={`/campaign/${c.id}`} className="flex-1 min-w-0 p-3 sm:p-4">
          <div className="flex items-center gap-2 min-w-0">
            <ScrollText size={16} className={`flex-shrink-0 ${archivedRow ? 'text-brass-deep' : 'text-crimson'}`} />
            <span className={`font-display tracking-wide flex-1 min-w-0 truncate transition-colors ${archivedRow ? 'text-ink-soft group-hover:text-ink' : 'text-ink group-hover:text-crimson'}`}>
              {c.name}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-sm border font-display uppercase tracking-wider ${sty.border} ${sty.bg} ${sty.text} flex-shrink-0`}>
              {sty.label}
            </span>
            {e.pinned && (
              <Pin size={12} className="text-brass-deep flex-shrink-0" fill="currentColor" />
            )}
          </div>

          {e.pitch && (
            <div className="text-sm text-ink-soft font-serif italic line-clamp-1 ml-6 mt-1">
              {e.pitch}
            </div>
          )}

          <div className="text-xs text-brass-deep font-serif italic ml-6 mt-1 flex items-center gap-2 flex-wrap">
            {e.pcName && <span>PC: {e.pcName}</span>}
            {e.pcName && <span className="text-ink-faint">·</span>}
            <span>Last played: {relativeTime(e.lastPlayed)}</span>
          </div>
        </Link>

        <div className="flex items-center pr-2 sm:pr-3 gap-0.5 flex-shrink-0 self-start pt-2 sm:pt-3">
          <div className="relative" ref={menuOpen === c.id ? menuRef : undefined}>
            <button
              type="button"
              aria-label="Campaign actions"
              onClick={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                setMenuOpen(menuOpen === c.id ? null : c.id);
              }}
              className="p-1.5 rounded text-ink-mute hover:text-ink hover:bg-parchment-deep transition-colors"
            >
              <MoreHorizontal size={14} />
            </button>
            {menuOpen === c.id && (
              <div className="absolute right-0 mt-1 w-44 bg-parchment border border-rule rounded shadow-page py-1 z-20 text-xs">
                {!archivedRow && (
                  <button
                    type="button"
                    onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); togglePin(e); setMenuOpen(null); }}
                    className="w-full text-left px-3 py-1.5 hover:bg-parchment-deep flex items-center gap-2 text-ink"
                  >
                    <Pin size={12} className="text-brass-deep" />
                    {e.pinned ? 'Unpin' : 'Pin'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); archivedRow ? handleUnarchive(c) : handleArchive(c); setMenuOpen(null); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-parchment-deep flex items-center gap-2 text-ink"
                >
                  {archivedRow ? <ArchiveRestore size={12} className="text-brass-deep" /> : <Archive size={12} className="text-brass-deep" />}
                  {archivedRow ? 'Unarchive' : 'Archive'}
                </button>
                <a
                  href={`/campaign/${c.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(ev) => { ev.stopPropagation(); setMenuOpen(null); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-parchment-deep flex items-center gap-2 text-ink"
                >
                  <ExternalLink size={12} className="text-brass-deep" />
                  Open in new tab
                </a>
                <div className="my-1 border-t border-rule" />
                <button
                  type="button"
                  onClick={(ev) => { ev.preventDefault(); ev.stopPropagation(); handleDelete(c); setMenuOpen(null); }}
                  className="w-full text-left px-3 py-1.5 hover:bg-crimson hover:text-parchment flex items-center gap-2 text-crimson"
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
      <div className="max-w-3xl mx-auto">
        <div className="bg-parchment-soft border border-rule rounded-lg shadow-page p-3 sm:p-5 md:p-8 space-y-4">
          <header className="pb-4 border-b border-rule flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-brass-deep font-display uppercase tracking-[0.3em]">
                Gamemaster Assistant
              </div>
              <h1 className="font-display text-2xl sm:text-3xl text-crimson tracking-wide mt-1">Your Campaigns</h1>
            </div>
            <AccountMenu />
          </header>

          <button onClick={handleCreate} className="w-full p-5 rounded border-2 border-dashed border-brass/60 text-brass-deep hover:text-crimson hover:border-crimson hover:bg-parchment transition-colors flex items-center justify-center gap-2 font-display uppercase tracking-wider text-sm">
            <Plus size={16} /> New Campaign
          </button>

          {error && <p className="text-sm text-crimson font-serif">{error}</p>}

          {loading ? (
            <p className="text-sm text-ink-mute italic font-serif text-center py-6">Consulting the tomes…</p>
          ) : (
            <>
              {active.length > 0 ? (
                <div className="space-y-2">
                  {active.map((e) => renderRow(e, false))}
                </div>
              ) : archived.length === 0 ? (
                <p className="text-sm text-ink-mute italic font-serif text-center py-6">No campaigns yet — begin your first above.</p>
              ) : (
                <p className="text-sm text-ink-mute italic font-serif text-center py-6">No active campaigns — all are archived.</p>
              )}

              {archived.length > 0 && (
                <div className="pt-2 border-t border-rule space-y-2">
                  <button
                    type="button"
                    onClick={() => setShowArchived((v) => !v)}
                    className="w-full flex items-center gap-2 text-xs text-brass-deep hover:text-crimson font-display uppercase tracking-wider"
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
