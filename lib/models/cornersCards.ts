import type { BaseResult, LadderRow, MatchData } from '@/lib/types';
import { poissonOver } from '@/lib/models/poisson';

const CORNERS_SPREAD = 0.2;
const CARDS_SPREAD = 0.3;
const CORNER_LINES = [6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5];
const CARD_LINES = [1.5, 2.5, 3.5, 4.5, 5.5, 6.5];

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

function round4(x: number): number {
  return Math.round(x * 10000) / 10000;
}

// 3-point Poisson mixture: mean*(1-s), mean, mean*(1+s) with weights 0.25 / 0.5 / 0.25.
function mixProb(mean: number, line: number, side: 'over' | 'under', spread: number): number {
  const p = (m: number): number => {
    const over = poissonOver(m, line);
    return side === 'over' ? over : 1 - over;
  };
  return clamp(0.25 * p(mean * (1 - spread)) + 0.5 * p(mean) + 0.25 * p(mean * (1 + spread)), 0, 1);
}

function mixLadder(mean: number, lines: number[], spread: number): LadderRow[] {
  return lines.map((line) => ({
    line,
    over: round4(mixProb(mean, line, 'over', spread)),
    under: round4(mixProb(mean, line, 'under', spread)),
  }));
}

function cornersMean(data: MatchData): number | null {
  const { home, away, leagueAvg } = data;
  if (!home || !away || !leagueAvg.corners) return null;
  const cols = [home.cornersFor, home.cornersAgainst, away.cornersFor, away.cornersAgainst];
  if (cols.every((v) => !v)) return null;
  const lh = (home.cornersFor + away.cornersAgainst) / 2;
  const la = (away.cornersFor + home.cornersAgainst) / 2;
  return 0.7 * (lh + la) + 0.3 * leagueAvg.corners;
}

function cardsMean(data: MatchData): number | null {
  const { home, away, leagueAvg, referee } = data;
  if (!home || !away || !leagueAvg.cards) return null;
  if (!home.cardsFor && !away.cardsFor) return null;
  const t = home.cardsFor + away.cardsFor;
  let refFactor = 1;
  if (referee) {
    const raw = clamp(referee.cardsPerGame / leagueAvg.cards, 0.75, 1.25);
    const f = 1 + ((raw - 1) * referee.games) / (referee.games + 10);
    if (Number.isFinite(f)) refFactor = f;
  }
  return (0.7 * t + 0.3 * leagueAvg.cards) * refFactor;
}

export function cornersCardsModel(data: MatchData): BaseResult | null {
  const { query, home, away } = data;
  const isCorners = query.market === 'corners_ou';
  if (!isCorners && query.market !== 'cards_ou') return null;
  if (!home || !away) return null;
  if (typeof query.line !== 'number' || !Number.isFinite(query.line)) return null;
  if (query.side !== 'over' && query.side !== 'under') return null;
  const mean = isCorners ? cornersMean(data) : cardsMean(data);
  if (mean === null || !Number.isFinite(mean) || mean <= 0) return null;
  const spread = isCorners ? CORNERS_SPREAD : CARDS_SPREAD;
  return {
    market: query.market,
    probability: mixProb(mean, query.line, query.side, spread),
    ladder: mixLadder(mean, isCorners ? CORNER_LINES : CARD_LINES, spread),
    method: isCorners ? 'poisson-corners-mix' : 'poisson-cards-mix',
    sampleSize: Math.min(home.games, away.games),
  };
}
