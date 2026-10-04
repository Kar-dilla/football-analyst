import type { Competition, MatchData, RefereeStats, TeamStats } from '@/lib/types';
import { getOrSet } from '@/lib/cache';
import { allCompetitions } from '@/lib/registry';
import { fitStrengths } from '@/lib/models/strengths';
import type { FitResult, MatchRow } from '@/lib/models/strengths';

type Row = Record<string, string>;
type Avg = MatchData['leagueAvg'];
const SIX_HOURS = 6 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const FIELDS = ['gf', 'ga', 'fhGf', 'fhGa', 'cornersFor', 'cornersAgainst', 'cardsFor', 'shotsFor', 'foulsFor', 'htZeroZeroRate'] as const;
const ALIAS: Record<string, string> = {
  'man united': 'manchester united', 'man utd': 'manchester united', 'man city': 'manchester city',
  spurs: 'tottenham', wolves: 'wolverhampton', forest: 'nottingham forest',
  'nott m forest': 'nottingham forest', 'ath madrid': 'atletico madrid',
  'paris sg': 'paris saint germain', psg: 'paris saint germain',
};

function key(s: string): string {
  const t = (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ');
  const w = t.split(' ').filter((x) => x && !['fc', 'afc', 'cf'].includes(x)).join(' ');
  return ALIAS[w] ?? w;
}

export function sameTeam(a: string, b: string): boolean {
  const x = key(a);
  const y = key(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [s, l] = x.length <= y.length ? [x, y] : [y, x];
  return s.length >= 3 && l.includes(s);
}

const num = (r: Row, k: string): number => {
  const v = parseFloat(r[k] ?? '');
  return isNaN(v) ? 0 : v;
};
const mean = (rows: Row[], ks: string[]): number =>
  rows.length ? rows.reduce((s, r) => s + ks.reduce((a, k) => a + num(r, k), 0), 0) / rows.length : 0;

function parse(text: string): Row[] {
  const lines = text.replace(/^\uFEFF/, '').replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];
  const head = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(',');
    const row: Row = {};
    head.forEach((h, i) => { if (h) row[h] = (cells[i] ?? '').trim(); });
    return row;
  });
}

