'use client';

import { useEffect, useState } from 'react';
import { allCompetitions } from '@/lib/registry';
import { DEFAULT_ALLOWED, loadSettings, saveSettings } from '@/lib/settings';
import type { AllowedLines, BestResult, MenuItem } from '@/lib/best';
import FixturePicker from '@/components/FixturePicker';
import OddsCheck from '@/components/OddsCheck';
import { Accordion, EmptyState, Field, Notice, PageHeader, Section, Skeleton, Stepper } from '@/components/ui';

type G = keyof AllowedLines;
type F = keyof AllowedLines['goals'];
const GROUPS: [G, string][] = [['goals', 'Goals'], ['firsthalf', '1st half goals'], ['secondhalf', '2nd half goals'], ['corners', 'Corners'], ['cards', 'Cards']];
const FIELDS: [F, string][] = [['overMin', 'Over from'], ['overMax', 'Over to'], ['underMin', 'Under from'], ['underMax', 'Under to']];
const LEAGUE_KEY = 'fa_league_v1';
const GRID2 = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 } as const;
const SPLIT = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 } as const;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

export default function BestPick({ onAnalyze, onAdd }: {
  onAnalyze: (item: MenuItem, competitionId: string) => void;
  onAdd: (item: MenuItem, match: string) => void;
}) {
  const [comp, setComp] = useState('');
  const [match, setMatch] = useState('');
  const [mine, setMine] = useState('');
  const [allowed, setAllowed] = useState<AllowedLines>(DEFAULT_ALLOWED);
  const [maxPct, setMaxPct] = useState(100);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<BestResult | null>(null);
  const [used, setUsed] = useState({ match: '', comp: '' });

  useEffect(() => {
    const s = loadSettings(); setAllowed(s.allowed); setMaxPct(s.maxPct); setReady(true);
    try {
      const v = window.localStorage.getItem(LEAGUE_KEY) ?? '';
      if (v && allCompetitions().some((c) => c.id === v)) setComp(v);
    } catch { /* storage unavailable */ }
  }, []);

  function chooseLeague(id: string) {
    setComp(id);
    try { window.localStorage.setItem(LEAGUE_KEY, id); } catch { /* storage unavailable */ }
  }
  function persist(a: AllowedLines, m: number) {
    setAllowed(a); setMaxPct(m); saveSettings({ allowed: a, maxPct: m });
  }
  function editLine(g: G, f: F, v: string) {
    const n = parseFloat(v);
    if (Number.isFinite(n)) persist({ ...allowed, [g]: { ...allowed[g], [f]: n } }, maxPct);
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
      {own && <div className="eyebrow">Your bet</div>}
      <div style={SPLIT}>
        <span className="h2" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{it.label}</span>
        <span className="num" style={{ fontSize: 30, fontWeight: 700 }}>{pct(it.probability)}</span>
      </div>
      <div className="row">
        {!own && <span className="chip">{it.group}</span>}
        <span className="label">Fair odds <span className="num">{it.fairOdds.toFixed(2)}</span></span>
      </div>
      <div className="meter" role="img" aria-label={`Probability ${pct(it.probability)}`}>
        <i style={{ width: `${Math.min(100, Math.max(0, it.probability * 100))}%` }} />
      </div>
      {!own && it.shift !== 0 && (
        <div className="muted">Stats {pct(it.modelProbability)} → after news {pct(it.probability)}{it.note ? ` — ${it.note}` : ''}</div>
      )}
      <OddsCheck fairOdds={it.fairOdds} />
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <button type="button" className="btn secondary" style={{ flex: 1 }} onClick={() => onAnalyze(it, used.comp)}>Analyze</button>
        <button type="button" className="btn" style={{ flex: 1 }} onClick={() => onAdd(it, used.match)}>Add to slip</button>
      </div>
    </div>
  );

  return (
    <div>
      <PageHeader eyebrow="Matchday" title="Best picks" subtitle="The top 3 bets for one match, from team stats." />
      <div className="stack">
        <div className="card stack">
          <Field label="League">
            <select className="input" value={comp} onChange={(e) => chooseLeague(e.target.value)}>
              <option value="" disabled>Choose league</option>
              {allCompetitions().map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <FixturePicker competitionId={comp} onPick={(h, a) => setMatch(h + ' vs ' + a)} />
          <Field label="Match"><input className="input" placeholder="Arsenal vs Chelsea" value={match} onChange={(e) => setMatch(e.target.value)} /></Field>
          <Field label="My bet (optional)" hint="Type it like: under 11.5 corners">
            <input className="input" placeholder="under 11.5 corners" value={mine} onChange={(e) => setMine(e.target.value)} />
          </Field>
          <Accordion title="Lines my bookmaker offers">
            <div className="stack">
              {GROUPS.map(([g, title]) => (
                <div key={g} className="stack" style={{ gap: 8 }}>
                  <div className="eyebrow" style={{ color: 'var(--muted)' }}>{title}</div>
                  <div style={GRID2}>
                    {FIELDS.map(([f, name]) => (
                      <Field key={f} label={name}>
                        <input key={String(ready)} className="input" type="number" inputMode="decimal" step={0.5} min={0} max={20} defaultValue={allowed[g][f]} onChange={(e) => editLine(g, f, e.target.value)} />
                      </Field>
                    ))}
                  </div>
                </div>
              ))}
              <Stepper label="Ignore picks above (%)" min={50} max={100} value={maxPct} onChange={(n) => persist(allowed, n)} />
            </div>
          </Accordion>
          <button type="button" className="btn block" onClick={find} disabled={busy}>{busy ? 'Finding…' : 'Find best picks'}</button>
        </div>

        {err && <Notice tone="bad">{err}</Notice>}
        {busy && <div className="card"><Skeleton lines={4} height={18} /></div>}
        {res && (res.top.length === 0 ? <EmptyState title="No pick reaches 55%" body={res.note} /> : (
          <>
            <div className="muted">{res.basis}</div>
            {res.mine && card(res.mine, true)}
            <Section title="Top picks">{res.top.slice(0, 3).map((it) => card(it, false))}</Section>
            <div className="muted">{res.note}</div>
          </>
        ))}
      </div>
    </div>
  );
}
