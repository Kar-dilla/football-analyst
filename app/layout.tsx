import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import type { ReactNode } from 'react';
import { AppProvider } from '@/components/AppProvider';
import ResultSheet from '@/components/ResultSheet';
import TabBar from '@/components/TabBar';

const sans = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-sans' });
const mono = JetBrains_Mono({ subsets: ['latin'], display: 'swap', variable: '--font-mono' });

export const metadata: Metadata = { title: 'Football Analyst' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>
        <AppProvider>
          <header className="topbar">
            <span className="brand">Football <b>Analyst</b></span>
          </header>
          <div className="wrap">{children}</div>
          <ResultSheet />
          <TabBar />
        </AppProvider>
      </body>
    </html>
  );
}
