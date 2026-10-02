import { getOrSet } from '@/lib/cache';
import { allCompetitions } from '@/lib/registry';

const BASE = 'https://v3.football.api-sports.io';
const H = 3_600_000;
const MIN_FIXTURES = 5;
const FALLBACK_SEASONS = [2025, 2024, 2023];

interface Item {
  team?: { id?: number; name?: string };
  player?: { name?: string };
  fixture?: { id?: number; date?: string; status?: { elapsed?: number | null; short?: string } };
  league?: { id?: number };
  teams?: { home?: { name?: string }; away?: { name?: string } };
  events?: { type?: string; detail?: string; time?: { elapsed?: number | null }; team?: { id?: number } }[];
  startXI?: { player?: { name?: string } }[];
}
type Events = { goalMinutes: number[]; fhSubRate: number };
type Season = Events & { completed: number };
type Gap = { injuries: string[]; expectedLineup: string[] };
type Live = { id: number; home: string; away: string; minute: number | null; status: string };

function call(path: string, key: string, ttlMs: number): Promise<Item[]> {
  return getOrSet<Item[]>(key, ttlMs, async () => {
    const apiKey = process.env.API_FOOTBALL_KEY;
    if (!apiKey) throw new Error('API_FOOTBALL_KEY missing');
    const res = await fetch(BASE + path, { headers: { 'x-apisports-key': apiKey }, cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = (await res.json()) as { errors?: unknown; response?: unknown };
    const e = json.errors;
    const failed = Array.isArray(e) ? e.length > 0 : !!e && typeof e === 'object' && Object.keys(e).length > 0;
    if (failed) throw new Error('API-Football reported errors');
    return Array.isArray(json.response) ? (json.response as Item[]) : [];
  });
}

async function teamId(name: string): Promise<number | null> {
  const n = name.trim();
  const lc = n.toLowerCase();
  const list = await call('/teams?search=' + encodeURIComponent(n), 'af:team:' + lc, 168 * H);
  const hit = list.find((r) => (r.team?.name ?? '').toLowerCase() === lc) ?? list[0];
  const id = hit?.team?.id;
  return typeof id === 'number' ? id : null;
}

// Goal minutes + first-half-sub rate over a set of fixtures that include events.
// `completed` = how many of those fixtures have status FT.
function summarize(id: number, fixtures: Item[]): Season | null {
  if (fixtures.length === 0) return null;
  const goalMinutes: number[] = [];
  let fhSubs = 0;
  for (const fx of fixtures) {
    const events = fx.events ?? [];
    for (const ev of events) {
      const m = ev.time?.elapsed;
      if (ev.type === 'Goal' && ev.detail !== 'Missed Penalty' && typeof m === 'number' && m >= 0 && m <= 120) {
        goalMinutes.push(m);
      }
    }
    if (events.some((ev) => ev.team?.id === id && (ev.type ?? '').toLowerCase() === 'subst' && (ev.time?.elapsed ?? 999) <= 45)) {
      fhSubs++;
    }
  }
  const completed = fixtures.filter((f) => f.fixture?.status?.short === 'FT').length;
  return goalMinutes.length > 0 ? { goalMinutes, fhSubRate: fhSubs / fixtures.length, completed } : null;
}

// Current method (last=10). Never throws; failures are not cached and give null.
async function currentSeason(team: string, lc: string): Promise<Season | null> {
  try {
    return await getOrSet<Season | null>('af:events:' + lc, 12 * H, async () => {
      const id = await teamId(team);
      if (id === null) return null;
      const last = await call(`/fixtures?team=${id}&last=10`, `af:last:${id}`, 12 * H);
      const ids = last.map((f) => f.fixture?.id).filter((x): x is number => typeof x === 'number');
      if (ids.length === 0) return null;
      const joined = ids.join('-');
      const fixtures = await call(`/fixtures?ids=${joined}`, `af:ids:${joined}`, 12 * H);
      return summarize(id, fixtures);
    });
  } catch {
    return null;
  }
}

// Older season s: all fixtures for the season, keep FT, newest 5 by date.
// Free plans block /fixtures?ids=, so events come from one /fixtures/events call per fixture.
// Throws on API failure (so getOrSet does not cache it); the caller catches.
function olderSeason(lc: string, id: number, s: number): Promise<Season | null> {
  return getOrSet<Season | null>(`af:events:${lc}:${s}`, 168 * H, async () => {
    const all = await call(`/fixtures?team=${id}&season=${s}`, `af:season:${id}:${s}`, 168 * H);
    const stamp = (f: Item): number => Date.parse(f.fixture?.date ?? '') || 0;
    const ids = all
      .filter((f) => f.fixture?.status?.short === 'FT' && typeof f.fixture?.id === 'number')
      .sort((a, b) => stamp(b) - stamp(a))
      .slice(0, MIN_FIXTURES)
      .map((f) => f.fixture?.id)
      .filter((x): x is number => typeof x === 'number');
    if (ids.length < MIN_FIXTURES) return null;
    const fixtures: Item[] = await Promise.all(
      ids.map(async (fid) => ({
        fixture: { id: fid, status: { short: 'FT' } },
        events: (await call(`/fixtures/events?fixture=${fid}`, `af:fxevents:${fid}`, 168 * H)) as unknown as Item['events'],
      })),
    );
    return summarize(id, fixtures);
  });
}

export async function getRecentEvents(team: string): Promise<{ goalMinutes: number[]; fhSubRate: number; season?: number } | null> {
  try {
    const lc = team.trim().toLowerCase();
    const current = await currentSeason(team, lc);
    const own = current ? { goalMinutes: current.goalMinutes, fhSubRate: current.fhSubRate } : null;
    if (current && current.completed >= MIN_FIXTURES) return own;

    const id = await teamId(team).catch(() => null);
    if (id === null) return own;
    for (const s of FALLBACK_SEASONS) {
      try {
        const r = await olderSeason(lc, id, s);
        if (r && r.completed >= MIN_FIXTURES) {
          return { goalMinutes: r.goalMinutes, fhSubRate: r.fhSubRate, season: s };
        }
      } catch {
        // failure (not cached): try the next season
      }
    }
    // no older season qualified: keep whatever the current season gave (or null)
    return own;
  } catch {
    return null;
  }
}

export async function getLineupsAndInjuries(fixture: { home: string; away: string }): Promise<{ injuries: string[]; expectedLineup: string[] } | null> {
  const key = `af:lineups:${fixture.home.trim().toLowerCase()}:${fixture.away.trim().toLowerCase()}`;
  try {
    return await getOrSet<Gap | null>(key, 2 * H, async () => {
      const id = await teamId(fixture.home);
      if (id === null) return null;
      const next = await call(`/fixtures?team=${id}&next=1`, `af:next:${id}`, 2 * H);
      const fid = next[0]?.fixture?.id;
      if (typeof fid !== 'number') return null;
      const [inj, lineups] = await Promise.all([
        call(`/injuries?fixture=${fid}`, `af:inj:${fid}`, 2 * H),
        call(`/fixtures/lineups?fixture=${fid}`, `af:lineup:${fid}`, 2 * H),
      ]);
      const injuries = inj.filter((r) => !!r.player?.name).map((r) => `${r.player?.name} (${r.team?.name ?? '?'})`);
      const expectedLineup = lineups.flatMap((t) => (t.startXI ?? []).map((p) => p.player?.name)).filter((n): n is string => !!n);
      return { injuries, expectedLineup };
    });
  } catch {
    return null;
  }
}

export async function getLiveFixtures(): Promise<{ id: number; home: string; away: string; minute: number | null; status: string }[]> {
  try {
    const ids = new Set(allCompetitions().map((c) => c.apiFootballId).filter((x): x is number => typeof x === 'number'));
    const live = await call('/fixtures?live=all', 'af:live', 60_000);
    const out: Live[] = [];
    for (const f of live) {
      const id = f.fixture?.id;
      const lid = f.league?.id;
      if (typeof id !== 'number' || typeof lid !== 'number' || !ids.has(lid)) continue;
      const m = f.fixture?.status?.elapsed;
      out.push({
        id,
        home: f.teams?.home?.name ?? '',
        away: f.teams?.away?.name ?? '',
        minute: typeof m === 'number' ? m : null,
        status: f.fixture?.status?.short ?? '',
      });
    }
    return out;
  } catch {
    return [];
  }
}
