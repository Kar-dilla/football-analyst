import { getOrSet } from '@/lib/cache';
import type { Price } from '@/lib/pricesClient';

const BASE = 'https://v3.football.api-sports.io';
const MIN = 60_000;

interface Fx { fixture?: { id?: number }; teams?: { home?: { name?: string }; away?: { name?: string } } }
interface Bet { name?: string; values?: { value?: string; odd?: string }[] }
interface Book { name?: string; bets?: Bet[] }
interface OddsItem { bookmakers?: Book[] }

async function api(path: string): Promise<unknown[]> {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) throw new Error('API_FOOTBALL_KEY missing');
  const res = await fetch(BASE + path, { headers: { 'x-apisports-key': key }, cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = (await res.json()) as { errors?: unknown; response?: unknown };
  const e = j.errors;
  if (Array.isArray(e) ? e.length > 0 : !!e && typeof e === 'object' && Object.keys(e).length > 0) throw new Error('API-Football errors');
  return Array.isArray(j.response) ? j.response : [];
}

const STOP = new Set(['fc', 'cf', 'afc', 'sc', 'ac', 'fk', 'sk', 'bk', 'if', 'cd', 'ud', 'sd', 'club', 'the', 'de']);
const toks = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((t) => t && !STOP.has(t));
function same(a: string, b: string): boolean {
  const x = toks(a), y = toks(b);
  if (!x.length || !y.length) return false;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  return s.every((t) => l.some((u) => u.startsWith(t) || t.startsWith(u)));
}

const day = (d: Date) => d.toISOString().slice(0, 10);

// Free plan only serves fixtures from yesterday to tomorrow, so other dates are skipped (no call, no quota).
export async function findFixtureId(home: string, away: string, kickoff?: string): Promise<number | null> {
  const now = Date.now();
  const ok = new Set([-1, 0, 1].map((o) => day(new Date(now + o * 86400000))));
  let dates = Array.from(ok);
  if (kickoff) {
    const t = Date.parse(kickoff);
    if (!Number.isFinite(t)) return null;
    dates = [day(new Date(t))].filter((d) => ok.has(d));
  }
  for (const d of dates) {
    const list = await getOrSet<Fx[]>('odds:fx:' + d, 60 * MIN, async () => (await api('/fixtures?date=' + d)) as Fx[]);
    const hit = list.find((f) => same(f.teams?.home?.name ?? '', home) && same(f.teams?.away?.name ?? '', away));
    if (typeof hit?.fixture?.id === 'number') return hit.fixture.id;
  }
  return null;
}

export function getBookmakers(id: number): Promise<Book[]> {
  return getOrSet<Book[]>('odds:bm:' + id, 30 * MIN, async () => {
    const r = (await api('/odds?fixture=' + id)) as OddsItem[];
    return r[0]?.bookmakers ?? [];
  });
}

const MK: Record<string, string> = {
  goals_ou: 'Goals Over/Under', btts: 'Both Teams Score', '1x2': 'Match Winner', double_chance: 'Double Chance',
  fh_goals_ou: 'Goals Over/Under First Half', sh_goals_ou: 'Goals Over/Under - Second Half',
  corners_ou: 'Corners Over Under', cards_ou: 'Cards Over/Under',
};
const SIDE: Record<string, string> = { '1': 'Home', X: 'Draw', '2': 'Away', '1X': 'Home/Draw', '12': 'Home/Away', X2: 'Draw/Away', yes: 'Yes', no: 'No' };

export function bestPrice(bms: Book[], market: string, side?: string, line?: number): Price | null {
  const name = MK[market];
  if (!name || !side) return null;
  const ou = side === 'over' || side === 'under';
  if (ou && typeof line !== 'number') return null;
  const want = ou ? side : SIDE[side];
  let best: Price | null = null;
  for (const b of bms) {
    for (const bet of b.bets ?? []) {
      if (bet.name !== name) continue;
      for (const v of bet.values ?? []) {
        const m = (v.value ?? '').trim();
        const p = m.split(/\s+/);
        const hit = ou ? p[0]?.toLowerCase() === want && Number(p[1]) === line : m === want;
        const odd = Number(v.odd);
        if (hit && odd > 1 && (!best || odd > best.odd)) best = { odd, book: b.name ?? '' };
      }
    }
  }
  return best;
}
