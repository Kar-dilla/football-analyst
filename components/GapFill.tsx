'use client';

import { useState } from 'react';
import type { GapFacts } from '@/lib/types';
import { Field, Notice } from '@/components/ui';

const lines = (s: string): string[] => s.split('\n').map((t) => t.trim()).filter(Boolean);
const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean) : [];
const merge = (cur: string, add: string[]): string => {
  const out = lines(cur);
  for (const s of add) if (!out.includes(s)) out.push(s);
  return out.join('\n');
};
const errMsg = (e: unknown): string => (e instanceof Error && e.message ? e.message : 'Something went wrong');
const LIST = { margin: '6px 0 0', paddingLeft: 18, overflowWrap: 'anywhere' } as const;

export default function GapFill({ needs, onRerun }: { needs: string[]; onRerun: (gap: GapFacts) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [injuries, setInjuries] = useState('');
  const [lineup, setLineup] = useState('');
  const [lateNews, setLateNews] = useState('');
  const [weather, setWeather] = useState('');
  const [referee, setReferee] = useState('');
  const [busy, setBusy] = useState<'extract' | 'rerun' | null>(null);
  const [hint, setHint] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [rerunError, setRerunError] = useState('');
  const [done, setDone] = useState(false);

  async function extract() {
    const t = text.trim();
    if (!t) { setHint(true); return; }
    if (busy) return;
    setBusy('extract'); setExtractError(''); setDone(false);
    try {
      const res = await fetch('/api/extract', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: t }) });
      const data: unknown = await res.json().catch(() => null);
      const o = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
      if (!res.ok || typeof o.error === 'string') throw new Error(typeof o.error === 'string' && o.error ? o.error : `Request failed (${res.status})`);
      const inj = strList(o.injuries);
      const lu = strList(o.expectedLineup);
      const ln = strList(o.lateNews);
      setInjuries((c) => merge(c, inj)); setLineup((c) => merge(c, lu)); setLateNews((c) => merge(c, ln));
      if (typeof o.weather === 'string' && o.weather.trim()) setWeather(o.weather.trim());
      if (typeof o.referee === 'string' && o.referee.trim()) setReferee(o.referee.trim());
    } catch (e) {
      setExtractError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  async function rerun() {
    if (busy) return;
    setBusy('rerun'); setRerunError(''); setDone(false);
    try {
      await onRerun({ injuries: lines(injuries), expectedLineup: lines(lineup), lateNews: lines(lateNews), weather: weather.trim() || undefined, referee: referee.trim() || undefined });
      setDone(true);
    } catch (e) {
      setRerunError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack">
      <button type="button" className="btn secondary block" aria-expanded={open} onClick={() => setOpen((o) => !o)}>Add missing info</button>
      {open && (
        <div className="stack">
          {needs.length > 0 && (
            <Notice tone="info">
              <strong>Helpful to add:</strong>
              <ul style={LIST}>{needs.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </Notice>
          )}
          <Field label="Paste team news">
            <textarea rows={3} placeholder="Paste team news, e.g. Saka out, Partey doubtful" value={text} onChange={(e) => { setText(e.target.value); setHint(false); }} />
          </Field>
          <div className="row">
            <button type="button" className="btn secondary" onClick={extract} disabled={busy !== null}>{busy === 'extract' ? 'Extracting…' : 'Extract'}</button>
            {hint && <span className="muted">Paste some text first</span>}
          </div>
          {extractError && <Notice tone="bad">{extractError}</Notice>}
          <Field label="Injuries (one per line)"><textarea rows={3} value={injuries} onChange={(e) => setInjuries(e.target.value)} /></Field>
          <Field label="Expected lineup (one per line)"><textarea rows={3} value={lineup} onChange={(e) => setLineup(e.target.value)} /></Field>
          <Field label="Late news (one per line)"><textarea rows={3} value={lateNews} onChange={(e) => setLateNews(e.target.value)} /></Field>
          <Field label="Weather"><input className="input" type="text" value={weather} onChange={(e) => setWeather(e.target.value)} /></Field>
          <Field label="Referee"><input className="input" type="text" value={referee} onChange={(e) => setReferee(e.target.value)} /></Field>
          <button type="button" className="btn block" onClick={rerun} disabled={busy !== null}>{busy === 'rerun' ? 'Re-running…' : 'Re-run analysis'}</button>
          {rerunError && <Notice tone="bad">{rerunError}</Notice>}
          {done && <Notice tone="ok">Updated. Check the new numbers above.</Notice>}
        </div>
      )}
    </div>
  );
}
