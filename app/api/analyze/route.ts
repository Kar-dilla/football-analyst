import { analyze } from '@/lib/orchestrate';
import type { GapFacts } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const strs = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];

export async function POST(req: Request): Promise<Response> {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b !== 'object') return json({ error: 'Body must be a JSON object' }, 400);
  const raw = typeof b.raw === 'string' ? b.raw.trim() : '';
  if (!raw) return json({ error: 'raw must be a non-empty string' }, 400);
  const t = b.threshold === undefined ? 0.85 : b.threshold;
  if (typeof t !== 'number' || !(t > 0 && t <= 1)) {
    return json({ error: 'threshold must be a number between 0 and 1 (e.g. 0.85)' }, 400);
  }
  const cid = typeof b.competitionId === 'string' ? b.competitionId : undefined;
  if (b.competitionId !== undefined && cid === undefined) return json({ error: 'competitionId must be a string' }, 400);
  let gap: GapFacts | undefined;
  if (b.gap !== undefined && b.gap !== null) {
    if (typeof b.gap !== 'object') return json({ error: 'gap must be an object' }, 400);
    const g = b.gap as Record<string, unknown>;
    const ref = typeof g.referee === 'string' ? g.referee.trim() : '';
    gap = { injuries: strs(g.injuries), expectedLineup: strs(g.expectedLineup), weather: typeof g.weather === 'string' ? g.weather : '', referee: ref || undefined, lateNews: strs(g.lateNews) };
  }
  try {
    return json(await analyze(raw, t, gap, cid));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
}
