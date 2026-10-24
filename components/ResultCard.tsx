'use client';

import type { Analysis, GapFacts, H2HMeeting, MatchesPanel, Streak } from '@/lib/types';
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

// ---- Matches / H2H panel (display only), laid out like Sofascore in the app's colours ----
type Who = [string, string][]; // [team, colour]
const CA = 'var(--accent)';
const CB = 'var(--info)';
const ROW = { display: 'grid', gridTemplateColumns: '64px 1fr 48px', alignItems: 'center', gap: 8, padding: '10px 0', borderTop: '1px solid var(--border)' } as const;
const htOf = (m: H2HMeeting): string => (m.htHome !== undefined && m.htAway !== undefined ? `HT ${m.htHome}-${m.htAway}` : '');

function Head({ children }: { children: string }) {
  return <div className="eyebrow" style={{ color: 'var(--muted)' }}>{children}</div>;
}

function Crest({ team, c }: { team: string; c: string }) {
  return (
    <span title={team} aria-label={team} style={{ width: 28, height: 28, flex: 'none', borderRadius: '50%', border: `1.5px solid ${c}`, background: `color-mix(in srgb, ${c} 14%, transparent)`, color: c, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700 }}>
      {team.replace(/[^a-z0-9]/gi, '').slice(0, 3).toUpperCase()}
    </span>
  );
}

function StreakRow({ s, who }: { s: Streak; who: Who }) {
  const run = /^No (losses|clean sheet)$/.test(s.label);
  return (
    <div style={ROW}>
      <span style={{ display: 'flex', gap: 4 }}>{who.map(([t, c]) => <Crest key={t} team={t} c={c} />)}</span>
      <span style={{ textAlign: 'center', fontWeight: 600 }}>{s.label}</span>
      <span className="num" style={{ textAlign: 'right', fontWeight: 700 }}>{run ? s.hit : `${s.hit}/${s.of}`}</span>
    </div>
  );
}

// Display-only head to head record, streaks and recent form. Reusable on other screens.
export function MatchesPanelView({ m }: { m: MatchesPanel }) {
  const h = m.h2h;
  const n = h ? h.meetings.length : 0;
  const tc = (t: string, i: number): string => (h ? (t === h.teamB ? CB : CA) : i === 0 ? CA : CB);
  return (
    <div className="stack">
      {h && (
        <>
          <Head>{`Head-to-head · last ${n} ${n === 1 ? 'match' : 'matches'}`}</Head>
          <div role="group" aria-label={`Last ${n} ${n === 1 ? 'meeting' : 'meetings'}: ${h.teamA} ${h.winsA} - Draws ${h.draws} - ${h.teamB} ${h.winsB}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 12, textAlign: 'center' }}>
            {([[h.winsA, h.teamA, CA], [h.draws, 'Draws', 'var(--muted)'], [h.winsB, h.teamB, CB]] as const).map(([v, t, c], i) => (
              <div key={i} style={{ minWidth: 0 }}>
                <div className="num" style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, color: c }}>{v}</div>
                <div className="label" style={{ overflowWrap: 'anywhere' }}>{t}</div>
              </div>
            ))}
          </div>
          {h.streaks.length > 0 && (
            <>
              <Head>Head-to-head streaks</Head>
              <div>
                {h.streaks.map((s) => {
                  const a = s.label.startsWith(`${h.teamA}: `);
                  const b = s.label.startsWith(`${h.teamB}: `);
                  const own = a ? h.teamA : b ? h.teamB : '';
                  const who: Who = own ? [[own, a ? CA : CB]] : [[h.teamA, CA], [h.teamB, CB]];
                  return <StreakRow key={s.label} s={own ? { ...s, label: s.label.slice(own.length + 2) } : s} who={who} />;
                })}
              </div>
            </>
          )}
          <Head>Past matches</Head>
          <div>
            {h.meetings.map((x, i) => (
              <div key={i} style={{ ...ROW, gridTemplateColumns: '84px 1fr auto' }}>
                <span className="label num">{x.date}</span>
                <span style={{ textAlign: 'center' }}>{x.home} <b className="num">{x.hg}-{x.ag}</b> {x.away}</span>
                <span className="label num">{htOf(x)}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {m.form.map((f, i) => (
        <div className="stack" key={f.team}>
          <Head>{`Recent form · ${f.team}`}</Head>
          <div>{f.streaks.map((s) => <StreakRow key={s.label} s={s} who={[[f.team, tc(f.team, i)]]} />)}</div>
        </div>
      ))}
      <p className="muted" style={{ margin: 0 }}>Small sample. For context only; it does not change the probability.</p>
    </div>
  );
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
        {a.matches && (
          <Accordion title="Matches / H2H" count={a.matches.h2h ? a.matches.h2h.meetings.length : undefined} defaultOpen>
            <MatchesPanelView m={a.matches} />
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
