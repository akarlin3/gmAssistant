'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';
import { AveryCorpEmblem } from '@/components/AveryCorpEmblem';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    const search = typeof window !== 'undefined' ? window.location.search : '';
    router.replace(user ? `/campaign${search}` : '/login');
  }, [user, loading, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center space-y-4 bg-parchment text-ink">
      <AveryCorpEmblem
        size={48}
        variant="image"
        cropMode="full-seal"
        isTimerActive
        ariaLabel="AveryCorp Institute Emblem"
      />
      <div className="animate-pulse font-display text-xs uppercase tracking-[0.2em] text-brass-deep">
        Preparing your table…
      </div>
    </main>
  );
}
