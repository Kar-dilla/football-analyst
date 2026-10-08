'use client';

import { useState } from 'react';
import type { Pick } from '@/lib/types';
import { removePick, updatePick } from '@/lib/store';
import { useApp } from '@/components/AppProvider';
import { getCompetition } from '@/lib/registry';
import { betLabel } from '@/lib/label';
import Shortlist from '@/components/Shortlist';
import { Accordion, EmptyState, Field } from '@/components/ui';

type Result = 'won' | 'lost' | 'void';
const RESULTS: [Result, string, string | undefined][] = [['won', 'Won', 'var(--ok)'], ['lost', 'Lost', 'var(--bad)'], ['void', 'Void', undefined]];
const SPLIT = { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 } as const;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

function age(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Math.round((day(new Date()) - day(d)) / 86400000);
  if (diff === 0) return 'Today ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString([], { day: 'numeric', month: 'short' });
}

function OddsInput({ pick, onSaved }: { pick: Pick; onSaved: () => void }) {
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
  const p = pick.analysis.probability;
  const fair = p > 0 ? Math.round(100 / p) / 100 : 0;
  const o = pick.odds;
  const diff = o !== undefined && fair > 0 ? o / fair - 1 : null;
  return (
    <div>
      <Field label="Odds you took">
        <input className="input" type="number" inputMode="decimal" step="0.01" min="1.01" placeholder="e.g. 1.25" value={text} onChange={(e) => setText(e.target.value)} onBlur={save} />
      </Field>
      {o !== undefined && diff !== null && (
        <div className="label" style={{ marginTop: 6 }}>Fair {fair.toFixed(2)} · you {o.toFixed(2)} ({diff >= 0 ? '+' : '−'}{Math.abs(diff * 100).toFixed(1)}% vs fair)</div>
      )}
    </div>
  );
}

export default function OpenPicks({ picks, onChange }: { picks: Pick[]; onChange: () => void }) {
  const { notify } = useApp();
  const open = picks
    .filter((p) => p.result === undefined)
    .sort((a, b) => b.analysis.createdAt.localeCompare(a.analysis.createdAt));
  const settle = (p: Pick, result: Result) => {
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
  if (open.length === 0) return <EmptyState title="No open picks" body="Save a pick from an analysis and it shows up here until you mark the result." />;
  return (
    <div className="stack">
      {open.length >= 2 && <Accordion title="Highest probability first"><Shortlist picks={picks} /></Accordion>}
      {open.map((p) => {
        const a = p.analysis;
        const league = getCompetition(a.query.competitionId ?? '')?.name;
        return (
          <div key={p.id} className="card stack">
            <div style={SPLIT}>
              <span style={{ minWidth: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <span className="h2" style={{ overflowWrap: 'anywhere' }}>{betLabel(a.query)}</span>
                {p.live && <span className="badge accent">Live</span>}
              </span>
              <span className="num" style={{ fontSize: 26, fontWeight: 700 }}>{pct(a.probability)}</span>
            </div>
            <div className="muted">{a.query.home} vs {a.query.away}{league ? ` · ${league}` : ''}</div>
            {p.live && <div className="label">{`Saved at ${p.live.minute}' · ${p.live.homeGoals}-${p.live.awayGoals}`}</div>}
            <div className="row">
              <span className="label">Saved {age(a.createdAt)}</span>
              {p.usedGapFill && <span className="badge">Used extra info</span>}
            </div>
            <OddsInput pick={p} onSaved={onChange} />
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              {RESULTS.map(([r, label, color]) => (
                <button key={r} type="button" className="btn secondary" style={{ flex: 1, minWidth: 0, ...(color ? { borderColor: color, color } : {}) }} onClick={() => settle(p, r)}>{label}</button>
              ))}
            </div>
            <div><button type="button" className="btn ghost sm" onClick={() => del(p)}>Delete</button></div>
          </div>
        );
      })}
    </div>
  );
}
