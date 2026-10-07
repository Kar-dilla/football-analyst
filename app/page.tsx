'use client';

import BestPick from '@/components/BestPick';
import { useApp } from '@/components/AppProvider';
import { Notice } from '@/components/ui';

export default function PicksPage() {
  const { analyzeItem, addLeg, analyzeError, notify } = useApp();
  return (
    <main className="stack">
      {analyzeError && <Notice tone="bad">{analyzeError}</Notice>}
      <BestPick
        onAnalyze={async (item, cid) => { await analyzeItem(item, cid); }}
        onAdd={(item, match) => {
          const r = addLeg({ id: match + '|' + item.label, match, label: item.label, probability: item.probability });
          notify(r === 'added' ? 'Added to slip' : r === 'duplicate' ? 'Already on the slip' : 'Slip is full (30 legs)');
        }}
      />
    </main>
  );
}
