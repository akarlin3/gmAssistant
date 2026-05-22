'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { getFirebaseAuth, googleProvider } from './client';
import { isProEmail } from '@/lib/verify-pro';

export { isProEmail };

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  isPro: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const signInWithGoogle = async () => {
    const auth = getFirebaseAuth();
    await signInWithPopup(auth, googleProvider);
  };

  const logout = async () => {
    const auth = getFirebaseAuth();
    await signOut(auth);
  };

  const isPro = isProEmail(user?.email);

  return (
    <AuthContext.Provider value={{ user, loading, isPro, signInWithGoogle, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
