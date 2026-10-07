'use client';

import { useEffect } from 'react';
import ResultCard from '@/components/ResultCard';
import { useApp } from '@/components/AppProvider';

const edge = '1px solid rgba(128,128,128,0.3)';
const shell = { position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', flexDirection: 'column', background: '#0d1117' } as const;
const header = { display: 'flex', alignItems: 'center', gap: 8, padding: 'calc(8px + env(safe-area-inset-top)) 12px 8px', borderBottom: edge, background: '#0d1117' } as const;
const title = { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 } as const;
const body = { flex: 1, overflowY: 'auto', padding: 12 } as const;
const footer = { display: 'flex', gap: 8, padding: '8px 12px calc(8px + env(safe-area-inset-bottom))', borderTop: edge, background: '#0d1117' } as const;
const grow = { flex: 1, minHeight: 44 } as const;

export default function ResultSheet() {
  const { analysis, sheetOpen, threshold, analysisSession, rerun, closeSheet, clearAnalysis, finishSave, finishSlip, finishBoth } = useApp();
  const visible = analysis !== null && sheetOpen;

  useEffect(() => {
    const prev = document.body.style.overflow;
    if (visible) document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [visible]);

  if (!analysis || !sheetOpen) return null;
  return (
    <div style={shell} role="dialog" aria-modal="true" aria-label="Analysis result">
      <div style={header}>
        <button className="btn" onClick={closeSheet}>&lsaquo; Back</button>
        <span style={title}>{analysis.query.raw}</span>
        <button className="btn" onClick={clearAnalysis}>Discard</button>
      </div>
      <div style={body}>
        <ResultCard key={analysisSession} analysis={analysis} threshold={threshold} onRerun={rerun} />
      </div>
      <div style={footer}>
        <button className="btn" style={grow} onClick={finishSave}>Save pick</button>
        <button className="btn" style={grow} onClick={finishSlip}>Add to slip</button>
        <button className="btn" style={grow} onClick={finishBoth}>Save + slip</button>
      </div>
    </div>
  );
}
