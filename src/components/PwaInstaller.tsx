'use client';

import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function PwaInstaller() {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1. Register /sw.js on window load
    const registerServiceWorker = () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker
          .register('/sw.js', { scope: '/' })
          .catch((err) => {
            console.warn('Service Worker registration failed:', err);
          });
      }
    };

    if (document.readyState === 'complete') {
      registerServiceWorker();
    } else {
      window.addEventListener('load', registerServiceWorker, { once: true });
    }

    // 2. Detect standalone display mode
    const mediaQuery = window.matchMedia('(display-mode: standalone)');
    const checkStandalone = () => {
      const nav = window.navigator as Navigator & { standalone?: boolean };
      setIsStandalone(mediaQuery.matches || nav.standalone === true);
    };
    checkStandalone();

    const handleDisplayModeChange = (e: MediaQueryListEvent) => {
      setIsStandalone(e.matches);
      if (e.matches) {
        setDeferredPrompt(null);
      }
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleDisplayModeChange);
    }

    // 3. Listen for beforeinstallprompt and appinstalled events
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      if (!window.matchMedia('(display-mode: standalone)').matches) {
        setDeferredPrompt(e as BeforeInstallPromptEvent);
      }
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('load', registerServiceWorker);
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', handleDisplayModeChange);
      }
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt
      );
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setDeferredPrompt(null);
      }
    } catch (err) {
      console.warn('PWA install prompt error:', err);
    }
  };

  if (isStandalone || !deferredPrompt) {
    return null;
  }

  return (
    <div
      role="region"
      aria-label="Install application"
      className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-end px-3 pt-2 sm:px-5 sm:pt-3"
    >
      <button
        type="button"
        onClick={handleInstallClick}
        aria-label="Install App"
        title="Install GM Assistant as a standalone app"
        className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-amber-400/50 bg-[#090d16]/95 px-3 py-1 font-display text-[11px] font-semibold uppercase tracking-wider text-amber-200 shadow-md backdrop-blur transition-all hover:border-amber-300 hover:bg-[#121b2d] hover:text-amber-100 active:scale-95"
      >
        <Download size={12} className="text-amber-400" />
        <span>Install App</span>
      </button>
    </div>
  );
}

export default PwaInstaller;
