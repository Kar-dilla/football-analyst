import { fetchLive } from '@/lib/livefeed';
import { getCompetition } from '@/lib/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NOTE = 'No live matches right now in this competition (or the feed is unavailable).';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export async function GET(req: Request): Promise<Response> {
  try {
    const q = new URL(req.url).searchParams;
    const comp = (q.get('comp') ?? '').trim();
    const c = comp ? getCompetition(comp) : null;
    if (!c) return json({ error: 'Invalid request.' }, 400);
    const matches = await fetchLive(c.id, q.get('all') === '1');
    return json({ matches, note: matches.length ? '' : NOTE });
  } catch {
    return json({ matches: [], note: NOTE });
  }
}
