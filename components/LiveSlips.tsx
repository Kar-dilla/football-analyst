'use client';

import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { allCompetitions } from '@/lib/registry';
import { espnSlug } from '@/lib/livefeed';
import { MAX_LEGS_LIMIT, buildSlips, normalizeFilters } from '@/lib/dailySlips';
import type { DailyFilters, DailyLeg, DailySlip } from '@/lib/dailySlips';
import type { SlipLeg } from '@/lib/slip';
import { useApp } from '@/components/AppProvider';
import { EmptyState, Notice, Stat } from '@/components/ui';

interface Scan { slips: DailySlip[]; legs: number; builtAt: number; filters: DailyFilters }
// Form values as typed (percent for probabilities). Kept in component state only.
interface Form { minP: string; maxP: string; minMin: string; maxMin: string; maxLegs: string; minOdds: string; target: string; onlyTarget: boolean; markets: string[]; allLeagues: boolean; leagues: string[]; full: boolean; shared: string }
// Module-level so the last scan survives switching tabs (lost only on a full page reload).
let cache: Scan | null = null;

const MARKETS: string[] = ['goals', 'btts', 'result', 'doublechance', 'nextgoal', 'corners', 'cards'];
const MARKET_LABELS: Record<string, string> = {
  goals: 'Goals', btts: 'Both teams to score', result: 'Result', doublechance: 'Double chance',
  nextgoal: 'Next goal', corners: 'Corners', cards: 'Cards',
};
const FORM0: Form = { minP: '80', maxP: '88', minMin: '15', maxMin: '80', maxLegs: '20', minOdds: '1.10', target: '', onlyTarget: false, markets: MARKETS, allLeagues: true, leagues: [], full: false, shared: '0' };
const pct = (x: number) => (x * 100).toFixed(1);
const pc = (x: number) => Number((x * 100).toFixed(1));
// Win chance of a slip as a fraction, taken from 1/odds so very small chances keep their precision.
const winOf = (s: DailySlip) => (s.odds > 0 ? 1 / s.odds : s.probability);
const winText = (s: DailySlip) => (winOf(s) < 0.05 ? (winOf(s) * 100).toFixed(2) : pct(s.probability));
const oneIn = (s: DailySlip) => (winOf(s) > 0 ? Math.round(1 / winOf(s)).toLocaleString() : '');
const num = (s: string) => (s.trim() === '' ? NaN : Number(s));
const flip = (xs: string[], x: string) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);
// Latest time any leg of the slip was priced (falls back to the time the scan finished).
const pricedText = (s: DailySlip, fallback: number) => {
  const ts = s.legs.map((l) => Date.parse(l.pricedAt ?? '')).filter((x) => Number.isFinite(x));
  return new Date(ts.length ? Math.max(...ts) : fallback).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};
const ROW = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 4px' } as const;

function Tick({ checked, onChange, children }: { checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label className="row" style={{ gap: 6, alignItems: 'center' }}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{children}</span>
    </label>
  );
}

