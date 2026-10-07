import './globals.css';
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AppProvider } from '@/components/AppProvider';
import ResultSheet from '@/components/ResultSheet';
import TabBar from '@/components/TabBar';

export const metadata: Metadata = { title: 'Football Analyst' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppProvider>
          <div style={{ paddingBottom: 84 }}>{children}</div>
          <ResultSheet />
          <TabBar />
        </AppProvider>
      </body>
    </html>
  );
}
