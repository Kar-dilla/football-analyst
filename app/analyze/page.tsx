'use client';

import AnalyzeForm from '@/components/AnalyzeForm';
import { useApp } from '@/components/AppProvider';
import { Notice, PageHeader } from '@/components/ui';
import { betLabel } from '@/lib/label';

export default function AnalyzePage() {
  const { analysis, sheetOpen, usedGapFill, analyzeError, formResetKey, setResult, openSheet, clearAnalysis } = useApp();
  return (
    <main data-gapfill={usedGapFill ? '1' : '0'}>
      <PageHeader eyebrow="Analyze" title="One bet, checked" subtitle="Probability, range and what could go wrong." />
      <div className="stack">
        <AnalyzeForm onResult={setResult} resetKey={formResetKey} />
        {analyzeError && <Notice tone="bad">{analyzeError}</Notice>}
        {analysis && !sheetOpen && (
          <div className="card stack">
            <span className="label">Last analysis</span>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <span className="h2" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{betLabel(analysis.query)}</span>
              <span className="num" style={{ fontSize: 26, fontWeight: 700 }}>{Math.round(analysis.probability * 100)}%</span>
            </div>
            <div className="sub">{analysis.query.home} vs {analysis.query.away}</div>
            <div className="row">
              <button type="button" className="btn secondary sm" onClick={openSheet}>Open</button>
              <button type="button" className="btn ghost sm" onClick={clearAnalysis}>Discard</button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
