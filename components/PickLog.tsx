'use client';

import type { Pick } from '@/lib/types';
import { exportPicksJSON, removePick, updatePick } from '@/lib/store';
import { computeStats } from '@/lib/stats';

type Rate = { n: number; rate: number };
const pct = (x: number) => `${Math.round(x * 100)}%`;

function download() {
  const url = URL.createObjectURL(new Blob([exportPicksJSON()], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'picks.json';
  a.click();
  URL.revokeObjectURL(url);
}

function RateTable(props: { title: string; rows: Record<string, Rate> }) {
  const keys = Object.keys(props.rows);
  return (
    <div className="stack">
      <strong>{props.title}</strong>
      {keys.length === 0 ? <p className="muted">No settled picks yet.</p> : (
        <table className="table">
          <thead><tr><th>Group</th><th>Settled</th><th>Hit rate</th></tr></thead>
          <tbody>
            {keys.map((k) => (
              <tr key={k}><td>{k}</td><td>{props.rows[k].n}</td><td>{props.rows[k].n ? pct(props.rows[k].rate) : '—'}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function PickLog(props: { picks: Pick[]; onChange: () => void }) {
  const { picks, onChange } = props;
  const s = computeStats(picks);
  const sorted = [...picks].sort((a, b) => b.analysis.createdAt.localeCompare(a.analysis.createdAt));
  const act = (fn: () => void) => { fn(); onChange(); };
  const setOdds = (p: Pick, text: string) => {
    const v = parseFloat(text);
    const odds = Number.isFinite(v) && v > 0 ? v : undefined;
    if (odds !== p.odds) act(() => updatePick(p.id, { odds }));
  };
  return (
    <section className="card stack">
      <div className="row">
        <h2>Pick log</h2>
        <button className="btn" onClick={download}>Export JSON</button>
      </div>
      {sorted.length === 0 && <p className="muted">No saved picks yet.</p>}
      {sorted.map((p) => (
        <div className="stack" key={p.id}>
          <div className="row">
            <strong>{p.analysis.query.raw}</strong>
            <span className="chip">{pct(p.analysis.probability)}</span>
            {p.result && <span className={`badge ${p.result === 'won' ? 'ok' : 'warn'}`}>{p.result}</span>}
          </div>
          <div className="row">
            <input className="input" type="number" step="0.01" min="1" placeholder="Odds" defaultValue={p.odds ?? ''} onBlur={(e) => setOdds(p, e.target.value)} />
            {(['won', 'lost', 'void'] as const).map((r) => (
              <button key={r} className="btn" onClick={() => act(() => updatePick(p.id, { result: r }))}>{r.charAt(0).toUpperCase() + r.slice(1)}</button>
            ))}
            <button className="btn" onClick={() => act(() => removePick(p.id))}>Delete</button>
          </div>
        </div>
      ))}
      <div className="stack">
        <div className="row">
          <strong>Dashboard</strong>
          <span>Settled: {s.settled}</span>
          {s.early && <span className="badge warn">early</span>}
        </div>
        <span>Brier score: {s.brier === null ? '—' : s.brier.toFixed(3)}</span>
        <RateTable title="Hit rate by market" rows={s.hitRateByMarket} />
        <RateTable title="Hit rate by tier" rows={s.hitRateByTier} />
        <strong>Reliability buckets</strong>
        <table className="table">
          <thead><tr><th>Bucket</th><th>n</th><th>Predicted</th><th>Actual</th></tr></thead>
          <tbody>
            {s.buckets.map((b) => (
              <tr key={b.label}><td>{b.label}</td><td>{b.n}</td><td>{b.n ? pct(b.predicted) : '—'}</td><td>{b.n ? pct(b.actual) : '—'}</td></tr>
            ))}
          </tbody>
        </table>
        <RateTable title="Gap-fill vs not" rows={{ 'With gap-fill': s.gapFill.with, 'Without gap-fill': s.gapFill.without }} />
      </div>
    </section>
  );
}
