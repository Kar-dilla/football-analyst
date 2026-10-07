'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { loadPicks, savePick } from '@/lib/store';
import { loadSlip, saveSlip } from '@/lib/slip';
import type { SlipLeg } from '@/lib/slip';
import type { MenuItem } from '@/lib/best';
import type { Analysis, GapFacts, ParsedQuery, Pick } from '@/lib/types';

const MAX_LEGS = 30;
const SEP = ' \u2014 ';
const OU = ['goals_ou', 'fh_goals_ou', 'sh_goals_ou', 'corners_ou', 'cards_ou'];
const NAME: Record<string, string> = { goals_ou: 'goals', fh_goals_ou: '1H goals', sh_goals_ou: '2H goals', corners_ou: 'corners', cards_ou: 'cards', btts: 'BTTS', '1x2': 'Result', double_chance: 'Double chance', window_goals: 'Goal window', fh_subs: '1H sub' };

export type LegResult = 'added' | 'duplicate' | 'full';

export interface AppState {
  analysis: Analysis | null; threshold: number; raw: string; competitionId: string; usedGapFill: boolean;
  analyzeError: string; picks: Pick[]; slip: SlipLeg[];
  setResult: (analysis: Analysis, threshold: number, raw: string, competitionId: string) => void;
  rerun: (gap: GapFacts) => Promise<void>;
  analyzeItem: (item: MenuItem, competitionId: string) => Promise<boolean>;
  refreshPicks: () => void;
  addLeg: (leg: SlipLeg) => LegResult; removeLeg: (id: string) => void; clearSlip: () => void;
  savePickNow: () => void; addAnalysisToSlip: () => LegResult;
  notify: (message: string, undo?: () => void) => void;
  analysisSession: number; sheetOpen: boolean; formResetKey: number;
  openSheet: () => void; closeSheet: () => void; clearAnalysis: () => void;
  finishSave: () => void; finishSlip: () => void; finishBoth: () => void;
}

const Ctx = createContext<AppState | null>(null);

export function useApp(): AppState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

async function post(body: Record<string, unknown>): Promise<Analysis> {
  const res = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data as Analysis;
}

function marketLabel(q: ParsedQuery): string {
  const side = q.side ? q.side.charAt(0).toUpperCase() + q.side.slice(1) : '';
  const line = q.line != null ? String(q.line) : '';
  const name = NAME[q.market] ?? q.market;
  if (OU.includes(q.market)) return [side, line, name].filter(Boolean).join(' ');
  return [name, side, q.windowMinutes ? q.windowMinutes + ' min' : ''].filter(Boolean).join(' ');
}

