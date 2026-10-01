'use client';

import { useState } from 'react';
import type { GapFacts } from '@/lib/types';

function lines(s: string): string[] {
  return s
    .split('\n')
    .map((t) => t.trim())
    .filter(Boolean);
}

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim())
    .filter(Boolean);
}

function mergeLines(current: string, incoming: string[]): string {
  const out = lines(current);
  for (const s of incoming) if (!out.includes(s)) out.push(s);
  return out.join('\n');
}

function errMsg(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Something went wrong';
}

const FULL = { width: '100%', boxSizing: 'border-box' } as const;

export default function GapFill(props: { needs: string[]; onRerun: (gap: GapFacts) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [injuries, setInjuries] = useState('');
  const [lineup, setLineup] = useState('');
  const [lateNews, setLateNews] = useState('');
  const [weather, setWeather] = useState('');
  const [referee, setReferee] = useState('');
  const [busy, setBusy] = useState<'extract' | 'rerun' | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [rerunError, setRerunError] = useState<string | null>(null);

  async function extract() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy('extract');
    setExtractError(null);
    try {
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: t }),
      });
      let data: unknown = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }
      const obj = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
      if (!res.ok || typeof obj.error === 'string') {
        throw new Error(typeof obj.error === 'string' && obj.error ? obj.error : `Request failed (${res.status})`);
      }
      const inj = strList(obj.injuries);
      const lu = strList(obj.expectedLineup);
      const ln = strList(obj.lateNews);
      setInjuries((cur) => mergeLines(cur, inj));
      setLineup((cur) => mergeLines(cur, lu));
      setLateNews((cur) => mergeLines(cur, ln));
      if (typeof obj.weather === 'string' && obj.weather.trim()) setWeather(obj.weather.trim());
      if (typeof obj.referee === 'string' && obj.referee.trim()) setReferee(obj.referee.trim());
    } catch (e) {
      setExtractError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  async function rerun() {
    if (busy) return;
    setBusy('rerun');
    setRerunError(null);
    try {
      const gap: GapFacts = {
        injuries: lines(injuries),
        expectedLineup: lines(lineup),
        lateNews: lines(lateNews),
        weather: weather.trim() || undefined,
        referee: referee.trim() || undefined,
      };
      await props.onRerun(gap);
    } catch (e) {
      setRerunError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  const loading = busy !== null;

  return (
    <div className="stack">
      <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        Add missing info
      </button>

      {open && (
        <div className="stack">
          {props.needs.length > 0 && (
            <div>
              <strong>Helpful to add:</strong>
              <ul style={{ overflowWrap: 'anywhere' }}>
                {props.needs.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}

          <textarea
            className="input"
            style={FULL}
            rows={3}
            placeholder="Paste team news, e.g. Saka out, Partey doubtful"
            aria-label="Pasted team news"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="row">
            <button type="button" className="btn" onClick={extract} disabled={loading}>
              Extract
            </button>
          </div>
          {extractError && (
            <div className="badge warn" role="alert" style={{ overflowWrap: 'anywhere', whiteSpace: 'normal' }}>
              {extractError}
            </div>
          )}

          <label className="stack">
            <span className="muted">Injuries (one per line)</span>
            <textarea
              className="input"
              style={FULL}
              rows={3}
              value={injuries}
              onChange={(e) => setInjuries(e.target.value)}
            />
          </label>
          <label className="stack">
            <span className="muted">Expected lineup (one per line)</span>
            <textarea
              className="input"
              style={FULL}
              rows={3}
              value={lineup}
              onChange={(e) => setLineup(e.target.value)}
            />
          </label>
          <label className="stack">
            <span className="muted">Late news (one per line)</span>
            <textarea
              className="input"
              style={FULL}
              rows={3}
              value={lateNews}
              onChange={(e) => setLateNews(e.target.value)}
            />
          </label>
          <label className="stack">
            <span className="muted">Weather</span>
            <input
              className="input"
              style={FULL}
              type="text"
              value={weather}
              onChange={(e) => setWeather(e.target.value)}
            />
          </label>
          <label className="stack">
            <span className="muted">Referee</span>
            <input
              className="input"
              style={FULL}
              type="text"
              value={referee}
              onChange={(e) => setReferee(e.target.value)}
            />
          </label>

          <div className="row">
            <button type="button" className="btn" onClick={rerun} disabled={loading}>
              Re-run analysis
            </button>
          </div>
          {rerunError && (
            <div className="badge warn" role="alert" style={{ overflowWrap: 'anywhere', whiteSpace: 'normal' }}>
              {rerunError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
