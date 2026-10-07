'use client';

import { useState } from 'react';

export default function OddsCheck({ fairOdds }: { fairOdds: number }) {
  const [text, setText] = useState('');
  const known = Number.isFinite(fairOdds) && fairOdds > 0;
  const min = Math.ceil(fairOdds * 105 - 1e-9) / 100;
  const odds = Number.parseFloat(text);
  const value = known && Number.isFinite(odds) && odds >= 1.01 ? odds / fairOdds - 1 : null;
  const signed = value === null ? '' : `${value >= 0 ? '+' : '−'}${Math.abs(value * 100).toFixed(1)}%`;
  const [cls, verdict] = value === null
    ? ['', '']
    : value >= 0.05 ? ['badge ok', 'Worth a look']
      : value >= 0 ? ['badge', 'Marginal (about fair)']
        : ['badge warn', 'Skip: pays below fair'];

  return (
    <div className="stack" style={{ gap: 8 }}>
      <div className="row">
        <input className="input" style={{ width: 170 }} type="number" inputMode="decimal" step={0.01} min={1.01} placeholder="Bookmaker odds" aria-label="Bookmaker odds" value={text} onChange={(e) => setText(e.target.value)} />
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
