'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { User, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { getDb, getFirebaseAuth, googleProvider } from './client';
import { evaluatePro, isProEmail, ProSource, SubscriptionStatus, UserDoc } from '@/lib/pro-status';

export { isProEmail };

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  isPro: boolean;
  proSource: ProSource;
  subscriptionStatus: SubscriptionStatus | null;
  currentPeriodEndMs: number | null;
  cancelAtPeriodEnd: boolean;
  isOnWaitlist: boolean;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [userDoc, setUserDoc] = useState<Partial<UserDoc> | null>(null);
  const [isOnWaitlist, setIsOnWaitlist] = useState(false);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      setUserDoc(null);
      return;
    }
    const ref = doc(getDb(), 'users', user.uid);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => setUserDoc(snap.exists() ? (snap.data() as Partial<UserDoc>) : null),
      () => setUserDoc(null),
    );
    return unsubscribe;
  }, [user]);

  useEffect(() => {
    if (!user) {
      setIsOnWaitlist(false);
      return;
    }
    const ref = doc(getDb(), 'proWaitlist', user.uid);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => setIsOnWaitlist(snap.exists()),
      () => setIsOnWaitlist(false),
    );
    return unsubscribe;
  }, [user]);

  const signInWithGoogle = async () => {
    const auth = getFirebaseAuth();
    await signInWithPopup(auth, googleProvider);
  };

  const logout = async () => {
    const auth = getFirebaseAuth();
    await signOut(auth);
  };

  const { isPro, source } = evaluatePro(user?.email, userDoc);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isPro,
        proSource: source,
        subscriptionStatus: userDoc?.subscriptionStatus ?? null,
        currentPeriodEndMs: userDoc?.currentPeriodEndMs ?? null,
        cancelAtPeriodEnd: userDoc?.cancelAtPeriodEnd ?? false,
        isOnWaitlist,
        signInWithGoogle,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
