'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';
import { subscribeToWorld, type World } from '@/lib/firebase/worlds';
import CampaignEditor from '@/components/CampaignEditor';

// In world mode, we use a fake campaign wrapper because CampaignEditor
// is tightly coupled to the campaign architecture. The strict split 
// writes (updateWorld / updateCampaign) in CampaignEditor will direct 
// all edits to the world document since worldId is set and the edited
// fields are WORLD_KEYS.
export default function WorldDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user, loading: authLoading, isPro } = useAuth();
  const router = useRouter();
  const [world, setWorld] = useState<World | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    const unsub = subscribeToWorld(
      id,
      (w) => {
        if (!w) { setError('World not found'); setLoading(false); return; }
        const isOwner = w.userId === user.uid;
        if (!isOwner) { setError('Access denied. You are not the owner of this world.'); setLoading(false); return; }
        setWorld(w);
        setLoading(false);
      },
      (err) => { setError(err.message); setLoading(false); }
    );
    return unsub;
  }, [id, user]);

  if (authLoading || loading) {
    return (
      <main className="min-h-screen bg-parchment flex flex-col">
        <div className="flex-1 flex items-center justify-center">
          <div className="h-8 w-8 rounded-full border-2 border-brass border-t-transparent animate-spin"></div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center p-5">
        <div className="space-y-3 text-center">
          <p className="text-sm text-red-400">{error}</p>
          <button onClick={() => router.replace('/campaign')} className="rounded border border-zinc-800 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-900">
            Back to campaigns
          </button>
        </div>
      </main>
    );
  }

  if (!world || !user) return null;

  // Stub campaign object that matches the World so CampaignEditor runs.
  const stubCampaign: any = {
    id: 'world-stub',
    worldId: world.id,
    userId: world.userId,
    name: world.name,
    data: world.data,
    done: {},
    playerIds: [],
    pendingPlayers: [],
  };

  return (
    <CampaignEditor 
      campaign={stubCampaign} 
      world={world}
      rawCampaign={stubCampaign}
      userEmail={user.email ?? ''} 
      isPro={isPro} 
      worldOnlyMode={true} 
    />
  );
}
