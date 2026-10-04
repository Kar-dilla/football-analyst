import type { BaseResult, LadderRow, MatchData } from '@/lib/types';
import { scoreGrid } from '@/lib/models/poisson';

const clamp = (p: number) => Math.min(1, Math.max(0, p));
const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const LADDER_LINES = [0.5, 1.5, 2.5, 3.5, 4.5];

export function expectedGoals(data: MatchData): { lh: number; la: number } | null {
  const { home, away, leagueAvg, competition, strengths } = data;
  if (!home || !away) return null;
  let lh: number;
  let la: number;
  if (strengths) {
    const { mu, homeAdv, home: h, away: a } = strengths;
    if (!isNum(mu) || !isNum(homeAdv) || homeAdv <= 0 || !h || !a) return null;
    const sh = Math.sqrt(homeAdv);
    lh = mu * sh * h.att * a.def;
    la = (mu / sh) * a.att * h.def;
  } else {
    if (![home.gf, home.ga, away.gf, away.ga, leagueAvg.goals].every((n) => Number.isFinite(n) && n >= 0)) return null;
    const rawH = (home.gf + away.ga) / 2;
    const rawA = (away.gf + home.ga) / 2;
    const total = 0.75 * (rawH + rawA) + 0.25 * leagueAvg.goals;
    const raw = rawH + rawA;
    const baseH = raw > 0 ? (rawH * total) / raw : total / 2;
    const baseA = raw > 0 ? (rawA * total) / raw : total / 2;
    // home advantage: club 1.12, 'nations' 1.10, any other national/youth (neutral venue) 1.0
    const adv = competition.type === 'club' ? 1.12 : competition.id === 'nations' ? 1.1 : 1.0;
    const advSum = baseH * adv + baseA / adv;
    lh = advSum > 0 ? (baseH * adv * total) / advSum : total / 2;
    la = advSum > 0 ? ((baseA / adv) * total) / advSum : total / 2;
  }
  return isNum(lh) && isNum(la) && lh >= 0 && la >= 0 ? { lh, la } : null;
}

function mixtureGrid(lh: number, la: number, spread: number): number[][] {
  const sp = Math.min(Math.max(spread, 0), 0.9);
  const parts: Array<[number, number]> = sp > 0 ? [[1 - sp, 0.25], [1, 0.5], [1 + sp, 0.25]] : [[1, 1]];
  let out: number[][] = [];
  for (const [s, w] of parts) {
    const g = scoreGrid(lh * s, la * s, 10);
    if (out.length === 0) out = g.map((row) => row.map(() => 0));
    g.forEach((row, h) => row.forEach((v, a) => { out[h][a] += w * v; }));
  }
  return out;
}

function dixonColes(grid: number[][], lh: number, la: number, rho: number): number[][] | null {
  const f: Record<string, number> = {
    '0,0': Math.max(0, 1 - lh * la * rho),
    '0,1': Math.max(0, 1 + lh * rho),
    '1,0': Math.max(0, 1 + la * rho),
    '1,1': Math.max(0, 1 - rho),
  };
  let sum = 0;
  const adj = grid.map((row, h) => row.map((v, a) => { const x = v * (f[h + ',' + a] ?? 1); sum += x; return x; }));
  if (!(sum > 0) || !Number.isFinite(sum)) return null;
  return adj.map((row) => row.map((v) => v / sum));
}

export function goalsModel(data: MatchData, opts?: { rho?: number; spread?: number }): BaseResult | null {
  const { home, away, query } = data;
  if (!home || !away || !query) return null;
  const xg = expectedGoals(data);
  if (!xg) return null;
  const { lh, la } = xg;
  const rhoIn = opts?.rho;
  const spreadIn = opts?.spread;
  const rho = isNum(rhoIn) ? rhoIn : -0.08;
  const spread = isNum(spreadIn) ? spreadIn : 0.2;
  const grid = dixonColes(mixtureGrid(lh, la, spread), lh, la, rho);
  if (!grid) return null;

  let hw = 0, dr = 0, aw = 0, both = 0;
  grid.forEach((row, h) => row.forEach((v, a) => {
    if (h > a) hw += v; else if (h === a) dr += v; else aw += v;
    if (h > 0 && a > 0) both += v;
  }));
  const overAt = (l: number) => {
    let o = 0;
    grid.forEach((row, h) => row.forEach((v, a) => { if (h + a > l) o += v; }));
    return o;
  };

  const { market, side, line } = query;
  let probability: number | undefined;
  let ladder: LadderRow[] | undefined;
  if (market === 'goals_ou') {
    if (typeof line !== 'number' || !Number.isFinite(line) || line < 0) return null;
    if (side !== 'over' && side !== 'under') return null;
    const over = overAt(line);
    probability = side === 'over' ? over : 1 - over;
    ladder = LADDER_LINES.map((l) => {
      const o = clamp(overAt(l));
      return { line: l, over: o, under: 1 - o };
    });
  } else if (market === 'btts' || market === '1x2' || market === 'double_chance') {
    const probs: Partial<Record<string, number>> =
      market === 'btts' ? { yes: both, no: 1 - both }
      : market === '1x2' ? { '1': hw, X: dr, '2': aw }
      : { '1X': hw + dr, X2: dr + aw, '12': hw + aw };
    probability = side ? probs[side] : undefined;
  } else return null;
  if (typeof probability !== 'number' || !Number.isFinite(probability)) return null;

  return {
    market,
    probability: clamp(probability),
    method: 'poisson-dc-mix',
    sampleSize: Math.min(home.games, away.games),
    ...(ladder ? { ladder } : {}),
  };
}
