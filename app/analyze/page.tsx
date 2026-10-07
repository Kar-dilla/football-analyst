'use client';

import AnalyzeForm from '@/components/AnalyzeForm';
import { useApp } from '@/components/AppProvider';

export default function AnalyzePage() {
  const { analysis, sheetOpen, usedGapFill, analyzeError, formResetKey, setResult, openSheet, clearAnalysis } = useApp();
  return (
    <main className="wrap stack" data-gapfill={usedGapFill ? '1' : '0'}>
      <AnalyzeForm onResult={setResult} resetKey={formResetKey} />
      {analyzeError && <div className="badge warn">{analyzeError}</div>}
      {analysis && !sheetOpen && (
        <div className="card stack">
          <span>Last analysis: {analysis.query.raw} {'\u00b7'} {Math.round(analysis.probability * 100)}%</span>
          <div className="row">
            <button className="btn" onClick={openSheet}>Open</button>
            <button className="btn" onClick={clearAnalysis}>Discard</button>
          </div>
        </div>
      )}
    </main>
  );
}
