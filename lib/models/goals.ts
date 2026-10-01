import type { BaseResult, LadderRow, MatchData } from '@/lib/types';
import { poissonOver, scoreGrid } from '@/lib/models/poisson';
import { buildLadder } from '@/lib/ladder';

const clamp = (p: number) => Math.min(1, Math.max(0, p));

export function goalsModel(data: MatchData): BaseResult | null {
  const { home, away, leagueAvg, query, competition } = data;
  const { market, side, line } = query;
  if (!home || !away) return null;
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
  const lh = advSum > 0 ? (baseH * adv * total) / advSum : total / 2;
  const la = advSum > 0 ? ((baseA / adv) * total) / advSum : total / 2;
  let probability: number;
  let ladder: LadderRow[] | undefined;
  if (market === 'goals_ou') {
    if (typeof line !== 'number' || !Number.isFinite(line) || line < 0) return null;
    if (side !== 'over' && side !== 'under') return null;
    const over = poissonOver(total, line);
    probability = side === 'over' ? over : 1 - over;
    ladder = buildLadder(total, [0.5, 1.5, 2.5, 3.5, 4.5]);
  } else if (market === 'btts' || market === '1x2' || market === 'double_chance') {
    let all = 0, hw = 0, dr = 0, aw = 0, both = 0;
    scoreGrid(lh, la).forEach((row, h) => row.forEach((v, a) => {
      all += v;
      if (h > a) hw += v; else if (h === a) dr += v; else aw += v;
      if (h > 0 && a > 0) both += v;
    }));
    if (!(all > 0)) return null;
    const probs: Partial<Record<string, number>> =
      market === 'btts' ? { yes: both / all, no: 1 - both / all }
      : market === '1x2' ? { '1': hw / all, X: dr / all, '2': aw / all }
      : { '1X': (hw + dr) / all, X2: (dr + aw) / all, '12': (hw + aw) / all };
    const p = side ? probs[side] : undefined;
    if (typeof p !== 'number') return null;
    probability = p;
  } else return null;
  return {
    market,
    probability: clamp(probability),
    method: 'poisson',
    sampleSize: Math.min(home.games, away.games),
    ...(ladder ? { ladder } : {}),
  };
}
