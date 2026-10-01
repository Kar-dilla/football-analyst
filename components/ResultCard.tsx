'use client';

import type { Analysis, GapFacts } from '@/lib/types';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const MARK = { up: '▲', down: '▼', neutral: '●' };

function Section(props: { title: string; items: string[] }) {
  if (!props.items.length) return null;
  return (
    <div>
      <strong>{props.title}</strong>
      <ul style={{ overflowWrap: 'anywhere' }}>
        {props.items.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ul>
    </div>
  );
}

export default function ResultCard(props: { analysis: Analysis; threshold: number; onRerun?: (gap: GapFacts) => Promise<void> }) {
  const a = props.analysis;
  const ladder = a.base.ladder ?? [];
  const line = a.query.line;

  return (
    <div className="card stack">
      <h2 style={{ margin: 0, overflowWrap: 'anywhere' }}>{a.query.raw}</h2>
      <div>
        <div style={{ fontSize: 48, fontWeight: 700, lineHeight: 1 }}>{pct(a.probability)}</div>
        <div className="muted">
          Range {pct(a.probLow)}–{pct(a.probHigh)}
        </div>
      </div>
      <div className="row" style={{ flexWrap: 'wrap' }}>
        <span className="badge">Confidence: {a.confidence}</span>
        <span className={a.safe ? 'badge ok' : 'badge warn'}>
          {a.safe ? 'SAFE' : 'NOT SAFE'}
        </span>
        <span className="muted">threshold {pct(props.threshold)}</span>
      </div>
      {a.safestLine != null && <div>Safest line: {a.safestLine}</div>}

      {ladder.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Line</th>
                <th>Over</th>
                <th>Under</th>
              </tr>
            </thead>
            <tbody>
              {ladder.map((r) => {
                const hit = line != null && Math.abs(r.line - line) < 1e-9;
                return (
                  <tr
                    key={r.line}
                    style={hit ? { background: 'rgba(255,255,255,0.12)', fontWeight: 700 } : undefined}
                  >
                    <td>{r.line}</td>
                    <td>{pct(r.over)}</td>
                    <td>{pct(r.under)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Section title="Drivers" items={a.drivers} />
      <Section title="Tail risks" items={a.tailRisks} />

      {a.flags.length > 0 && (
        <div className="row" style={{ flexWrap: 'wrap' }}>
          {a.flags.map((f, i) => (
            <span className="chip" key={`${f.key}-${i}`}>
              {MARK[f.impact]} {f.label}
            </span>
          ))}
        </div>
      )}

      <Section title="Gaps" items={a.gaps} />

      {a.evidence.length > 0 && (
        <details>
          <summary>Evidence ({a.evidence.length})</summary>
          <ul style={{ overflowWrap: 'anywhere' }}>
            {a.evidence.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </details>
      )}

      {a.sources.length > 0 && (
        <details>
          <summary>Sources</summary>
          <ul style={{ overflowWrap: 'anywhere' }}>
            {a.sources.map((s, i) => (
              <li key={i}>
                {/^https?:\/\//.test(s) ? (
                  <a href={s} target="_blank" rel="noreferrer">
                    {s}
                  </a>
                ) : (
                  s
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