async function fetchRows(path: string, ttl: number): Promise<Row[] | null> {
  try {
    return await getOrSet(`csv:${path}`, ttl, async () => {
      const res = await fetch(`https://www.football-data.co.uk/${path}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parse(await res.text());
    });
  } catch {
    return null;
  }
}

function priorPath(path: string): string | null {
  const m = path.match(/^(mmz4281\/)(\d{2})(\d{2})(\/.*)$/);
  const back = (s: string): string => String((parseInt(s, 10) + 99) % 100).padStart(2, '0');
  return m ? `${m[1]}${back(m[2])}${back(m[3])}${m[4]}` : null;
}

const played = (rows: Row[]): Row[] => rows.filter((r) => r.FTHG && r.FTAG);
const yr = (r: Row): number => parseInt((r.Season || '').slice(0, 4), 10) || 0;

async function load(c: Competition): Promise<{ cur: Row[]; prior: Row[] }> {
  const path = c.csvPath;
  if (!path) return { cur: [], prior: [] };
  const isNew = path.startsWith('new/');
  const pp = isNew ? null : priorPath(path);
  const [rows, old] = await Promise.all([fetchRows(path, SIX_HOURS), pp ? fetchRows(pp, DAY) : null]);
  if (!isNew) return { cur: played(rows ?? []), prior: played(old ?? []) };
  const all = rows ?? [];
  const seasons = Array.from(new Set(all.map(yr))).filter(Boolean).sort((a, b) => b - a);
  const pick = (s: number | undefined): Row[] =>
    s === undefined ? [] : played(all.filter((r) => yr(r) === s).map((r) => ({ ...r, HomeTeam: r.Home, AwayTeam: r.Away, FTHG: r.HG, FTAG: r.AG })));
  return { cur: pick(seasons[0]), prior: pick(seasons[1]) };
}

function statsFor(rows: Row[], team: string): TeamStats | null {
  if (!rows.length) return null;
  const names = Array.from(new Set(rows.map((r) => r.HomeTeam).concat(rows.map((r) => r.AwayTeam)))).filter(Boolean);
  const name = names.find((x) => key(x) === key(team)) ?? names.find((x) => sameTeam(x, team));
  if (!name) return null;
  const hasHT = 'HTHG' in rows[0] && 'HTAG' in rows[0];
  const t = { games: 0, gf: 0, ga: 0, fhGf: 0, fhGa: 0, cf: 0, ca: 0, cards: 0, shots: 0, fouls: 0, zz: 0 };
  for (const r of rows) {
    const home = r.HomeTeam === name;
    if (!home && r.AwayTeam !== name) continue;
    const [a, b] = home ? ['H', 'A'] : ['A', 'H']; // own side, opposing side
    t.games++;
    t.gf += num(r, `FT${a}G`);
    t.ga += num(r, `FT${b}G`);
    t.fhGf += num(r, `HT${a}G`);
    t.fhGa += num(r, `HT${b}G`);
    t.cf += num(r, `${a}C`);
    t.ca += num(r, `${b}C`);
    t.cards += num(r, `${a}Y`) + num(r, `${a}R`);
    t.shots += num(r, `${a}S`);
    t.fouls += num(r, `${a}F`);
    if (hasHT && num(r, 'HTHG') === 0 && num(r, 'HTAG') === 0) t.zz++;
  }
  const g = t.games;
  if (!g) return null;
  return {
    name, games: g, gf: t.gf / g, ga: t.ga / g, fhGf: t.fhGf / g, fhGa: t.fhGa / g,
    cornersFor: t.cf / g, cornersAgainst: t.ca / g, cardsFor: t.cards / g, shotsFor: t.shots / g,
    foulsFor: t.fouls / g, htZeroZeroRate: t.zz / g, goalMinutes: [],
  };
}

export async function loadTeamStats(competition: Competition, team: string): Promise<TeamStats | null> {
  const { cur, prior } = await load(competition);
  const a = statsFor(cur, team);
  const b = statsFor(prior, team);
  if (!b) return a;
  if (!a) return { ...b, games: Math.round(Math.min(b.games, 12)) };
  const kp = Math.max(0, Math.min(b.games, 12 - 0.4 * a.games));
  const w = a.games + kp;
  const out: TeamStats = { ...a, games: Math.round(w), goalMinutes: [] };
  for (const f of FIELDS) out[f] = (a.games * a[f] + kp * b[f]) / w;
  return out;
}

export async function loadTeamStatsAnywhere(team: string): Promise<{ stats: TeamStats; competition: Competition } | null> {
  const comps = allCompetitions().filter((c) => c.csvPath?.startsWith('mmz4281'));
  const found = await Promise.all(comps.map(async (c) => ({ c, stats: await loadTeamStats(c, team) })));
  const hit = found.find((f) => f.stats);
  return hit && hit.stats ? { stats: hit.stats, competition: hit.c } : null;
}

const leagueMeans = (rows: Row[]): Avg => ({
  goals: mean(rows, ['FTHG', 'FTAG']), fhGoals: mean(rows, ['HTHG', 'HTAG']),
  corners: mean(rows, ['HC', 'AC']), cards: mean(rows, ['HY', 'AY', 'HR', 'AR']),
});

export async function loadLeagueAvg(competition: Competition): Promise<MatchData['leagueAvg'] | null> {
  const { cur, prior } = await load(competition);
  const a = cur.length ? leagueMeans(cur) : null;
  const b = prior.length ? leagueMeans(prior) : null;
  if (!a || !b) return a ?? b;
  const mp = Math.max(0, Math.min(prior.length, 120 - 0.4 * cur.length));
  const mix = (x: number, y: number): number =>
    x === 0 ? y : y === 0 ? x : (cur.length * x + mp * y) / (cur.length + mp);
  return { goals: mix(a.goals, b.goals), fhGoals: mix(a.fhGoals, b.fhGoals), corners: mix(a.corners, b.corners), cards: mix(a.cards, b.cards) };
}

export async function loadReferee(competition: Competition, name: string): Promise<RefereeStats | null> {
  const { cur, prior } = await load(competition);
  const q = name.trim().toLowerCase();
  if (!q) return null;
  const mine = cur.concat(prior).filter((r) => {
    const x = (r.Referee || '').trim().toLowerCase();
    return !!x && (x.includes(q) || q.includes(x));
  });
  if (!mine.length) return null;
  return {
    name: mine[0].Referee, games: mine.length,
    cardsPerGame: mean(mine, ['HY', 'AY', 'HR', 'AR']), foulsPerGame: mean(mine, ['HF', 'AF']),
  };
}

// ---- team strengths: attack/defence multipliers fitted on current + prior season ----
function dayMs(s: string | undefined): number | null {
  const m = (s || '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})$/);
  if (!m) return null;
  const d = parseInt(m[1], 10), mo = parseInt(m[2], 10), y = parseInt(m[3], 10) + (m[3].length === 2 ? 2000 : 0);
  const t = Date.UTC(y, mo - 1, d), c = new Date(t);
  return c.getUTCFullYear() === y && c.getUTCMonth() === mo - 1 && c.getUTCDate() === d ? t : null;
}

function matchRows(rows: Row[], seasonW: number, now: number): MatchRow[] {
  const out: MatchRow[] = [];
  for (const r of rows) {
    const date = dayMs(r.Date), home = (r.HomeTeam || '').trim(), away = (r.AwayTeam || '').trim();
    const hs = (r.FTHG ?? '').trim(), as2 = (r.FTAG ?? '').trim();
    if (date === null || !home || !away || !hs || !as2) continue;
    const hg = Number(hs), ag = Number(as2);
    if (!isFinite(hg) || !isFinite(ag)) continue;
    const age = Math.max(0, (now - date) / DAY);
    out.push({ date, home, away, hg, ag, w: seasonW * Math.max(0.05, Math.exp((-age * Math.LN2) / 90)) });
  }
  return out;
}

export async function loadFit(competition: Competition): Promise<FitResult | null> {
  if (!competition.csvPath) return null;
  try {
    return await getOrSet<FitResult>('fit:' + competition.id, SIX_HOURS, async () => {
      const { cur, prior } = await load(competition);
      const now = Date.now();
      const fit = fitStrengths(matchRows(cur, 1, now).concat(matchRows(prior, 0.5, now)));
      if (!fit) throw new Error('NO_FIT'); // thrown so a miss is never cached
      return fit;
    });
  } catch {
    return null;
  }
}

export async function loadStrengths(competition: Competition, home: string, away: string): Promise<MatchData['strengths'] | null> {
  const fit = await loadFit(competition);
  if (!fit) return null;
  const names = Array.from(fit.att.keys());
  const find = (t: string): string | undefined => {
    const q = (t || '').trim().toLowerCase();
    return names.find((x) => x.toLowerCase() === q) ?? names.find((x) => sameTeam(x, t));
  };
  const h = find(home), a = find(away);
  if (h === undefined || a === undefined || h === a) return null;
  const side = (t: string) => ({ att: fit.att.get(t) ?? 1, def: fit.def.get(t) ?? 1, n: fit.n.get(t) ?? 0 });
  return { home: side(h), away: side(a), homeAdv: fit.homeAdv, mu: fit.mu };
}
