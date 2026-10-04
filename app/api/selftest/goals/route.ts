import type { BaseResult, MarketKind, MatchData, ParsedQuery } from '@/lib/types';
import { goalsModel } from '@/lib/models/goals';
import { halvesModel } from '@/lib/models/halves';
import { safestLine } from '@/lib/ladder';

export const dynamic = 'force-dynamic';

const sample: MatchData = {
  query: { home: 'Arsenal', away: 'Chelsea', market: 'goals_ou', side: 'over', line: 2.5, raw: 'Arsenal v Chelsea over 2.5' },
  competition: { id: 'epl', name: 'Premier League', tier: 'A', type: 'club', confidenceCap: 'high' },
  home: { name: 'Arsenal', games: 20, gf: 1.9, ga: 0.8, fhGf: 0.9, fhGa: 0.35, cornersFor: 6.5, cornersAgainst: 3.8,
    cardsFor: 1.6, shotsFor: 16, foulsFor: 10.5, htZeroZeroRate: 0.3, goalMinutes: [12, 34, 58, 77] },
  away: { name: 'Chelsea', games: 20, gf: 1.6, ga: 1.2, fhGf: 0.7, fhGa: 0.5, cornersFor: 5.5, cornersAgainst: 4.5,
    cardsFor: 1.9, shotsFor: 13, foulsFor: 11.5, htZeroZeroRate: 0.32, goalMinutes: [8, 41, 63, 85] },
  leagueAvg: { goals: 2.8, fhGoals: 1.2, corners: 10.2, cards: 4.1 },
  referee: null, fixtureDates: { home: [], away: [] }, news: [], missing: [],
  gap: { injuries: [], expectedLineup: [], lateNews: [] },
};

const ask = (market: MarketKind, side: ParsedQuery['side'], line = 2.5): MatchData =>
  ({ ...sample, query: { ...sample.query, market, side, line } });
const twin = (side: ParsedQuery['side']): MatchData =>
  ({ ...ask('1x2', side), home: sample.home, away: sample.home, competition: { ...sample.competition, type: 'club' } });
const prob = (r: BaseResult | null) => (r ? r.probability : NaN);

export async function GET(req: Request): Promise<Response> {
  void req;
  const ladder = goalsModel(sample)?.ladder ?? [];
  const o05 = prob(goalsModel(ask('goals_ou', 'over', 0.5)));
  const o25 = prob(goalsModel(ask('goals_ou', 'over', 2.5)));
  const h = prob(goalsModel(ask('1x2', '1')));
  const d = prob(goalsModel(ask('1x2', 'X')));
  const a = prob(goalsModel(ask('1x2', '2')));
  const sum = h + d + a;
  const drawFlat = prob(goalsModel(ask('1x2', 'X'), { rho: 0, spread: 0 }));
  const dc1X = prob(goalsModel(ask('double_chance', '1X')));
  const dcX2 = prob(goalsModel(ask('double_chance', 'X2')));
  const dc12 = prob(goalsModel(ask('double_chance', '12')));
  const body = {
    goals: { over05: o05, over25: o25 },
    oneXTwo: { '1': h, X: d, '2': a, sum },
    drawProbability: d,
    drawLift: d > drawFlat,
    doubleChance: { '1X': dc1X, X2: dcX2, '12': dc12 },
    btts: { yes: prob(goalsModel(ask('btts', 'yes'))) },
    fh: { over05: prob(halvesModel(ask('fh_goals_ou', 'over', 0.5))) },
    sh: { over15: prob(halvesModel(ask('sh_goals_ou', 'over', 1.5))) },
    ladder,
    safestLine085: safestLine(ladder, 0.85) ?? null,
    checks: {
      over05GtOver25: o05 > o25,
      oneXTwoSumsToOne: Math.abs(sum - 1) < 0.001,
      homeAdvOk: prob(goalsModel(twin('1'))) > prob(goalsModel(twin('2'))),
      dcSumsOk: Math.abs(dc1X + dcX2 + dc12 - 2) < 0.001,
    },
  };
  return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
}
