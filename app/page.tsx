'use client';

import { useState } from 'react';
import AnalyzeForm from '@/components/AnalyzeForm';
import ResultCard from '@/components/ResultCard';
import type { Analysis, GapFacts } from '@/lib/types';

export default function Page() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [threshold, setThreshold] = useState(0.85);
  const [raw, setRaw] = useState('');
  const [competitionId, setCompetitionId] = useState('');
  const [usedGapFill, setUsedGapFill] = useState(false);

  async function rerun(gap: GapFacts): Promise<void> {
    const body: Record<string, unknown> = { raw, threshold, gap };
    if (competitionId) body.competitionId = competitionId;
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      throw new Error((data && data.error) || `Request failed (${res.status})`);
    }
    setAnalysis(data as Analysis);
    setUsedGapFill(true);
  }

  function onResult(a: Analysis, t: number, r: string, c: string) {
    setAnalysis(a);
    setThreshold(t);
    setRaw(r);
    setCompetitionId(c);
    setUsedGapFill(false);
  }

  return (
    <main className="wrap stack" data-gapfill={usedGapFill ? '1' : '0'}>
      <AnalyzeForm onResult={onResult} />
      {analysis && (
        <ResultCard analysis={analysis} threshold={threshold} onRerun={rerun} />
      )}
    </main>
  );
}
