'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/firebase/auth-context';
import {
  subscribeToUserCampaigns, createCampaign,
  archiveCampaign, unarchiveCampaign, deleteCampaign,
  type Campaign,
} from '@/lib/firebase/campaigns';
import { Plus, ScrollText, Calendar, Archive, ArchiveRestore, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { AccountMenu } from '@/components/AccountMenu';

export default function CampaignListPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

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

  const { active, archived } = useMemo(() => {
    const active: Campaign[] = [];
    const archived: Campaign[] = [];
    for (const c of campaigns) {
      if (c.archivedAt) archived.push(c); else active.push(c);
    }
    return { active, archived };
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
    try {
      await archiveCampaign(c.id);
    } catch (e: any) {
      setError(e?.message || 'Archive failed');
    }
  };

  const handleUnarchive = async (c: Campaign) => {
    try {
      await unarchiveCampaign(c.id);
    } catch (e: any) {
      setError(e?.message || 'Unarchive failed');
    }
  };

  const handleDelete = async (c: Campaign) => {
    if (!confirm(`Delete "${c.name}"? This cannot be undone.`)) return;
    try {
      await deleteCampaign(c.id);
    } catch (e: any) {
      setError(e?.message || 'Delete failed');
    }
  };

  if (authLoading || !user) {
    return (
      <main className="min-h-screen flex items-center justify-center text-sm text-ink-mute italic font-serif">
        Loading…
      </main>
    );
  }

  const renderRow = (c: Campaign, archivedRow: boolean) => (
    <div key={c.id} className={`flex items-stretch rounded border border-rule transition-colors shadow-card group ${archivedRow ? 'bg-parchment/60 hover:bg-parchment' : 'bg-parchment hover:bg-parchment-deep/50 hover:border-crimson/60'}`}>
      <Link href={`/campaign/${c.id}`} className="flex-1 min-w-0 p-3 sm:p-4">
        <div className="flex items-center gap-3">
          <ScrollText size={16} className={`flex-shrink-0 ${archivedRow ? 'text-brass-deep' : 'text-crimson'}`} />
          <span className={`font-display tracking-wide flex-1 min-w-0 truncate transition-colors ${archivedRow ? 'text-ink-soft group-hover:text-ink' : 'text-ink group-hover:text-crimson'}`}>{c.name}</span>
          <span className="text-xs text-brass-deep flex items-center gap-1 font-serif italic flex-shrink-0">
            <Calendar size={11} />
            {c.updatedAt ? new Date(c.updatedAt.toMillis()).toLocaleDateString() : '—'}
          </span>
        </div>
      </Link>
      <div className="flex items-center pr-2 sm:pr-3 gap-0.5 flex-shrink-0">
        <button
          type="button"
          onClick={() => archivedRow ? handleUnarchive(c) : handleArchive(c)}
          title={archivedRow ? 'Unarchive' : 'Archive'}
          aria-label={archivedRow ? 'Unarchive campaign' : 'Archive campaign'}
          className="p-1.5 rounded text-brass-deep/70 hover:text-brass-deep hover:bg-parchment-deep transition-colors"
        >
          {archivedRow ? <ArchiveRestore size={14} /> : <Archive size={14} />}
        </button>
        <button
          type="button"
          onClick={() => handleDelete(c)}
          title="Delete"
          aria-label="Delete campaign"
          className="p-1.5 rounded text-crimson/70 hover:text-parchment hover:bg-crimson transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  );

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
                  {active.map((c) => renderRow(c, false))}
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
                      {archived.map((c) => renderRow(c, true))}
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
