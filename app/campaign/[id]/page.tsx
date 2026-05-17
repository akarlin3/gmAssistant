'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';
import { subscribeToCampaign, type Campaign } from '@/lib/firebase/campaigns';
import CampaignEditor from '@/components/CampaignEditor';

export default function CampaignDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading: authLoading, isAdmin } = useAuth();
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToCampaign(
      id,
      (c) => {
        if (!c) { setError('Campaign not found'); setLoading(false); return; }
        if (c.userId !== user.uid) { setError('Access denied'); setLoading(false); return; }
        setCampaign(c);
        setLoading(false);
      },
      (err) => { setError(err.message); setLoading(false); }
    );
    return unsub;
  }, [id, user]);

  if (authLoading || loading) {
    return <main className="min-h-screen flex items-center justify-center text-xs text-zinc-500">Loading…</main>;
  }
  if (error) {
    return (
      <main className="min-h-screen flex items-center justify-center p-5">
        <div className="text-center space-y-3">
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={() => router.replace('/campaign')} className="text-xs px-3 py-1 rounded border border-zinc-800 text-zinc-300 hover:bg-zinc-900">
            Back to campaigns
          </button>
        </div>
      </main>
    );
  }
  if (!campaign || !user) return null;

  return <CampaignEditor campaign={campaign} userEmail={user.email ?? ''} isAdmin={isAdmin} />;
}
