'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { allCompetitions } from '@/lib/registry';
import type { Analysis } from '@/lib/types';

export default function AnalyzeForm(props: { onResult: (analysis: Analysis, threshold: number, raw: string, competitionId: string) => void; resetKey?: number }) {
  const [competitionId, setCompetitionId] = useState('');
  const [raw, setRaw] = useState('');
  const [percent, setPercent] = useState('85');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const lastKey = useRef(props.resetKey);
  const competitions = allCompetitions();

  useEffect(() => {
    if (lastKey.current === props.resetKey) return;
    lastKey.current = props.resetKey;
    setRaw('');
    setError('');
  }, [props.resetKey]);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = raw.trim();
    if (!text) {
      setError('Enter a query first.');
      return;
    }
    const pct = Math.min(99, Math.max(50, Math.round(Number(percent)) || 85));
    setPercent(String(pct));
    setLoading(true);
    setError('');
    try {
      const body: Record<string, unknown> = { raw: text, threshold: pct / 100 };
      if (competitionId) body.competitionId = competitionId;
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
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
      <select
        className="input"
        aria-label="League"
        value={competitionId}
        onChange={(e) => setCompetitionId(e.target.value)}
      >
        <option value="">Auto-detect league</option>
        {competitions.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <input
        className="input"
        type="text"
        aria-label="Query"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder="Arsenal vs Chelsea corners over 6.5"
      />
      <div className="row">
        <label className="muted" htmlFor="threshold">
          Safe threshold (%)
        </label>
        <input
          id="threshold"
          className="input"
          type="number"
          inputMode="numeric"
          min={50}
          max={99}
          value={percent}
          onChange={(e) => setPercent(e.target.value)}
          style={{ width: 90 }}
        />
      </div>
      <button className="btn" type="submit" disabled={loading}>
        {loading ? 'Analyzing\u2026' : 'Analyze'}
      </button>
      {error && (
        <p role="alert" style={{ color: '#ff6b6b', margin: 0 }}>
          {error}
        </p>
      )}
    </form>
  );
}
