'use client';

import { useEffect, useState } from 'react';
import { allCompetitions } from '@/lib/registry';
import { DEFAULT_ALLOWED, loadSettings, saveSettings } from '@/lib/settings';
import type { AllowedLines, BestResult, MenuItem } from '@/lib/best';

type G = keyof AllowedLines;
type F = keyof AllowedLines['goals'];
const NAMES: Record<G, string> = { goals: 'Goals', firsthalf: 'First half', secondhalf: 'Second half', corners: 'Corners', cards: 'Cards' };
const FIELDS: [F, string][] = [['overMin', 'over from'], ['overMax', 'over to'], ['underMin', 'under from'], ['underMax', 'under to']];
const SMALL = { width: '4.5rem' };
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export default function BestPick({ onAnalyze, onAdd }: {
  onAnalyze: (item: MenuItem, competitionId: string) => void;
  onAdd: (item: MenuItem, match: string) => void;
}) {
  const [comp, setComp] = useState('');
  const [match, setMatch] = useState('');
  const [mine, setMine] = useState('');
  const [open, setOpen] = useState(false);
  const [allowed, setAllowed] = useState<AllowedLines>(DEFAULT_ALLOWED);
  const [maxPct, setMaxPct] = useState(100);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<BestResult | null>(null);
  const [used, setUsed] = useState({ match: '', comp: '' });

  useEffect(() => { const s = loadSettings(); setAllowed(s.allowed); setMaxPct(s.maxPct); }, []);

  function persist(a: AllowedLines, m: number) {
    setAllowed(a); setMaxPct(m); saveSettings({ allowed: a, maxPct: m });
  }
  function editLine(g: G, f: F, v: string) {
    const n = parseFloat(v);
    if (Number.isFinite(n)) persist({ ...allowed, [g]: { ...allowed[g], [f]: n } }, maxPct);
  }
  function editMax(v: string) {
    const n = parseFloat(v);
    if (Number.isFinite(n)) persist(allowed, Math.min(100, Math.max(50, n)));
  }

  async function find() {
    const m = match.trim();
    if (!comp || !m) return setErr('Choose a league and type a match.');
    setBusy(true); setErr(''); setRes(null);
    try {
      const body: Record<string, unknown> = { match: m, competitionId: comp, allowed };
      if (mine.trim()) body.mine = mine.trim();
      if (maxPct < 100) body.maxProbability = maxPct / 100;
      const r = await fetch('/api/best', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d) throw new Error((d && d.error) || `Request failed (${r.status})`);
      setRes(d as BestResult); setUsed({ match: m, comp });
    } catch (e) { setErr(e instanceof Error ? e.message : 'Request failed'); }
    setBusy(false);
  }

  const card = (it: MenuItem, own: boolean) => (
    <div key={`${own}|${it.group}|${it.label}`} className="card stack">
      {own ? <h3>Your bet</h3> : null}
      {own ? <strong>{it.label}</strong> : <h3>{it.label}</h3>}
      <div>{pct(it.probability)} {own ? null : <span className="chip">{it.group}</span>} · Fair odds {it.fairOdds.toFixed(2)}</div>
      {!own && it.shift !== 0 && (
        <div className="muted">Stats {pct(it.modelProbability)} → news adjusted {pct(it.probability)}{it.note ? ` — ${it.note}` : ''}</div>
      )}
      <div className="row">
        <button className="btn" onClick={() => onAnalyze(it, used.comp)}>Analyze</button>
        <button className="btn" onClick={() => onAdd(it, used.match)}>Add to slip</button>
      </div>
    </div>
  );

  return (
    <section className="card stack">
      <select className="input" value={comp} onChange={(e) => setComp(e.target.value)}>
        <option value="" disabled>Choose league</option>
        {allCompetitions().map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <label className="stack"><span className="muted">Match</span><input className="input" placeholder="Arsenal vs Chelsea" value={match} onChange={(e) => setMatch(e.target.value)} /></label>
      <label className="stack"><span className="muted">My bet (optional)</span><input className="input" placeholder="under 11.5 corners" value={mine} onChange={(e) => setMine(e.target.value)} /></label>
      <button className="btn" onClick={() => setOpen(!open)}>Lines my bookmaker offers {open ? '▴' : '▾'}</button>
      {open && (
        <div className="stack">
          {(Object.keys(NAMES) as G[]).map((g) => (
            <div key={g} className="row">
              <strong>{NAMES[g]}</strong>
              {FIELDS.map(([f, name]) => (
                <label key={f}><span className="muted">{name}</span>
                  <input className="input" style={SMALL} type="number" step={0.5} defaultValue={allowed[g][f]} onChange={(e) => editLine(g, f, e.target.value)} />
                </label>
              ))}
            </div>
          ))}
          <label className="stack"><span className="muted">Ignore picks above (%)</span>
            <input className="input" type="number" min={50} max={100} step={1} defaultValue={maxPct} onChange={(e) => editMax(e.target.value)} onBlur={(e) => { e.target.value = String(maxPct); }} />
          </label>
        </div>
      )}
      <button className="btn" onClick={find} disabled={busy}>{busy ? 'Finding…' : 'Find best picks'}</button>
      {err && <div className="badge warn">{err}</div>}
      {res && (res.top.length === 0 ? <div className="muted">{res.note}</div> : (
        <div className="stack">
          <div className="muted">{res.basis}</div>
          {res.mine && card(res.mine, true)}
          <h3>Top picks</h3>
          {res.top.slice(0, 3).map((it) => card(it, false))}
          <div className="muted">{res.note}</div>
        </div>
      ))}
    </section>
  );
}
