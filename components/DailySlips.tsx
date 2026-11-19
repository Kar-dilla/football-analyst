'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { allCompetitions } from '@/lib/registry';
import { espnSlug } from '@/lib/livefeed';
import { ALL_MARKETS, HARD_DRAW_MAX, HARD_DRAW_MIN, HARD_MAX_P, HARD_MIN_P, MAX_LEGS_LIMIT, MAX_WINDOW_MS, buildDrawSlips, buildSlips, normalizeFilters, windowOffsets } from '@/lib/dailySlips';
import type { DailyFilters, DailyLeg, DailySlip } from '@/lib/dailySlips';
import type { SlipLeg } from '@/lib/slip';
import { useApp } from '@/components/AppProvider';
import { fetchPrices, priceKey } from '@/lib/pricesClient';
import type { Price } from '@/lib/pricesClient';
import { DAILY_KEY, loadStored, saveStored } from '@/lib/slipStore';
import { EmptyState, Notice, Stat } from '@/components/ui';

// drawSlips = draw-only slips (empty unless draw slips were on); draws = draw legs found. scanned = the filters the scan itself used (a rebuild changes filters, never scanned).
interface Scan { slips: DailySlip[]; legs: number; games: number; builtAt: number; filters: DailyFilters; drawSlips: DailySlip[]; draws: number; scanned: DailyFilters }
interface Days { today: boolean; tomorrow: boolean; range: 0 | 3 | 7 }
// Form values as typed (percent for probabilities). from/to = datetime-local values (local time). shared = max legs shared between slips.
interface Form { minP: string; maxP: string; maxLegs: string; minOdds: string; target: string; onlyTarget: boolean; mix: boolean; markets: string[]; allLeagues: boolean; leagues: string[]; days: Days; full: boolean; from: string; to: string; draws: boolean; drawMin: string; drawMax: string; shared: string }
// What is kept: the last scan, the games it collected (games = normal legs, drawGames = draw legs) and the filter form.
interface Store { builtAt: number; scan: Scan | null; games: DailyLeg[]; drawGames: DailyLeg[]; form: Form }
// Module-level so everything survives switching tabs; it is also saved to localStorage (see lib/slipStore.ts) so it survives a reload.
let cache: Store | null = null;

