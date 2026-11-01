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
// day = local date key 'YYYY-MM-DD' (set only when slips are built per day); from/to = first and last kickoff (ISO); custom = the 'My target odds' card.
export interface DailySlip { target: number; legs: DailyLeg[]; odds: number; probability: number; note: string; day?: string; from?: string; to?: string; custom?: boolean }

// User filters. Probabilities are fractions 0..1. leagues: [] means all leagues.
export interface DailyFilters {
  minP: number;
  maxP: number;
  markets: string[];
  leagues: string[];
  day: 'today' | 'tomorrow';
  maxLegs: number;
  minLegOdds: number;
  fullStatsOnly: boolean;
  targetOdds: number;    // 0 = no custom target, otherwise 1.5 to 100
  onlyTarget: boolean;   // hide the fixed 2, 5, 10, 15 cards (needs targetOdds)
  dayOffsets: number[];  // 0 = today, 1 = tomorrow, ... up to 6
  mixDays: boolean;      // true: legs from different days may share a slip
}

export const ALL_MARKETS: string[] = ['goals', 'btts', 'result', 'doublechance', 'firsthalf', 'secondhalf', 'corners', 'cards'];
// The default range is now 0.80 to 0.88 (it used to be 0.55 to 0.88).
export const DEFAULT_FILTERS: DailyFilters = {
  minP: 0.8,
  maxP: 0.88,
  markets: ALL_MARKETS,
  leagues: [],
  day: 'today',
  maxLegs: 20,
  minLegOdds: 1.1,
  fullStatsOnly: false,
  targetOdds: 0,
  onlyTarget: false,
  dayOffsets: [0],
  mixDays: false,
};
// Hard limit the user can never override: a leg must be >= HARD_MIN_P and < HARD_MAX_P.
export const HARD_MIN_P = 0.55;
export const HARD_MAX_P = 1;

const TARGETS = [2, 5, 10, 15];
const TARGET_MIN = 1.5;
const TARGET_MAX = 100;
const NONE = 'No qualifying combination today';
const NOTES: Record<number, string> = {
  2: 'About a coin flip.',
  5: 'Risky.',
  10: 'Long shot. Expect this to lose most days.',
  15: 'Long shot. Expect this to lose most days.',
};

const r2 = (x: number) => Math.round(x * 100) / 100;
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const oddsOf = (ls: DailyLeg[]) => ls.reduce((a, l) => a * (1 / l.probability), 1);
const probOf = (ls: DailyLeg[]) => ls.reduce((a, l) => a * l.probability, 1);
const noteFor = (t: number) => NOTES[t] ?? (t <= 3 ? NOTES[2] : t <= 7 ? NOTES[5] : NOTES[10]);

// Validates unknown input; every bad field falls back to its default.
export function normalizeFilters(raw?: unknown): DailyFilters {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const D = DEFAULT_FILTERS;
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
  const strs = (v: unknown, ok: string[] | null, d: string[]) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && (!ok || ok.includes(x))) : d;
  let minP = clamp(num(r.minP, D.minP), HARD_MIN_P, 0.99);
  let maxP = clamp(num(r.maxP, D.maxP), HARD_MIN_P, 0.99);
  if (minP > maxP) [minP, maxP] = [maxP, minP];
  let dayOffsets = Array.isArray(r.dayOffsets)
    ? Array.from(new Set((r.dayOffsets as unknown[]).filter((x): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 6))).sort((a, b) => a - b)
    : [];
  if (dayOffsets.length === 0) dayOffsets = [r.day === 'tomorrow' ? 1 : 0];
  const t = num(r.targetOdds, 0);
  return {
    minP,
    maxP,
    markets: strs(r.markets, ALL_MARKETS, [...ALL_MARKETS]),
    leagues: strs(r.leagues, null, []),
    day: dayOffsets.length === 1 && dayOffsets[0] === 1 ? 'tomorrow' : 'today',
    maxLegs: Math.round(clamp(num(r.maxLegs, D.maxLegs), 1, 20)),
    minLegOdds: clamp(num(r.minLegOdds, D.minLegOdds), 1, 20),
    fullStatsOnly: r.fullStatsOnly === true,
    targetOdds: t >= TARGET_MIN && t <= TARGET_MAX ? r2(t) : 0,
    onlyTarget: r.onlyTarget === true,
    dayOffsets,
    mixDays: r.mixDays === true,
  };
}

