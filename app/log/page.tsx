'use client';

import Shortlist from '@/components/Shortlist';
import PickLog from '@/components/PickLog';
import { useApp } from '@/components/AppProvider';

export default function LogPage() {
  const { picks, refreshPicks } = useApp();
  return (
    <main className="wrap stack">
      <Shortlist picks={picks} />
      <PickLog picks={picks} onChange={refreshPicks} />
    </main>
  );
}
