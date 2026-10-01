import type { BaseResult, MatchData, TeamStats } from '@/lib/types';

const RECENT_GAMES = 10;

function teamRate(team: TeamStats, w: number, leagueGoals: number): { rate: number; n: number } {
  const observed = (team.goalMinutes ?? []).filter((m) => m <= w).length / RECENT_GAMES;
  const prior = leagueGoals * (w / 90) * 0.9;
  const n = Math.max(0, Math.min(RECENT_GAMES, team.games));
  const k = n / (n + 10);
  return { rate: k * observed + (1 - k) * prior, n };
}

export function timingModel(data: MatchData): BaseResult | null {
  const { query, home, away, leagueAvg } = data;
  if (query.market !== 'window_goals') return null;
  const w = query.windowMinutes;
  if (w !== 5 && w !== 10) return null;
  if (!home || !away) return null;
  if (!home.goalMinutes?.length && !away.goalMinutes?.length) return null;
  const yes = query.side === 'over' || query.side === 'yes';
  const no = query.side === 'under' || query.side === 'no';
  if (!yes && !no) return null;
  const h = teamRate(home, w, leagueAvg.goals);
  const a = teamRate(away, w, leagueAvg.goals);
  const lambda = (h.rate + a.rate) / 2;
  if (!Number.isFinite(lambda) || lambda < 0) return null;
  const atLeastOne = 1 - Math.exp(-lambda);
  return {
    market: 'window_goals',
    probability: yes ? atLeastOne : 1 - atLeastOne,
    method: 'early-goal-blend',
    sampleSize: Math.min(h.n, a.n),
  };
}
