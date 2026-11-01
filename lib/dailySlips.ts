export interface DailyLeg {
  match: string;
  home: string;
  away: string;
  kickoff: string;
  competitionId: string;
  competitionName: string;
  label: string;
  probability: number;
}
export interface DailySlip { target: number; legs: DailyLeg[]; odds: number; probability: number; note: string }

const TARGETS = [2, 5, 10, 15];
const MAX_LEGS = 20;
const MIN_P = 0.55;
const MAX_P = 0.88; // legs at or above this are dropped
const NONE = 'No qualifying combination today';
const NOTES: Record<number, string> = {
  2: 'About a coin flip.',
  5: 'Risky.',
  10: 'Long shot. Expect this to lose most days.',
  15: 'Long shot. Expect this to lose most days.',
};

const r2 = (x: number) => Math.round(x * 100) / 100;
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const oddsOf = (ls: DailyLeg[]) => ls.reduce((a, l) => a * (1 / l.probability), 1);
const probOf = (ls: DailyLeg[]) => ls.reduce((a, l) => a * l.probability, 1);

// Keeps legs in 55%..<88%, one per match (the highest), sorted by probability descending.
function clean(legs: DailyLeg[]): DailyLeg[] {
  const best = new Map<string, DailyLeg>();
  for (const l of Array.isArray(legs) ? legs : []) {
    if (!l || typeof l.probability !== 'number' || !Number.isFinite(l.probability)) continue;
    if (l.probability < MIN_P || l.probability >= MAX_P) continue;
    const key = (l.home + '|' + l.away).trim().toLowerCase();
    const cur = best.get(key);
    if (!cur || l.probability > cur.probability) best.set(key, l);
  }
  return Array.from(best.values()).sort(
    (a, b) => b.probability - a.probability || a.match.localeCompare(b.match) || a.label.localeCompare(b.label),
  );
}

function pick(pool: DailyLeg[], target: number): DailyLeg[] {
  const lo = target * 0.85;
  const hi = target * 1.25;
  const chosen: DailyLeg[] = [];
  let o = 1;
  for (const l of pool) {
    if (o >= target || chosen.length >= MAX_LEGS) break;
    chosen.push(l);
    o *= 1 / l.probability;
  }
  if (o >= lo && o <= hi) return chosen;
  if (o > hi && chosen.length > 0) {
    // last leg overshot: swap it for the unused leg that lands closest to the target
    const base = o * chosen[chosen.length - 1].probability;
    let bestLeg: DailyLeg | null = null;
    let bestGap = Infinity;
    for (const c of pool) {
      if (chosen.includes(c)) continue;
      const gap = Math.abs(base / c.probability - target);
      if (gap < bestGap) {
        bestGap = gap;
        bestLeg = c;
      }
    }
    if (bestLeg) {
      const next = base / bestLeg.probability;
      if (next >= lo && next <= hi) return [...chosen.slice(0, -1), bestLeg];
    }
  }
  return [];
}

export function buildSlips(legs: DailyLeg[]): DailySlip[] {
  const pool = clean(legs);
  return TARGETS.map((target) => {
    const chosen = pick(pool, target);
    if (chosen.length === 0) return { target, legs: [], odds: 0, probability: 0, note: NONE };
    return { target, legs: chosen, odds: r2(oddsOf(chosen)), probability: r4(probOf(chosen)), note: NOTES[target] };
  });
}
