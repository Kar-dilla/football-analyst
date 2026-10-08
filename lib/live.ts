import { getCompetition } from '@/lib/registry';
import { loadMatchData } from '@/lib/orchestrate';
import { parseQuery } from '@/lib/parse';
import { expectedGoals } from '@/lib/models/goals';
import { scoreGrid } from '@/lib/models/poisson';
import { pressure } from '@/lib/pressure';
import type { AllowedRange } from '@/lib/best';
import type { TeamLive } from '@/lib/livefeed';
import type { ParsedQuery } from '@/lib/types';

const PRESSURE_MAX = 0.20;
const DEFAULT_MIN_FAIR = 1.10;

export interface LiveState { minute: number; homeGoals: number; awayGoals: number; homeReds: number; awayReds: number; corners?: number; yellows?: number; stats?: { home: TeamLive; away: TeamLive } }
export interface LiveItem { label: string; group: string; probability: number; fairOdds: number }
export interface LiveResult { top: LiveItem[]; mine: LiveItem | null; basis: string; note: string; modelVersion: 'live-v2'; pressure?: { tilt: number; weight: number; shareHome: number } }

type Test = (h: number, a: number) => boolean;
const fair = (p: number): number => p > 0 ? Math.round(100 / p) / 100 : 0;
const mk = (label: string, group: string, p: number): LiveItem => ({ label, group, probability: p, fairOdds: fair(p) });
const whole = (v: unknown, lo: number, hi: number): boolean => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

// Corners and yellow cards: Poisson on what is left, pooled with the pace so far (rough, untested).
type Pace = { mean: number; n: number };
interface Counter { name: string; group: string; max: number; c: Pace | null }
const inb = (v: number, lo: number, hi: number): boolean => Number.isFinite(v) && v >= lo && v <= hi;
const firstIn = (vs: number[], lo: number, hi: number): number | null => vs.find((v) => inb(v, lo, hi)) ?? null;
const share = (m: number, h1: number): number => Math.min(m <= 45 ? (h1 * m) / 45 : h1 + ((1 - h1) * (m - 45)) / 45, 0.98);
const pcdf = (k: number, l: number): number => {
  if (k < 0) return 0;
  let t = Math.exp(-l);
  let s = t;
  for (let i = 1; i <= k; i++) { t *= l / i; s += t; }
  return Math.min(1, s);
};
const overP = (c: Pace, L: number): number => 1 - pcdf(Math.floor(L - c.n), c.mean);
const underP = (c: Pace, L: number): number => pcdf(Math.ceil(L - c.n) - 1, c.mean);
const mkCounter = (name: string, group: string, mu: number | null, n: number | undefined, m: number, h1: number, a: number, max: number): Counter => {
  if (mu === null || n === undefined) return { name, group, max, c: null };
  const f = share(m, h1);
  return { name, group, max, c: { mean: mu * ((a + n) / (a + mu * f)) * (1 - f), n } };
};

// Maps a parsed bet to a test on the final score, or null when live mode cannot price it.
const testFor = (q: ParsedQuery): Test | null => {
  const s = q.side;
  const L = q.line;
  if (q.market === 'goals_ou' && typeof L === 'number' && (s === 'over' || s === 'under')) return s === 'over' ? (h, a) => h + a > L : (h, a) => h + a < L;
  if (q.market === 'btts') return s === 'yes' ? (h, a) => h > 0 && a > 0 : (h, a) => h === 0 || a === 0;
  if (q.market === '1x2' && (s === '1' || s === 'X' || s === '2')) return s === '1' ? (h, a) => h > a : s === 'X' ? (h, a) => h === a : (h, a) => a > h;
  if (q.market === 'double_chance' && (s === '1X' || s === 'X2' || s === '12')) return s === '1X' ? (h, a) => h >= a : s === 'X2' ? (h, a) => a >= h : (h, a) => h !== a;
  return null;
};

