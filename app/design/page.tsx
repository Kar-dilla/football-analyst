'use client';

import { useState } from 'react';
import type { CSSProperties } from 'react';
import { Accordion, Dot, EmptyState, Field, Gauge, Meter, Notice, PageHeader, Section, Segmented, Skeleton, Stat, Stepper } from '@/components/ui';

type Tab = 'open' | 'history' | 'stats';
const grid = (cols: string): CSSProperties => ({ display: 'grid', gap: 12, gridTemplateColumns: cols });

export default function DesignPage() {
  const [tab, setTab] = useState<Tab>('open');
  const [minute, setMinute] = useState(67);
  const [home, setHome] = useState(1);
  const [away, setAway] = useState(0);
  return (
    <div>
      <PageHeader eyebrow="Matchday" title="Best picks" subtitle="Premier League picks above your safe threshold." right={<span className="badge ok"><Dot tone="ok" />3 live</span>} />
      <Section title="Stats">
        <div className="card" style={grid('repeat(3, minmax(0, 1fr))')}>
          <Stat label="Hit rate" value="64%" sub="last 30 days" tone="ok" />
          <Stat label="Avg odds" value="1.42" sub="open picks" />
          <Stat label="Open" value="3" sub="on the slip" tone="accent" />
        </div>
      </Section>
      <Section title="Gauge" hint="probability range">
        <div className="card"><Gauge value={0.82} low={0.77} high={0.85} threshold={0.85} confidence="medium" basis="15 games" /></div>
      </Section>
      <Section title="Meters">
        <div className="card stack">
          <Meter label="Over 8.5 corners" value={0.78} display="78%" />
          <Meter label="Both teams to score" value={0.64} display="64%" />
        </div>
      </Section>
      <Section title="Segmented" hint={`Selected: ${tab}`}>
        <div>
          <Segmented<Tab> ariaLabel="Picks view" value={tab} onChange={setTab} options={[{ value: 'open', label: 'Open', count: 3 }, { value: 'history', label: 'History', count: 12 }, { value: 'stats', label: 'Stats' }]} />
        </div>
      </Section>
      <Section title="Steppers" hint="tap, or type and leave the field">
        <div className="card" style={grid('repeat(auto-fit, minmax(164px, 1fr))')}>
          <Stepper label="Minute" value={minute} min={0} max={120} onChange={setMinute} />
          <Stepper label="Home goals" value={home} min={0} max={20} onChange={setHome} />
          <Stepper label="Away goals" value={away} min={0} max={20} onChange={setAway} />
        </div>
      </Section>
      <Section title="Buttons">
        <div className="row">
          <button type="button" className="btn">Primary</button>
          <button type="button" className="btn secondary">Secondary</button>
          <button type="button" className="btn ghost">Ghost</button>
          <button type="button" className="btn danger">Danger</button>
          <button type="button" className="btn sm">Small</button>
          <button type="button" className="btn" disabled>Disabled</button>
        </div>
      </Section>
      <Section title="Badges and chips">
        <div className="row">
          <span className="badge">Default</span><span className="badge ok">Safe</span><span className="badge warn">Close</span>
          <span className="badge bad">Avoid</span><span className="badge accent">Top pick</span><span className="chip">Corners</span>
        </div>
      </Section>
      <Section title="Accordion">
        <Accordion title="Corners markets" count={4} defaultOpen>
          <p className="muted" style={{ margin: 0 }}>Over 8.5, 9.5 and 10.5 and under 11.5 are inside your bookmaker&apos;s lines.</p>
        </Accordion>
        <Accordion title="Cards markets" count={3}>
          <p className="muted" style={{ margin: 0 }}>Under 4.5 cards is the only line above your safe threshold.</p>
        </Accordion>
      </Section>
      <Section title="Notices">
        <Notice tone="ok">Probability is above your safe threshold.</Notice>
        <Notice tone="warn">Only 6 games of data. Treat this pick with caution.</Notice>
        <Notice tone="bad">Key striker ruled out. The model has not adjusted for it.</Notice>
        <Notice tone="info">Lineups are usually confirmed about an hour before kickoff.</Notice>
      </Section>
      <Section title="Empty state">
        <div className="card"><EmptyState title="No picks yet" body="Choose a league and a match to see the best picks." action={<button type="button" className="btn">Find picks</button>} /></div>
      </Section>
      <Section title="Skeleton">
        <div className="card"><Skeleton lines={3} /></div>
      </Section>
      <Section title="Table">
        <div className="card">
          <table className="table">
            <thead><tr><th>Match</th><th>Pick</th><th>Prob</th></tr></thead>
            <tbody>
              <tr><td>Arsenal v Chelsea</td><td>Over 8.5 corners</td><td className="num">82%</td></tr>
              <tr><td>Milan v Inter</td><td>Under 4.5 cards</td><td className="num">88%</td></tr>
              <tr><td>Flamengo v Santos</td><td>Over 1.5 goals</td><td className="num">79%</td></tr>
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="Fields">
        <div className="card stack">
          <Field label="Match" hint="Type it as Home vs Away."><input className="input" placeholder="Arsenal vs Chelsea" /></Field>
          <Field label="League">
            <select className="input" defaultValue="epl"><option value="epl">Premier League</option><option value="laliga">La Liga</option><option value="seriea">Serie A</option></select>
          </Field>
        </div>
      </Section>
    </div>
  );
}
