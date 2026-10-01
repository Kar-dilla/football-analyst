import { getOrSet } from '@/lib/cache';
import { sameTeam } from '@/lib/sources/csv';
import type { MatchData, TeamStats } from '@/lib/types';

const URL_CSV = 'https://raw.githubusercontent.com/martj42/international_results/master/results.csv';
const DAY = 86400000;
const COLS = ['date', 'home_team', 'away_team', 'home_score', 'away_score', 'tournament', 'neutral'];
// dataset spellings differ from common names; keys are accent-stripped lowercase
const ALIAS = new Map(Object.entries({
  usa: 'united states',
  'united states of america': 'united states',
  'korea republic': 'south korea',
  'republic of korea': 'south korea',
  "cote d'ivoire": 'ivory coast',
  czechia: 'czech republic',
  'ir iran': 'iran',
  turkiye: 'turkey',
  'cabo verde': 'cape verde',
  'congo dr': 'dr congo',
}));

type Match = { t: number; date: string; home: string; away: string; hg: number; ag: number; tournament: string; neutral: boolean };
type Dataset = { matches: Match[]; elo: Record<string, number>; names: Record<string, string> };

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch !== '"') cur += ch;
      else if (line[i + 1] === '"') { cur += '"'; i++; }
      else q = false;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function parse(text: string): Match[] {
  const lines = text.split('\n');
  const head = splitCsv((lines[0] ?? '').replace(/^\uFEFF/, '').replace(/\r$/, '')).map((s) => s.trim());
  const [iD, iH, iA, iHs, iAs, iT, iN] = COLS.map((c) => head.indexOf(c));
  if ([iD, iH, iA, iHs, iAs, iT, iN].some((i) => i < 0)) throw new Error('intl results: header changed');
  const today = new Date().toISOString().slice(0, 10);
  const out: Match[] = [];
  for (let k = 1; k < lines.length; k++) {
    const c = splitCsv(lines[k].replace(/\r$/, ''));
    const date = (c[iD] ?? '').trim();
    const sh = (c[iHs] ?? '').trim();
    const sa = (c[iAs] ?? '').trim();
    if (!c[iH] || !c[iA] || !date || date > today || sh === '' || sa === '') continue;
    const hg = Number(sh);
    const ag = Number(sa);
    const t = Date.parse(date + 'T00:00:00Z');
    if (!Number.isFinite(hg) || !Number.isFinite(ag) || Number.isNaN(t)) continue;
    out.push({ t, date, home: c[iH].trim(), away: c[iA].trim(), hg, ag, tournament: (c[iT] ?? '').trim(), neutral: (c[iN] ?? '').trim().toUpperCase() === 'TRUE' });
  }
  return out.sort((x, y) => x.t - y.t);
}

function buildElo(ms: Match[]): Record<string, number> {
  const elo: Record<string, number> = Object.create(null);
  for (const m of ms) {
    if (m.date < '2010-01-01') continue;
    const eh = elo[m.home] ?? 1500;
    const ea = elo[m.away] ?? 1500;
    const exp = 1 / (1 + Math.pow(10, -(eh - ea + (m.neutral ? 0 : 100)) / 400));
    const res = m.hg > m.ag ? 1 : m.hg === m.ag ? 0.5 : 0;
    const d = Math.abs(m.hg - m.ag);
    const k = m.tournament === 'FIFA World Cup' ? 50 : m.tournament === 'Friendly' ? 20 : 40;
    const ch = k * (d <= 1 ? 1 : d === 2 ? 1.5 : (11 + d) / 8) * (res - exp);
    elo[m.home] = eh + ch;
    elo[m.away] = ea - ch;
  }
  return elo;
}

async function load(): Promise<Dataset | null> {
  try {
    return await getOrSet<Dataset>('intl:results:v1', 24 * 3600 * 1000, async () => {
      const res = await fetch(URL_CSV, { cache: 'no-store' }); // file is >2MB: keep it out of Next's fetch cache
      if (!res.ok) throw new Error('intl results: HTTP ' + res.status); // thrown inside getOrSet so it is never cached
      const matches = parse(await res.text());
      if (matches.length < 1000) throw new Error('intl results: unexpected content');
      const names: Record<string, string> = Object.create(null);
      for (const m of matches) {
        names[norm(m.home)] = m.home;
        names[norm(m.away)] = m.away;
      }
      return { matches, elo: buildElo(matches), names };
    });
  } catch {
    return null;
  }
}

function resolve(ds: Dataset, team: string): string | null {
  const n = norm(team);
  const key = ALIAS.get(n) ?? n;
  if (ds.names[key]) return ds.names[key]; // exact match wins
  // fuzzy only when unambiguous: "niger" must not silently become "nigeria"
  const hits = Object.keys(ds.names).filter((k) => sameTeam(k, key));
  return hits.length === 1 ? ds.names[hits[0]] : null;
}

export async function loadIntlTeamStats(team: string): Promise<TeamStats | null> {
  try {
    const ds = await load();
    if (!ds) return null;
    const name = resolve(ds, team);
    if (!name) return null;
    const now = Date.now();
    const cutoff = now - 4 * 365 * DAY;
    let n = 0;
    let sw = 0;
    let sg = 0;
    let sc = 0;
    for (let i = ds.matches.length - 1; i >= 0 && n < 20; i--) { // dataset is date-sorted: newest first
      const m = ds.matches[i];
      if (m.t < cutoff) break;
      const isHome = m.home === name;
      if (!isHome && m.away !== name) continue;
      const oe = ds.elo[isHome ? m.away : m.home] ?? 1500;
      const w = Math.exp(-((now - m.t) / DAY) / 540) * (m.tournament === 'Friendly' ? 0.5 : 1);
      sw += w;
      sg += w * (isHome ? m.hg : m.ag) * clamp(oe / 1500, 0.7, 1.4);
      sc += w * (isHome ? m.ag : m.hg) * clamp(1500 / oe, 0.7, 1.4);
      n++;
    }
    if (n === 0 || sw === 0) return null;
    return {
      name, games: n, gf: sg / sw, ga: sc / sw, fhGf: 0, fhGa: 0, cornersFor: 0, cornersAgainst: 0,
      cardsFor: 0, shotsFor: 0, foulsFor: 0, htZeroZeroRate: 0, goalMinutes: [],
    };
  } catch {
    return null;
  }
}

export async function loadIntlLeagueAvg(): Promise<MatchData['leagueAvg'] | null> {
  try {
    const ds = await load();
    if (!ds) return null;
    let n = 0;
    let goals = 0;
    for (const m of ds.matches) {
      if (m.date < '2022-01-01') continue;
      n++;
      goals += m.hg + m.ag;
    }
    return n > 0 ? { goals: goals / n, fhGoals: 0, corners: 0, cards: 0 } : null;
  } catch {
    return null;
  }
}
