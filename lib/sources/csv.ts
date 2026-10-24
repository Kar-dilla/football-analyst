import type { Competition, FormBlock, H2HMeeting, MatchData, MatchesPanel, RefereeStats, Streak, TeamStats } from '@/lib/types';
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
  qpr: 'queens park rangers', 'sheffield weds': 'sheffield wednesday', 'bristol rvs': 'bristol rovers',
  hearts: 'heart of midlothian', 'queens park': 'queen s park', 'raith rvs': 'raith rovers',
  'queen of sth': 'queen of the south',
  'sp lisbon': 'sporting cp', 'academico de viseu': 'academico viseu',
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

// ---- appointed referee for an upcoming match, read from football-data.co.uk/fixtures.csv ----
export async function loadFixtureReferee(competition: Competition, home: string, away: string): Promise<string | null> {
  try {
    const path = competition.csvPath;
    if (!path || path.startsWith('new/')) return null;
    const div = (path.split('/').pop() || '').replace(/\.csv$/i, '');
    if (!div) return null;
    const rows = await getOrSet<Row[]>('fixturesref', 30 * 60 * 1000, async () => {
      const res = await fetch('https://www.football-data.co.uk/fixtures.csv');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parse(await res.text());
    });
    const hit = rows.find((r) =>
      (r.Div || '').replace(/^\uFEFF/, '').trim() === div &&
      sameTeam(r.HomeTeam || '', home) && sameTeam(r.AwayTeam || '', away));
    return hit && hit.Referee ? hit.Referee.trim() || null : null;
  } catch {
    return null;
  }
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

// ---- matches panel: H2H record + streaks for the fixture and each team's form (display only) ----
function seasonPath(path: string, k: number): string | null {
  const m = path.match(/^(mmz4281\/)(\d{2})(\d{2})(\/.*)$/);
  const back = (s: string): string => String((parseInt(s, 10) + 100 - k) % 100).padStart(2, '0');
  return m ? `${m[1]}${back(m[2])}${back(m[3])}${m[4]}` : null;
}

const numOrUndef = (v: string | undefined): number | undefined => {
  const s = (v ?? '').trim();
  const n = s === '' ? NaN : Number(s);
  return Number.isFinite(n) ? n : undefined;
};

type Game = { t: number; home: string; away: string; hg: number; ag: number; htH?: number; htA?: number; corners?: number; cards?: number };

function toGame(r: Row): Game | null {
  const t = dayMs(r.Date), hg = numOrUndef(r.FTHG), ag = numOrUndef(r.FTAG);
  const home = (r.HomeTeam || '').trim(), away = (r.AwayTeam || '').trim();
  if (t === null || hg === undefined || ag === undefined || !home || !away) return null;
  const g: Game = { t, home, away, hg, ag };
  const htH = numOrUndef(r.HTHG), htA = numOrUndef(r.HTAG);
  if (htH !== undefined) g.htH = htH;
  if (htA !== undefined) g.htA = htA;
  const hc = numOrUndef(r.HC), ac = numOrUndef(r.AC);
  if (hc !== undefined && ac !== undefined) g.corners = hc + ac;
  const hy = numOrUndef(r.HY), ay = numOrUndef(r.AY);
  if (hy !== undefined && ay !== undefined) g.cards = hy + ay + (numOrUndef(r.HR) ?? 0) + (numOrUndef(r.AR) ?? 0);
  return g;
}

const toMeeting = (g: Game): H2HMeeting => {
  const m: H2HMeeting = { date: new Date(g.t).toISOString().slice(0, 10), home: g.home, away: g.away, hg: g.hg, ag: g.ag };
  if (g.htH !== undefined) m.htHome = g.htH;
  if (g.htA !== undefined) m.htAway = g.htA;
  if (g.corners !== undefined) m.corners = g.corners;
  if (g.cards !== undefined) m.cards = g.cards;
  return m;
};

type Cand = { label: string; val: (g: Game) => boolean | undefined };
const lineCand = (name: string, n: (g: Game) => number | undefined, over: boolean, l: number): Cand => ({
  label: `${over ? 'Over' : 'Under'} ${l} ${name}`,
  val: (g) => { const v = n(g); return v === undefined ? undefined : over ? v > l : v < l; },
});
const goalsOf = (g: Game): number => g.hg + g.ag;
const cornersOf = (g: Game): number | undefined => g.corners;
const cardsOf = (g: Game): number | undefined => g.cards;
const CANDS: Cand[] = [
  lineCand('goals', goalsOf, true, 2.5), lineCand('goals', goalsOf, false, 2.5), lineCand('goals', goalsOf, true, 1.5),
  lineCand('goals', goalsOf, false, 3.5), lineCand('goals', goalsOf, false, 4.5),
  { label: 'BTTS yes', val: (g) => g.hg > 0 && g.ag > 0 },
  { label: 'BTTS no', val: (g) => !(g.hg > 0 && g.ag > 0) },
  ...[9.5, 10.5, 11.5].flatMap((l) => [lineCand('corners', cornersOf, true, l), lineCand('corners', cornersOf, false, l)]),
  ...[3.5, 4.5, 5.5].flatMap((l) => [lineCand('cards', cardsOf, true, l), lineCand('cards', cardsOf, false, l)]),
];

// count-type streaks: share of games (with data) hitting the candidate, kept at >= 70% over >= 5 games
function countStreaks(games: Game[]): Streak[] {
  const out: Streak[] = [];
  for (const c of CANDS) {
    let hit = 0, n = 0;
    for (const g of games) {
      const v = c.val(g);
      if (v === undefined) continue;
      n++;
      if (v) hit++;
    }
    if (n >= 5 && hit / n >= 0.7) out.push({ label: c.label, hit, of: n });
  }
  return out;
}

// run-type streaks from the newest game; games are newest first, mine(g) = the team is the home side of g
function runStreaks(games: Game[], mine: (g: Game) => boolean, prefix: string, withClean: boolean): Streak[] {
  const gf = (g: Game): number => (mine(g) ? g.hg : g.ag);
  const ga = (g: Game): number => (mine(g) ? g.ag : g.hg);
  const run = (ok: (g: Game) => boolean): number => {
    let n = 0;
    for (const g of games) { if (!ok(g)) break; n++; }
    return n;
  };
  const out: Streak[] = [];
  const nl = run((g) => gf(g) >= ga(g));
  if (nl >= 3) out.push({ label: `${prefix}No losses`, hit: nl, of: nl });
  if (withClean) {
    const nc = run((g) => ga(g) >= 1);
    if (nc >= 3) out.push({ label: 'No clean sheet', hit: nc, of: nc });
  }
  return out;
}

const best5 = (xs: Streak[]): Streak[] => [...xs].sort((a, b) => b.hit / b.of - a.hit / a.of || b.of - a.of).slice(0, 5);

export async function loadMatchesPanel(competition: Competition, home: string, away: string): Promise<MatchesPanel | null> {
  try {
    const path = competition.csvPath;
    if (!path || path.startsWith('new/')) return null;
    const files = [0, 1, 2, 3, 4, 5, 6, 7, 8]
      .map((k) => ({ k, p: k === 0 ? path : seasonPath(path, k) }))
      .filter((f): f is { k: number; p: string } => f.p !== null);
    const sets: Game[][] = await Promise.all(files.map(async (f) =>
      played((await fetchRows(f.p, f.k === 0 ? SIX_HOURS : DAY)) ?? []).map(toGame).filter((g): g is Game => g !== null)));
    const newest = (xs: Game[]): Game[] => [...xs].sort((x, y) => y.t - x.t);

    // head to head: teamA = home, teamB = away of the analysed fixture, any venue
    const aHome = (g: Game): boolean => sameTeam(g.home, home);
    const meets = newest(([] as Game[]).concat(...sets).filter((g) =>
      (sameTeam(g.home, home) && sameTeam(g.away, away)) || (sameTeam(g.home, away) && sameTeam(g.away, home)))).slice(0, 10);
    let h2h: MatchesPanel['h2h'] = null;
    if (meets.length >= 1) {
      let winsA = 0, draws = 0, winsB = 0;
      for (const g of meets) {
        const a = aHome(g) ? g.hg : g.ag, b = aHome(g) ? g.ag : g.hg;
        if (a > b) winsA++; else if (a < b) winsB++; else draws++;
      }
      h2h = {
        meetings: meets.map(toMeeting), winsA, draws, winsB, teamA: home, teamB: away,
        streaks: best5([
          ...runStreaks(meets, aHome, `${home}: `, false),
          ...runStreaks(meets, (g) => !aHome(g), `${away}: `, false),
          ...countStreaks(meets),
        ]),
      };
    }

    // form: each club's last 10 played games, current season then prior
    const recent = newest(([] as Game[]).concat(sets[0] ?? [], sets[1] ?? []));
    const form: FormBlock[] = [];
    for (const team of [home, away]) {
      const games = recent.filter((g) => sameTeam(g.home, team) || sameTeam(g.away, team)).slice(0, 10);
      const streaks = best5([...runStreaks(games, (g) => sameTeam(g.home, team), '', true), ...countStreaks(games)]);
      if (streaks.length > 0) form.push({ team, streaks });
    }

    if (!h2h && form.length === 0) return null;
    return { h2h, form };
  } catch {
    return null;
  }
}
