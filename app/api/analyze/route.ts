import { analyze } from '@/lib/orchestrate';
import type { GapFacts } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const bad = (error = 'Invalid request') => json({ error }, 400);
const fail = (e: unknown): Response => {
  const m = e instanceof Error ? e.message : '';
  const err = (error: string, status: number) => json({ error }, status);
  if (m.startsWith('MISSING_KEY:'))
    return err(`Server setup incomplete: ${m.slice(12).trim()} is not set in the Vercel environment variables.`, 500);
  if (m.includes('HTTP_429')) return err('Too many requests right now. Wait a minute and try again shortly.', 429);
  if (m.includes('HTTP_')) return err('A data service is unavailable. Try again shortly.', 502);
  if (m.startsWith('NO_DATA'))
    return err((m.startsWith('NO_DATA:') ? m.slice(8).trim() : '') || 'No data found for that request.', 404);
  if (m.includes('LEAGUE_NOT_FOUND')) return err('Could not identify the league. Pick it from the league list.', 400);
  if (m.includes('PARSE_FAILED')) return err('Could not understand that query. Try: Arsenal vs Chelsea corners over 6.5.', 400);
  if (m.includes('EMPTY_INPUT')) return err('Paste some text first.', 400);
  return err('Something went wrong. Try again.', 500);
};
// Returns a cleaned string[]: non-strings and empties dropped, each item trimmed and cut to 200 chars,
// first 20 kept (absent -> []). Returns null only if the value is present but not an array.
const list = (v: unknown): string[] | null => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return null;
  return v
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim().slice(0, 200))
    .filter((x) => x !== '')
    .slice(0, 20);
};
// Returns a trimmed string cut to 200 chars, or undefined if absent, not a string, or blank.
const text = (v: unknown): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const t = v.trim().slice(0, 200);
  return t === '' ? undefined : t;
};

export async function POST(req: Request): Promise<Response> {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return bad();
  const raw = typeof b.raw === 'string' ? b.raw.trim() : '';
  if (raw.length < 3 || raw.length > 300)
    return bad('Type a match and market, e.g. Arsenal vs Chelsea corners over 6.5.');
  const t = b.threshold === undefined ? 0.85 : b.threshold;
  if (typeof t !== 'number' || !Number.isFinite(t) || t < 0.5 || t > 0.99) return bad();
  const cid = typeof b.competitionId === 'string' ? b.competitionId : undefined;
  if (b.competitionId !== undefined && (cid === undefined || cid.length > 30)) return bad();
  let gap: GapFacts | undefined;
  if (b.gap !== undefined && b.gap !== null) {
    if (typeof b.gap !== 'object' || Array.isArray(b.gap)) return bad();
    const g = b.gap as Record<string, unknown>;
    const injuries = list(g.injuries);
    const expectedLineup = list(g.expectedLineup);
    const lateNews = list(g.lateNews);
    if (!injuries || !expectedLineup || !lateNews) return bad('Invalid request: the extra info is malformed.');
    gap = { injuries, expectedLineup, weather: text(g.weather), referee: text(g.referee), lateNews };
  }
  try {
    return json(await analyze(raw, t, gap, cid));
  } catch (e) {
    return fail(e);
  }
}
