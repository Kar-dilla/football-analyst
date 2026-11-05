'use client';

import { useState } from 'react';
import type { Price } from '@/lib/pricesClient';

export default function OddsCheck({ fairOdds, live }: { fairOdds: number; live?: Price | null }) {
  const [text, setText] = useState('');
  const known = Number.isFinite(fairOdds) && fairOdds > 0;
  const min = Math.ceil(fairOdds * 105 - 1e-9) / 100;
  const typed = Number.parseFloat(text);
  const odds = Number.isFinite(typed) ? typed : (live?.odd ?? NaN);
  const value = known && Number.isFinite(odds) && odds >= 1.01 ? odds / fairOdds - 1 : null;
  const signed = value === null ? '' : `${value >= 0 ? '+' : '−'}${Math.abs(value * 100).toFixed(1)}%`;
  const [cls, verdict] = value === null
    ? ['', '']
    : value >= 0.05 ? ['badge ok', 'Worth a look']
      : value >= 0 ? ['badge', 'Marginal (about fair)']
        : ['badge warn', 'Skip: pays below fair'];

  return (
    <div className="stack" style={{ gap: 8 }}>
      {live && <div className="label">Best price <span className="num">{live.odd.toFixed(2)}</span> at {live.book}</div>}
      <div className="row">
        <input className="input" style={{ width: 170 }} type="number" inputMode="decimal" step={0.01} min={1.01} placeholder={live ? `Best: ${live.odd.toFixed(2)}` : 'Bookmaker odds'} aria-label="Bookmaker odds" value={text} onChange={(e) => setText(e.target.value)} />
        {value !== null && (
          <>
            <span className="num" style={{ fontWeight: 700 }}>{signed}</span>
            <span className={cls}>{verdict}</span>
          </>
        )}
      </div>
      {known && <div className="label">Suggested minimum: {min.toFixed(2)}</div>}
      <div className="label faint">Fair odds come from the site&apos;s probability, which can be too high.</div>
    </div>
  );
}
