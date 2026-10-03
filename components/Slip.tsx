'use client';

import { useState } from 'react';
import { combinedProbability } from '@/lib/slip';
import type { SlipLeg } from '@/lib/slip';

const pct = (x: number) => (x * 100).toFixed(1);

export default function Slip({ legs, onRemove, onClear }: {
  legs: SlipLeg[]; onRemove: (id: string) => void; onClear: () => void;
}) {
  const [msg, setMsg] = useState('');
  if (legs.length === 0) return null;
  const combined = combinedProbability(legs);
  const warnings: string[] = [];
  if (new Set(legs.map((l) => l.match.trim().toLowerCase())).size < legs.length)
    warnings.push('Legs from the same match are correlated; the combined % is only a rough guide.');
  if (combined < 0.5) warnings.push('Combined chance is below 50%.');
  if (legs.length >= 5) warnings.push('A slip loses if any single leg loses; each extra leg lowers the combined chance.');

  async function copy() {
    const lines = legs.map((l) => `${l.match} — ${l.label} (${pct(l.probability)}%)`);
    lines.push(`Combined: ${pct(combined)}%`);
    try { await navigator.clipboard.writeText(lines.join('\n')); setMsg('Copied'); }
    catch { setMsg('Copy failed'); }
    setTimeout(() => setMsg(''), 2000);
  }

  return (
    <section className="card stack">
      <h2>Slip ({legs.length} {legs.length === 1 ? 'leg' : 'legs'})</h2>
      {legs.map((l) => (
        <div key={l.id} className="row">
          <div>
            <div className="muted">{l.match}</div>
            <strong>{l.label}</strong> — {pct(l.probability)}%
          </div>
          <button className="btn" onClick={() => onRemove(l.id)}>Remove</button>
        </div>
      ))}
      <div>Combined chance: <strong>{pct(combined)}%</strong></div>
      {warnings.map((w) => <div key={w} className="badge warn">{w}</div>)}
      <div className="muted">Odds are not included — this site does not know what SportyBet, Betwinner or MSport offer or pay.</div>
      <div className="row">
        <button className="btn" onClick={copy}>Copy slip</button>
        <button className="btn" onClick={onClear}>Clear</button>
        {msg && <span className="muted">{msg}</span>}
      </div>
    </section>
  );
}
