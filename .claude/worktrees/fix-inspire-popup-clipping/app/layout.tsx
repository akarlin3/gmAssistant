import type { Metadata } from 'next';
import { Cinzel, EB_Garamond } from 'next/font/google';
import { AuthProvider } from '@/lib/firebase/auth-context';
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
  title: 'Campaign Prep',
  description: 'TTRPG campaign prep — Lazy DM · CCD · Proactive Roleplaying',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${cinzel.variable} ${garamond.variable}`}>
      <body className="bg-parchment text-ink font-serif antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
