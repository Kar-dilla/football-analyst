'use client';

import Slip from '@/components/Slip';
import Coverage from '@/components/Coverage';
import { useApp } from '@/components/AppProvider';
import { Notice, PageHeader, Section } from '@/components/ui';

export default function MorePage() {
  const { slip, removeLeg, clearSlip } = useApp();
  return (
    <main>
      <PageHeader eyebrow="More" title="Slip and info" />
      <Section title="Slip">
        <Slip legs={slip} onRemove={removeLeg} onClear={clearSlip} />
      </Section>
      <Section title="Data coverage">
        <Coverage />
      </Section>
      <Section title="About">
        <Notice tone="info">Probabilities come from team stats, optionally nudged by news (at most 8 points). Bookmaker odds are not known.</Notice>
        <Notice tone="info">A backtest on 366 Premier League matches found goals lines close to league base rates; only match results showed a small edge. Treat these numbers as a screening tool.</Notice>
        <p className="muted" style={{ margin: 0 }}>Your picks are stored in this browser. Use Export JSON on the Log tab to keep a backup.</p>
      </Section>
    </main>
  );
}
