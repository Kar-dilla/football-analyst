'use client';

import { useState } from 'react';
import DailySlips from '@/components/DailySlips';
import LiveSlips from '@/components/LiveSlips';
import { PageHeader, Section } from '@/components/ui';

type Mode = 'daily' | 'live';

const OPTIONS: { id: Mode; label: string }[] = [
  { id: 'daily', label: 'Daily' },
  { id: 'live', label: 'Live' },
];

export default function SlipsPage() {
  const [mode, setMode] = useState<Mode>('daily');
  return (
    <main>
      <PageHeader eyebrow="Slips" title="Slips" />
      <div role="group" aria-label="Slip type" style={{ display: 'flex', gap: 4, padding: 4, margin: '0 0 12px', borderRadius: 12, border: '1px solid rgba(128,128,128,0.35)' }}>
        {OPTIONS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            aria-pressed={mode === id}
            onClick={() => setMode(id)}
            style={{ flex: 1, padding: '8px 12px', border: 0, borderRadius: 9, font: 'inherit', color: 'inherit', cursor: 'pointer', fontWeight: mode === id ? 700 : 500, background: mode === id ? 'rgba(128,128,128,0.25)' : 'transparent' }}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === 'daily' ? (
        <Section title="Daily slips">
          <DailySlips />
        </Section>
      ) : (
        <Section title="Live slips">
          <LiveSlips />
        </Section>
      )}
    </main>
  );
}
