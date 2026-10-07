'use client';

import { useState } from 'react';
import type { Pick } from '@/lib/types';
import { exportPicksJSON } from '@/lib/store';
import OpenPicks from '@/components/OpenPicks';
import History from '@/components/History';
import StatsView from '@/components/StatsView';
import { Segmented } from '@/components/ui';

type Seg = 'open' | 'history' | 'stats';

function download() {
  const url = URL.createObjectURL(new Blob([exportPicksJSON()], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'picks.json';
  a.click();
  URL.revokeObjectURL(url);
}

export default function PickLog({ picks, onChange }: { picks: Pick[]; onChange: () => void }) {
  const [seg, setSeg] = useState<Seg>('open');
  const nOpen = picks.filter((p) => p.result === undefined).length;
  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <Segmented<Seg>
          ariaLabel="Log view"
          value={seg}
          onChange={setSeg}
          options={[{ value: 'open', label: 'Open', count: nOpen }, { value: 'history', label: 'History', count: picks.length - nOpen }, { value: 'stats', label: 'Stats' }]}
        />
        <button type="button" className="btn ghost sm" style={{ marginLeft: 'auto' }} onClick={download}>Export JSON</button>
      </div>
      {seg === 'open' && <OpenPicks picks={picks} onChange={onChange} />}
      {seg === 'history' && <History picks={picks} onChange={onChange} />}
      {seg === 'stats' && <StatsView picks={picks} />}
    </div>
  );
}
