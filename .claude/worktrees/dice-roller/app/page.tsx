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
    <main className="min-h-screen flex items-center justify-center text-xs text-zinc-500">
      Loading…
    </main>
  );
}
