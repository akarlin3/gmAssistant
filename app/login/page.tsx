'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/firebase/auth-context';

export default function LoginPage() {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) router.replace('/campaign');
  }, [user, loading, router]);

  const handleSignIn = async () => {
    setSigningIn(true);
    setError(null);
    try {
      await signInWithGoogle();
    } catch (e: any) {
      setError(e?.message || 'Sign-in failed');
      setSigningIn(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center space-y-4 bg-parchment text-ink">
        <div className="gm-spinner" />
        <div className="animate-pulse font-display text-xs uppercase tracking-[0.2em] text-brass-deep">
          Consulting the archives…
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-5">
      <div className="w-full max-w-sm space-y-6 rounded-lg border border-rule bg-parchment-soft p-8 shadow-page">
        <div className="space-y-3 text-center">
          <div className="font-display text-xs uppercase tracking-[0.3em] text-brass-deep">
            Gamemaster Assistant
          </div>
          <h1 className="font-display text-4xl leading-none tracking-wide text-crimson">Sign In</h1>
          <div className="flourish"><span>❦</span></div>
          <p className="font-serif text-sm italic text-ink-soft">Lazy DM · CCD · Proactive Roleplaying</p>
        </div>
        <button
          onClick={handleSignIn}
          disabled={signingIn}
          className="flex w-full items-center justify-center gap-3 rounded border border-crimson/60 bg-parchment px-4 py-2.5 font-display text-sm uppercase tracking-wider text-crimson transition-colors hover:bg-crimson hover:text-parchment disabled:opacity-50"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
            <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
          </svg>
          <span>{signingIn ? 'Signing in…' : 'Continue with Google'}</span>
        </button>
        {error && <p className="text-center font-serif text-xs text-crimson">{error}</p>}
      </div>
    </main>
  );
}