// markets: ALL_MARKETS already includes handicap, fhdc and shdc, so they are ticked by default and by Reset.
const FORM0: Form = { minP: '80', maxP: '88', maxLegs: '20', minOdds: '1.10', target: '', onlyTarget: false, mix: false, markets: ALL_MARKETS, allLeagues: true, leagues: [], days: { today: true, tomorrow: false, range: 0 }, full: false, from: '', to: '', draws: false, drawMin: '25', drawMax: '45', shared: '0' };
const MARKET_LABELS: Record<string, string> = {
  goals: 'Goals', btts: 'Both teams to score', result: 'Result', doublechance: 'Double chance',
  firsthalf: '1st half goals', secondhalf: '2nd half goals', corners: 'Corners', cards: 'Cards',
  handicap: 'Handicap', fhdc: '1st half double chance', shdc: '2nd half double chance',
};
// Saved form values are checked field by field; anything of the wrong type falls back to its default.
function mergeForm(raw: unknown): Form {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const base = FORM0 as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { ...base };
  for (const k of Object.keys(base)) {
    if (k === 'days') continue;
    const a = r[k];
    const b = base[k];
    if (Array.isArray(b) ? Array.isArray(a) && a.every((x) => typeof x === 'string') : typeof a === typeof b) out[k] = a;
  }
  const d = r.days as Partial<Days> | undefined;
  if (d && typeof d === 'object') out.days = { today: d.today === true, tomorrow: d.tomorrow === true, range: d.range === 3 || d.range === 7 ? d.range : 0 };
  return out as unknown as Form;
}
function remember(p: Partial<Store>): Store {
  const st: Store = { builtAt: 0, scan: null, games: [], drawGames: [], form: FORM0, ...(cache ?? {}), ...p };
  cache = st;
  return st;
}
const goodSlips = (v: unknown) => Array.isArray(v) && v.every((x) => !!x && Array.isArray(x.legs));
const okScan = (x: unknown): x is Scan => {
  const s = x as Partial<Scan> | null;
  return !!s && typeof s === 'object' && goodSlips(s.slips) && goodSlips(s.drawSlips ?? []) && typeof s.legs === 'number' && typeof s.builtAt === 'number' && !!s.filters && typeof s.filters === 'object' && !!s.scanned && typeof s.scanned === 'object';
};
const legsOf = (v: unknown): DailyLeg[] => (Array.isArray(v) ? v.filter((l) => !!l && typeof l.probability === 'number') : []);
// True when the current filters need games the saved scan never looked at (so a rebuild would be wrong and a new scan is needed).
function changed(cur: DailyFilters, old: DailyFilters, builtAt: number): boolean {
  const sub = (a: string[], b: string[]) => a.every((x) => b.includes(x));
  const sameDays = cur.dayOffsets.join() === old.dayOffsets.join() && (cur.from ?? '') === (old.from ?? '') && (cur.to ?? '') === (old.to ?? '');
  const otherDay = !old.from && new Date(builtAt).toDateString() !== new Date().toDateString();
  const leaguesWider = old.leagues.length > 0 && (cur.leagues.length === 0 || !sub(cur.leagues, old.leagues));
  const drawsWider = !!cur.includeDraws && (!old.includeDraws || (cur.drawMinP ?? 0) < (old.drawMinP ?? 0) - 1e-9 || (cur.drawMaxP ?? 0) > (old.drawMaxP ?? 0) + 1e-9);
  return !sameDays || otherDay || leaguesWider || drawsWider || cur.minP < old.minP - 1e-9 || cur.maxP > old.maxP + 1e-9 || !sub(cur.markets, old.markets) || cur.minLegOdds < old.minLegOdds - 1e-9 || (cur.fullStatsOnly && !old.fullStatsOnly);
}
const pct = (x: number) => (x * 100).toFixed(1);
const pc = (x: number) => Number((x * 100).toFixed(1));
// Win chance of a slip as a fraction, taken from 1/odds so very small chances keep their precision.
const winOf = (s: DailySlip) => (s.odds > 0 ? 1 / s.odds : s.probability);
const winText = (s: DailySlip) => (winOf(s) < 0.05 ? (winOf(s) * 100).toFixed(2) : pct(s.probability));
const oneIn = (s: DailySlip) => (winOf(s) > 0 ? Math.round(1 / winOf(s)).toLocaleString() : '');
const num = (s: string) => (s.trim() === '' ? NaN : Number(s));
const flip = (xs: string[], x: string) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);
const offsetsOf = (d: Days): number[] => (d.range ? Array.from({ length: d.range }, (_, i) => i) : [...(d.today ? [0] : []), ...(d.tomorrow ? [1] : [])]);
const hm = (t: Date) => String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
const stamp = (iso: string) => {
  const t = new Date(iso);
  return t.toLocaleDateString([], { weekday: 'short' }) + ' ' + hm(t);
};
// 'Sat 24 Oct 15:00' in the user's local time.
const wstamp = (iso: string) => {
  const t = new Date(iso);
  return t.toLocaleDateString([], { weekday: 'short' }) + ' ' + t.getDate() + ' ' + t.toLocaleDateString([], { month: 'short' }) + ' ' + hm(t);
};
const dayLabel = (k: string) => {
  const [y, m, d] = k.split('-').map(Number);
  const t = new Date(y, m - 1, d);
  return Number.isNaN(t.getTime()) ? '' : t.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'short' });
};
const ROW = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 4px' } as const;

