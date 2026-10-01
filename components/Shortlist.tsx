'use client';

import type { Pick } from '@/lib/types';

const RANK = { high: 3, medium: 2, low: 1 };

export default function Shortlist(props: { picks: Pick[] }) {
  const list = props.picks
    .filter((p) => !p.result && p.analysis.safe)
    .sort(
      (a, b) =>
        Math.round(b.analysis.probability * 100) - Math.round(a.analysis.probability * 100) ||
        RANK[b.analysis.confidence] - RANK[a.analysis.confidence],
    )
    .slice(0, 15);
  return (
    <section className="card stack">
      <h2>Shortlist</h2>
      {list.length === 0 ? (
        <p className="muted">No safe pending picks yet. Save a safe analysis to see it here.</p>
      ) : (
        list.map((p) => (
          <div className="row" key={p.id}>
            <span>{p.analysis.query.raw}</span>
            <span className="chip">{Math.round(p.analysis.probability * 100)}%</span>
            <span className={`badge ${p.analysis.confidence === 'high' ? 'ok' : 'warn'}`}>
              {p.analysis.confidence}
            </span>
          </div>
        ))
      )}
    </section>
  );
}
