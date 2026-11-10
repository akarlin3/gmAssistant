import type { Metadata, Viewport } from 'next';
import { AuthProvider } from '@/lib/firebase/auth-context';
import { ConfirmProvider } from '@/components/ConfirmDialog';
import { ThemeProvider } from '@/lib/theme';
import SyncIndicator from '@/components/SyncIndicator';
import { PwaInstaller } from '@/src/components/PwaInstaller';
import './globals.css';

export const metadata: Metadata = {
  title: 'GM Assistant — TTRPG Campaign & Table Suite',
  description:
    'Offline-first TTRPG campaign prep, at-the-table run tools, and player-mode reveals.',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
      { url: '/icons/base-icon.svg', type: 'image/svg+xml' },
    ],
    shortcut: '/icons/icon-192x192.png',
    apple: [
      { url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'GM Assistant',
  },
};

export const viewport: Viewport = {
  themeColor: '#090d16',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="slate" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500;1,600&family=JetBrains+Mono:wght@400;500&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-[var(--bg-canvas)] font-sans text-[var(--text-primary)] antialiased transition-colors duration-200">
        <ThemeProvider defaultTheme="slate">
          <AuthProvider>
            <ConfirmProvider>
              <PwaInstaller />
              {children}
              <SyncIndicator />
            </ConfirmProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
