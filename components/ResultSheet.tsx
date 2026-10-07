'use client';

import { useEffect } from 'react';
import ResultCard from '@/components/ResultCard';
import { useApp } from '@/components/AppProvider';
import { IconBack } from '@/components/icons';

const title = { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } as const;
const tight = { padding: '0 6px' } as const;

export default function ResultSheet() {
  const { analysis, sheetOpen, threshold, analysisSession, rerun, closeSheet, clearAnalysis, finishSave, finishSlip, finishBoth } = useApp();
  const visible = analysis !== null && sheetOpen;

  useEffect(() => {
    const prev = document.body.style.overflow;
    if (visible) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [visible]);

  if (!analysis) return null;

  // One fixed tree, only `hidden` toggles: it stays mounted so typed text in the missing-info box survives Back.
  return (
    <div hidden={!sheetOpen}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label="Analysis result">
        <div className="sheet-head">
          <button type="button" className="btn secondary sm" aria-label="Back" onClick={closeSheet}><IconBack size={20} /></button>
          <span className="h2" style={title}>{analysis.query.home} vs {analysis.query.away}</span>
          <button type="button" className="btn danger sm" onClick={clearAnalysis}>Discard</button>
        </div>
        <div className="sheet-body">
          <ResultCard key={analysisSession} analysis={analysis} threshold={threshold} onRerun={rerun} />
        </div>
        <div className="sheet-foot">
          <button type="button" className="btn" style={tight} onClick={finishSave}>Save pick</button>
          <button type="button" className="btn secondary" style={tight} onClick={finishSlip}>Add to slip</button>
          <button type="button" className="btn secondary" style={tight} onClick={finishBoth}>Save + slip</button>
        </div>
      </div>
    </div>
  );
}
