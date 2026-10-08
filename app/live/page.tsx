'use client';

import { useEffect, useMemo, useState, type FormEvent, type KeyboardEvent } from 'react';
import type { TeamLive } from '@/lib/livefeed';
import { allCompetitions } from '@/lib/registry';
import { loadSettings } from '@/lib/settings';
import { useApp } from '@/components/AppProvider';
import LiveStats from '@/components/LiveStats';
import OddsCheck from '@/components/OddsCheck';
import { EmptyState, Field, Notice, PageHeader, Section, Skeleton, Stepper } from '@/components/ui';

type FeedStats = { home: TeamLive; away: TeamLive };
interface FeedMatch { home: string; away: string; minute: number | null; homeGoals: number; awayGoals: number; homeReds: number | null; awayReds: number | null; stats?: FeedStats | null }
interface LivePick { label: string; group: string; probability: number; fairOdds: number }
interface LiveResult { top: LivePick[]; mine: LivePick | null; basis: string; note: string; modelVersion?: string; pressure?: { tilt: number; weight: number; shareHome: number } }

const LEAGUE_KEY = 'fa_league_v1';
const MINFAIR_KEY = 'fa_minfair_v1';
const INIT = { minute: 1, hg: 0, ag: 0, hr: 0, ar: 0 };
type Key = keyof typeof INIT;
const clamp = (n: number, lo: number, hi: number) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : lo);
const parseFair = (v: string): number => { const n = parseFloat(v); return Number.isFinite(n) ? Math.min(3, Math.max(1.01, n)) : 1.1; };
const GRID2 = { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 } as const;
const SPLIT = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 } as const;
const ROW = { width: '100%', minHeight: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 4px', color: 'var(--text)', font: 'inherit', textAlign: 'left', cursor: 'pointer' } as const;
const noEnter = (e: KeyboardEvent<HTMLElement>) => { if (e.key === 'Enter') e.preventDefault(); };

export default function LivePage() {
  const { addLeg, notify } = useApp();
  const comps = useMemo(() => allCompetitions(), []);
  const [league, setLeague] = useState('');
  const [match, setMatch] = useState('');
  const [f, setF] = useState(INIT);
  const [mine, setMine] = useState('');
  const [maxPct, setMaxPct] = useState(100);
  const [minFair, setMinFair] = useState('1.10');
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [res, setRes] = useState<LiveResult | null>(null);
  const [at, setAt] = useState('');
  const [used, setUsed] = useState({ match: '', minute: 1, home: '' });
  const [feed, setFeed] = useState<{ comp: string; list: FeedMatch[]; msg: string; failed: boolean } | null>(null);
  const [feedBusy, setFeedBusy] = useState(false);
  const [redNote, setRedNote] = useState(false);
  const [picked, setPicked] = useState<{ home: string; away: string; stats: FeedStats; at: string } | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMsg, setSyncMsg] = useState('');

  useEffect(() => {
    setMaxPct(loadSettings().maxPct);
    try {
      const v = window.localStorage.getItem(LEAGUE_KEY) ?? '';
      if (v && allCompetitions().some((c) => c.id === v)) setLeague(v);
      const mf = window.localStorage.getItem(MINFAIR_KEY);
      if (mf) setMinFair(parseFair(mf).toFixed(2));
    } catch { /* storage unavailable */ }
  }, []);

  const upd = (k: Key) => (n: number) => setF((s) => ({ ...s, [k]: n }));
  function chooseLeague(id: string) {
    setLeague(id);
    setPicked(null);
    try { window.localStorage.setItem(LEAGUE_KEY, id); } catch { /* storage unavailable */ }
  }

  function changeMinFair(v: string) {
    setMinFair(v);
    try { window.localStorage.setItem(MINFAIR_KEY, v); } catch { /* storage unavailable */ }
  }

  function editMatch(v: string) {
    setMatch(v);
    if (picked && v.trim() !== `${picked.home} vs ${picked.away}`) setPicked(null);
  }

  async function loadFeed() {
    setFeedBusy(true);
    setRedNote(false);
    let next = { comp: league, list: [] as FeedMatch[], msg: '', failed: true };
    try {
      const d = await (await fetch(`/api/livefeed?comp=${encodeURIComponent(league)}`)).json();
      if (Array.isArray(d?.matches)) next = { comp: league, list: d.matches, msg: String(d.note || ''), failed: false };
    } catch { /* keep the failed state */ }
    setFeed(next);
    setFeedBusy(false);
  }

  function pickMatch(m: FeedMatch) {
    setMatch(`${m.home} vs ${m.away}`);
    setF((s) => ({
      ...s,
      ...(m.minute !== null ? { minute: clamp(m.minute, 1, 120) } : {}),
      hg: clamp(m.homeGoals, 0, 20),
      ag: clamp(m.awayGoals, 0, 20),
      ...(m.homeReds !== null ? { hr: clamp(m.homeReds, 0, 4) } : {}),
      ...(m.awayReds !== null ? { ar: clamp(m.awayReds, 0, 4) } : {}),
    }));
    setRedNote(m.homeReds === null || m.awayReds === null);
    setPicked(m.stats ? { home: m.home, away: m.away, stats: m.stats, at: new Date().toTimeString().slice(0, 8) } : null);
    setSyncMsg('');
    setFeed(null);
  }

  async function refreshFeed() {
    if (!picked || !league) return;
    setSyncBusy(true);
    let list = null as FeedMatch[] | null;
    try {
      const d = await (await fetch(`/api/livefeed?comp=${encodeURIComponent(league)}`)).json();
      if (Array.isArray(d?.matches)) list = d.matches;
    } catch { /* keep the failed state */ }
    const m = list?.find((x) => x.home === picked.home && x.away === picked.away);
    if (m) pickMatch(m);
    else setSyncMsg(list ? 'This game is no longer in the live list. It may have ended.' : 'Could not reach the live feed. Try again.');
    setSyncBusy(false);
  }

  async function run() {
    if (!league) return setErr('Choose a league.');
    if (!match.trim()) return setErr('Type the match, e.g. Arsenal vs Chelsea.');
    setErr('');
    setLoading(true);
    try {
      const st = { minute: clamp(f.minute, 1, 120), homeGoals: clamp(f.hg, 0, 20), awayGoals: clamp(f.ag, 0, 20), homeReds: clamp(f.hr, 0, 4), awayReds: clamp(f.ar, 0, 4) };
      const limit = clamp(maxPct, 50, 100);
      const live = picked && match.trim() === `${picked.home} vs ${picked.away}` ? picked : null;
      const body: Record<string, unknown> = { match: match.trim(), competitionId: league, state: live ? { ...st, stats: live.stats } : st, allowedGoals: loadSettings().allowed.goals, minFairOdds: parseFair(minFair) };
      if (mine.trim()) body.mine = mine.trim();
      if (limit < 100) body.maxProbability = limit / 100;
      const r = await fetch('/api/live', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await r.json().catch(() => null);
      if (!r.ok || !data || data.error) throw new Error((data && data.error) || `Request failed (${r.status})`);
      setRes(data as LiveResult);
      setAt(new Date().toTimeString().slice(0, 8));
      setUsed({ match: match.trim(), minute: st.minute, home: live ? live.home : '' });
    } catch (x) {
      setErr(x instanceof Error ? x.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  function add(p: LivePick) {
    const r = addLeg({ id: `${used.match}|${p.label}|live`, match: used.match, label: `${p.label} (live ${used.minute}')`, probability: p.probability });
    notify(r === 'added' ? 'Added to slip' : r === 'duplicate' ? 'Already on the slip' : 'Slip is full (30 legs)');
  }

  const card = (p: LivePick, own: boolean) => (
    <div key={`${own}|${p.group}|${p.label}`} className="card stack">
      {own && <div className="eyebrow">Your bet</div>}
      <div style={SPLIT}>
        <span className="h2" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{p.label}</span>
        <span className="num" style={{ fontSize: 30, fontWeight: 700 }}>{Math.round(p.probability * 100)}%</span>
      </div>
      <div className="row">
        {!own && <span className="chip">{p.group}</span>}
        <span className="label">Fair odds <span className="num">{p.fairOdds.toFixed(2)}</span></span>
      </div>
      <div className="meter" role="img" aria-label={`Probability ${Math.round(p.probability * 100)}%`}>
        <i style={{ width: `${Math.min(100, Math.max(0, p.probability * 100))}%` }} />
      </div>
      <OddsCheck fairOdds={p.fairOdds} />
      <button type="button" className="btn block" onClick={() => add(p)}>Add to slip</button>
    </div>
  );

  const shown = !!res && res.top.length > 0;
  const here = feed && feed.comp === league ? feed : null;

  return (
    <main>
      <PageHeader eyebrow="Live" title="Live picks" subtitle="Reprices the bets for the rest of the match." />
      <div className="stack">
        <form className="stack" onSubmit={(e: FormEvent) => { e.preventDefault(); run(); }}>
          <div className="card stack">
            <Field label="League">
              <select className="input" value={league} onChange={(e) => chooseLeague(e.target.value)}>
                <option value="" disabled>Choose league</option>
                {comps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <button type="button" className="btn secondary block" disabled={!league || feedBusy} onClick={loadFeed}>{feedBusy ? 'Loading…' : 'Fill from live feed'}</button>
            {here?.failed && <Notice tone="warn">Could not reach the live feed. Type the details instead.</Notice>}
            {here && !here.failed && here.list.length > 0 && (
              <div>
                {here.list.map((m, i) => (
                  <button key={`${m.home}|${m.away}|${i}`} type="button" className="card flat" style={ROW} onClick={() => pickMatch(m)}>
                    <span style={{ minWidth: 0, overflowWrap: 'anywhere', fontWeight: 600 }}>{m.home} vs {m.away}</span>
                    <span className="num muted">{`${m.minute ?? '?'}' · ${m.homeGoals}-${m.awayGoals}`}</span>
                  </button>
                ))}
              </div>
            )}
            {here && !here.failed && here.list.length === 0 && here.msg && <div className="muted">{here.msg}</div>}
            {redNote && <Notice tone="info">Red cards are not in the feed for this match. Check them yourself.</Notice>}
            <Field label="Match"><input className="input" type="text" placeholder="Arsenal vs Chelsea" value={match} onChange={(e) => editMatch(e.target.value)} /></Field>
          </div>

          <Section title="Match state" hint="minute, score, red cards">
            <div className="stack" onKeyDown={noEnter}>
              <Stepper label="Minute" min={1} max={120} value={f.minute} onChange={upd('minute')} />
              <div style={GRID2}>
                <Stepper label="Home goals" min={0} max={20} value={f.hg} onChange={upd('hg')} />
                <Stepper label="Away goals" min={0} max={20} value={f.ag} onChange={upd('ag')} />
              </div>
              <div style={GRID2}>
                <Stepper label="Home reds" min={0} max={4} value={f.hr} onChange={upd('hr')} />
                <Stepper label="Away reds" min={0} max={4} value={f.ar} onChange={upd('ar')} />
              </div>
            </div>
            {picked && (
              <div className="stack">
                <LiveStats home={picked.home} away={picked.away} stats={picked.stats} minute={f.minute} fetchedAt={picked.at} />
                <div className="row">
                  <button type="button" className="btn secondary sm" onClick={refreshFeed} disabled={syncBusy}>{syncBusy ? 'Loading…' : 'Refresh from feed'}</button>
                </div>
                {syncMsg && <Notice tone="warn">{syncMsg}</Notice>}
              </div>
            )}
          </Section>

          <div className="card stack">
            <Field label="My bet (optional)" hint="Type it like: over 2.5 goals">
              <input className="input" type="text" placeholder="over 2.5 goals" value={mine} onChange={(e) => setMine(e.target.value)} />
            </Field>
            <div onKeyDown={noEnter}><Stepper label="Ignore picks above (%)" min={50} max={100} value={maxPct} onChange={setMaxPct} /></div>
            <Field label="Hide picks paying below" hint="Fair odds under this are hidden because they pay almost nothing. 1.10 is a good start.">
              <input className="input" type="number" inputMode="decimal" step="0.01" min="1.01" max="3" value={minFair} onChange={(e) => changeMinFair(e.target.value)} />
            </Field>
            <button className="btn block" type="submit" disabled={loading}>{loading ? 'Pricing…' : 'Find live picks'}</button>
            {loading && <Skeleton lines={3} />}
          </div>
        </form>

        {err && <Notice tone="bad">{err}</Notice>}
        {res && (
          <div className="stack">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <div className="row">
                <span className="label">Updated at {at}</span>
                {res.modelVersion && <span className="chip">{res.modelVersion}</span>}
              </div>
              <button type="button" className="btn secondary sm" onClick={run} disabled={loading}>Refresh</button>
            </div>
            <div className="muted">{res.pressure ? `Pressure used: ${used.home || 'Home'} ${Math.round(50 + 50 * res.pressure.tilt)}% (weight ${res.pressure.weight.toFixed(2)})` : 'Match stats not used.'}</div>
            {shown && <div className="label">{res.basis}</div>}
            {res.mine && card(res.mine, true)}
            {shown
              ? <Section title="Top live picks">{res.top.slice(0, 3).map((p) => card(p, false))}</Section>
              : <EmptyState title="No live pick reaches 55%" body={res.note} />}
            {shown && <div className="muted">{res.note}</div>}
            <div className="label">Live picks can be stale by the time you type them. Update the score and tap Refresh.</div>
          </div>
        )}
        <Notice tone="info">Live mode uses pre-match stats and the score, minute and red cards you enter. The time, score and red-card effects are estimates and are untested. Bookmaker live odds are not known.</Notice>
      </div>
    </main>
  );
}