export async function livePicks(match: string, competitionId: string, state: LiveState, mine?: string, allowedGoals?: AllowedRange, maxProbability?: number, minFairOdds?: number): Promise<LiveResult> {
  const parts = String(match || '').trim().split(/\s+(?:vs\.?|v|-)\s+/i).map((x) => x.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error('NO_DATA: Type the match as "Team A vs Team B".');
  const home = parts[0];
  const away = parts[1];
  const competition = getCompetition(competitionId);
  if (!competition) throw new Error('LEAGUE_NOT_FOUND');
  if (!state || !whole(state.minute, 1, 120) || !whole(state.homeGoals, 0, 20) || !whole(state.awayGoals, 0, 20) || !whole(state.homeReds, 0, 4) || !whole(state.awayReds, 0, 4) || !(state.corners === undefined || whole(state.corners, 0, 40)) || !(state.yellows === undefined || whole(state.yellows, 0, 20))) throw new Error('NO_DATA: Check the minute, score, red cards, corners and yellow cards.');
  const { minute, homeGoals, awayGoals, homeReds, awayReds } = state;
  const minFair = Math.min(3, Math.max(1.01, typeof minFairOdds === 'number' && Number.isFinite(minFairOdds) ? minFairOdds : DEFAULT_MIN_FAIR));

  const q0: ParsedQuery = { home, away, market: 'goals_ou', side: 'over', line: 2.5, competitionId: competition.id, raw: match };
  const data = await loadMatchData(q0, competition);
  const e = expectedGoals(data);
  if (!e) throw new Error('NO_DATA: not enough stats to price this match');

  // Time left, score state and red cards (rough approximations).
  const m = Math.min(minute, 90);
  const cum = m <= 45 ? (0.45 * m) / 45 : 0.45 + (0.55 * (m - 45)) / 45;
  const rem = Math.max(1 - cum, 0.02);
  let rh = e.lh * rem;
  let ra = e.la * rem;
  const d = homeGoals - awayGoals;
  const k = Math.min(Math.abs(d), 2);
  if (d < 0) { rh *= 1 + 0.08 * k; ra *= 1 - 0.06 * k; }
  if (d > 0) { ra *= 1 + 0.08 * k; rh *= 1 - 0.06 * k; }
  rh *= Math.pow(0.75, Math.min(homeReds, 2)) * Math.pow(1.2, Math.min(awayReds, 2));
  ra *= Math.pow(0.75, Math.min(awayReds, 2)) * Math.pow(1.2, Math.min(homeReds, 2));

  // Match stats (shots, corners, possession) tilt the remaining goals toward the side on top, by at most PRESSURE_MAX.
  const pres = state.stats ? pressure(state.stats.home, state.stats.away, state.minute) : null;
  if (pres) {
    const shift = PRESSURE_MAX * pres.tilt * pres.weight;
    rh *= 1 + shift;
    ra *= 1 - shift;
  }

  const grid = scoreGrid(rh, ra, 10);
  const pr = (t: Test): number => {
    let s = 0;
    for (let x = 0; x < grid.length; x++) for (let y = 0; y < grid[x].length; y++) if (t(homeGoals + x, awayGoals + y)) s += grid[x][y];
    return Math.min(1, s);
  };

  // Pre-match full-match means for corners and cards, from team stats (cards also from the referee), else the league average.
  const tc = data.home && data.away ? (data.home.cornersFor + data.home.cornersAgainst + data.away.cornersFor + data.away.cornersAgainst) / 2 : 0;
  const cardSrc = [data.home && data.away ? data.home.cardsFor + data.away.cardsFor : 0, data.referee ? data.referee.cardsPerGame : 0].filter((v) => inb(v, 1, 10));
  const muC = firstIn([tc, data.leagueAvg.corners], 4, 20);
  const muY = firstIn([cardSrc.length ? cardSrc.reduce((x, y) => x + y, 0) / cardSrc.length : 0, data.leagueAvg.cards], 1, 10);
  const counters: Record<string, Counter> = {
    corners_ou: mkCounter('corners', 'corners', muC, state.corners, m, 0.47, 40, 24),
    cards_ou: mkCounter('yellow cards', 'cards', muY, state.yellows, m, 0.42, 25, 12),
  };

  const cands: LiveItem[] = [];
  const add = (label: string, group: string, t: Test) => { cands.push(mk(label, group, pr(t))); };

  for (let L = 0.5; L <= 5.5; L += 1) {
    if (!allowedGoals || (L >= allowedGoals.overMin && L <= allowedGoals.overMax)) add('Over ' + L + ' goals', 'goals', (h, a) => h + a > L);
    if (!allowedGoals || (L >= allowedGoals.underMin && L <= allowedGoals.underMax)) add('Under ' + L + ' goals', 'goals', (h, a) => h + a < L);
  }
  add('Both teams to score: Yes', 'btts', (h, a) => h > 0 && a > 0);
  add('Both teams to score: No', 'btts', (h, a) => h === 0 || a === 0);
  add(home + ' win', 'result', (h, a) => h > a);
  add('Draw', 'result', (h, a) => h === a);
  add(away + ' win', 'result', (h, a) => a > h);
  add(home + ' or draw', 'doublechance', (h, a) => h >= a);
  add(away + ' or draw', 'doublechance', (h, a) => a >= h);
  add(home + ' or ' + away + ' (no draw)', 'doublechance', (h, a) => h !== a);
  const g00 = grid[0][0];
  const tot = rh + ra || 1;
  cands.push(mk('Next goal: ' + home, 'nextgoal', ((1 - g00) * rh) / tot));
  cands.push(mk('Next goal: ' + away, 'nextgoal', ((1 - g00) * ra) / tot));
  cands.push(mk('No more goals', 'nextgoal', g00));
  for (const ct of Object.values(counters)) {
    const pace = ct.c;
    if (!pace) continue;
    for (let L = 0.5; L <= ct.max; L += 1) {
      cands.push(mk('Over ' + L + ' ' + ct.name, ct.group, overP(pace, L)));
      cands.push(mk('Under ' + L + ' ' + ct.name, ct.group, underP(pace, L)));
    }
  }

  // Keep only the best candidate of each group, drop decided, weak and low-paying ones.
  const best = new Map<string, LiveItem>();
  for (const c of cands) {
    if (c.probability >= 0.995 || c.probability < 0.55) continue;
    if (c.fairOdds < minFair) continue;
    if (maxProbability !== undefined && c.probability > maxProbability) continue;
    const cur = best.get(c.group);
    if (!cur || c.probability > cur.probability) best.set(c.group, c);
  }
  const top = Array.from(best.values()).sort((a, b) => b.probability - a.probability).slice(0, 3);
  // Corners and cards always get a slot when priced, so goal markets do not crowd them out.
  for (const g of ['corners', 'cards']) { const x = best.get(g); if (x && !top.includes(x)) top.push(x); }

  // The user's own bet, priced from the same grid (or the corners/cards pace). Never dropped by the odds minimum.
  let mineItem: LiveItem | null = null;
  const label = typeof mine === 'string' ? mine.trim() : '';
  if (label) {
    try {
      const q = await parseQuery(home + ' vs ' + away + ' ' + label);
      const t = testFor(q);
      const ct = counters[q.market];
      if (t) mineItem = mk(label, q.market, pr(t));
      else if (ct && ct.c && typeof q.line === 'number' && (q.side === 'over' || q.side === 'under')) mineItem = mk(label, q.market, q.side === 'over' ? overP(ct.c, q.line) : underP(ct.c, q.line));
    } catch {
      mineItem = null;
    }
  }
  const mineMiss = label && !mineItem ? ' Your bet could not be priced in live mode (goals, BTTS, result, double chance, corners and yellow cards only).' : '';
  const noCount = Object.values(counters).filter((x) => !x.c).map((x) => x.name);
  const noCountNote = noCount.length ? ' No ' + noCount.join(' or ') + ' picks (missing stats or count).' : '';

  const typed = (muC !== null && state.corners !== undefined ? ', corners ' + state.corners : '') + (muY !== null && state.yellows !== undefined ? ', yellows ' + state.yellows : '');
  const exp = [muC !== null ? 'corners ' + muC.toFixed(1) : '', muY !== null ? 'yellows ' + muY.toFixed(1) : ''].filter(Boolean).join(', ');
  const base = 'Pre-match expected goals: ' + home + ' ' + e.lh.toFixed(2) + ', ' + away + ' ' + e.la.toFixed(2) + ' (stats: ' + (data.home ? data.home.games : 0) + ' and ' + (data.away ? data.away.games : 0) + ' games) \u00b7 Live state: minute ' + minute + ', score ' + homeGoals + '-' + awayGoals + ', reds ' + homeReds + '-' + awayReds + typed + (exp ? ' \u00b7 Pre-match expected ' + exp : '') + ' \u00b7 No live news or odds used';
  const basis = base + (pres ? ' \u00b7 Match stats: ' + home + ' ' + Math.round(50 + 50 * pres.tilt) + '% pressure, weight ' + pres.weight.toFixed(2) : ' \u00b7 Match stats: not used') + ' \u00b7 Hiding picks that pay below ' + minFair.toFixed(2) + ' fair odds';
  const note = 'Live mode uses pre-match stats and the state you typed. Time, score, red-card, corner and yellow-card effects are rough approximations and are untested. Bookmaker live odds are not known.' + (top.length ? '' : ' No live pick reaches 55% within your allowed lines.') + (!top.length && minFair > 1.01 ? ' Picks that pay almost nothing are hidden (below the minimum fair odds). Lower the minimum to see them.' : '') + noCountNote + mineMiss;
  return { top, mine: mineItem, basis, note, modelVersion: 'live-v2', ...(pres ? { pressure: pres } : {}) };
}
