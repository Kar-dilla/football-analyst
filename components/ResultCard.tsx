'use client';

import type { Analysis, GapFacts } from '@/lib/types';
import GapFill from '@/components/GapFill';
import { Accordion, Dot, Gauge, Notice, PageHeader, Stat } from '@/components/ui';
import { getCompetition } from '@/lib/registry';
import { betLabel } from '@/lib/label';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const UL = { margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6, overflowWrap: 'anywhere' } as const;
const GRID2 = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 } as const;
const TONE = { up: 'ok', down: 'warn', neutral: 'off' } as const;
const URL_RE = /https?:\/\/[^\s<>"')\]]+/;

function List({ items }: { items: string[] }) {
  return <ul style={UL}>{items.map((s, i) => <li key={i}>{s}</li>)}</ul>;
}

function Source({ s }: { s: string }) {
  const m = URL_RE.exec(s);
  if (!m) return <>{s}</>;
  const url = m[0].replace(/[.,;:!?]+$/, '');
  return (
    <>
      {s.slice(0, m.index)}
      <a className="link" href={url} target="_blank" rel="noopener noreferrer">{url}</a>
      {s.slice(m.index + url.length)}
    </>
  );
}

export default function ResultCard({ analysis: a, threshold, onRerun }: { analysis: Analysis; threshold: number; onRerun?: (gap: GapFacts) => Promise<void> }) {
  const comp = getCompetition(a.query.competitionId ?? '');
  const ladder = a.base.ladder ?? [];
  const line = a.query.line;
  const above = a.probability >= threshold;
  const diff = a.probability - a.base.probability;
  const changed = Math.abs(diff) >= 0.01 - 1e-9;
  const pts = Math.round(diff * 100);

  return (
    <div>
      <PageHeader eyebrow={comp?.name ?? 'Match'} title={betLabel(a.query)} subtitle={`${a.query.home} vs ${a.query.away}`} right={<span className="badge">Data tier {a.tier}</span>} />
      <div className="stack">
        <div className="card stack">
          <Gauge value={a.probability} low={a.probLow} high={a.probHigh} threshold={threshold} confidence={a.confidence} basis={`${a.base.sampleSize} games of stats`} />
          <div className="row">
            <span className={above ? 'badge ok' : 'badge warn'}>{above ? 'Above' : 'Below'} your threshold ({pct(threshold)})</span>
            {a.safestLine != null && <span className="chip">Safest line: {a.safestLine}</span>}
          </div>
          <div style={GRID2}>
            <Stat label="Stats only" value={pct(a.base.probability)} />
            <Stat label="After news" value={pct(a.probability)} tone={changed ? 'accent' : undefined} sub={changed ? `${pts >= 0 ? '+' : '−'}${Math.abs(pts)} pts` : 'no adjustment'} />
          </div>
        </div>

        {a.gaps.length > 0 && <Notice tone="warn">Some data was missing ({a.gaps.length}). See Gaps below.</Notice>}

        {ladder.length > 0 && (
          <Accordion title="Line ladder">
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead><tr><th>Line</th><th>Over</th><th>Under</th></tr></thead>
                <tbody>
                  {ladder.map((r) => {
                    const hit = line != null && Math.abs(r.line - line) < 1e-9;
                    return (
                      <tr key={r.line} style={hit ? { background: 'var(--accent-soft)', fontWeight: 700 } : undefined}>
                        <td className="num">{r.line}</td>
                        <td className="num">{pct(r.over)}</td>
                        <td className="num">{pct(r.under)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Accordion>
        )}
        {a.drivers.length > 0 && <Accordion title="Why this number" count={a.drivers.length} defaultOpen><List items={a.drivers} /></Accordion>}
        {a.tailRisks.length > 0 && <Accordion title="What could go wrong" count={a.tailRisks.length}><List items={a.tailRisks} /></Accordion>}
        {a.flags.length > 0 && (
          <Accordion title="Flags" count={a.flags.length}>
            <div className="row">
              {a.flags.map((f, i) => (
                <span className="chip" key={`${f.key}-${i}`} style={{ gap: 6 }}><Dot tone={TONE[f.impact]} />{f.label}</span>
              ))}
            </div>
          </Accordion>
        )}
        {a.evidence.length > 0 && <Accordion title="Evidence" count={a.evidence.length}><List items={a.evidence} /></Accordion>}
        {a.sources.length > 0 && (
          <Accordion title="Sources" count={a.sources.length}>
            <ul style={UL}>{a.sources.map((s, i) => <li key={i}><Source s={s} /></li>)}</ul>
          </Accordion>
        )}
        {a.gaps.length > 0 && <Accordion title="Gaps" count={a.gaps.length}><List items={a.gaps} /></Accordion>}

        <p className="muted" style={{ margin: 0 }}>Model estimate from team stats, not a guarantee. Bookmaker odds are not known.</p>
        {onRerun && <GapFill needs={a.needs} onRerun={onRerun} />}
      </div>
    </div>
  );
}
