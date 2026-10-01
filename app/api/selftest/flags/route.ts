import { computeFlags } from '@/lib/flags';
import { buildNeeds } from '@/lib/needs';
import { parseQuery } from '@/lib/parse';
import type { MatchData } from '@/lib/types';

export const dynamic = 'force-dynamic';

function makeSample(): MatchData {
  const now = Date.now();
  const d = (n: number) => new Date(now + n * 86400000).toISOString();
  return {
    query: { home: 'Arsenal', away: 'Chelsea', market: 'corners_ou', side: 'over', line: 9.5, raw: 'sample' },
    competition: { id: 'sample', name: 'Sample League', tier: 'A', type: 'club', confidenceCap: 'high' },
    home: null,
    away: null,
    leagueAvg: { goals: 2.7, fhGoals: 1.2, corners: 10, cards: 4 },
    referee: null,
    fixtureDates: { home: [d(-4), d(-1), d(2)], away: [d(-3), d(2)] },
    news: [],
    missing: [],
  };
}

export async function GET(req: Request): Promise<Response> {
  const q = new URL(req.url).searchParams.get('q');
  const sample = makeSample();
  const body: Record<string, unknown> = {
    flags: computeFlags(sample),
    needs: buildNeeds(sample),
  };
  if (q) body.parsed = await parseQuery(q);
  return Response.json(body);
}
