'use client';

import type { Pick } from '@/lib/types';
import { computeStats } from '@/lib/stats';
import { Accordion, EmptyState, Notice, Stat } from '@/components/ui';

type Rate = { n: number; rate: number };
const pct = (x: number) => `${Math.round(x * 100)}%`;
const opt = (x: number | null) => (x === null ? '-' : pct(x));
const b3 = (x: number | null) => (x === null ? '-' : x.toFixed(3));
const signed = (x: number, digits: number, suffix = '') => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(digits)}${suffix}`;
const tone = (x: number): 'ok' | 'bad' | undefined => (x > 0 ? 'ok' : x < 0 ? 'bad' : undefined);
const GRID2 = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 } as const;
const MARKET: Record<string, string> = { goals_ou: 'Goals', btts: 'Both teams to score', '1x2': 'Result', double_chance: 'Double chance', fh_goals_ou: '1st half goals', sh_goals_ou: '2nd half goals', corners_ou: 'Corners', cards_ou: 'Cards', window_goals: 'Goal window', fh_subs: '1st half sub' };

function Rates({ rows, name }: { rows: Record<string, Rate>; name?: (k: string) => string }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="table">
        <thead><tr><th>Group</th><th>Settled</th><th>Hit rate</th></tr></thead>
        <tbody>
          {Object.keys(rows).map((k) => (
            <tr key={k}><td>{name ? name(k) : k}</td><td className="num">{rows[k].n}</td><td className="num">{rows[k].n ? pct(rows[k].rate) : '-'}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function StatsView({ picks }: { picks: Pick[] }) {
  const s = computeStats(picks);
  if (s.settled === 0) return <EmptyState title="No results yet" body="Stats appear after you mark picks Won or Lost." />;
  const won = picks.filter((p) => p.result === 'won').length;
  const lost = picks.filter((p) => p.result === 'lost').length;
  const r = s.roi;
  return (
    <div className="stack">
      {s.early && <Notice tone="warn">Only {s.settled} settled picks so far. At this size the numbers are mostly luck.</Notice>}
      <div className="card" style={GRID2}>
        <Stat label="Settled" value={String(s.settled)} />
        <Stat label="Hit rate" value={pct(won / s.settled)} sub={`${won} won, ${lost} lost`} />
        <Stat label="Last 20 picks" value={pct(s.last20.rate)} sub={`${s.last20.n} picks`} />
        <Stat label="Average predicted" value={opt(s.avgPredicted)} sub={`Stats only ${opt(s.avgBase)}`} />
        <Stat label="Brier score" value={b3(s.brier)} sub={`Stats only ${b3(s.brierBase)} · lower is better`} />
      </div>
      <div className="card stack">
        <div className="eyebrow" style={{ color: 'var(--muted)' }}>Return at your odds</div>
        {r.n > 0 ? (
          <>
            <div style={GRID2}>
              <Stat label="Units" value={signed(r.units, 2)} tone={tone(r.units)} />
              <Stat label="Return" value={signed(r.pct * 100, 1, '%')} tone={tone(r.pct)} />
            </div>
            <div className="label">On {r.n} picks with odds · average odds {r.avgOdds.toFixed(2)} · break-even hit rate {opt(r.breakEven)}</div>
            <div className="label faint">Only picks where you entered odds count.</div>
          </>
        ) : (
          <EmptyState title="No odds yet" body="Add the odds you took on open picks to see your return." />
        )}
      </div>
      <Accordion title="Reliability: predicted vs actual" defaultOpen>
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead><tr><th>Bucket</th><th>n</th><th>Predicted</th><th>Actual</th></tr></thead>
            <tbody>
              {s.buckets.map((b) => (
                <tr key={b.label} style={b.n < 10 ? { color: 'var(--muted)' } : undefined}>
                  <td>{b.label}</td><td className="num">{b.n}</td>
                  <td className="num">{b.n ? pct(b.predicted) : '-'}</td><td className="num">{b.n ? pct(b.actual) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="label" style={{ marginTop: 8 }}>Predicted and actual should be close. Small buckets are noise.</div>
      </Accordion>
      <Accordion title="By market"><Rates rows={s.hitRateByMarket} name={(k) => MARKET[k] ?? k} /></Accordion>
      <Accordion title="By data tier"><Rates rows={s.hitRateByTier} name={(k) => 'Tier ' + k} /></Accordion>
      <Accordion title="With and without extra info"><Rates rows={{ 'With extra info': s.gapFill.with, 'Without extra info': s.gapFill.without }} /></Accordion>
    </div>
  );
}
