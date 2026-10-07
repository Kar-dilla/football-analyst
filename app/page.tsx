'use client';

import BestPick from '@/components/BestPick';
import { useApp } from '@/components/AppProvider';

export default function PicksPage() {
  const { analyzeItem, addLeg, analyzeError } = useApp();
  return (
    <main className="wrap stack">
      {analyzeError && <div className="badge warn">{analyzeError}</div>}
      <BestPick
        onAnalyze={async (item, cid) => { await analyzeItem(item, cid); }}
        onAdd={(item, match) => addLeg({ id: match + '|' + item.label, match, label: item.label, probability: item.probability })}
      />
    </main>
  );
}
