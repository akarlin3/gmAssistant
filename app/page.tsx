'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    router.replace(user ? '/campaign' : '/login');
  }, [user, loading, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center space-y-4 bg-parchment text-ink">
      <div className="gm-spinner" />
      <div className="animate-pulse font-display text-xs uppercase tracking-[0.2em] text-brass-deep">
        Preparing your table…
      </div>
    </main>
  );
}
