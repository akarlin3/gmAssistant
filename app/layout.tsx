import type { Metadata, Viewport } from 'next';
import { Cinzel, EB_Garamond } from 'next/font/google';
import { AuthProvider } from '@/lib/firebase/auth-context';
import { ConfirmProvider } from '@/components/ConfirmDialog';
import SyncIndicator from '@/components/SyncIndicator';
import { PwaInstaller } from '@/src/components/PwaInstaller';
import './globals.css';

const cinzel = Cinzel({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-cinzel',
  display: 'swap',
});

const garamond = EB_Garamond({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  style: ['normal', 'italic'],
  variable: '--font-garamond',
  display: 'swap',
});

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
    <html lang="en" className={`${cinzel.variable} ${garamond.variable}`}>
      <body className="bg-parchment font-serif text-ink antialiased">
        <AuthProvider>
          <ConfirmProvider>
            <PwaInstaller />
            {children}
            <SyncIndicator />
          </ConfirmProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
