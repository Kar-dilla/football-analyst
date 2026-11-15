import type { BaseResult, MatchData, ParsedQuery } from '@/lib/types';
import { expectedGoals, fullGrid } from '@/lib/models/goals';
import { scoreGrid } from '@/lib/models/poisson';

const clamp = (p: number) => Math.min(1, Math.max(0, p));
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const FH_SHARE = 0.446;
const SH_SHARE = 0.554;

type Side = ParsedQuery['side'];

// Half-point lines only, -2.5 to +2.5.
const okLine = (line: unknown): line is number =>
  isNum(line) && line >= -2.5 && line <= 2.5 && Math.abs(Math.abs(line % 1) - 0.5) < 1e-9;

// P(home covers the home handicap L) = P(homeGoals + L > awayGoals). Side '2' is the complement.
function handicapProb(data: MatchData, side: Side, line: unknown): number | null {
  if (side !== '1' && side !== '2') return null;
  if (!okLine(line)) return null;
  const grid = fullGrid(data);
  if (!grid) return null;
  let cover = 0;
  grid.forEach((row, h) => row.forEach((v, a) => { if (h + line > a) cover += v; }));
  return side === '1' ? cover : 1 - cover;
}

// Double chance for one half: independent Poisson with the full-match goals scaled by the half share.
function halfDcProb(data: MatchData, first: boolean, side: Side): number | null {
  const { home, away, leagueAvg, competition } = data;
  if (competition.type === 'national') return null;
  if (side !== '1X' && side !== 'X2') return null;
  if (!home || !away || !(leagueAvg.fhGoals > 0) || !isNum(home.fhGf) || !isNum(away.fhGf)) return null;
  const xg = expectedGoals(data);
  if (!xg) return null;
  const s = first ? FH_SHARE : SH_SHARE;
  const grid = scoreGrid(xg.lh * s, xg.la * s, 10);
  let p = 0;
  grid.forEach((row, h) => row.forEach((v, a) => { if (side === '1X' ? h >= a : a >= h) p += v; }));
  return p;
}

export function extraModel(data: MatchData): BaseResult | null {
  try {
    const { home, away, query } = data;
    if (!home || !away || !query) return null;
    const { market, side, line } = query;
    let p: number | null;
    let method: string;
    if (market === 'handicap') {
      p = handicapProb(data, side, line);
      method = 'poisson-dc-mix';
    } else if (market === 'fh_double_chance' || market === 'sh_double_chance') {
      p = halfDcProb(data, market === 'fh_double_chance', side);
      method = 'poisson-half-share';
    } else return null;
    if (p === null || !isNum(p)) return null;
    return { market, probability: clamp(p), method, sampleSize: Math.min(home.games, away.games) };
  } catch {
    return null;
  }
}
