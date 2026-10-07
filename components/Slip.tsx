'use client';

import { useState } from 'react';
import { combinedProbability } from '@/lib/slip';
import type { SlipLeg } from '@/lib/slip';
import { IconClose } from '@/components/icons';
import { EmptyState, Notice, Stat } from '@/components/ui';

const pct = (x: number) => (x * 100).toFixed(1);
const ROW = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 4px' } as const;

export default function Slip({ legs, onRemove, onClear }: {
  legs: SlipLeg[]; onRemove: (id: string) => void; onClear: () => void;
}) {
  const [msg, setMsg] = useState('');
  if (legs.length === 0) return <EmptyState title="Your slip is empty" body="Add picks from Picks, Analyze or Live." />;
  const n = legs.length;
  const legsText = `${n} ${n === 1 ? 'leg' : 'legs'}`;
  const combined = combinedProbability(legs);
  const warnings: string[] = [];
  if (new Set(legs.map((l) => l.match.trim().toLowerCase())).size < n)
    warnings.push('Legs from the same match are correlated; the combined % is only a rough guide.');
  if (combined < 0.5) warnings.push('Combined chance is below 50%.');
  if (n >= 5) warnings.push('A slip loses if any single leg loses; each extra leg lowers the combined chance.');

  async function copy() {
    const lines = legs.map((l) => `${l.match} — ${l.label} (${pct(l.probability)}%)`);
    lines.push(`Combined: ${pct(combined)}%`);
    try { await navigator.clipboard.writeText(lines.join('\n')); setMsg('Copied'); }
    catch { setMsg('Copy failed'); }
    setTimeout(() => setMsg(''), 2000);
  }

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="h2">Slip</span>
        <span className="badge">{legsText}</span>
      </div>
      <div>
        {legs.map((l) => (
          <div key={l.id} className="card flat" style={ROW}>
            <div style={{ minWidth: 0 }}>
              <div className="label">{l.match}</div>
              <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{l.label}</div>
            </div>
            <div className="row" style={{ flex: 'none', flexWrap: 'nowrap' }}>
              <span className="num" style={{ fontWeight: 700 }}>{Math.round(l.probability * 100)}%</span>
              <button type="button" className="btn ghost sm" aria-label="Remove leg" onClick={() => onRemove(l.id)}><IconClose size={18} /></button>
            </div>
          </div>
        ))}
      </div>
      <div className="card">
        <Stat label="Combined chance" value={`${pct(combined)}%`} tone={combined < 0.5 ? 'warn' : 'ok'} sub={`${legsText}, multiplied together`} />
      </div>
      {warnings.map((w) => <Notice key={w} tone="warn">{w}</Notice>)}
      <div className="muted">Odds are not included. This site does not know what SportyBet, Betwinner or MSport offer or pay.</div>
      <div className="row">
        <button type="button" className="btn" onClick={copy}>{msg || 'Copy slip'}</button>
        <button type="button" className="btn danger" onClick={() => { if (window.confirm('Clear the whole slip?')) onClear(); }}>Clear</button>
      </div>
    </div>
  );
}
