'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { allCompetitions } from '@/lib/registry';
import type { Analysis } from '@/lib/types';
import FixturePicker from '@/components/FixturePicker';
import { Field, Notice, Stepper } from '@/components/ui';

const LEAGUE_KEY = 'fa_league_v1';

export default function AnalyzeForm(props: { onResult: (analysis: Analysis, threshold: number, raw: string, competitionId: string) => void; resetKey?: number }) {
  const [competitionId, setCompetitionId] = useState('');
  const [raw, setRaw] = useState('');
  const [percent, setPercent] = useState(85);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const lastKey = useRef(props.resetKey);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const v = window.localStorage.getItem(LEAGUE_KEY) ?? '';
      if (v && allCompetitions().some((c) => c.id === v)) setCompetitionId(v);
    } catch { /* storage unavailable */ }
  }, []);

  useEffect(() => {
    if (lastKey.current === props.resetKey) return;
    lastKey.current = props.resetKey;
    setRaw('');
    setError('');
  }, [props.resetKey]);

  function chooseLeague(id: string) {
    setCompetitionId(id);
    try { window.localStorage.setItem(LEAGUE_KEY, id); } catch { /* storage unavailable */ }
  }

  function pick(home: string, away: string) {
    const v = `${home} vs ${away} `;
    setRaw(v);
    inputRef.current?.focus();
    setTimeout(() => inputRef.current?.setSelectionRange(v.length, v.length), 0);
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = raw.trim();
    if (!text) { setError('Enter a query first.'); return; }
    const pct = Math.min(99, Math.max(50, Math.round(percent) || 85));
    setLoading(true);
    setError('');
    try {
      const body: Record<string, unknown> = { raw: text, threshold: pct / 100 };
      if (competitionId) body.competitionId = competitionId;
      const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setError((data && data.error) || `Request failed (${res.status})`);
      } else {
        props.onResult(data as Analysis, pct / 100, text, competitionId);
      }
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="card stack" onSubmit={submit}>
      <Field label="League">
        <select className="input" value={competitionId} onChange={(e) => chooseLeague(e.target.value)}>
          <option value="">Auto-detect league</option>
          {allCompetitions().map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </Field>
      <FixturePicker competitionId={competitionId} onPick={pick} />
      <Field label="Match and bet" hint="Example: Arsenal vs Chelsea over 9.5 corners">
        <input ref={inputRef} className="input" type="text" value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="Arsenal vs Chelsea corners over 6.5" />
      </Field>
      <div onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}>
        <Stepper label="Safe threshold (%)" min={50} max={99} value={percent} onChange={setPercent} />
      </div>
      <button className="btn block" type="submit" disabled={loading}>{loading ? 'Analyzing…' : 'Analyze'}</button>
      {error && <Notice tone="bad">{error}</Notice>}
    </form>
  );
}
