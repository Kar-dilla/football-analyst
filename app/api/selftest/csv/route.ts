import { NextResponse } from 'next/server';
import { getCompetition } from '@/lib/registry';
import { loadLeagueAvg, loadTeamStats, loadTeamStatsAnywhere } from '@/lib/sources/csv';
import { getFixtures, getTable } from '@/lib/sources/fd';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const team = params.get('team') || 'Arsenal';
  const comp = getCompetition(params.get('comp') || 'Premier League');
  const anywhere = await loadTeamStatsAnywhere(team);
  const [teamStats, leagueAvg, fixtures, table] = comp
    ? await Promise.all([loadTeamStats(comp, team), loadLeagueAvg(comp), getFixtures(comp, team), getTable(comp)])
    : [null, null, null, null];
  return NextResponse.json({
    teamStats,
    leagueAvg,
    fixtures,
    tableSize: table?.size ?? null,
    anywhereCompetition: anywhere?.competition.id ?? null,
    rawNote: 'games is the effective sample (current games plus up to 10 prior-season pseudo-games, fading to 0 by game 30)',
  });
}
