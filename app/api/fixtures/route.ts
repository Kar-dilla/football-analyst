import { espnSlug, fetchFixtures } from '@/lib/livefeed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NONE = 'No upcoming games found for this day. Type the match instead.';
const NO_TOMORROW = "Tomorrow's list is not available. Type the match instead.";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export async function GET(req: Request): Promise<Response> {
  try {
    const q = new URL(req.url).searchParams;
    const comp = (q.get('comp') ?? '').trim();
    const day = (q.get('day') ?? 'today').trim();
    const tzRaw = (q.get('tz') ?? '0').trim();
    const tz = /^[+-]?\d+$/.test(tzRaw) ? Number(tzRaw) : NaN;
    if (!espnSlug(comp) || (day !== 'today' && day !== 'tomorrow') || !Number.isInteger(tz) || tz < -840 || tz > 840) {
      return json({ error: 'Invalid request.' }, 400);
    }
    const { fixtures, datesSupported } = await fetchFixtures(comp, day, tz);
    const note = fixtures.length ? '' : !datesSupported && day === 'tomorrow' ? NO_TOMORROW : NONE;
    return json({ fixtures, note });
  } catch {
    return json({ fixtures: [], note: NONE });
  }
}
