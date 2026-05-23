'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';
import { getCampaignOnce, requestJoinCampaign } from '@/lib/firebase/campaigns';
import { Shield } from 'lucide-react';

export default function InvitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [campaignName, setCampaignName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace(`/login?redirect=/invite/${id}`);
    }
  }, [user, authLoading, router, id]);

  useEffect(() => {
    async function fetchCampaign() {
      try {
        const c = await getCampaignOnce(id);
        if (!c) {
          setError('Campaign not found or invite is invalid.');
        } else {
          setCampaignName(c.name);
          if (user && (c.userId === user.uid || (c.playerIds || []).includes(user.uid))) {
            // Already a member, redirect to campaign
            router.replace(`/campaign/${id}`);
          } else if (user && (c.pendingPlayers || []).some((p: any) => p.uid === user.uid)) {
            setError('Your request to join is pending GM approval.');
            setJoining(true); // disable button
          }
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load campaign info.');
      } finally {
        setLoading(false);
      }
    }
    
    if (user && id) {
      fetchCampaign();
    }
  }, [id, user, router]);

  const handleJoin = async () => {
    if (!user) return;
    setJoining(true);
    setError(null);
    try {
      await requestJoinCampaign(id, { uid: user.uid, email: user.email || 'unknown@example.com' });
      setError('Your request to join has been sent to the GM.');
    } catch (err: any) {
      setError(err.message || 'Failed to request to join.');
      setJoining(false);
    }
  };

  if (authLoading || loading) {
    return (
      <main className="flex min-h-screen items-center justify-center p-5 bg-parchment font-serif">
        <p className="text-sm italic text-ink-mute animate-pulse">Loading invite...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center p-5 bg-parchment">
        <div className="space-y-4 text-center max-w-sm">
          <p className="text-sm font-serif text-crimson">{error}</p>
          <button 
            onClick={() => router.replace('/campaign')} 
            className="rounded border border-rule px-4 py-2 text-sm font-display tracking-wide text-ink-soft hover:bg-parchment-deep hover:text-ink transition-colors"
          >
            Go to My Campaigns
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-5 bg-parchment">
      <div className="max-w-md w-full rounded-lg border border-rule bg-parchment-soft shadow-card p-6 md:p-8 space-y-6 text-center">
        <div className="mx-auto w-12 h-12 flex items-center justify-center rounded-full bg-brass/10 border border-brass/40">
          <Shield className="text-brass-deep" size={24} />
        </div>
        
        <div className="space-y-2">
          <h1 className="font-display text-2xl tracking-wide text-ink">Join Campaign</h1>
          <p className="font-serif text-sm italic text-ink-soft">
            You have been invited to join <span className="font-semibold not-italic text-crimson">{campaignName}</span>.
          </p>
        </div>

        <div className="pt-4 border-t border-rule">
          <button
            onClick={handleJoin}
            disabled={joining}
            className="w-full flex items-center justify-center gap-2 rounded border border-brass-deep bg-brass/10 px-4 py-3 font-display text-sm tracking-wider uppercase text-brass-deep hover:bg-brass hover:text-parchment transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {joining ? 'Request Pending...' : 'Request to Join'}
          </button>
        </div>
      </div>
    </main>
  );
}
