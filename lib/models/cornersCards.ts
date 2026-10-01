import type { BaseResult, MatchData } from '@/lib/types';
import { poissonOver } from '@/lib/models/poisson';
import { buildLadder } from '@/lib/ladder';

const CORNER_LINES = [6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5];
const CARD_LINES = [1.5, 2.5, 3.5, 4.5, 5.5, 6.5];

function clamp(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
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
  const over = clamp(poissonOver(mean, query.line), 0, 1);
  return {
    market: query.market,
    probability: query.side === 'over' ? over : 1 - over,
    ladder: buildLadder(mean, isCorners ? CORNER_LINES : CARD_LINES),
    method: isCorners ? 'poisson-corners' : 'poisson-cards',
    sampleSize: Math.min(home.games, away.games),
  };
}
