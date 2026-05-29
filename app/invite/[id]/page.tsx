'use client';

import { use, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';
import { getCampaignOnce, requestJoinCampaign } from '@/lib/firebase/campaigns';
import { Shield } from 'lucide-react';

export default function InvitePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
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
        // If they get a permission error, it means they are not the GM and not yet a player.
        // We fallback to showing the campaign name from the URL so they can request to join.
        const urlName = searchParams.get('name');
        setCampaignName(urlName || 'the campaign');
        // We don't know if they are pending yet since they can't read the campaign, 
        // but if they try to join again, the Firestore arrayUnion is idempotent.
      } finally {
        setLoading(false);
      }
    }
    
    if (user && id) {
      fetchCampaign();
    }
  }, [id, user, router, searchParams]);

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
      <main className="flex min-h-screen items-center justify-center bg-parchment p-5 font-serif">
        <p className="animate-pulse text-sm italic text-ink-mute">Loading invite...</p>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-parchment p-5">
        <div className="max-w-sm space-y-4 text-center">
          <p className="font-serif text-sm text-crimson">{error}</p>
          <button 
            onClick={() => router.replace('/campaign')} 
            className="rounded border border-rule px-4 py-2 font-display text-sm tracking-wide text-ink-soft transition-colors hover:bg-parchment-deep hover:text-ink"
          >
            Go to My Campaigns
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-parchment p-5">
      <div className="w-full max-w-md space-y-6 rounded-lg border border-rule bg-parchment-soft p-6 text-center shadow-card md:p-8">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full border border-brass/40 bg-brass/10">
          <Shield className="text-brass-deep" size={24} />
        </div>
        
        <div className="space-y-2">
          <h1 className="font-display text-2xl tracking-wide text-ink">Join Campaign</h1>
          <p className="font-serif text-sm italic text-ink-soft">
            You have been invited to join <span className="font-semibold not-italic text-crimson">{campaignName}</span>.
          </p>
        </div>

        <div className="border-t border-rule pt-4">
          <button
            onClick={handleJoin}
            disabled={joining}
            className="flex w-full items-center justify-center gap-2 rounded border border-brass-deep bg-brass/10 px-4 py-3 font-display text-sm uppercase tracking-wider text-brass-deep transition-colors hover:bg-brass hover:text-parchment disabled:cursor-not-allowed disabled:opacity-50"
          >
            {joining ? 'Request Pending...' : 'Request to Join'}
          </button>
        </div>
      </div>
    </main>
  );
}