export default function LiveSlips() {
  const app = useApp() as unknown as { addLeg?: (leg: SlipLeg) => void };
  const [scan, setScan] = useState<Scan | null>(cache);
  const [progress, setProgress] = useState<{ n: number; m: number; found: number } | null>(null);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState<Form>(FORM0);
  const cancelled = useRef(false);
  const ctl = useRef<AbortController | null>(null);
  const scannable = allCompetitions().filter((c) => espnSlug(c.id));
  const set = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));

  // Max legs left at its default (or empty) is sent as "not given", so a custom target above 15 can use 40 legs.
  const toFilters = (tv: number): DailyFilters =>
    normalizeFilters({
      minP: num(form.minP) / 100, maxP: num(form.maxP) / 100, dayOffsets: [0], mixDays: false,
      maxLegs: form.maxLegs.trim() === '' || form.maxLegs.trim() === FORM0.maxLegs ? undefined : num(form.maxLegs),
      minLegOdds: num(form.minOdds), fullStatsOnly: form.full,
      targetOdds: tv, onlyTarget: form.onlyTarget, maxShared: num(form.shared),
    });

  async function run() {
    if (progress) return;
    const tv = form.target.trim() === '' ? 0 : Number(form.target);
    const lo = num(form.minMin);
    const hi = num(form.maxMin);
    if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo < 1 || hi > 120 || lo > hi) { setMsg('Check the minute range (1 to 120, from not after to).'); return; }
    if (!form.allLeagues && form.leagues.length === 0) { setMsg('Tick at least one league.'); return; }
    if (form.markets.length === 0) { setMsg('Tick at least one market.'); return; }
    if (tv !== 0 && !(tv >= 1.5 && tv <= 100)) { setMsg('My target odds must be between 1.5 and 100.'); return; }
    if (form.onlyTarget && tv === 0) { setMsg('Fill in My target odds to use Only my target.'); return; }
    const f = toFilters(tv);
    const leagues = scannable.filter((c) => form.allLeagues || form.leagues.includes(c.id));
    // One leg per home|away (the highest probability wins).
    const merged = new Map<string, DailyLeg>();
    cancelled.current = false;
    setMsg('');
    for (let i = 0; i < leagues.length; i++) {
      if (cancelled.current) break;
      setProgress({ n: i + 1, m: leagues.length, found: merged.size });
      try {
        ctl.current = new AbortController();
        const res = await fetch('/api/live-slips', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ competitionId: leagues[i].id, filters: { minP: f.minP, maxP: f.maxP, markets: form.markets, minLegOdds: f.minLegOdds, minMinute: lo, maxMinute: hi, fullStatsOnly: form.full } }),
          signal: ctl.current.signal,
        });
        if (res.ok) {
          const j = (await res.json()) as { legs?: DailyLeg[] };
          for (const l of Array.isArray(j.legs) ? j.legs : []) {
            if (!l || typeof l.probability !== 'number') continue;
            const k = `${l.home}|${l.away}`.trim().toLowerCase();
            const cur = merged.get(k);
            if (!cur || l.probability > cur.probability) merged.set(k, l);
          }
        }
      } catch {
        // skip a league that failed or was cancelled
      }
    }
    setProgress(null);
    if (cancelled.current) { setMsg('Scan cancelled. Showing the previous result.'); return; }
    const legs = Array.from(merged.values());
    const next: Scan = { slips: buildSlips(legs, f), legs: legs.length, builtAt: Date.now(), filters: f };
    cache = next;
    setScan(next);
  }

  function cancel() {
    cancelled.current = true;
    ctl.current?.abort();
  }

  function addSlip(s: DailySlip) {
    const add = app.addLeg;
    if (typeof add !== 'function') { setMsg('Could not add: the slip helper was not found.'); return; }
    for (const l of s.legs) {
      add({ id: `live-${l.competitionId}-${l.home}-${l.away}-${l.label}`, match: l.match, label: l.label, probability: l.probability } as SlipLeg);
    }
    setMsg(`Added ${s.legs.length} ${s.legs.length === 1 ? 'leg' : 'legs'} to your slip.`);
  }

  const numBox = { width: 72 } as const;
  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="h2">Live slips</span>
        {scan && <span className="label">Built {new Date(scan.builtAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
      </div>
      <details>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Filters</summary>
        <div className="stack" style={{ paddingTop: 8 }}>
          <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
            <label className="label">Min % <input type="number" inputMode="decimal" min={55} max={99} step={1} style={numBox} value={form.minP} onChange={(e) => set({ minP: e.target.value })} /></label>
            <label className="label">Max % <input type="number" inputMode="decimal" min={55} max={99} step={1} style={numBox} value={form.maxP} onChange={(e) => set({ maxP: e.target.value })} /></label>
            <label className="label">Minute from <input type="number" inputMode="numeric" min={1} max={120} step={1} style={numBox} value={form.minMin} onChange={(e) => set({ minMin: e.target.value })} /></label>
            <label className="label">Minute to <input type="number" inputMode="numeric" min={1} max={120} step={1} style={numBox} value={form.maxMin} onChange={(e) => set({ maxMin: e.target.value })} /></label>
            <label className="label">Max legs <input type="number" inputMode="numeric" min={1} max={MAX_LEGS_LIMIT} step={1} style={numBox} value={form.maxLegs} onChange={(e) => set({ maxLegs: e.target.value })} /></label>
            <label className="label">Min fair odds per leg <input type="number" inputMode="decimal" min={1} step={0.01} style={numBox} value={form.minOdds} onChange={(e) => set({ minOdds: e.target.value })} /></label>
            <label className="label">My target odds <input type="number" inputMode="decimal" min={1.5} max={100} step={0.1} placeholder="e.g. 3.5" style={numBox} value={form.target} onChange={(e) => set({ target: e.target.value })} /></label>
          </div>
          <label className="label">Max legs shared between slips <input type="number" inputMode="numeric" min={0} max={10} step={1} style={numBox} value={form.shared} onChange={(e) => set({ shared: e.target.value })} /></label>
          <div className="muted">0 = every slip uses different legs</div>
          <Tick checked={form.onlyTarget} onChange={() => set({ onlyTarget: !form.onlyTarget })}>Only my target</Tick>
          <div className="label">Markets</div>
          <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
            {MARKETS.map((m) => (
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
          <div className="muted">Every leg stays at 55% or more, whatever you enter. Only games in play are used.</div>
          <div><button type="button" className="btn ghost" onClick={() => { setForm(FORM0); setMsg(''); }}>Reset</button></div>
        </div>
      </details>
      <div className="row">
        <button type="button" className="btn" disabled={!!progress} onClick={run}>Build live slips</button>
        {scan && !progress && <button type="button" className="btn ghost" onClick={run}>Refresh</button>}
        {progress && <button type="button" className="btn ghost" onClick={cancel}>Cancel</button>}
      </div>
      {progress && <div className="muted">Scanning {progress.n} of {progress.m} leagues... {progress.found} live matches found</div>}
      {msg && <Notice tone="info">{msg}</Notice>}
      {scan && scan.legs === 0 && <EmptyState title="No live games with qualifying picks right now." />}
      {scan && scan.legs > 0 && scan.slips.map((s) => (
        <div key={`${s.day ?? ''}-${s.target}`} className="card flat stack">
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
              </div>
              <div className="muted">About 1 in {oneIn(s)}</div>
              <div className="muted">{s.note}</div>
              {(s.sharedWith ?? []).filter((x) => x.count > 0).map((x) => (
                <div key={x.target} className="muted" style={{ color: '#b45309', fontWeight: 600 }}>Shares {x.count} {x.count === 1 ? 'leg' : 'legs'} with the ~{x.target} slip</div>
              ))}
              <div className="label">Legs between {pc(scan.filters.minP)}% and {pc(scan.filters.maxP)}%</div>
              <div>
                {s.legs.map((l) => (
                  <div key={l.match + l.label} style={ROW}>
                    <div style={{ minWidth: 0 }}>
                      <div className="label">{l.match}</div>
                      <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{l.label}</div>
                      {l.minute !== undefined && <div className="label">min {l.minute}{l.score ? `, ${l.score}` : ''}</div>}
                    </div>
                    <span className="num" style={{ fontWeight: 700, textAlign: 'right' }}>{Math.round(l.probability * 100)}%</span>
                  </div>
                ))}
              </div>
              <button type="button" className="btn" onClick={() => addSlip(s)}>Add to slip</button>
            </>
          )}
          <div className="label">Priced at {pricedText(s, scan.builtAt)}</div>
          <div className="muted" style={{ color: '#b45309', fontWeight: 600 }}>Live prices go stale. Refresh before you play.</div>
        </div>
      ))}
      {scan && scan.legs > 0 && <div className="muted">Fair odds from the model, not bookmaker prices. The live model is untested. No guarantees.</div>}
    </div>
  );
}
