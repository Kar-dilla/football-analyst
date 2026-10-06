'use client';

import type { Pick } from '@/lib/types';
import { computeStats } from '@/lib/stats';

type Rate = { n: number; rate: number };
const pct = (x: number) => `${Math.round(x * 100)}%`;
const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;
const opt = (x: number | null) => (x === null ? '-' : pct1(x));
const brier = (x: number | null) => (x === null ? '-' : x.toFixed(3));

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
              <tr key={k}><td>{k}</td><td>{props.rows[k].n}</td><td>{props.rows[k].n ? pct(props.rows[k].rate) : '-'}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function StatsView(props: { picks: Pick[] }) {
  const s = computeStats(props.picks);
  const won = props.picks.filter((p) => p.result === 'won').length;
  const hit = s.settled ? won / s.settled : null;
  const r = s.roi;
  return (
    <div className="stack">
      {s.early && <div className="badge warn">Small sample. Only {s.settled} picks so far; this is mostly luck at this size.</div>}
      <div className="stack">
        <strong>Overview</strong>
        <span>Settled: {s.settled}</span>
        <span>Won: {won}</span>
        <span>Hit rate: {opt(hit)}</span>
        <span>Average predicted (adjusted): {opt(s.avgPredicted)}</span>
        <span>Average predicted (stats only): {opt(s.avgBase)}</span>
        <span>Brier score (adjusted): {brier(s.brier)}</span>
        <span>Brier score (stats only): {brier(s.brierBase)}</span>
        <span>Last 20 hit rate: {s.last20.n ? pct1(s.last20.rate) : '-'} ({s.last20.n} picks)</span>
      </div>
      <div className="stack">
        <strong>Return at entered odds</strong>
        {r.n === 0 ? <p className="muted">Add odds to your picks to see this</p> : (
          <>
            <span>Picks with odds: {r.n}</span>
            <span>Units: {(r.units >= 0 ? '+' : '') + r.units.toFixed(2)}</span>
            <span>Return: {pct1(r.pct)}</span>
            <span>Average odds: {r.avgOdds.toFixed(2)}</span>
            <span>Break-even hit rate: {r.breakEven === null ? '-' : pct1(r.breakEven)}</span>
          </>
        )}
      </div>
      <strong>Reliability buckets</strong>
      <table className="table">
        <thead><tr><th>Bucket</th><th>n</th><th>Predicted</th><th>Actual</th></tr></thead>
        <tbody>
          {s.buckets.map((b) => (
            <tr key={b.label} style={b.n < 10 ? { opacity: 0.45 } : undefined}>
              <td>{b.label}</td><td>{b.n}</td><td>{b.n ? pct(b.predicted) : '-'}</td><td>{b.n ? pct(b.actual) : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Greyed rows have fewer than 10 picks.</p>
      <RateTable title="Hit rate by market" rows={s.hitRateByMarket} />
      <RateTable title="Hit rate by tier" rows={s.hitRateByTier} />
      <RateTable title="Gap-fill vs not" rows={{ 'With gap-fill': s.gapFill.with, 'Without gap-fill': s.gapFill.without }} />
    </div>
  );
}
