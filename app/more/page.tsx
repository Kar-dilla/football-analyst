'use client';

import Slip from '@/components/Slip';
import { useApp } from '@/components/AppProvider';

export default function MorePage() {
  const { slip, removeLeg, clearSlip } = useApp();
  return (
    <main className="wrap stack">
      <Slip legs={slip} onRemove={removeLeg} onClear={clearSlip} />
      <p className="muted">Football Analyst. Probabilities come from team stats, optionally nudged by news. Bookmaker odds are not known.</p>
    </main>
  );
}