function legLabel(a: Analysis): string {
  const q = a.query;
  const at = q.raw.indexOf(SEP);
  if (at >= 0) return q.raw.slice(at + SEP.length).trim() || marketLabel(q);
  const lead = q.home + ' vs ' + q.away;
  const s = q.raw.trim();
  const rest = s.slice(0, lead.length).toLowerCase() === lead.toLowerCase() ? s.slice(lead.length) : s;
  return rest.replace(/^[\s,\-\u2013\u2014]+/, '') || marketLabel(q);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [threshold, setThreshold] = useState(0.85);
  const [raw, setRaw] = useState('');
  const [competitionId, setCompetitionId] = useState('');
  const [usedGapFill, setUsedGapFill] = useState(false);
  const [analyzeError, setAnalyzeError] = useState('');
  const [picks, setPicks] = useState<Pick[]>([]);
  const [slip, setSlip] = useState<SlipLeg[]>([]);
  const [toast, setToast] = useState<{ message: string; undo?: () => void } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [analysisSession, setAnalysisSession] = useState(0);
  const [formResetKey, setFormResetKey] = useState(0);
  const slipRef = useRef<SlipLeg[]>([]);
  const sessionRef = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { setPicks(loadPicks()); }, []);
  useEffect(() => { const s = loadSlip(); slipRef.current = s; setSlip(s); }, []);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function bumpSession() { sessionRef.current += 1; setAnalysisSession(sessionRef.current); }
  function refreshPicks() { setPicks(loadPicks()); }
  function commitSlip(next: SlipLeg[]) { slipRef.current = next; setSlip(next); saveSlip(next); }
  function addLeg(leg: SlipLeg): LegResult {
    const cur = slipRef.current;
    if (cur.some((l) => l.id === leg.id)) return 'duplicate';
    if (cur.length >= MAX_LEGS) return 'full';
    commitSlip([...cur, leg]);
    return 'added';
  }
  function removeLeg(id: string) { commitSlip(slipRef.current.filter((l) => l.id !== id)); }
  function clearSlip() { commitSlip([]); }

  function setResult(a: Analysis, t: number, r: string, c: string) {
    setAnalysis(a); setThreshold(t); setRaw(r); setCompetitionId(c); setUsedGapFill(false); setAnalyzeError('');
    setSheetOpen(true); bumpSession();
  }

  async function rerun(gap: GapFacts): Promise<void> {
    const body: Record<string, unknown> = { raw, threshold, gap };
    if (competitionId) body.competitionId = competitionId;
    const session = sessionRef.current;
    const next = await post(body);
    if (session !== sessionRef.current) return;
    setAnalysis(next);
    setUsedGapFill(true);
  }

  async function analyzeItem(item: MenuItem, cid: string): Promise<boolean> {
    setAnalyzeError('');
    try {
      setAnalysis(await post({ raw: item.query.raw, threshold, competitionId: cid, query: item.query }));
      setRaw(item.query.raw); setCompetitionId(cid); setUsedGapFill(false);
      setSheetOpen(true); bumpSession();
      return true;
    } catch (e) {
      setAnalyzeError(e instanceof Error ? e.message : 'Request failed');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return false;
    }
  }

  function savePickNow() {
    if (!analysis) return;
    savePick({ id: crypto.randomUUID(), analysis, threshold, usedGapFill });
    refreshPicks();
  }

  function addAnalysisToSlip(): LegResult {
    if (!analysis) return 'duplicate';
    const match = analysis.query.home + ' vs ' + analysis.query.away;
    const label = legLabel(analysis);
    return addLeg({ id: match + '|' + label, match, label, probability: analysis.probability });
  }

  function notify(message: string, undo?: () => void) {
    if (timer.current) clearTimeout(timer.current);
    setToast({ message, undo });
    timer.current = setTimeout(() => setToast(null), 6000);
  }

  function openSheet() { setSheetOpen(true); }
  function closeSheet() { setSheetOpen(false); }
  function clearAnalysis() {
    setAnalysis(null); setUsedGapFill(false); setRaw(''); setAnalyzeError(''); setSheetOpen(false);
    bumpSession(); setFormResetKey((k) => k + 1);
  }

  function finishSave() {
    if (!analysis) return;
    savePickNow();
    notify('Pick saved');
    clearAnalysis();
  }

  function finishSlip() {
    if (!analysis) return;
    const r = addAnalysisToSlip();
    if (r === 'full') { notify('Slip is full (30 legs)'); return; }
    notify(r === 'duplicate' ? 'Already on the slip' : 'Added to slip');
    clearAnalysis();
  }

  function finishBoth() {
    if (!analysis) return;
    savePickNow();
    const r = addAnalysisToSlip();
    notify(r === 'full' ? 'Pick saved. Slip is full (30 legs)' : r === 'duplicate' ? 'Pick saved. Already on the slip' : 'Pick saved and added to slip');
    clearAnalysis();
  }

  const value: AppState = { analysis, threshold, raw, competitionId, usedGapFill, analyzeError, picks, slip, setResult, rerun, analyzeItem, refreshPicks, addLeg, removeLeg, clearSlip, savePickNow, addAnalysisToSlip, notify, analysisSession, sheetOpen, formResetKey, openSheet, closeSheet, clearAnalysis, finishSave, finishSlip, finishBoth };
  const bar = { position: 'fixed', left: 12, right: 12, bottom: 'calc(68px + env(safe-area-inset-bottom))', zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 } as const;
  return (
    <Ctx.Provider value={value}>
      {children}
      {toast && (
        <div className="card" role="status" style={bar}>
          <span>{toast.message}</span>
          {toast.undo && <button className="btn" onClick={() => { toast.undo?.(); setToast(null); }}>Undo</button>}
        </div>
      )}
    </Ctx.Provider>
  );
}
