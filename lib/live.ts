import { getCompetition } from '@/lib/registry';
import { loadMatchData } from '@/lib/orchestrate';
import { parseQuery } from '@/lib/parse';
import { expectedGoals } from '@/lib/models/goals';
import { scoreGrid } from '@/lib/models/poisson';
import type { AllowedRange } from '@/lib/best';
import type { ParsedQuery } from '@/lib/types';

export interface LiveState { minute: number; homeGoals: number; awayGoals: number; homeReds: number; awayReds: number }
export interface LiveItem { label: string; group: string; probability: number; fairOdds: number }
export interface LiveResult { top: LiveItem[]; mine: LiveItem | null; basis: string; note: string }

type Test = (h: number, a: number) => boolean;
const fair = (p: number): number => (p > 0 ? Math.round(100 / p) / 100 : 0);
const mk = (label: string, group: string, p: number): LiveItem => ({ label, group, probability: p, fairOdds: fair(p) });
const whole = (v: unknown, lo: number, hi: number): boolean => typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;

// Maps a parsed bet to a test on the final score, or null when live mode cannot price it.
const testFor = (q: ParsedQuery): Test | null => {
  const s = q.side;
  const L = q.line;
  if (q.market === 'goals_ou' && typeof L === 'number' && (s === 'over' || s === 'under')) return s === 'over' ? (h, a) => h + a > L : (h, a) => h + a < L;
  if (q.market === 'btts' && (s === 'yes' || s === 'no')) return s === 'yes' ? (h, a) => h > 0 && a > 0 : (h, a) => h === 0 || a === 0;
  if (q.market === '1x2' && (s === '1' || s === 'X' || s === '2')) return s === '1' ? (h, a) => h > a : s === 'X' ? (h, a) => h === a : (h, a) => a > h;
  if (q.market === 'double_chance' && (s === '1X' || s === 'X2' || s === '12')) return s === '1X' ? (h, a) => h >= a : s === 'X2' ? (h, a) => a >= h : (h, a) => h !== a;
  return null;
};

export async function livePicks(match: string, competitionId: string, state: LiveState, mine?: string, allowedGoals?: AllowedRange, maxProbability?: number): Promise<LiveResult> {
  const parts = String(match || '').trim().split(/\s+(?:vs\.?|v|-)\s+/i).map((x) => x.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error('NO_DATA: Type the match as "Team A vs Team B".');
  const home = parts[0];
  const away = parts[1];
  const competition = getCompetition(competitionId);
  if (!competition) throw new Error('LEAGUE_NOT_FOUND');
  if (!state || !whole(state.minute, 1, 120) || !whole(state.homeGoals, 0, 20) || !whole(state.awayGoals, 0, 20) || !whole(state.homeReds, 0, 4) || !whole(state.awayReds, 0, 4)) throw new Error('NO_DATA: Check the minute, score and red cards.');
  const { minute, homeGoals, awayGoals, homeReds, awayReds } = state;

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

  const grid = scoreGrid(rh, ra, 10);
  const pr = (t: Test): number => {
    let s = 0;
    for (let x = 0; x < grid.length; x++) for (let y = 0; y < grid[x].length; y++) if (t(homeGoals + x, awayGoals + y)) s += grid[x][y];
    return Math.min(1, s);
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

  // Keep only the best candidate of each group, drop decided and weak ones.
  const best = new Map<string, LiveItem>();
  for (const c of cands) {
    if (c.probability >= 0.995 || c.probability < 0.55) continue;
    if (maxProbability !== undefined && c.probability > maxProbability) continue;
    const cur = best.get(c.group);
    if (!cur || c.probability > cur.probability) best.set(c.group, c);
  }
  const top = Array.from(best.values()).sort((a, b) => b.probability - a.probability).slice(0, 3);

  // The user's own bet, priced from the same grid.
  let mineItem: LiveItem | null = null;
  const label = typeof mine === 'string' ? mine.trim() : '';
  if (label) {
    try {
      const q = await parseQuery(home + ' vs ' + away + ' ' + label);
      const t = testFor(q);
      if (t) mineItem = mk(label, q.market, pr(t));
    } catch {
      mineItem = null;
    }
  }
  const mineMiss = label && !mineItem ? ' Your bet could not be priced in live mode (only goals, BTTS, result and double chance).' : '';

  const basis = 'Pre-match expected goals: ' + home + ' ' + e.lh.toFixed(2) + ', ' + away + ' ' + e.la.toFixed(2) + ' (stats: ' + (data.home ? data.home.games : 0) + ' and ' + (data.away ? data.away.games : 0) + ' games) \u00b7 Live state: minute ' + minute + ', score ' + homeGoals + '-' + awayGoals + ', reds ' + homeReds + '-' + awayReds + ' \u00b7 No live news or odds used';
  const note = 'Live mode uses pre-match stats and the state you typed. Time, score and red-card effects are rough approximations and are untested. Bookmaker live odds are not known.' + (top.length ? '' : ' No live pick reaches 55% within your allowed lines.') + mineMiss;
  return { top, mine: mineItem, basis, note };
}