function Tick({ checked, onChange, disabled, children }: { checked: boolean; onChange: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <label className="row" style={{ gap: 6, alignItems: 'center', opacity: disabled ? 0.45 : 1 }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
      <span>{children}</span>
    </label>
  );
}

export default function DailySlips() {
  const app = useApp() as unknown as { addLeg?: (leg: SlipLeg) => void };
  const [scan, setScan] = useState<Scan | null>(cache?.scan ?? null);
  const [saved, setSaved] = useState<{ legs: DailyLeg[]; draws: DailyLeg[] }>({ legs: cache?.games ?? [], draws: cache?.drawGames ?? [] });
  const [progress, setProgress] = useState<{ n: number; m: number; found: number; d: number; k: number } | null>(null);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState<Form>(cache?.form ?? FORM0);
  const [prices, setPrices] = useState<Record<string, Price | null>>({});
  const [pricing, setPricing] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const cancelled = useRef(false);
  const ctl = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seen = useRef(form);
  const scannable = allCompetitions().filter((c) => espnSlug(c.id));

  const set = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));

  // On the client only: when nothing is held in memory, load the last saved scan, games and form.
  useEffect(() => {
    if (cache) return;
    const s = loadStored<Partial<Store>>(DAILY_KEY);
    if (!s) return;
    const raw: unknown = s.scan;
    const sc = okScan(raw) ? { ...raw, filters: normalizeFilters(raw.filters), scanned: normalizeFilters(raw.scanned), drawSlips: raw.drawSlips ?? [] } : null;
    const st = remember({ builtAt: sc ? sc.builtAt : 0, scan: sc, games: legsOf(s.games), drawGames: legsOf(s.drawGames), form: mergeForm(s.form) });
    setScan(st.scan);
    setSaved({ legs: st.games, draws: st.drawGames });
    seen.current = st.form;
    setForm(st.form);
  }, []);
  // Form changes are kept in memory at once and written to storage 400 ms later (or when the screen closes).
  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (cache) saveStored(DAILY_KEY, cache);
  };
  useEffect(() => {
    if (seen.current === form) return;
    seen.current = form;
    remember({ form });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, 400);
  }, [form]);
  useEffect(() => {
    const h = () => { if (timer.current) flush(); };
    const v = () => { if (document.visibilityState === 'hidden') h(); };
    window.addEventListener('pagehide', h);
    document.addEventListener('visibilitychange', v);
    return () => { window.removeEventListener('pagehide', h); document.removeEventListener('visibilitychange', v); h(); };
  }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Ticking a single day replaces a range; ticking a range replaces the single days.
  const pickDay = (k: 'today' | 'tomorrow') => {
    const d = form.days;
    const t = d.range ? false : d.today;
    const m = d.range ? false : d.tomorrow;
    set({ days: { today: k === 'today' ? !t : t, tomorrow: k === 'tomorrow' ? !m : m, range: 0 } });
  };
  const pickRange = (n: 3 | 7) => set({ days: { today: false, tomorrow: false, range: form.days.range === n ? 0 : n } });
  // Max legs left at its default (or empty) is sent as "not given", so a custom target above 15 can use 40 legs.
  const toFilters = (offsets: number[], tv: number, win?: { from: string; to: string }): DailyFilters =>
    normalizeFilters({
      minP: num(form.minP) / 100, maxP: num(form.maxP) / 100, markets: form.markets,
      leagues: form.allLeagues ? [] : form.leagues, dayOffsets: offsets,
      maxLegs: form.maxLegs.trim() === '' || form.maxLegs.trim() === FORM0.maxLegs ? undefined : num(form.maxLegs),
      minLegOdds: num(form.minOdds), fullStatsOnly: form.full,
      targetOdds: tv, onlyTarget: form.onlyTarget, mixDays: form.mix,
      includeDraws: form.draws, drawMinP: num(form.drawMin) / 100, drawMaxP: num(form.drawMax) / 100,
      maxShared: num(form.shared),
      from: win?.from, to: win?.to,
    });

  // Checks the form and returns the filters for a scan or a rebuild; null (with a message) when something is wrong.
  function prepare() {
    const tv = form.target.trim() === '' ? 0 : Number(form.target);
    const tz = -new Date().getTimezoneOffset(); // minutes east of UTC, as fetchFixtures expects
    // Custom window: converted from the user's local time to ISO UTC.
    let win: { from: string; to: string } | undefined;
    const hasF = form.from.trim() !== '';
    const hasT = form.to.trim() !== '';
    if (hasF || hasT) {
      if (!(hasF && hasT)) { setMsg('Fill in both From and To, or clear the window.'); return null; }
      const a = new Date(form.from).getTime();
      const b = new Date(form.to).getTime();
      if (!Number.isFinite(a) || !Number.isFinite(b)) { setMsg('Check the From and To dates.'); return null; }
      if (a >= b) { setMsg('From must be before To.'); return null; }
      if (b <= Date.now()) { setMsg('To must be in the future.'); return null; }
      if (b - a > MAX_WINDOW_MS) { setMsg('The window can be 7 days at most.'); return null; }
      win = { from: new Date(a).toISOString(), to: new Date(b).toISOString() };
    }
    const offsets = win ? windowOffsets(win.from, win.to, tz) : offsetsOf(form.days);
    if (offsets.length === 0) { setMsg(win ? 'No games kick off in this window' : 'Tick at least one day.'); return null; }
    if (!form.allLeagues && form.leagues.length === 0) { setMsg('Tick at least one league.'); return null; }
    if (form.markets.length === 0) { setMsg('Tick at least one market.'); return null; }
    if (tv !== 0 && !(tv >= 1.5 && tv <= 100)) { setMsg('My target odds must be between 1.5 and 100.'); return null; }
    if (form.onlyTarget && tv === 0) { setMsg('Fill in My target odds to use Only my target.'); return null; }
    return { f: toFilters(offsets, tv, win), tz, win, offsets };
  }

  async function run() {
    if (progress) return;
    const p = prepare();
    if (!p) return;
    const { f, tz, win, offsets } = p;
    const leagues = scannable.filter((c) => f.leagues.length === 0 || f.leagues.includes(c.id));
    // All days share one pool: one leg per home|away (the highest probability wins). Draw legs get their own pool.
    const merged = new Map<string, DailyLeg>();
    const mergedD = new Map<string, DailyLeg>();
    let games = 0;
    const merge = (ls: DailyLeg[], into: Map<string, DailyLeg> = merged) => {
      for (const l of ls) {
        if (!l || typeof l.probability !== 'number') continue;
        const k = `${l.home}|${l.away}`.trim().toLowerCase();
        const cur = into.get(k);
        if (!cur || l.probability > cur.probability) into.set(k, l);
      }
    };
    cancelled.current = false;
    setMsg('');
    sweep: for (let d = 0; d < offsets.length; d++) {
      for (let i = 0; i < leagues.length; i++) {
        if (cancelled.current) break sweep;
        setProgress({ n: i + 1, m: leagues.length, found: merged.size, d: d + 1, k: offsets.length });
        try {
          ctl.current = new AbortController();
          const res = await fetch('/api/daily', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ competitionId: leagues[i].id, tz, filters: f, dayOffset: offsets[d], ...(win ?? {}) }),
            signal: ctl.current.signal,
          });
          if (res.ok) {
            const j = (await res.json()) as { legs?: DailyLeg[]; games?: number; drawLegs?: DailyLeg[] };
            if (Array.isArray(j.legs)) merge(j.legs);
            if (f.includeDraws && Array.isArray(j.drawLegs)) merge(j.drawLegs, mergedD);
            if (typeof j.games === 'number') games += j.games;
          }
        } catch {
          // skip a league that failed or was cancelled
        }
      }
    }
    setProgress(null);
    if (cancelled.current) { setMsg('Scan cancelled. Showing the previous result.'); return; }
    const legs = Array.from(merged.values());
    const drawLegs = Array.from(mergedD.values());
    const next: Scan = { slips: buildSlips(legs, f), legs: legs.length, games, builtAt: Date.now(), filters: f, drawSlips: f.includeDraws ? buildDrawSlips(drawLegs, f) : [], draws: drawLegs.length, scanned: f };
    saveStored(DAILY_KEY, remember({ builtAt: next.builtAt, scan: next, games: legs, drawGames: drawLegs }));
    setScan(next);
    setSaved({ legs, draws: drawLegs });
    void loadPrices(next.slips.flatMap((s) => s.legs));
  }

  // Builds the slips again from the saved games with the current filters. No network call.
  function rebuild() {
    if (progress || !scan) return;
    const p = prepare();
    if (!p) return;
    const f = p.f;
    if (changed(f, scan.scanned, scan.builtAt)) { setMsg('Filters changed. Tap Build to scan again.'); return; }
    const was = scan.scanned;
    const keep = (l: DailyLeg) => (!l.market || !ALL_MARKETS.includes(l.market) || f.markets.includes(l.market)) && (f.minLegOdds <= was.minLegOdds || 1 / l.probability >= f.minLegOdds - 1e-9);
    const next: Scan = { ...scan, slips: buildSlips(saved.legs.filter(keep), f), filters: f, drawSlips: f.includeDraws ? buildDrawSlips(saved.draws, f) : [] };
    saveStored(DAILY_KEY, remember({ scan: next }));
    setScan(next);
    setMsg('Rebuilt from the saved games. No new scan.');
  }

  async function loadPrices(legs: DailyLeg[]) {
    setPricing(true);
    try { const p = await fetchPrices(legs); setPrices((o) => ({ ...o, ...p })); } finally { setPricing(false); }
  }

  function cancel() {
    cancelled.current = true;
    ctl.current?.abort();
  }

  function addSlip(s: DailySlip) {
    const add = app.addLeg;
    if (typeof add !== 'function') { setMsg('Could not add: the slip helper was not found.'); return; }
    for (const l of s.legs) {
      add({ id: `daily-${l.competitionId}-${l.home}-${l.away}-${l.label}`, match: l.match, label: l.label, probability: l.probability } as SlipLeg);
    }
    setMsg(`Added ${s.legs.length} ${s.legs.length === 1 ? 'leg' : 'legs'} to your slip.`);
  }

  const numBox = { width: 72 } as const;
  const dy = form.days;
  const win = form.from.trim() !== '' && form.to.trim() !== '';
  const buildLabel = win ? 'Build slips for this window' : dy.range ? `Build slips for the next ${dy.range} days` : dy.tomorrow && !dy.today ? "Build tomorrow's slips" : dy.tomorrow ? 'Build slips for today and tomorrow' : "Build today's slips";
  const todayOnly = !scan || (scan.filters.dayOffsets.length === 1 && scan.filters.dayOffsets[0] === 0);
  const winFrom = scan?.filters.from;
  const winTo = scan?.filters.to;
  const hasGames = saved.legs.length > 0 || saved.draws.length > 0;
  const mins = scan ? Math.max(0, Math.floor((now - scan.builtAt) / 60000)) : 0;
  const ageTxt = mins < 1 ? 'just now' : mins < 60 ? `${mins} min ago` : `${Math.floor(mins / 60)} h ago`;
  const stale = !!scan && now - scan.builtAt > 3600000;
  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="h2">Daily slips</span>
        {scan && <span className="label">Built {new Date(scan.builtAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({ageTxt})</span>}
      </div>
      {stale && <div className="muted" style={{ color: '#b45309', fontWeight: 600 }}>Older than an hour. Games may have started. Refresh before you play.</div>}
      <details>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Filters</summary>
        <div className="stack" style={{ paddingTop: 8 }}>
          <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
            <label className="label">Min % <input type="number" inputMode="decimal" min={55} max={89} step={1} style={numBox} value={form.minP} onChange={(e) => set({ minP: e.target.value })} /></label>
            <label className="label">Max % <input type="number" inputMode="decimal" min={55} max={89} step={1} style={numBox} value={form.maxP} onChange={(e) => set({ maxP: e.target.value })} /></label>
            <label className="label">Max legs <input type="number" inputMode="numeric" min={1} max={MAX_LEGS_LIMIT} step={1} style={numBox} value={form.maxLegs} onChange={(e) => set({ maxLegs: e.target.value })} /></label>
            <label className="label">Min fair odds per leg <input type="number" inputMode="decimal" min={1} step={0.01} style={numBox} value={form.minOdds} onChange={(e) => set({ minOdds: e.target.value })} /></label>
            <label className="label">My target odds <input type="number" inputMode="decimal" min={1.5} max={100} step={0.1} placeholder="e.g. 3.5" style={numBox} value={form.target} onChange={(e) => set({ target: e.target.value })} /></label>
          </div>
          <label className="label">Max legs shared between slips <input type="number" inputMode="numeric" min={0} max={10} step={1} style={numBox} value={form.shared} onChange={(e) => set({ shared: e.target.value })} /></label>
          <div className="muted">0 = every slip uses different legs</div>
          <Tick checked={form.onlyTarget} onChange={() => set({ onlyTarget: !form.onlyTarget })}>Only my target</Tick>
          <Tick checked={form.draws} onChange={() => set({ draws: !form.draws })}>Draw slips (separate)</Tick>
          <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
            <label className="label">Draw min % <input type="number" inputMode="decimal" min={HARD_DRAW_MIN * 100} max={HARD_DRAW_MAX * 100} step={1} style={numBox} disabled={!form.draws} value={form.drawMin} onChange={(e) => set({ drawMin: e.target.value })} /></label>
            <label className="label">Draw max % <input type="number" inputMode="decimal" min={HARD_DRAW_MIN * 100} max={HARD_DRAW_MAX * 100} step={1} style={numBox} disabled={!form.draws} value={form.drawMax} onChange={(e) => set({ drawMax: e.target.value })} /></label>
          </div>
          <div className="label">Days</div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
            <Tick disabled={win} checked={dy.today} onChange={() => pickDay('today')}>Today</Tick>
            <Tick disabled={win} checked={dy.tomorrow} onChange={() => pickDay('tomorrow')}>Tomorrow</Tick>
            <Tick disabled={win} checked={dy.range === 3} onChange={() => pickRange(3)}>Next 3 days</Tick>
            <Tick disabled={win} checked={dy.range === 7} onChange={() => pickRange(7)}>Next 7 days</Tick>
          </div>
          <Tick checked={form.mix} onChange={() => set({ mix: !form.mix })}>Mix games across days</Tick>
          <div className="label">Custom window</div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
            <label className="label">From <input type="datetime-local" value={form.from} onChange={(e) => set({ from: e.target.value })} /></label>
            <label className="label">To <input type="datetime-local" value={form.to} onChange={(e) => set({ to: e.target.value })} /></label>
            <button type="button" className="btn ghost" onClick={() => set({ from: '', to: '' })}>Clear window</button>
          </div>
          {win && <div className="muted">Using custom window</div>}
          <div className="label">Markets</div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
            {ALL_MARKETS.map((m) => (
              <Tick key={m} checked={form.markets.includes(m)} onChange={() => set({ markets: flip(form.markets, m) })}>{MARKET_LABELS[m] ?? m}</Tick>
            ))}
          </div>
          <div className="label">Leagues</div>
          <Tick checked={form.allLeagues} onChange={() => set({ allLeagues: !form.allLeagues })}>All leagues</Tick>
          {!form.allLeagues && (
            <div style={{ maxHeight: 160, overflowY: 'auto' }}>
              {scannable.map((c) => (
                <Tick key={c.id} checked={form.leagues.includes(c.id)} onChange={() => set({ leagues: flip(form.leagues, c.id) })}>{c.name}</Tick>
              ))}
            </div>
          )}
          <Tick checked={form.full} onChange={() => set({ full: !form.full })}>Full-stats leagues only</Tick>
          <div className="muted">Every leg stays at {Math.round(HARD_MIN_P * 100)}% or more and below {Math.round(HARD_MAX_P * 100)}%, whatever you enter.</div>
          <div className="muted">Draw legs stay between {Math.round(HARD_DRAW_MIN * 100)}% and {Math.round(HARD_DRAW_MAX * 100)}% and never mix with the other legs.</div>
          <div><button type="button" className="btn ghost" onClick={() => { setForm(FORM0); setMsg(''); }}>Reset</button></div>
        </div>
      </details>
      <div className="row">
        <button type="button" className="btn" disabled={!!progress} onClick={run}>{buildLabel}</button>
        {scan && !progress && <button type="button" className="btn ghost" onClick={run}>Refresh</button>}
        {hasGames && !progress && <button type="button" className="btn ghost" onClick={rebuild}>Rebuild</button>}
        {progress && <button type="button" className="btn ghost" onClick={cancel}>Cancel</button>}
      </div>
      {progress && <div className="muted">Scanning {progress.n} of {progress.m} leagues{progress.k > 1 ? `, day ${progress.d} of ${progress.k}` : ''}... {progress.found} matches found</div>}
      {msg && <Notice tone="info">{msg}</Notice>}
      {scan && scan.legs === 0 && (
        <EmptyState title={winFrom ? (scan.games === 0 ? 'No games kick off in this window' : 'No games with qualifying picks in this window') : `No games with qualifying picks ${todayOnly ? 'today' : 'for these days'}`} />
      )}
      {scan && scan.legs > 0 && scan.slips.map((s) => (
        <div key={`${s.day ?? ''}-${s.target}`} className="card flat stack">
          {s.day ? <div className="label">{dayLabel(s.day)}</div> : null}
          {winFrom && winTo ? <div className="label">Games from {wstamp(winFrom)} to {wstamp(winTo)}</div> : null}
          {s.legs.length === 0 ? (
            <>
              <div className="h2">Target ~{s.target}</div>
              <div className="muted">{s.note}</div>
            </>
          ) : (
            <>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span className="h2">Target ~{s.target}</span>
                <span className="badge">{s.legs.length} {s.legs.length === 1 ? 'leg' : 'legs'}</span>
              </div>
              <div className="row" style={{ gap: 24 }}>
                <Stat label="Fair odds" value={s.odds.toFixed(2)} />
                <Stat label="Win chance" value={`${winText(s)}%`} tone={s.probability < 0.5 ? 'warn' : 'ok'} />
                {(() => {
                  const have = s.legs.map((l) => prices[priceKey(l)]).filter((x): x is Price => !!x);
                  if (have.length === 0) return pricing ? <Stat label="Bookmaker odds" value="..." /> : null;
                  const prod = have.reduce((a, x) => a * x.odd, 1);
                  return <Stat label={have.length === s.legs.length ? 'Bookmaker odds' : `Bookmaker odds (${have.length}/${s.legs.length} legs)`} value={prod.toFixed(2)} />;
                })()}
              </div>
              <div className="muted">About 1 in {oneIn(s)}</div>
              <div className="muted">{s.note}</div>
              {(s.sharedWith ?? []).filter((x) => x.count > 0).map((x) => (
                <div key={x.target} className="muted" style={{ color: '#b45309', fontWeight: 600 }}>Shares {x.count} {x.count === 1 ? 'leg' : 'legs'} with the ~{x.target} slip</div>
              ))}
              <div className="label">Legs between {pc(scan.filters.minP)}% and {pc(scan.filters.maxP)}%</div>
              {s.from && s.to && <div className="label">{stamp(s.from)} to {stamp(s.to)}</div>}
              <div className="muted">This slip settles after the last game</div>
              <div>
                {s.legs.map((l) => (
                  <div key={l.match + l.label} style={ROW}>
                    <div style={{ minWidth: 0 }}>
                      <div className="label">{l.match}</div>
                      <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{l.label}</div>
                    </div>
                    <span className="num" style={{ fontWeight: 700, textAlign: 'right' }}>{Math.round(l.probability * 100)}%{prices[priceKey(l)] && <span className="label" style={{ display: 'block' }}>@ {prices[priceKey(l)]?.odd.toFixed(2)} {prices[priceKey(l)]?.book}</span>}</span>
                  </div>
                ))}
              </div>
              <button type="button" className="btn" onClick={() => addSlip(s)}>Add to slip</button>
            </>
          )}
          <div className="muted">Fair odds from the model, not bookmaker prices. No guarantees.</div>
        </div>
      ))}
      {scan && scan.legs > 0 && (scan.filters.maxShared ?? 0) === 0 && (
        <div className="muted">{"Each leg is used in one slip only, so one failed leg can't sink the others."}</div>
      )}
      {scan && scan.filters.includeDraws && (
        <div className="stack">
          <span className="h2">Draw slips</span>
          {scan.drawSlips.every((s) => s.legs.length === 0) ? (
            <div className="muted">No draw legs today (found {scan.draws})</div>
          ) : scan.drawSlips.map((s) => (
            <div key={`draw-${s.day ?? ''}-${s.target}`} className="card flat stack">
              {s.day ? <div className="label">{dayLabel(s.day)}</div> : null}
              {s.legs.length === 0 ? (
                <>
                  <div className="h2">All draws</div>
                  <div className="muted">{s.note}</div>
                </>
              ) : (
                <>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <span className="h2">All draws</span>
                    <span className="badge">{s.legs.length} {s.legs.length === 1 ? 'leg' : 'legs'}</span>
                  </div>
                  <div className="row" style={{ gap: 24 }}>
                    <Stat label="Total odds" value={s.odds.toFixed(2)} />
                    <Stat label="Win chance" value={`${winText(s)}%`} tone="warn" />
                  </div>
                  <div className="muted">About 1 in {oneIn(s)}</div>
                  <div className="muted">{s.note}</div>
                  {s.from && s.to && <div className="label">{stamp(s.from)} to {stamp(s.to)}</div>}
                  <div>
                    {s.legs.map((l) => (
                      <div key={l.match + l.label} style={ROW}>
                        <div style={{ minWidth: 0 }}>
                          <div className="label">{l.match}</div>
                          <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{l.label}</div>
                        </div>
                        <span className="num" style={{ fontWeight: 700, textAlign: 'right' }}>{Math.round(l.probability * 100)}%</span>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="btn" onClick={() => addSlip(s)}>Add to slip</button>
                </>
              )}
              <div className="muted">Fair odds from the model, not bookmaker prices. No guarantees.</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
