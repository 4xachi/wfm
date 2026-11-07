import type { Metadata } from 'next';
import { Host_Grotesk, Fira_Code } from 'next/font/google';
import './globals.css';

const hostGrotesk = Host_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

const firaCode = Fira_Code({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'FiberBlaze WFM — Cavite Dispatch, 3D Field Navigation & Governance',
  description:
    'Unified Workforce Management platform for FiberBlaze FTTH dispatch, Cavite 3D street navigation, optical verification, offline sync, and supervisor audit.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      data-theme="noc-dark"
      className={`${hostGrotesk.variable} ${firaCode.variable}`}
    >
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
