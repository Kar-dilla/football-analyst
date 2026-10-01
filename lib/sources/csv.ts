import type { Competition, MatchData, RefereeStats, TeamStats } from '@/lib/types';
import { getOrSet } from '@/lib/cache';
import { allCompetitions } from '@/lib/registry';

type Row = Record<string, string>;
const SIX_HOURS = 6 * 60 * 60 * 1000;
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

async function load(c: Competition): Promise<Row[] | null> {
  const path = c.csvPath;
  if (!path) return null;
  try {
    return await getOrSet(`csv:${path}`, SIX_HOURS, async () => {
      const res = await fetch(`https://www.football-data.co.uk/${path}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      let rows = parse(await res.text());
      if (path.startsWith('new/')) {
        const top = rows.reduce((m, r) => Math.max(m, parseFloat(r.Season) || 0), 0);
        rows = rows
          .filter((r) => parseFloat(r.Season) === top)
          .map((r) => ({ ...r, HomeTeam: r.Home, AwayTeam: r.Away, FTHG: r.HG, FTAG: r.AG }));
      }
      return rows.filter((r) => r.FTHG && r.FTAG);
    });
  } catch {
    return null;
  }
}

export async function loadTeamStats(competition: Competition, team: string): Promise<TeamStats | null> {
  const rows = await load(competition);
  if (!rows?.length) return null;
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

export async function loadTeamStatsAnywhere(team: string): Promise<{ stats: TeamStats; competition: Competition } | null> {
  const comps = allCompetitions().filter((c) => c.csvPath?.startsWith('mmz4281'));
  const found = await Promise.all(comps.map(async (c) => ({ c, stats: await loadTeamStats(c, team) })));
  const hit = found.find((f) => f.stats);
  return hit && hit.stats ? { stats: hit.stats, competition: hit.c } : null;
}

export async function loadLeagueAvg(competition: Competition): Promise<MatchData['leagueAvg'] | null> {
  const rows = await load(competition);
  if (!rows?.length) return null;
  return {
    goals: mean(rows, ['FTHG', 'FTAG']), fhGoals: mean(rows, ['HTHG', 'HTAG']),
    corners: mean(rows, ['HC', 'AC']), cards: mean(rows, ['HY', 'AY', 'HR', 'AR']),
  };
}

export async function loadReferee(competition: Competition, name: string): Promise<RefereeStats | null> {
  const rows = await load(competition);
  const q = name.trim().toLowerCase();
  if (!rows?.length || !q || !('Referee' in rows[0])) return null;
  const mine = rows.filter((r) => {
    const x = (r.Referee || '').trim().toLowerCase();
    return !!x && (x.includes(q) || q.includes(x));
  });
  if (!mine.length) return null;
  return {
    name: mine[0].Referee, games: mine.length,
    cardsPerGame: mean(mine, ['HY', 'AY', 'HR', 'AR']), foulsPerGame: mean(mine, ['HF', 'AF']),
  };
}
