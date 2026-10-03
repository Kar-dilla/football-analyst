import { analyze } from '@/lib/orchestrate';
import type { GapFacts, MarketKind, ParsedQuery } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const bad = (error = 'Invalid request.') => json({ error }, 400);
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
// Returns a cleaned string[] (max 20 items, each <= 200 chars), or null if invalid.
const list = (v: unknown): string[] | null => {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > 20) return null;
  if (!v.every((x) => typeof x === 'string' && x.length <= 200)) return null;
  return (v as string[]).map((x) => x.trim()).filter((x) => x !== '');
};
// Returns a trimmed string (<= 200 chars, '' if absent), or null if invalid.
const text = (v: unknown): string | null =>
  v === undefined || v === null ? '' : typeof v === 'string' && v.length <= 200 ? v.trim() : null;
const MARKETS = ['goals_ou', 'btts', '1x2', 'double_chance', 'fh_goals_ou', 'sh_goals_ou', 'corners_ou', 'cards_ou', 'window_goals', 'fh_subs'];
const SIDES = ['over', 'under', 'yes', 'no', '1', 'X', '2', '1X', 'X2', '12'];
// Returns a cleaned ParsedQuery, or null if invalid.
const presetOf = (v: unknown): ParsedQuery | null => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const q = v as Record<string, unknown>;
  const nm = (s: unknown) => (typeof s === 'string' && s.trim() !== '' && s.trim().length <= 60 ? s.trim() : '');
  const fin = (x: unknown) => x === undefined || x === null || (typeof x === 'number' && Number.isFinite(x));
  if (!nm(q.home) || !nm(q.away) || typeof q.raw !== 'string' || q.raw.length > 200) return null;
  if (typeof q.market !== 'string' || !MARKETS.includes(q.market) || !fin(q.line) || !fin(q.windowMinutes)) return null;
  if ((q.side != null && (typeof q.side !== 'string' || !SIDES.includes(q.side))) || (q.competitionId != null && typeof q.competitionId !== 'string')) return null;
  return { home: nm(q.home), away: nm(q.away), market: q.market as MarketKind, side: (q.side ?? undefined) as ParsedQuery['side'], line: (q.line ?? undefined) as number | undefined, windowMinutes: (q.windowMinutes ?? undefined) as number | undefined, competitionId: (q.competitionId ?? undefined) as string | undefined, raw: q.raw as string };
};

export async function POST(req: Request): Promise<Response> {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return bad();
  const pq = b.query === undefined || b.query === null ? undefined : presetOf(b.query);
  if (pq === null) return bad();
  const raw = typeof b.raw === 'string' ? b.raw.trim() : '';
  if (raw.length > 300 || (!pq && raw.length < 3))
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
    const weather = text(g.weather);
    const referee = text(g.referee);
    if (!injuries || !expectedLineup || !lateNews || weather === null || referee === null) return bad();
    gap = { injuries, expectedLineup, weather, referee: referee || undefined, lateNews };
  }
  try {
    return json(await analyze(raw, t, gap, cid, pq));
  } catch (e) {
    return fail(e);
  }
}
