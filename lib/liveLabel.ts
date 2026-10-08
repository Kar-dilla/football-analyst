import { getCompetition } from '@/lib/registry';
import type { Analysis, MarketKind, ParsedQuery, Pick } from '@/lib/types';

export type LiveStatsSnap = NonNullable<NonNullable<Pick['live']>['stats']>;

export interface LivePickArgs {
  home: string; away: string; competitionId: string;
  label: string; group: string; probability: number; fairOdds: number;
  state: { minute: number; homeGoals: number; awayGoals: number; homeReds: number; awayReds: number };
  stats?: LiveStatsSnap;
  pressure?: { tilt: number; weight: number; shareHome: number } | null;
  modelVersion?: string;
  threshold?: number;
}

const uid = (): string => (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `live-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

// Turns a live pick label back into a market, side and line. Null for labels the Log cannot track (next goal, corners, cards).
export function parseLiveLabel(label: string, home: string, away: string): { market: MarketKind; side: NonNullable<ParsedQuery['side']>; line?: number } | null {
  const t = label.trim().toLowerCase();
  const h = home.trim().toLowerCase();
  const a = away.trim().toLowerCase();
  const ou = /^(over|under)\s+(\d+(?:\.\d+)?)(?:\s+goals)?$/.exec(t);
  if (ou) return { market: 'goals_ou', side: ou[1] === 'over' ? 'over' : 'under', line: Number(ou[2]) };
  if (t === 'both teams to score: yes') return { market: 'btts', side: 'yes' };
  if (t === 'both teams to score: no') return { market: 'btts', side: 'no' };
  if (t === 'draw') return { market: '1x2', side: 'X' };
  if (h && t === `${h} win`) return { market: '1x2', side: '1' };
  if (a && t === `${a} win`) return { market: '1x2', side: '2' };
  if (h && t === `${h} or draw`) return { market: 'double_chance', side: '1X' };
  if (a && t === `${a} or draw`) return { market: 'double_chance', side: 'X2' };
  if (h && a && t === `${h} or ${a} (no draw)`) return { market: 'double_chance', side: '12' };
  return null;
}

export function buildLivePick(a: LivePickArgs): Pick | null {
  const p = parseLiveLabel(a.label, a.home, a.away);
  if (!p) return null;
  const { minute, homeGoals, awayGoals, homeReds, awayReds } = a.state;
  const threshold = a.threshold ?? 0.85;
  const drivers = [`Live: minute ${minute}, score ${homeGoals}-${awayGoals}`];
  if (a.pressure) drivers.push(`Pressure: ${a.home} ${Math.round(50 + 50 * a.pressure.tilt)}%`);
  const snap = (t: LiveStatsSnap['home']) => ({ shots: t.shots, shotsOnTarget: t.shotsOnTarget, corners: t.corners, possession: t.possession });
  const analysis: Analysis = {
    query: { home: a.home, away: a.away, market: p.market, side: p.side, ...(p.line !== undefined ? { line: p.line } : {}), competitionId: a.competitionId, raw: `${a.home} vs ${a.away} — ${a.label} (live ${minute}')` },
    tier: getCompetition(a.competitionId)?.tier ?? 'C',
    base: { market: p.market, probability: a.probability, method: 'live-v2', sampleSize: 0 },
    probability: a.probability, probLow: a.probability, probHigh: a.probability,
    confidence: 'low', safe: a.probability >= threshold,
    drivers, tailRisks: ['The live model is untested'], flags: [], evidence: [], gaps: [], needs: [], sources: [],
    createdAt: new Date().toISOString(),
  };
  const live: NonNullable<Pick['live']> = {
    minute, homeGoals, awayGoals, homeReds, awayReds, label: a.label, group: a.group, fairOdds: a.fairOdds,
    ...(a.pressure ? { pressureHome: Math.round(50 + 50 * a.pressure.tilt), pressureWeight: a.pressure.weight } : {}),
    ...(a.stats ? { stats: { home: snap(a.stats.home), away: snap(a.stats.away) } } : {}),
    modelVersion: a.modelVersion ?? 'live-v2',
  };
  return { id: uid(), threshold, usedGapFill: false, analysis, live };
}
