import { livePicks } from '@/lib/live';
import type { LiveState } from '@/lib/live';
import type { AllowedRange } from '@/lib/best';
import type { TeamLive } from '@/lib/livefeed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const bad = (error = 'Invalid request.') => json({ error }, 400);
const fail = (e: unknown): Response => {
  const m = e instanceof Error ? e.message : '';
  const err = (error: string, status: number) => json({ error }, status);
  if (m.startsWith('MISSING_KEY:')) return err(`Server setup incomplete: ${m.slice(12).trim()} is not set in the Vercel environment variables.`, 500);
  if (m.includes('HTTP_429')) return err('Too many requests right now. Wait a minute and try again shortly.', 429);
  if (m.includes('HTTP_')) return err('A data service is unavailable. Try again shortly.', 502);
  if (m.includes('NO_DATA:')) return err((m.startsWith('NO_DATA:') ? m.slice(8).trim() : '') || 'No data found for that request.', 404);
  if (m.includes('LEAGUE_NOT_FOUND')) return err('Could not identify the league. Pick it from the league list.', 400);
  if (m.includes('PARSE_FAILED')) return err('Could not understand that query. Try: Arsenal vs Chelsea corners over 6.5.', 400);
  if (m.includes('EMPTY_INPUT')) return err('Paste some text first.', 400);
  return err('Something went wrong. Try again.', 500);
};
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const inRange = (v: unknown, lo = -Infinity, hi = Infinity): boolean => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

const TEAM_KEYS = ['shots', 'shotsOnTarget', 'corners', 'possession', 'fouls', 'yellows'] as const;
// One team's live stats: each field null (or missing) or a finite number from 0 to 300 (possession 0 to 100).
const teamLive = (v: unknown): TeamLive | null => {
  if (!isObj(v)) return null;
  const out: TeamLive = { shots: null, shotsOnTarget: null, corners: null, possession: null, fouls: null, yellows: null };
  for (const k of TEAM_KEYS) {
    const x = v[k];
    if (x === undefined || x === null) continue;
    if (!inRange(x, 0, k === 'possession' ? 100 : 300)) return null;
    out[k] = x as number;
  }
  return out;
};

export async function POST(req: Request): Promise<Response> {
  const b = await req.json().catch(() => null);
  if (!isObj(b)) return bad();
  const match = typeof b.match === 'string' ? b.match.trim() : '';
  const cid = b.competitionId;
  if (match.length < 3 || match.length > 120) return bad();
  if (typeof cid !== 'string' || cid.length < 1 || cid.length > 30) return bad();
  const s = b.state;
  if (!isObj(s)) return bad();
  const keys = ['minute', 'homeGoals', 'awayGoals', 'homeReds', 'awayReds'];
  if (!keys.every((k) => inRange(s[k]))) return bad();
  const state: LiveState = { minute: s.minute as number, homeGoals: s.homeGoals as number, awayGoals: s.awayGoals as number, homeReds: s.homeReds as number, awayReds: s.awayReds as number };
  for (const k of ['corners', 'yellows'] as const) {
    if (s[k] === undefined || s[k] === null) continue;
    if (!inRange(s[k], 0, k === 'corners' ? 40 : 20)) return bad();
    state[k] = s[k] as number;
  }
  if (s.stats !== undefined && s.stats !== null) {
    const st = s.stats;
    const home = isObj(st) ? teamLive(st.home) : null;
    const away = isObj(st) ? teamLive(st.away) : null;
    if (!home || !away) return bad();
    state.stats = { home, away };
  }
  const mine = b.mine === undefined || b.mine === null ? undefined : b.mine;
  if (mine !== undefined && (typeof mine !== 'string' || mine.length > 80)) return bad();
  let allowed: AllowedRange | undefined;
  if (b.allowedGoals !== undefined && b.allowedGoals !== null) {
    const g = b.allowedGoals;
    if (!isObj(g) || !['overMin', 'overMax', 'underMin', 'underMax'].every((k) => inRange(g[k], 0, 20))) return bad();
    allowed = { overMin: g.overMin as number, overMax: g.overMax as number, underMin: g.underMin as number, underMax: g.underMax as number };
  }
  const mp = b.maxProbability === undefined || b.maxProbability === null ? undefined : b.maxProbability;
  if (mp !== undefined && !inRange(mp, 0.5, 1)) return bad();
  const mf = b.minFairOdds === undefined || b.minFairOdds === null ? undefined : b.minFairOdds;
  if (mf !== undefined && !inRange(mf, 1.01, 3)) return bad();
  try {
    return json(await livePicks(match, cid, state, mine as string | undefined, allowed, mp as number | undefined, mf as number | undefined));
  } catch (e) {
    return fail(e);
  }
}
