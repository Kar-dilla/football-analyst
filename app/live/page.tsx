'use client';

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { allCompetitions } from '@/lib/registry';
import { loadSettings } from '@/lib/settings';
import type { LiveMatch } from '@/lib/livefeed';

interface LivePick { label: string; group: string; probability: number; fairOdds: number }
interface LiveResult { top: LivePick[]; mine: LivePick | null; basis: string; note: string }

const INIT = { minute: '1', hg: '0', ag: '0', hr: '0', ar: '0' };
type Key = keyof typeof INIT;

const clamp = (v: string, lo: number, hi: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
};

function Field(p: { label: string; children: ReactNode }) {
  return (
    <label className="stack">
      <span className="muted">{p.label}</span>
      {p.children}
    </label>
  );
}

function Stepper(p: { label: string; value: string; min: number; max: number; onChange: (v: string) => void }) {
  const cur = clamp(p.value, p.min, p.max);
  const set = (n: number) => p.onChange(String(clamp(String(n), p.min, p.max)));
  return (
    <div className="stack">
      <span className="muted">{p.label}</span>
      <div className="row">
        <button type="button" className="btn" aria-label={`${p.label} minus`} onClick={() => set(cur - 1)}>−</button>
        <input
          className="input"
          type="number"
          inputMode="numeric"
          aria-label={p.label}
          min={p.min}
          max={p.max}
          value={p.value}
          onChange={(e) => p.onChange(e.target.value)}
        />
        <button type="button" className="btn" aria-label={`${p.label} plus`} onClick={() => set(cur + 1)}>+</button>
      </div>
    </div>
  );
}

function PickCard(p: { pick: LivePick; head?: string; chip?: boolean }) {
  return (
    <div className="card stack">
      {p.head && <div className="muted">{p.head}</div>}
      <h3>{p.pick.label}</h3>
      <div className="row">
        <strong>{Math.round(p.pick.probability * 100)}%</strong>
        {p.chip && <span className="chip">{p.pick.group}</span>}
        <span className="muted">Fair odds {p.pick.fairOdds.toFixed(2)}</span>
      </div>
    </div>
  );
}

