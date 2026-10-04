import { getCompetition } from '@/lib/registry';
import { loadFit } from '@/lib/sources/csv';

export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const r3 = (x: number): number => Math.round(x * 1000) / 1000;

export async function GET(req: Request): Promise<Response> {
  try {
    const comp = new URL(req.url).searchParams.get('comp') || 'epl';
    const competition = getCompetition(comp);
    if (!competition) return json({ error: 'LEAGUE_NOT_FOUND: ' + comp }, 404);
    const fit = await loadFit(competition);
    if (!fit) return json({ error: 'NO_FIT: no csv source, fewer than 40 usable matches, or the data could not be fetched' }, 502);
    const top = (m: Map<string, number>, desc: boolean): [string, number][] =>
      Array.from(m.entries())
        .sort((x, y) => (desc ? y[1] - x[1] : x[1] - y[1]))
        .slice(0, 3)
        .map(([t, v]): [string, number] => [t, r3(v)]);
    return json({
      rows: fit.att.size, homeAdv: r3(fit.homeAdv), mu: r3(fit.mu),
      topAttack: top(fit.att, true), weakAttack: top(fit.att, false),
      bestDefence: top(fit.def, false), worstDefence: top(fit.def, true),
    });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
}
