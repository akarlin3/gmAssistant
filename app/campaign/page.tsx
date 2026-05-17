'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/firebase/auth-context';
import { subscribeToUserCampaigns, createCampaign, type Campaign } from '@/lib/firebase/campaigns';
import { Plus, LogOut, ScrollText, Calendar } from 'lucide-react';

export default function CampaignListPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const handleCreate = async () => {
    if (!user) return;
    try {
      const id = await createCampaign(user.uid);
      router.push(`/campaign/${id}`);
    } catch (e: any) {
      setError(e?.message || 'Failed to create campaign');
    }
  };

  const handleSignOut = async () => {
    await logout();
    router.replace('/login');
  };

  if (authLoading || !user) {
    return (
      <main className="min-h-screen flex items-center justify-center text-sm text-ink-mute italic font-serif">
        Loading…
      </main>
    );
  }

  return (
    <main className="min-h-screen p-3 sm:p-5 md:p-8">
      <div className="max-w-3xl mx-auto">
        <div className="bg-parchment-soft border border-rule rounded-lg shadow-page p-3 sm:p-5 md:p-8 space-y-4">
          <header className="pb-4 border-b border-rule flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs text-brass-deep font-display uppercase tracking-[0.3em]">
                Campaign Prep
              </div>
              <h1 className="font-display text-2xl sm:text-3xl text-crimson tracking-wide mt-1">Your Campaigns</h1>
              <p className="text-sm text-ink-soft italic font-serif mt-1 break-all">{user.email}</p>
            </div>
            <button onClick={handleSignOut} className="text-xs px-3 py-1 rounded border border-rule text-ink-soft hover:bg-parchment-deep font-display uppercase tracking-wider flex items-center gap-1.5 flex-shrink-0">
              <LogOut size={12} /> <span className="hidden sm:inline">Sign Out</span>
            </button>
          </header>

          <button onClick={handleCreate} className="w-full p-5 rounded border-2 border-dashed border-brass/60 text-brass-deep hover:text-crimson hover:border-crimson hover:bg-parchment transition-colors flex items-center justify-center gap-2 font-display uppercase tracking-wider text-sm">
            <Plus size={16} /> New Campaign
          </button>

          {error && <p className="text-sm text-crimson font-serif">{error}</p>}

          {loading ? (
            <p className="text-sm text-ink-mute italic font-serif text-center py-6">Consulting the tomes…</p>
          ) : campaigns.length > 0 ? (
            <div className="space-y-2">
              {campaigns.map((c) => (
                <Link key={c.id} href={`/campaign/${c.id}`} className="block p-3 sm:p-4 rounded border border-rule bg-parchment hover:bg-parchment-deep/50 hover:border-crimson/60 transition-colors shadow-card group">
                  <div className="flex items-center gap-3">
                    <ScrollText size={16} className="text-crimson flex-shrink-0" />
                    <span className="font-display tracking-wide text-ink flex-1 min-w-0 truncate group-hover:text-crimson transition-colors">{c.name}</span>
                    <span className="text-xs text-brass-deep flex items-center gap-1 font-serif italic flex-shrink-0">
                      <Calendar size={11} />
                      {c.updatedAt ? new Date(c.updatedAt.toMillis()).toLocaleDateString() : '—'}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-mute italic font-serif text-center py-6">No campaigns yet — begin your first above.</p>
          )}
        </div>
      </div>
    </main>
  );
}
