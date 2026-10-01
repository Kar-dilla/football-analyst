import type { BaseResult, MatchData } from '@/lib/types';
import { poissonOver } from '@/lib/models/poisson';

const r4 = (x: number) => Math.round(x * 10000) / 10000;
const clamp = (p: number) => Math.min(1, Math.max(0, p));
const valid = (nums: number[]) => nums.every((n) => Number.isFinite(n) && n >= 0);

export function halvesModel(data: MatchData): BaseResult | null {
  const { home, away, leagueAvg: lg, query } = data;
  const { market, side, line } = query;
  const fh = market === 'fh_goals_ou';
  if (!fh && market !== 'sh_goals_ou') return null;
  if (!home || !away || !(lg.fhGoals > 0)) return null;
  if (typeof line !== 'number' || !Number.isFinite(line) || line < 0) return null;
  if (side !== 'over' && side !== 'under') return null;
  const nums = fh
    ? [home.fhGf, home.fhGa, away.fhGf, away.fhGa, lg.fhGoals, home.htZeroZeroRate, away.htZeroZeroRate]
    : [home.gf, home.ga, home.fhGf, home.fhGa, away.gf, away.ga, away.fhGf, away.fhGa, lg.goals, lg.fhGoals];
  if (!valid(nums)) return null;
  const lamH = fh ? (home.fhGf + away.fhGa) / 2 : (home.gf - home.fhGf + (away.ga - away.fhGa)) / 2;
  const lamA = fh ? (away.fhGf + home.fhGa) / 2 : (away.gf - away.fhGf + (home.ga - home.fhGa)) / 2;
  const leagueHalf = fh ? lg.fhGoals : Math.max(0, lg.goals - lg.fhGoals);
  const mean = 0.75 * (Math.max(0, lamH) + Math.max(0, lamA)) + 0.25 * leagueHalf;
  const noGoalRate = (home.htZeroZeroRate + away.htZeroZeroRate) / 2;
  const overAt = (l: number) =>
    clamp(fh && l === 0.5 ? 0.5 * poissonOver(mean, l) + 0.5 * (1 - noGoalRate) : poissonOver(mean, l));
  const ladder = [0.5, 1.5, 2.5].map((l) => {
    const over = r4(overAt(l));
    return { line: l, over, under: r4(1 - over) };
  });
  const pOver = overAt(line);
  return {
    market,
    probability: side === 'over' ? pOver : clamp(1 - pOver),
    ladder,
    method: 'poisson-halves',
    sampleSize: Math.min(home.games, away.games),
  };
}