// Keeps legs inside the filter range (never outside the hard limit), one per match (the highest), sorted by probability descending.
function clean(legs: DailyLeg[], f: DailyFilters): DailyLeg[] {
  const lo = Math.max(f.minP, HARD_MIN_P);
  const best = new Map<string, DailyLeg>();
  for (const l of Array.isArray(legs) ? legs : []) {
    if (!l || typeof l.probability !== 'number' || !Number.isFinite(l.probability)) continue;
    if (l.probability < lo || l.probability > f.maxP || l.probability >= HARD_MAX_P) continue;
    const key = (l.home + '|' + l.away).trim().toLowerCase();
    const cur = best.get(key);
    if (!cur || l.probability > cur.probability) best.set(key, l);
  }
  return Array.from(best.values()).sort(
    (a, b) => b.probability - a.probability || a.match.localeCompare(b.match) || a.label.localeCompare(b.label),
  );
}

function pick(pool: DailyLeg[], target: number, maxLegs: number): DailyLeg[] {
  const lo = target * 0.85;
  const hi = target * 1.25;
  const chosen: DailyLeg[] = [];
  let o = 1;
  for (const l of pool) {
    if (o >= target || chosen.length >= maxLegs) break;
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

// Local calendar date of a kickoff ('' when the kickoff cannot be read). Runs in the browser, so it is the user's own date.
function dayKey(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate());
}

function slipFor(pool: DailyLeg[], target: number, f: DailyFilters, day?: string, custom?: boolean): DailySlip {
  const chosen = pick(pool, target, f.maxLegs);
  const tag = { ...(day !== undefined ? { day } : {}), ...(custom ? { custom: true } : {}) };
  if (chosen.length === 0) return { target, legs: [], odds: 0, probability: 0, note: NONE, ...tag };
  const ts = chosen.map((l) => Date.parse(l.kickoff)).filter((x) => Number.isFinite(x));
  const range = ts.length ? { from: new Date(Math.min(...ts)).toISOString(), to: new Date(Math.max(...ts)).toISOString() } : {};
  return { target, legs: chosen, odds: r2(oddsOf(chosen)), probability: r4(probOf(chosen)), note: noteFor(target), ...range, ...tag };
}

export function buildSlips(legs: DailyLeg[], filters?: DailyFilters): DailySlip[] {
  const f = normalizeFilters(filters);
  const pool = clean(legs, f);
  const t = f.targetOdds;
  const extra = t > 0 && !TARGETS.includes(t);
  // 'Target ~X' is the extra card; 'Only my target' replaces the four fixed cards with it.
  const targets = t > 0 && f.onlyTarget ? [t] : extra ? [...TARGETS, t] : TARGETS;
  let groups: { day?: string; pool: DailyLeg[] }[] = [{ pool }];
  if (!f.mixDays && f.dayOffsets.length > 1) {
    // Mix OFF over several days: one set of slips per day.
    const by = new Map<string, DailyLeg[]>();
    for (const l of pool) {
      const k = dayKey(l.kickoff);
      by.set(k, [...(by.get(k) ?? []), l]);
    }
    groups = Array.from(by.keys()).sort().map((k) => ({ day: k, pool: by.get(k) ?? [] }));
    if (groups.length === 0) groups = [{ pool }];
  }
  return groups.flatMap((g) => targets.map((target) => slipFor(g.pool, target, f, g.day, t > 0 && target === t && (f.onlyTarget || extra))));
}
