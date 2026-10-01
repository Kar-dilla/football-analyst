import { loadIntlTeamStats, loadIntlLeagueAvg } from '@/lib/sources/intl';

export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export async function GET(req: Request): Promise<Response> {
  const team = (new URL(req.url).searchParams.get('team') ?? '').trim();
  if (!team) return json({ error: 'team query param required, e.g. ?team=France' }, 400);
  const [stats, leagueAvg] = await Promise.all([loadIntlTeamStats(team), loadIntlLeagueAvg()]);
  return json({ stats, leagueAvg });
}
