'use client';

import { useState } from 'react';
import type { Pick } from '@/lib/types';
import { removePick, updatePick } from '@/lib/store';
import { useApp } from '@/components/AppProvider';

type Filter = 'all' | 'won' | 'lost' | 'void';
const FILTERS: Filter[] = ['all', 'won', 'lost', 'void'];
const PAGE = 20;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const stamp = (p: Pick) => p.settledAt ?? p.analysis.createdAt;
const sep = { paddingTop: 8, borderTop: '1px solid rgba(128,128,128,0.3)' } as const;

export default function History(props: { picks: Pick[]; onChange: () => void }) {
  const { picks, onChange } = props;
  const { notify } = useApp();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const settled = picks
    .filter((p) => p.result !== undefined)
    .sort((a, b) => stamp(b).localeCompare(stamp(a)));
  const q = query.trim().toLowerCase();
  const rows = settled.filter(
    (p) => (filter === 'all' || p.result === filter) && (!q || p.analysis.query.raw.toLowerCase().includes(q)),
  );
  const reopen = (p: Pick) => {
    updatePick(p.id, { result: undefined, settledAt: undefined });
    onChange();
    notify('Moved back to Open');
  };
  const del = (p: Pick) => {
    if (!window.confirm('Delete this pick?')) return;
    removePick(p.id);
    onChange();
  };
  if (settled.length === 0) return <p className="muted">Settled picks appear here.</p>;
  return (
    <div className="stack">
      <div className="row">
        {FILTERS.map((f) => (
          <button key={f} className={filter === f ? 'chip' : 'btn'} aria-pressed={filter === f} onClick={() => { setFilter(f); setShown(PAGE); }}>{cap(f)}</button>
        ))}
      </div>
      <input className="input" type="search" placeholder="Search picks" value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} />
      {rows.length === 0 && <p className="muted">No picks match.</p>}
      {rows.slice(0, shown).map((p) => (
        <div className="stack" key={p.id} style={sep}>
          <div className="row">
            <strong>{p.analysis.query.raw}</strong>
            <span className="chip">{pct(p.analysis.probability)}</span>
            {p.odds !== undefined && <span className="muted">odds {p.odds.toFixed(2)}</span>}
            <span className={p.result === 'won' ? 'badge ok' : p.result === 'lost' ? 'badge warn' : 'badge'}>{p.result}</span>
          </div>
          <div className="row">
            <button className="btn" onClick={() => reopen(p)}>Reopen</button>
            <button className="btn" onClick={() => del(p)}>Delete</button>
          </div>
        </div>
      ))}
      {rows.length > shown && <button className="btn" onClick={() => setShown(shown + PAGE)}>Show more</button>}
    </div>
  );
}
