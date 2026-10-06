'use client';

import { useState } from 'react';
import type { Pick } from '@/lib/types';
import { removePick, updatePick } from '@/lib/store';
import { useApp } from '@/components/AppProvider';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const sep = { paddingTop: 8, borderTop: '1px solid rgba(128,128,128,0.3)' } as const;

function OddsInput(props: { pick: Pick; onSaved: () => void }) {
  const { pick, onSaved } = props;
  const saved = pick.odds !== undefined ? String(pick.odds) : '';
  const [text, setText] = useState(saved);
  const save = () => {
    const v = parseFloat(text);
    if (Number.isFinite(v) && v >= 1.01) {
      if (v !== pick.odds) { updatePick(pick.id, { odds: v }); onSaved(); }
    } else {
      setText(saved);
    }
  };
  return <input className="input" type="number" step="0.01" min="1.01" placeholder="Odds" value={text} onChange={(e) => setText(e.target.value)} onBlur={save} />;
}

export default function OpenPicks(props: { picks: Pick[]; onChange: () => void }) {
  const { picks, onChange } = props;
  const { notify } = useApp();
  const open = picks
    .filter((p) => p.result === undefined)
    .sort((a, b) => b.analysis.createdAt.localeCompare(a.analysis.createdAt));
  const settle = (p: Pick, result: 'won' | 'lost' | 'void') => {
    updatePick(p.id, { result, settledAt: new Date().toISOString() });
    onChange();
    notify('Marked ' + result, () => {
      updatePick(p.id, { result: undefined, settledAt: undefined });
      onChange();
    });
  };
  const del = (p: Pick) => {
    if (!window.confirm('Delete this pick?')) return;
    removePick(p.id);
    onChange();
  };
  if (open.length === 0) return <p className="muted">No open picks. Save a pick from an analysis to track it here.</p>;
  return (
    <div className="stack">
      {open.map((p) => (
        <div className="stack" key={p.id} style={sep}>
          <div className="row">
            <strong>{p.analysis.query.raw}</strong>
            <span className="chip">{pct(p.analysis.probability)}</span>
          </div>
          <div className="row">
            <OddsInput pick={p} onSaved={onChange} />
          </div>
          <div className="row">
            {(['won', 'lost', 'void'] as const).map((r) => (
              <button key={r} className="btn" onClick={() => settle(p, r)}>{cap(r)}</button>
            ))}
            <button className="btn" onClick={() => del(p)}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}
