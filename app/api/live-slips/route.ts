import { fetchLive, espnSlug } from '@/lib/livefeed';
import type { LiveMatch, TeamLive } from '@/lib/livefeed';
import { livePicks } from '@/lib/live';
import type { LiveItem, LiveState } from '@/lib/live';
import { getCompetition } from '@/lib/registry';
import type { DailyLeg } from '@/lib/dailySlips';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// handicap and fhdc (1st half double chance) are the extra live markets.
const MARKETS = ['goals', 'btts', 'result', 'doublechance', 'nextgoal', 'corners', 'cards', 'handicap', 'fhdc'];
const MAX_MATCHES = 8;
const CONCURRENCY = 3;
const TIMEOUT_MS = 15000;

interface F { minP: number; maxP: number; markets: string[]; minLegOdds: number; minMinute: number; maxMinute: number; fullStatsOnly: boolean }

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

// Bad or missing values fall back to the defaults. minP is at least 0.55, maxP at most 0.99.
function readFilters(raw: unknown): F {
  const r: Record<string, unknown> = isObj(raw) ? raw : {};
  const n = (v: unknown, d: number, lo: number, hi: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  let minP = n(r.minP, 0.8, 0.55, 0.99);
  let maxP = n(r.maxP, 0.88, 0.55, 0.99);
  if (minP > maxP) [minP, maxP] = [maxP, minP];
  const ms = Array.isArray(r.markets) ? r.markets.filter((x): x is string => typeof x === 'string' && MARKETS.includes(x)) : [];
  let lo = Math.round(n(r.minMinute, 15, 1, 120));
  let hi = Math.round(n(r.maxMinute, 80, 1, 120));
  if (lo > hi) { lo = 15; hi = 80; }
  return { minP, maxP, markets: ms.length ? ms : [...MARKETS], minLegOdds: n(r.minLegOdds, 1.1, 1, 20), minMinute: lo, maxMinute: hi, fullStatsOnly: r.fullStatsOnly === true };
}

const whole = (v: number, hi: number): number => Math.min(hi, Math.max(0, Math.round(Number.isFinite(v) ? v : 0)));
const cl = (v: number | null, hi: number): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(0, v)) : null);
const team = (t: TeamLive): TeamLive => ({ shots: cl(t.shots, 300), shotsOnTarget: cl(t.shotsOnTarget, 300), corners: cl(t.corners, 300), possession: cl(t.possession, 100), fouls: cl(t.fouls, 300), yellows: cl(t.yellows, 300) });

// State for livePicks, clamped to the limits livePicks validates.
function stateOf(m: LiveMatch, minute: number): LiveState {
  const hs = m.stats?.home;
  const as = m.stats?.away;
  const corners = hs && as && typeof hs.corners === 'number' && typeof as.corners === 'number' ? whole(hs.corners + as.corners, 40) : undefined;
  const yellows = hs && as && typeof hs.yellows === 'number' && typeof as.yellows === 'number' ? whole(hs.yellows + as.yellows, 20) : undefined;
  return {
    minute: Math.min(120, Math.max(1, Math.round(minute))),
    homeGoals: whole(m.homeGoals, 20),
    awayGoals: whole(m.awayGoals, 20),
    homeReds: whole(m.homeReds ?? 0, 4),
    awayReds: whole(m.awayReds ?? 0, 4),
    ...(corners !== undefined ? { corners } : {}),
    ...(yellows !== undefined ? { yellows } : {}),
    ...(hs && as ? { stats: { home: team(hs), away: team(as) } } : {}),
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(null); });
  });
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const k = i++;
      out[k] = await fn(items[k]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return out;
}

// One in-play match -> at most one leg (the highest-probability candidate inside the filters). Never throws.
async function one(m: LiveMatch, cid: string, name: string, f: F): Promise<DailyLeg | null> {
  try {
    const minute = m.minute;
    if (minute === null) return null;
    const home = m.home;
    const away = m.away;
    const res = await withTimeout(livePicks(`${home} vs ${away}`, cid, stateOf(m, minute), undefined, undefined, undefined, f.minLegOdds, { all: true, skipNews: true, extra: true }), TIMEOUT_MS);
    let best: LiveItem | null = null;
    for (const c of res?.candidates ?? []) {
      if (c.probability < f.minP || c.probability > f.maxP || c.probability >= 0.995) continue;
      if (!f.markets.includes(c.group) || c.fairOdds < f.minLegOdds) continue;
      if (!best || c.probability > best.probability) best = c;
    }
    if (!best) return null;
    const now = new Date().toISOString();
    return { match: `${home} vs ${away}`, home, away, kickoff: now, competitionId: cid, competitionName: name, label: best.label, probability: best.probability, minute, score: `${m.homeGoals}-${m.awayGoals}`, pricedAt: now };
  } catch {
    return null;
  }
}

export async function POST(req: Request): Promise<Response> {
  try {
    const b = await req.json().catch(() => null);
    if (!isObj(b)) return json({ legs: [], error: 'Invalid request.' }, 400);
    const cid = b.competitionId;
    if (typeof cid !== 'string' || cid.length < 1 || cid.length > 30 || !espnSlug(cid)) return json({ legs: [], error: 'Invalid request.' }, 400);
    const competition = getCompetition(cid);
    if (!competition) return json({ legs: [], error: 'Could not identify the league.' }, 400);
    const f = readFilters(b.filters);
    if (f.fullStatsOnly && competition.tier !== 'A') return json({ legs: [] });
    const live = (await fetchLive(cid))
      .filter((m) => m.state === 'in' && m.minute !== null && m.minute >= f.minMinute && m.minute <= f.maxMinute)
      .slice(0, MAX_MATCHES);
    const out = await pool(live, CONCURRENCY, (m) => one(m, cid, competition.name, f));
    return json({ legs: out.filter((x): x is DailyLeg => x !== null) });
  } catch {
    return json({ legs: [] });
  }
}
