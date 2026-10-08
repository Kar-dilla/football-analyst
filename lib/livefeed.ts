import { getOrSet } from '@/lib/cache';

export interface LiveMatch { home: string; away: string; state: 'pre' | 'in' | 'post'; minute: number | null; homeGoals: number; awayGoals: number; homeReds: number | null; awayReds: number | null; stats: { home: TeamLive; away: TeamLive } | null }
export interface Fixture { home: string; away: string; kickoff: string }
export interface TeamLive { shots: number | null; shotsOnTarget: number | null; corners: number | null; possession: number | null; fouls: number | null; yellows: number | null }   // possession is a percent 0-100

// Loose shape of ESPN's unofficial JSON: every field is optional and re-checked at runtime.
interface Team { id?: unknown; displayName?: unknown }
interface Side { homeAway?: unknown; score?: unknown; team?: Team; statistics?: unknown }
interface Detail { redCard?: unknown; yellowCard?: unknown; type?: { text?: unknown }; team?: Team }
interface Comp { competitors?: unknown; details?: unknown }
interface Ev { status?: { displayClock?: unknown; type?: { state?: unknown; description?: unknown } }; competitions?: unknown }

const SLUGS: Record<string, string> = {
  epl: 'eng.1', seriea: 'ita.1', laliga: 'esp.1', bundesliga: 'ger.1', ligue1: 'fra.1',
  eredivisie: 'ned.1', portugal: 'por.1', belgium: 'bel.1', superlig: 'tur.1', brazil: 'bra.1',
  mls: 'usa.1', japan: 'jpn.1', saudi: 'ksa.1', india: 'ind.1', ucl: 'uefa.champions',
  uel: 'uefa.europa', uecl: 'uefa.europa.conf', nations: 'uefa.nations', worldcup: 'fifa.world',
  afcon: 'caf.nations',
};

const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

