'use client';

import AnalyzeForm from '@/components/AnalyzeForm';
import ResultCard from '@/components/ResultCard';
import { useApp } from '@/components/AppProvider';

export default function AnalyzePage() {
  const { analysis, threshold, usedGapFill, setResult, rerun, savePickNow, addAnalysisToSlip, notify } = useApp();
  return (
    <main className="wrap stack" data-gapfill={usedGapFill ? '1' : '0'}>
      <AnalyzeForm onResult={setResult} />
      {analysis && (
        <>
          <ResultCard analysis={analysis} threshold={threshold} onRerun={rerun} />
          <div className="row">
            <button className="btn" onClick={() => { savePickNow(); notify('Pick saved'); }}>Save pick</button>
            <button className="btn" onClick={() => { addAnalysisToSlip(); notify('Added to slip'); }}>Add to slip</button>
          </div>
        </>
      )}
    </main>
  );
}