export default function LivePage() {
  const comps = useMemo(() => allCompetitions(), []);
  const [league, setLeague] = useState('');
  const [match, setMatch] = useState('');
  const [f, setF] = useState(INIT);
  const [mine, setMine] = useState('');
  const [maxPct, setMaxPct] = useState('100');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<LiveResult | null>(null);
  const [at, setAt] = useState('');
  const [feed, setFeed] = useState<{ comp: string; list: LiveMatch[]; msg: string } | null>(null);
  const [feedBusy, setFeedBusy] = useState(false);
  const [redNote, setRedNote] = useState(false);

  useEffect(() => { setMaxPct(String(loadSettings().maxPct)); }, []);
  const upd = (k: Key) => (v: string) => setF((s) => ({ ...s, [k]: v }));

  async function loadFeed() {
    setFeedBusy(true);
    setRedNote(false);
    let next = { comp: league, list: [] as LiveMatch[], msg: 'Could not reach the live feed. Type the details instead.' };
    try {
      const d = await (await fetch(`/api/livefeed?comp=${encodeURIComponent(league)}`)).json();
      if (Array.isArray(d?.matches)) next = { comp: league, list: d.matches, msg: String(d.note || '') };
    } catch {}
    setFeed(next);
    setFeedBusy(false);
  }

  function pickMatch(m: LiveMatch) {
    const c = (n: number, hi: number) => String(clamp(String(n), 0, hi));
    setMatch(`${m.home} vs ${m.away}`);
    setF((s) => ({
      ...s,
      ...(m.minute !== null ? { minute: String(m.minute) } : {}),
      hg: c(m.homeGoals, 20),
      ag: c(m.awayGoals, 20),
      ...(m.homeReds !== null ? { hr: c(m.homeReds, 4) } : {}),
      ...(m.awayReds !== null ? { ar: c(m.awayReds, 4) } : {}),
    }));
    setRedNote(m.homeReds === null || m.awayReds === null);
    setFeed(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!league) return setErr('Choose a league.');
    if (!match.trim()) return setErr('Type the match, e.g. Arsenal vs Chelsea.');
    setErr('');
    setLoading(true);
    try {
      const st = {
        minute: clamp(f.minute, 1, 120),
        homeGoals: clamp(f.hg, 0, 20),
        awayGoals: clamp(f.ag, 0, 20),
        homeReds: clamp(f.hr, 0, 4),
        awayReds: clamp(f.ar, 0, 4),
      };
      const limit = clamp(maxPct, 50, 100);
      setF({ minute: String(st.minute), hg: String(st.homeGoals), ag: String(st.awayGoals), hr: String(st.homeReds), ar: String(st.awayReds) });
      setMaxPct(String(limit));
      const body: Record<string, unknown> = {
        match: match.trim(),
        competitionId: league,
        state: st,
        allowedGoals: loadSettings().allowed.goals,
      };
      if (mine.trim()) body.mine = mine.trim();
      if (limit < 100) body.maxProbability = limit / 100;
      const r = await fetch('/api/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => null);
      if (!r.ok || !data || data.error) throw new Error((data && data.error) || `Request failed (${r.status})`);
      setRes(data as LiveResult);
      setAt(new Date().toTimeString().slice(0, 8));
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  const shown = !!res && res.top.length > 0;

  return (
    <main className="wrap stack">
      <a href="/" className="btn">Pre-match</a>
      <form className="card stack" onSubmit={submit}>
        <Field label="League">
          <select className="input" value={league} onChange={(e) => setLeague(e.target.value)}>
            <option value="" disabled>Choose league</option>
            {comps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <button type="button" className="btn" disabled={!league || feedBusy} onClick={loadFeed}>{feedBusy ? 'Loading…' : 'Fill from live feed'}</button>
        {feed && feed.comp === league && feed.list.map((m, i) => (
          <button key={`${m.home}|${m.away}|${i}`} type="button" className="btn" onClick={() => pickMatch(m)}>
            {`${m.home} vs ${m.away}  ·  ${m.minute ?? '?'}'  ·  ${m.homeGoals}-${m.awayGoals}`}
          </button>
        ))}
        {feed && feed.comp === league && feed.list.length === 0 && feed.msg && <div className="muted">{feed.msg}</div>}
        {redNote && <div className="muted">{"Red cards aren't in the feed for this match. Check and enter them yourself."}</div>}
        <Field label="Match">
          <input className="input" type="text" placeholder="Arsenal vs Chelsea" value={match} onChange={(e) => setMatch(e.target.value)} />
        </Field>
        <Stepper label="Minute" value={f.minute} min={1} max={120} onChange={upd('minute')} />
        <Stepper label="Home goals" value={f.hg} min={0} max={20} onChange={upd('hg')} />
        <Stepper label="Away goals" value={f.ag} min={0} max={20} onChange={upd('ag')} />
        <Stepper label="Home reds" value={f.hr} min={0} max={4} onChange={upd('hr')} />
        <Stepper label="Away reds" value={f.ar} min={0} max={4} onChange={upd('ar')} />
        <Field label="My bet (optional)">
          <input className="input" type="text" placeholder="over 2.5 goals" value={mine} onChange={(e) => setMine(e.target.value)} />
        </Field>
        <Field label="Ignore picks above (%)">
          <input className="input" type="number" inputMode="numeric" min={50} max={100} value={maxPct} onChange={(e) => setMaxPct(e.target.value)} />
        </Field>
        <button className="btn" type="submit" disabled={loading}>{loading ? 'Finding…' : 'Find live picks'}</button>
        {err && <div className="badge warn">{err}</div>}
      </form>
      {res && (
        <div className="stack">
          {shown && <div className="muted">{res.basis}</div>}
          {shown && <div className="muted">Updated at {at}</div>}
          {res.mine && <PickCard head="Your bet" pick={res.mine} />}
          {shown && <h2>Top live picks</h2>}
          {shown && res.top.slice(0, 5).map((p) => <PickCard key={`${p.group}|${p.label}`} pick={p} chip />)}
          <div className="muted">{res.note}</div>
          <div className="muted">Update the score and tap again to refresh. Live picks can be stale by the time you type them.</div>
        </div>
      )}
    </main>
  );
}
