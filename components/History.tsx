'use client';

import { useState } from 'react';
import type { Pick } from '@/lib/types';
import { removePick, updatePick } from '@/lib/store';
import { useApp } from '@/components/AppProvider';
import { betLabel } from '@/lib/label';
import { EmptyState, Segmented } from '@/components/ui';

type Filter = 'all' | 'won' | 'lost' | 'void';
const FILTERS = ['all', 'won', 'lost', 'void'] as const;
const PAGE = 20;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const stamp = (p: Pick) => p.settledAt ?? p.analysis.createdAt;
const BADGE = { won: 'badge ok', lost: 'badge bad', void: 'badge' } as const;
const ROW = { width: '100%', minHeight: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '10px 4px', color: 'var(--text)', font: 'inherit', textAlign: 'left', cursor: 'pointer' } as const;

export default function History({ picks, onChange }: { picks: Pick[]; onChange: () => void }) {
  const { notify } = useApp();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  const [openId, setOpenId] = useState('');
  const settled = picks
    .filter((p) => p.result !== undefined)
    .sort((a, b) => stamp(b).localeCompare(stamp(a)));
  const count = (f: Filter) => (f === 'all' ? settled.length : settled.filter((p) => p.result === f).length);
  const q = query.trim().toLowerCase();
  const rows = settled.filter((p) => (filter === 'all' || p.result === filter) && (!q || p.analysis.query.raw.toLowerCase().includes(q)));
  const reopen = (p: Pick) => {
    updatePick(p.id, { result: undefined, settledAt: undefined });
    onChange();
    setOpenId('');
    notify('Moved back to Open');
  };
  const del = (p: Pick) => {
    if (!window.confirm('Delete this pick?')) return;
    removePick(p.id);
    onChange();
  };
  if (settled.length === 0) return <EmptyState title="No settled picks yet" body="Won, lost and void picks collect here." />;
  return (
    <div className="stack">
      <div style={{ overflowX: 'auto', padding: '4px 0' }}>
        <Segmented<Filter>
          ariaLabel="Result filter"
          value={filter}
          onChange={(f) => { setFilter(f); setShown(PAGE); }}
          options={FILTERS.map((f) => ({ value: f, label: cap(f), count: count(f) }))}
        />
      </div>
      <input className="input" type="search" placeholder="Search team or bet" aria-label="Search picks" value={query} onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }} />
      {rows.length === 0 && <p className="muted" style={{ margin: 0 }}>No picks match.</p>}
      <div>
        {rows.slice(0, shown).map((p) => {
          const a = p.analysis;
          return (
            <div key={p.id}>
              <button type="button" className="card flat" style={ROW} aria-expanded={openId === p.id} onClick={() => setOpenId(openId === p.id ? '' : p.id)}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 700, overflowWrap: 'anywhere' }}>{betLabel(a.query)}{p.live && <span className="badge accent" style={{ marginLeft: 8 }}>Live</span>}</span>
                  <span className="muted" style={{ display: 'block' }}>{a.query.home} vs {a.query.away}</span>
                  {p.live && <span className="label" style={{ display: 'block' }}>{`Saved at ${p.live.minute}' · ${p.live.homeGoals}-${p.live.awayGoals}`}</span>}
                </span>
                <span style={{ flex: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                  <span className={p.result ? BADGE[p.result] : 'badge'}>{cap(p.result ?? '')}</span>
                  <span className="row" style={{ gap: 8 }}>
                    <span className="num">{pct(a.probability)}</span>
                    {p.odds !== undefined && <span className="num">@ {p.odds.toFixed(2)}</span>}
                  </span>
                </span>
              </button>
              {openId === p.id && (
                <div className="row" style={{ padding: '8px 4px 12px' }}>
                  <button type="button" className="btn secondary sm" onClick={() => reopen(p)}>Reopen</button>
                  <button type="button" className="btn ghost sm" onClick={() => del(p)}>Delete</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {rows.length > shown && <button type="button" className="btn ghost block" onClick={() => setShown(shown + PAGE)}>Show more</button>}
    </div>
  );
}
