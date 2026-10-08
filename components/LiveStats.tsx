'use client';

import type { TeamLive } from '@/lib/livefeed';
import { pressure } from '@/lib/pressure';

const SPLIT = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' } as const;
const ROW = { display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'baseline', gap: 8, marginBottom: 4 } as const;
const NAME = { minWidth: 0, overflowWrap: 'anywhere' } as const;
const END = { textAlign: 'right' } as const;
const BOLD = { fontWeight: 700 } as const;

const show = (v: number | null): string => (v === null ? '–' : String(Math.round(v * 10) / 10));

// Home share of a two-part bar, in percent. 50/50 when both are 0 or either is unknown.
function split(h: number | null, a: number | null): number {
  if (h === null || a === null) return 50;
  const x = Math.max(h, 0);
  const y = Math.max(a, 0);
  return x + y > 0 ? (x / (x + y)) * 100 : 50;
}

function Bar({ h }: { h: number }) {
  const w = Math.min(100, Math.max(0, h));
  return (
    <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden' }} aria-hidden="true">
      <div style={{ width: `${w}%`, background: 'var(--accent)' }} />
      <div style={{ width: `${100 - w}%`, background: 'var(--border-strong)' }} />
    </div>
  );
}

export default function LiveStats(props: { home: string; away: string; stats: { home: TeamLive; away: TeamLive }; minute: number; fetchedAt?: string }) {
  const { home, away, stats, minute, fetchedAt } = props;
  const rows: [string, number | null, number | null][] = [
    ['Possession %', stats.home.possession, stats.away.possession],
    ['Shots', stats.home.shots, stats.away.shots],
    ['On target', stats.home.shotsOnTarget, stats.away.shotsOnTarget],
    ['Corners', stats.home.corners, stats.away.corners],
    ['Fouls', stats.home.fouls, stats.away.fouls],
  ];
  const p = pressure(stats.home, stats.away, minute);
  const good = p !== null && p.weight >= 0.15 ? p : null;
  const hp = good ? Math.round(50 + 50 * good.tilt) : 50;

  return (
    <div className="card stack">
      <div style={SPLIT}>
        <span className="eyebrow">Match stats</span>
        {fetchedAt && <span className="label">from the feed at {fetchedAt}</span>}
      </div>
      <div style={ROW}>
        <span className="label" style={NAME}>{home}</span>
        <span />
        <span className="label" style={{ ...NAME, ...END }}>{away}</span>
      </div>
      {rows.map(([name, h, a]) => (
        <div key={name}>
          <div style={ROW}>
            <span className="num" style={BOLD}>{show(h)}</span>
            <span className="label">{name}</span>
            <span className="num" style={{ ...BOLD, ...END }}>{show(a)}</span>
          </div>
          <Bar h={split(h, a)} />
        </div>
      ))}
      <div className="stack" style={{ gap: 6 }}>
        <div className="label">Pressure</div>
        {good ? (
          <>
            <Bar h={50 + 50 * good.tilt} />
            <div style={{ fontWeight: 600 }}>{`${home} ${hp}% · ${away} ${100 - hp}%`}</div>
            <div className="label faint">Pressure is an estimate from shots, shots on target, corners and possession. It is not tested.</div>
          </>
        ) : (
          <div className="muted">Not enough match data yet to measure pressure.</div>
        )}
      </div>
    </div>
  );
}
