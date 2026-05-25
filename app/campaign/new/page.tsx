'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';
import { createCampaignFromWizard } from '@/lib/firebase/campaigns';
import { applySession0Patch } from '@/lib/session0';
import Session0Wizard from '@/components/Session0Wizard';

function NewCampaignFlow() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const worldId = searchParams.get('worldId') || undefined;
  const [error, setError] = useState<string | null>(null);
  const creatingRef = useRef(false);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/login');
  }, [user, authLoading, router]);

  if (authLoading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center font-serif text-sm italic text-ink-mute">
        Loading…
      </main>
    );
  }

  // Closing the wizard before finishing creates nothing (B-03).
  const onClose = () => router.replace('/campaign');

  const onFinish = async (patch: Parameters<typeof applySession0Patch>[1] & { markDone: boolean }) => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    try {
      const name = (patch.name && patch.name.trim()) || 'Untitled Campaign';
      const data = applySession0Patch({ __soloMode: patch.soloMode ?? true }, patch);
      const id = await createCampaignFromWizard(user.uid, { name, data, worldId });
      router.replace(`/campaign/${id}`);
    } catch (e: any) {
      creatingRef.current = false;
      setError(e?.message || 'Failed to create campaign');
    }
  };

  return (
    <>
      {error && (
        <div className="fixed inset-x-0 top-0 z-[60] bg-crimson/10 px-4 py-2 text-center font-serif text-sm text-crimson">
          {error}
        </div>
      )}
      <Session0Wizard
        initialName=""
        initialSoloMode={true}
        onClose={onClose}
        onFinish={onFinish}
      />
    </>
  );
}

export default function NewCampaignPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center font-serif text-sm italic text-ink-mute">
          Loading…
        </main>
      }
    >
      <NewCampaignFlow />
    </Suspense>
  );
}
