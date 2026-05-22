import type { Metadata, Viewport } from 'next';
import { Cinzel, EB_Garamond } from 'next/font/google';
import { AuthProvider } from '@/lib/firebase/auth-context';
import { ConfirmProvider } from '@/components/ConfirmDialog';
import SyncIndicator from '@/components/SyncIndicator';
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
  title: 'Gamemaster Assistant',
  description: 'TTRPG campaign prep — Lazy DM · CCD · Proactive Roleplaying',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'GM Assist',
  },
};

export const viewport: Viewport = {
  themeColor: '#b1201e',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};
 
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${cinzel.variable} ${garamond.variable}`}>
      <body className="bg-parchment font-serif text-ink antialiased">
        <AuthProvider>
          <ConfirmProvider>
            {children}
            <SyncIndicator />
          </ConfirmProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
