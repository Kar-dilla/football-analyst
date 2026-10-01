import type { MatchData, ParsedQuery } from '@/lib/types';
import { cornersCardsModel } from '@/lib/models/cornersCards';
import { timingModel } from '@/lib/models/timing';
import { subsModel } from '@/lib/models/subs';

export const dynamic = 'force-dynamic';

const DATA: MatchData = {
  query: { home: 'Alpha', away: 'Beta', market: 'corners_ou', side: 'over', line: 8.5, raw: 'selftest' },
  competition: { id: 'selftest', name: 'Selftest League', tier: 'A', type: 'club', confidenceCap: 'high' },
  home: {
    name: 'Alpha', games: 20, gf: 1.6, ga: 1.1, fhGf: 0.7, fhGa: 0.5, cornersFor: 5.8, cornersAgainst: 4.2,
    cardsFor: 2.0, shotsFor: 13.5, foulsFor: 11.8, htZeroZeroRate: 0.3,
    goalMinutes: [3, 8, 9, 15, 27, 34, 41, 52, 60, 73, 85], fhSubRate: 0.15,
  },
  away: {
    name: 'Beta', games: 18, gf: 1.3, ga: 1.4, fhGf: 0.6, fhGa: 0.6, cornersFor: 4.9, cornersAgainst: 5.3,
    cardsFor: 2.3, shotsFor: 11.2, foulsFor: 12.9, htZeroZeroRate: 0.35,
    goalMinutes: [6, 19, 22, 38, 44, 57, 63, 70, 81, 90], fhSubRate: 0.25,
  },
  leagueAvg: { goals: 2.7, fhGoals: 1.2, corners: 10, cards: 4.2 },
  referee: { name: 'Ref One', games: 25, cardsPerGame: 5.0 },
  fixtureDates: { home: [], away: [] },
  news: [],
  gap: { injuries: [], expectedLineup: [], lateNews: [] },
  missing: [],
};

const q = (p: Partial<ParsedQuery>): MatchData => ({ ...DATA, query: { ...DATA.query, ...p } });

export async function GET(req: Request): Promise<Response> {
  void req;
  const corners = cornersCardsModel(q({ market: 'corners_ou', side: 'over', line: 8.5 }));
  const cards = cornersCardsModel(q({ market: 'cards_ou', side: 'over', line: 3.5 }));
  const timing = timingModel(q({ market: 'window_goals', side: 'yes', windowMinutes: 10 }));
  const subs = subsModel(q({ market: 'fh_subs', side: 'under', line: 0.5 }));
  const vals = [corners, cards, timing, subs].flatMap((r) =>
    r ? [r.probability, ...(r.ladder ?? []).flatMap((l) => [l.over, l.under])] : [NaN],
  );
  const allInRange = vals.every((v) => Number.isFinite(v) && v >= 0 && v <= 1);
  return new Response(JSON.stringify({ corners, cards, timing, subs, allInRange }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
