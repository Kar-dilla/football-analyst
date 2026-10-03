import { bestPicks } from '@/lib/best';
import type { AllowedLines, AllowedRange } from '@/lib/best';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const bad = (error = 'Invalid request.') => json({ error }, 400);
const fail = (e: unknown): Response => {
  const m = e instanceof Error ? e.message : '';
  const err = (error: string, status: number) => json({ error }, status);
  if (m.startsWith('MISSING_KEY:')) return err(`Server setup incomplete: ${m.slice(12).trim()} is not set in the Vercel environment variables.`, 500);
  if (m.includes('HTTP_429')) return err('Too many requests right now. Wait a minute and try again shortly.', 429);
  if (m.includes('HTTP_')) return err('A data service is unavailable. Try again shortly.', 502);
  if (m.startsWith('NO_DATA')) return err((m.startsWith('NO_DATA:') ? m.slice(8).trim() : '') || 'No data found for that request.', 404);
  if (m.includes('LEAGUE_NOT_FOUND')) return err('Could not identify the league. Pick it from the league list.', 400);
  if (m.includes('PARSE_FAILED')) return err('Could not understand that query. Try: Arsenal vs Chelsea corners over 6.5.', 400);
  if (m.includes('EMPTY_INPUT')) return err('Paste some text first.', 400);
  return err('Something went wrong. Try again.', 500);
};
const num = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 20;
const range = (r: unknown): AllowedRange | null => {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const { overMin, overMax, underMin, underMax } = r as Record<string, unknown>;
  return [overMin, overMax, underMin, underMax].every(num) ? ({ overMin, overMax, underMin, underMax } as AllowedRange) : null;
};
const allowedOf = (v: unknown): AllowedLines | null | undefined => {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const [goals, firsthalf, secondhalf, corners, cards] = [o.goals, o.firsthalf, o.secondhalf, o.corners, o.cards].map(range);
  return goals && firsthalf && secondhalf && corners && cards ? { goals, firsthalf, secondhalf, corners, cards } : null;
};

export async function POST(req: Request): Promise<Response> {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b !== 'object' || Array.isArray(b)) return bad();
  const match = typeof b.match === 'string' ? b.match.trim() : '';
  if (match.length < 3 || match.length > 120) return bad('Type a match, e.g. Arsenal vs Chelsea.');
  const cid = typeof b.competitionId === 'string' ? b.competitionId.trim() : '';
  if (!cid || cid.length > 30) return bad();
  const m0 = b.mine;
  if (m0 !== undefined && m0 !== null && (typeof m0 !== 'string' || m0.length > 80)) return bad();
  const allowed = allowedOf(b.allowed);
  const mp = b.maxProbability;
  if (allowed === null || (mp !== undefined && mp !== null && (typeof mp !== 'number' || !(mp >= 0.5 && mp <= 1)))) return bad();
  try {
    return json(await bestPicks(match, cid, typeof m0 === 'string' ? m0.trim() || undefined : undefined, allowed, typeof mp === 'number' ? mp : undefined));
  } catch (e) {
    return fail(e);
  }
}
