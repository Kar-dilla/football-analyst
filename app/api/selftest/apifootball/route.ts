import { getRecentEvents } from '@/lib/sources/apifootball';
import { tavilySearch } from '@/lib/sources/tavily';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const team = searchParams.get('team') ?? 'Arsenal';
  const q = searchParams.get('q') ?? `${team} team news`;
  const [events, snippets] = await Promise.all([getRecentEvents(team), tavilySearch(q)]);
  return new Response(JSON.stringify({ events, snippets }), {
    headers: { 'Content-Type': 'application/json' },
  });
}
