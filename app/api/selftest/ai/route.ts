import { adjust, extractFacts } from '@/lib/ai';
import type { BaseResult, MatchData, TeamStats } from '@/lib/types';

export const dynamic = 'force-dynamic';

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });

const team = (name: string): TeamStats => ({
  name, games: 10, gf: 1.8, ga: 1.0, fhGf: 0.8, fhGa: 0.4,
  cornersFor: 5.8, cornersAgainst: 4.4, cardsFor: 1.8, shotsFor: 14, foulsFor: 11,
  htZeroZeroRate: 0.3, goalMinutes: [12, 34, 55, 78],
});

// Tier B / cap 'medium' on purpose: the test proves the cap is enforced.
const DATA: MatchData = {
  query: { home: 'Home FC', away: 'Away FC', market: 'corners_ou', side: 'over', line: 9.5, raw: 'Home FC vs Away FC over 9.5 corners' },
  competition: { id: 'test', name: 'Test League', tier: 'B', type: 'club', confidenceCap: 'medium' },
  home: team('Home FC'),
  away: team('Away FC'),
  leagueAvg: { goals: 2.7, fhGoals: 1.2, corners: 10.2, cards: 3.8 },
  referee: null,
  fixtureDates: { home: [], away: [] },
  news: ['Saka doubtful for the match'],
  missing: ['referee'],
};
const BASE: BaseResult = { market: 'corners_ou', probability: 0.7, method: 'test', sampleSize: 20 };

export async function GET(req: Request): Promise<Response> {
  if (new URL(req.url).searchParams.get('ai') !== '1') return json({ skipped: true });
  try {
    const adjusted = await adjust(DATA, BASE, [
      { key: 'inj', label: 'Key attacker doubtful', impact: 'down', source: 'user' },
    ]);
    const withinLimit = Math.abs(adjusted.probability - 0.7) <= 0.08 + 1e-9;
    const extracted = await extractFacts('striker out; Saka doubtful; rain expected');
    return json({ adjusted, withinLimit, extracted });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
}
