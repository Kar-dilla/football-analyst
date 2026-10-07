'use client';

import type { Pick } from '@/lib/types';
import { betLabel } from '@/lib/label';

const RANK = { high: 3, medium: 2, low: 1 };
const ROW = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '10px 4px' } as const;

export default function Shortlist({ picks }: { picks: Pick[] }) {
  const list = picks
    .filter((p) => p.result === undefined && p.analysis.safe)
    .sort((a, b) => Math.round(b.analysis.probability * 100) - Math.round(a.analysis.probability * 100) || RANK[b.analysis.confidence] - RANK[a.analysis.confidence])
    .slice(0, 5);
  if (list.length === 0) return <p className="muted" style={{ margin: 0 }}>No open picks above your threshold.</p>;
  return (
    <div>
      {list.map((p) => (
        <div key={p.id} className="card flat" style={ROW}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{betLabel(p.analysis.query)}</div>
            <div className="muted">{p.analysis.query.home} vs {p.analysis.query.away}</div>
          </div>
          <span className="num" style={{ fontWeight: 700 }}>{Math.round(p.analysis.probability * 100)}%</span>
        </div>
      ))}
    </div>
  );
}