function minuteOf(ev: Ev): number | null {
  const t = ev.status?.type;
  if (t?.state !== 'in') return null;
  if (t?.description === 'Halftime') return 45;
  const m = /^(\d+)(?:\+(\d+))?/.exec(String(ev.status?.displayClock ?? '').replace(/['’\s]/g, ''));
  return m ? Math.min(120, Math.max(1, Number(m[1]) + Number(m[2] ?? 0))) : null;
}

function redsOf(comp: Comp, h: Side, a: Side): [number | null, number | null] {
  if (!Array.isArray(comp.details)) return [null, null];
  let hr = 0;
  let ar = 0;
  for (const d of comp.details as Detail[]) {
    const isRed = d?.redCard === true || /red card/i.test(String(d?.type?.text ?? ''));
    const id = d?.team?.id;
    if (!isRed || id == null) continue;
    const key = String(id);
    if (key === String(h.team?.id)) hr++;
    else if (key === String(a.team?.id)) ar++;
  }
  return [hr, ar];
}

function teamLive(side: Side, details: unknown): TeamLive {
  const by = new Map<string, number | null>();
  for (const s of arr(side.statistics) as { name?: unknown; displayValue?: unknown }[]) {
    const k = str(s?.name);
    if (k && !by.has(k)) by.set(k, num(s?.displayValue));
  }
  const id = side.team?.id;
  let yellows: number | null = null;
  if (Array.isArray(details) && id != null) {
    yellows = 0;
    for (const d of details as Detail[]) {
      const did = d?.team?.id;
      if (d?.yellowCard === true && did != null && String(did) === String(id)) yellows++;
    }
  }
  return {
    shots: by.get('totalShots') ?? null,
    shotsOnTarget: by.get('shotsOnTarget') ?? null,
    corners: by.get('wonCorners') ?? null,
    possession: by.get('possessionPct') ?? null,
    fouls: by.get('foulsCommitted') ?? null,
    yellows,
  };
}

function parse(data: unknown): LiveMatch[] {
  const out: LiveMatch[] = [];
  for (const raw of arr((data as { events?: unknown } | null)?.events)) {
    try {
      const ev = raw as Ev;
      const s = ev?.status?.type?.state;
      if (s !== 'pre' && s !== 'in' && s !== 'post') continue;
      const state = s as LiveMatch['state'];
      const comp = arr(ev.competitions)[0] as Comp | undefined;
      const sides = arr(comp?.competitors) as Side[];
      const h = sides.find((x) => x?.homeAway === 'home');
      const a = sides.find((x) => x?.homeAway === 'away');
      const home = str(h?.team?.displayName);
      const away = str(a?.team?.displayName);
      if (!comp || !h || !a || !home || !away) continue;
      const [homeReds, awayReds] = redsOf(comp, h, a);
      const stats = Array.isArray(h.statistics) || Array.isArray(a.statistics) ? { home: teamLive(h, comp.details), away: teamLive(a, comp.details) } : null;
      out.push({ home, away, state, minute: minuteOf(ev), homeGoals: Number(h.score) || 0, awayGoals: Number(a.score) || 0, homeReds, awayReds, stats });
    } catch {
      // skip a malformed event
    }
  }
  return out;
}

async function fetchScoreboard(slug: string, date?: string): Promise<unknown> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const res = await fetch(`https://site.api.espn.com/apis/site/v2/sports/soccer/${slug}/scoreboard${date ? `?dates=${date}` : ''}`, { signal: ctl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(`ESPN ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchLive(competitionId: string, includeAll?: boolean): Promise<LiveMatch[]> {
  const slug = Object.prototype.hasOwnProperty.call(SLUGS, competitionId) ? SLUGS[competitionId] : '';
  if (!slug) return [];
  try {
    const data = await getOrSet<unknown>('espn:' + slug, 20000, () => fetchScoreboard(slug));
    return parse(data).filter((m) => includeAll || m.state === 'in');
  } catch {
    return [];
  }
}

export function espnSlug(competitionId: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(SLUGS, competitionId) ? SLUGS[competitionId] : undefined;
}

const ymd = (ms: number): string => new Date(ms).toISOString().slice(0, 10).replace(/-/g, '');

function parseFixtures(data: unknown, from: number, to: number, seen: Set<string>): Fixture[] {
  const out: Fixture[] = [];
  for (const raw of arr((data as { events?: unknown } | null)?.events)) {
    try {
      const ev = raw as Ev & { id?: unknown; date?: unknown };
      const st = ev?.status?.type as { state?: unknown; description?: unknown; name?: unknown } | undefined;
      if (st?.state !== 'pre') continue;
      if (/postpon|cancel|suspend|abandon/i.test(`${str(st.description)} ${str(st.name)}`)) continue;
      const t = Date.parse(str(ev.date));
      if (!Number.isFinite(t) || t < from || t >= to) continue;
      const sides = arr((arr(ev.competitions)[0] as Comp | undefined)?.competitors) as Side[];
      const home = str(sides.find((x) => x?.homeAway === 'home')?.team?.displayName);
      const away = str(sides.find((x) => x?.homeAway === 'away')?.team?.displayName);
      if (!home || !away) continue;
      const key = ev.id != null && ev.id !== '' ? String(ev.id) : `${home}|${away}|${t}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ home, away, kickoff: new Date(t).toISOString() });
    } catch {
      // skip a malformed event
    }
  }
  return out;
}

export async function fetchFixtures(competitionId: string, day: 'today' | 'tomorrow', tzOffsetMinutes: number): Promise<{ fixtures: Fixture[]; datesSupported: boolean }> {
  const slug = espnSlug(competitionId);
  if (!slug) return { fixtures: [], datesSupported: false };
  const tz = Number.isFinite(tzOffsetMinutes) ? tzOffsetMinutes : 0;
  const start = Math.floor((Date.now() + tz * 60000) / 86400000) * 86400000 - tz * 60000 + (day === 'tomorrow' ? 86400000 : 0);
  const end = start + 86400000;
  const dates = Array.from(new Set([start - 86400000, start, end].map(ymd)));
  const got = await Promise.all(dates.map(async (d) => {
    try { return { data: await getOrSet<unknown>(`espn:${slug}:${d}`, 60000, () => fetchScoreboard(slug, d)) }; } catch { return null; }
  }));
  const done = got.filter((g): g is { data: unknown } => g !== null);
  let sources = done.map((g) => g.data);
  let datesSupported = true;
  if (!done.length) {
    if (day === 'tomorrow') return { fixtures: [], datesSupported: false };
    datesSupported = false;
    try { sources = [await getOrSet<unknown>('espn:' + slug, 20000, () => fetchScoreboard(slug))]; } catch { sources = []; }
  }
  const seen = new Set<string>();
  const fixtures = sources.flatMap((d) => parseFixtures(d, start, end, seen)).sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  return { fixtures, datesSupported };
}
