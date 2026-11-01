'use client';

import { useRef, useState } from 'react';
import { allCompetitions } from '@/lib/registry';
import { espnSlug } from '@/lib/livefeed';
import { buildSlips } from '@/lib/dailySlips';
import type { DailyLeg, DailySlip } from '@/lib/dailySlips';
import type { SlipLeg } from '@/lib/slip';
import { useApp } from '@/components/AppProvider';
import { EmptyState, Notice, Stat } from '@/components/ui';

interface Scan { slips: DailySlip[]; legs: number; builtAt: number }
// Module-level so the last scan survives switching tabs (lost only on a full page reload).
let cache: Scan | null = null;

const pct = (x: number) => (x * 100).toFixed(1);
const ROW = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 4px' } as const;

export default function DailySlips() {
  const app = useApp() as unknown as { addLeg?: (leg: SlipLeg) => void };
  const [scan, setScan] = useState<Scan | null>(cache);
  const [progress, setProgress] = useState<{ n: number; m: number; found: number } | null>(null);
  const [msg, setMsg] = useState('');
  const cancelled = useRef(false);
  const ctl = useRef<AbortController | null>(null);

  async function run() {
    if (progress) return;
    const leagues = allCompetitions().filter((c) => espnSlug(c.id));
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
          body: JSON.stringify({ competitionId: leagues[i].id, tz }),
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
    const next: Scan = { slips: buildSlips(legs), legs: legs.length, builtAt: Date.now() };
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

  return (
    <div className="card stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <span className="h2">Daily slips</span>
        {scan && <span className="label">Built {new Date(scan.builtAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>}
      </div>
      <div className="row">
        <button type="button" className="btn" disabled={!!progress} onClick={run}>Build today&apos;s slips</button>
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
