'use client';

import { use, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCampaignAndWorld } from '@/lib/useCampaignAndWorld';
import PlayerSafeLoreView from '@/components/PlayerSafeLoreView';

function CampaignPlayerViewInner({ id }: { id: string }) {
  const router = useRouter();
  const { campaign, loading, error } = useCampaignAndWorld(id);

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-parchment p-6 font-serif text-sm italic text-ink-mute">
        Loading Player-Safe Lore View…
      </main>
    );
  }

  if (error || !campaign) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-parchment p-6">
        <p className="font-serif text-sm text-crimson">
          {error?.message || 'Campaign not found.'}
        </p>
        <button
          onClick={() => router.push('/campaign')}
          className="rounded border border-rule bg-parchment-soft px-3 py-1.5 font-display text-xs uppercase tracking-wider text-brass-deep"
        >
          Back to Campaigns
        </button>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-parchment">
      <PlayerSafeLoreView
        data={campaign.data}
        campaignName={campaign.name}
        onExitPlayerView={() => router.push(`/campaign/${id}`)}
      />
    </main>
  );
}

export default function CampaignPlayerViewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <Suspense fallback={<div className="p-6 font-serif text-sm italic text-ink-mute">Loading…</div>}>
      <CampaignPlayerViewInner id={id} />
    </Suspense>
  );
}
