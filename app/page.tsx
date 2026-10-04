'use client';

import { useEffect, useState } from 'react';
import AnalyzeForm from '@/components/AnalyzeForm';
import BestPick from '@/components/BestPick';
import ResultCard from '@/components/ResultCard';
import Shortlist from '@/components/Shortlist';
import Slip from '@/components/Slip';
import PickLog from '@/components/PickLog';
import { loadPicks, savePick } from '@/lib/store';
import { loadSlip, saveSlip } from '@/lib/slip';
import type { MenuItem } from '@/lib/best';
import type { SlipLeg } from '@/lib/slip';
import type { Analysis, GapFacts, Pick } from '@/lib/types';

export default function Page() {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [threshold, setThreshold] = useState(0.85);
  const [raw, setRaw] = useState('');
  const [competitionId, setCompetitionId] = useState('');
  const [usedGapFill, setUsedGapFill] = useState(false);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [slip, setSlip] = useState<SlipLeg[]>([]);
  const [analyzeErr, setAnalyzeErr] = useState('');

  useEffect(() => { setPicks(loadPicks()); }, []);
  useEffect(() => { setSlip(loadSlip()); }, []);
  const refresh = () => setPicks(loadPicks());

  function commitSlip(next: SlipLeg[]) { setSlip(next); saveSlip(next); }
  function addLeg(leg: SlipLeg) {
    if (slip.some((l) => l.id === leg.id) || slip.length >= 8) return;
    commitSlip([...slip, leg]);
  }
  const removeLeg = (id: string) => commitSlip(slip.filter((l) => l.id !== id));
  const clearSlip = () => commitSlip([]);

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

  async function analyzeItem(item: MenuItem, cid: string): Promise<void> {
    setAnalyzeErr('');
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw: item.query.raw, threshold, competitionId: cid, query: item.query }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) throw new Error((data && data.error) || `Request failed (${res.status})`);
      setAnalysis(data as Analysis);
      setRaw(item.query.raw);
      setCompetitionId(cid);
      setUsedGapFill(false);
    } catch (e) {
      setAnalyzeErr(e instanceof Error ? e.message : 'Request failed');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function onResult(a: Analysis, t: number, r: string, c: string) {
    setAnalysis(a);
    setThreshold(t);
    setRaw(r);
    setCompetitionId(c);
    setUsedGapFill(false);
    setAnalyzeErr('');
  }

  return (
    <main className="wrap stack" data-gapfill={usedGapFill ? '1' : '0'}>
      <a href="/live" className="btn">Live mode</a>
      <AnalyzeForm onResult={onResult} />
      {analyzeErr && <div className="badge warn">{analyzeErr}</div>}
      {analysis && (
        <ResultCard analysis={analysis} threshold={threshold} onRerun={rerun} />
      )}
      {analysis && (
        <div className="row">
          <button className="btn" onClick={() => { savePick({ id: crypto.randomUUID(), analysis, threshold, usedGapFill }); refresh(); }}>
            Save pick
          </button>
          <button
            className="btn"
            onClick={() => {
              const match = `${analysis.query.home} vs ${analysis.query.away}`;
              const label = analysis.query.raw.split(' — ')[1] ?? analysis.query.raw;
              addLeg({ id: `${match}|${label}`, match, label, probability: analysis.probability });
            }}
          >
            Add to slip
          </button>
        </div>
      )}
      <BestPick onAnalyze={analyzeItem} onAdd={(item, match) => addLeg({ id: `${match}|${item.label}`, match, label: item.label, probability: item.probability })} />
      <Shortlist picks={picks} />
      <Slip legs={slip} onRemove={removeLeg} onClear={clearSlip} />
      <PickLog picks={picks} onChange={refresh} />
    </main>
  );
}
