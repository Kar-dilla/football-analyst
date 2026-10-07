'use client';

import PickLog from '@/components/PickLog';
import { useApp } from '@/components/AppProvider';
import { PageHeader } from '@/components/ui';

export default function LogPage() {
  const { picks, refreshPicks } = useApp();
  return (
    <main>
      <PageHeader eyebrow="Log" title="Your picks" subtitle="Open bets, results and how honest the numbers were." />
      <PickLog picks={picks} onChange={refreshPicks} />
    </main>
  );
}
