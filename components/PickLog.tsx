'use client';

import { useState } from 'react';
import type { Pick } from '@/lib/types';
import { exportPicksJSON } from '@/lib/store';
import OpenPicks from '@/components/OpenPicks';
import History from '@/components/History';
import StatsView from '@/components/StatsView';

type Seg = 'open' | 'history' | 'stats';

function download() {
  const url = URL.createObjectURL(new Blob([exportPicksJSON()], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'picks.json';
  a.click();
  URL.revokeObjectURL(url);
}

export default function PickLog(props: { picks: Pick[]; onChange: () => void }) {
  const { picks, onChange } = props;
  const [seg, setSeg] = useState<Seg>('open');
  const nOpen = picks.filter((p) => p.result === undefined).length;
  const tabs: [Seg, string][] = [['open', `Open (${nOpen})`], ['history', `History (${picks.length - nOpen})`], ['stats', 'Stats']];
  return (
    <section className="card stack">
      <div className="row">
        <h2>Pick log</h2>
        <button className="btn" onClick={download}>Export JSON</button>
      </div>
      <div className="row">
        {tabs.map(([k, label]) => (
          <button key={k} className={seg === k ? 'chip' : 'btn'} aria-pressed={seg === k} onClick={() => setSeg(k)}>{label}</button>
        ))}
      </div>
      {seg === 'open' && <OpenPicks picks={picks} onChange={onChange} />}
      {seg === 'history' && <History picks={picks} onChange={onChange} />}
      {seg === 'stats' && <StatsView picks={picks} />}
    </section>
  );
}
