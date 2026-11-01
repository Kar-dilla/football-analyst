'use client';

import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { allCompetitions } from '@/lib/registry';
import { espnSlug } from '@/lib/livefeed';
import { ALL_MARKETS, buildSlips, normalizeFilters } from '@/lib/dailySlips';
import type { DailyFilters, DailyLeg, DailySlip } from '@/lib/dailySlips';
import type { SlipLeg } from '@/lib/slip';
import { useApp } from '@/components/AppProvider';
import { EmptyState, Notice, Stat } from '@/components/ui';

interface Scan { slips: DailySlip[]; legs: number; builtAt: number; filters: DailyFilters }
// Form values as typed (percent for probabilities). Kept in component state only.
interface Form { minP: string; maxP: string; maxLegs: string; minOdds: string; markets: string[]; allLeagues: boolean; leagues: string[]; day: 'today' | 'tomorrow'; full: boolean }
// Module-level so the last scan survives switching tabs (lost only on a full page reload).
let cache: Scan | null = null;

const FORM0: Form = { minP: '80', maxP: '88', maxLegs: '20', minOdds: '1.10', markets: ALL_MARKETS, allLeagues: true, leagues: [], day: 'today', full: false };
const MARKET_LABELS: Record<string, string> = {
  goals: 'Goals', btts: 'Both teams to score', result: 'Result', doublechance: 'Double chance',
  firsthalf: '1st half goals', secondhalf: '2nd half goals', corners: 'Corners', cards: 'Cards',
};
const pct = (x: number) => (x * 100).toFixed(1);
const pc = (x: number) => Number((x * 100).toFixed(1));
const num = (s: string) => (s.trim() === '' ? NaN : Number(s));
const flip = (xs: string[], x: string) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);
const ROW = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 4px' } as const;

function Tick({ checked, onChange, children }: { checked: boolean; onChange: () => void; children: ReactNode }) {
  return (
    <label className="row" style={{ gap: 6, alignItems: 'center' }}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{children}</span>
    </label>
  );
}

export default function DailySlips() {
  const app = useApp() as unknown as { addLeg?: (leg: SlipLeg) => void };
  const [scan, setScan] = useState<Scan | null>(cache);
  const [progress, setProgress] = useState<{ n: number; m: number; found: number } | null>(null);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState<Form>(FORM0);
  const cancelled = useRef(false);
  const ctl = useRef<AbortController | null>(null);
  const scannable = allCompetitions().filter((c) => espnSlug(c.id));

  const set = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));
  const toFilters = (): DailyFilters =>
    normalizeFilters({
      minP: num(form.minP) / 100, maxP: num(form.maxP) / 100, markets: form.markets,
      leagues: form.allLeagues ? [] : form.leagues, day: form.day,
      maxLegs: num(form.maxLegs), minLegOdds: num(form.minOdds), fullStatsOnly: form.full,
    });

  async function run() {
    if (progress) return;
    if (!form.allLeagues && form.leagues.length === 0) { setMsg('Tick at least one league.'); return; }
    if (form.markets.length === 0) { setMsg('Tick at least one market.'); return; }
    const f = toFilters();
    const leagues = scannable.filter((c) => f.leagues.length === 0 || f.leagues.includes(c.id));
    const tz = -new Date().getTimezoneOffset(); // minutes east of UTC, as fetchFixtures expects
    const legs: DailyLeg[] = [];
    cancelled.current = false;
    setMsg('');
    for (let i = 0; i < leagues.length; i++) {
      if (cancelled.current) break;
      setProgress({ n: i + 1, m: leagues.length, found: legs.length });
      try {
        ctl.current = new AbortController();
        const res = await fetch('/api/daily', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ competitionId: leagues[i].id, tz, filters: f }),
          signal: ctl.current.signal,
        });
        if (res.ok) {
          const j = (await res.json()) as { legs?: DailyLeg[] };
          if (Array.isArray(j.legs)) legs.push(...j.legs);
        }
      } catch {
        // skip a league that failed or was cancelled
      }
    }
    setProgress(null);
    if (cancelled.current) { setMsg('Scan cancelled. Showing the previous result.'); return; }
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
      add({ id: `daily-${l.competitionId}-${l.home}-${l.away}-${l.label}`, match: l.match, label: l.label, probability: l.probability } as SlipLeg);
    }
    setMsg(`Added ${s.legs.length} ${s.legs.length === 1 ? 'leg' : 'legs'} to your slip.`);
  }

  const numBox = { width: 72 } as const;
  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="h2">Daily slips</span>
        {scan && <span className="label">Built {new Date(scan.builtAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
      </div>
      <details>
        <summary style={{ cursor: 'pointer', fontWeight: 700 }}>Filters</summary>
        <div className="stack" style={{ paddingTop: 8 }}>
          <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
            <label className="label">Min % <input type="number" inputMode="decimal" min={55} max={89} step={1} style={numBox} value={form.minP} onChange={(e) => set({ minP: e.target.value })} /></label>
            <label className="label">Max % <input type="number" inputMode="decimal" min={55} max={89} step={1} style={numBox} value={form.maxP} onChange={(e) => set({ maxP: e.target.value })} /></label>
            <label className="label">Max legs <input type="number" inputMode="numeric" min={1} max={20} step={1} style={numBox} value={form.maxLegs} onChange={(e) => set({ maxLegs: e.target.value })} /></label>
            <label className="label">Min fair odds per leg <input type="number" inputMode="decimal" min={1} step={0.01} style={numBox} value={form.minOdds} onChange={(e) => set({ minOdds: e.target.value })} /></label>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className={form.day === 'today' ? 'btn' : 'btn ghost'} onClick={() => set({ day: 'today' })}>Today</button>
            <button type="button" className={form.day === 'tomorrow' ? 'btn' : 'btn ghost'} onClick={() => set({ day: 'tomorrow' })}>Tomorrow</button>
          </div>
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
          <div className="muted">Every leg stays at 55% or more and below 90%, whatever you enter.</div>
          <div><button type="button" className="btn ghost" onClick={() => { setForm(FORM0); setMsg(''); }}>Reset</button></div>
        </div>
      </details>
      <div className="row">
        <button type="button" className="btn" disabled={!!progress} onClick={run}>Build {form.day === 'tomorrow' ? "tomorrow's" : "today's"} slips</button>
        {scan && !progress && <button type="button" className="btn ghost" onClick={run}>Refresh</button>}
        {progress && <button type="button" className="btn ghost" onClick={cancel}>Cancel</button>}
      </div>
      {progress && <div className="muted">Scanning {progress.n} of {progress.m} leagues... {progress.found} matches found</div>}
      {msg && <Notice tone="info">{msg}</Notice>}
      {scan && scan.legs === 0 && <EmptyState title="No games with qualifying picks today" />}
      {scan && scan.legs > 0 && scan.slips.map((s) => (
        <div key={s.target} className="card flat stack">
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
                <Stat label="Win chance" value={`${pct(s.probability)}%`} tone={s.probability < 0.5 ? 'warn' : 'ok'} />
              </div>
              <div className="muted">{s.note}</div>
              <div className="label">Legs between {pc(scan.filters.minP)}% and {pc(scan.filters.maxP)}%</div>
              <div>
                {s.legs.map((l) => (
                  <div key={l.match + l.label} style={ROW}>
                    <div style={{ minWidth: 0 }}>
                      <div className="label">{l.match}</div>
                      <div style={{ fontWeight: 700, overflowWrap: 'anywhere' }}>{l.label}</div>
                    </div>
                    <span className="num" style={{ fontWeight: 700 }}>{Math.round(l.probability * 100)}%</span>
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
  );
}
