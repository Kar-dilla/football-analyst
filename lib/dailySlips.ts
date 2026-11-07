export interface DailyLeg {
  match: string;
  home: string;
  away: string;
  kickoff: string;
  competitionId: string;
  competitionName: string;
  market?: string;
  side?: string;
  line?: number;
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
  maxLegs: number;       // 1 to 50, default 20 (used by the fixed 2, 5, 10, 15 slips)
  minLegOdds: number;
  fullStatsOnly: boolean;
  targetOdds: number;    // 0 = no custom target, otherwise 1.5 to 100
  onlyTarget: boolean;   // hide the fixed 2, 5, 10, 15 cards (needs targetOdds)
  dayOffsets: number[];  // 0 = today, 1 = tomorrow, ... up to 6
  mixDays: boolean;      // true: legs from different days may share a slip
  customMaxLegs?: number; // max legs for the 'My target odds' card (1 to 50); defaults to maxLegs, or 40 when the target is above 15 and maxLegs was not given
  from?: string;         // custom window start, ISO UTC. Set only when from and to are both valid (from < to, at most 7 days)
  to?: string;           // custom window end (exclusive), ISO UTC
  includeDraws?: boolean; // draw slips on or off (default false). Draw legs never mix with normal legs
  drawMinP?: number;      // draw leg minimum probability, fraction, clamped to 0.20 to 0.50 (default 0.25)
  drawMaxP?: number;      // draw leg maximum probability, fraction, clamped to 0.20 to 0.50 (default 0.45)
}

export const ALL_MARKETS: string[] = ['goals', 'btts', 'result', 'doublechance', 'firsthalf', 'secondhalf', 'corners', 'cards'];
// Draw legs live in their own range. Hard limits the user can never override: 0.20 to 0.50.
export const HARD_DRAW_MIN = 0.2;
export const HARD_DRAW_MAX = 0.5;
export const DEFAULT_DRAW_MIN = 0.25;
export const DEFAULT_DRAW_MAX = 0.45;
const DRAW_TARGETS = [5, 10, 15];
const DRAW_MAX_LEGS = 10;
const DRAW_NOTE = 'Draws are hard to predict. Low confidence.';
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
  includeDraws: false,
  drawMinP: DEFAULT_DRAW_MIN,
  drawMaxP: DEFAULT_DRAW_MAX,
};
// Hard limit the user can never override: a leg must be >= HARD_MIN_P and < HARD_MAX_P.
export const HARD_MIN_P = 0.55;
export const HARD_MAX_P = 1;

const TARGETS = [2, 5, 10, 15];
const TARGET_MIN = 1.5;
const TARGET_MAX = 100;
export const MAX_LEGS_LIMIT = 50; // highest max legs a user can set
export const MAX_WINDOW_MS = 7 * 86400000; // longest custom window
const CUSTOM_BIG_LEGS = 40; // max legs for a custom target above 15 when max legs was left alone
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
  let drawMinP = clamp(num(r.drawMinP, DEFAULT_DRAW_MIN), HARD_DRAW_MIN, HARD_DRAW_MAX);
  let drawMaxP = clamp(num(r.drawMaxP, DEFAULT_DRAW_MAX), HARD_DRAW_MIN, HARD_DRAW_MAX);
  if (drawMinP > drawMaxP) [drawMinP, drawMaxP] = [drawMaxP, drawMinP];
  let dayOffsets = Array.isArray(r.dayOffsets)
    ? Array.from(new Set((r.dayOffsets as unknown[]).filter((x): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 6))).sort((a, b) => a - b)
    : [];
  if (dayOffsets.length === 0) dayOffsets = [r.day === 'tomorrow' ? 1 : 0];
  const t = num(r.targetOdds, 0);
  const target = t >= TARGET_MIN && t <= TARGET_MAX ? r2(t) : 0;
  const maxLegs = Math.round(clamp(num(r.maxLegs, D.maxLegs), 1, MAX_LEGS_LIMIT));
  // A custom target above 15 with no max legs given gets 40 legs; an explicit customMaxLegs (e.g. from an earlier pass) always wins.
  const customMaxLegs = Math.round(clamp(num(r.customMaxLegs, target > 15 && typeof r.maxLegs !== 'number' ? CUSTOM_BIG_LEGS : maxLegs), 1, MAX_LEGS_LIMIT));
  // Custom window: both ends must parse, from < to and at most 7 days; otherwise the window is ignored.
  const iso = (v: unknown) => {
    if (typeof v !== 'string' || v.length > 40) return '';
    const ms = Date.parse(v);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : '';
  };
  let from = iso(r.from);
  let to = iso(r.to);
  if (!from || !to || Date.parse(to) <= Date.parse(from) || Date.parse(to) - Date.parse(from) > MAX_WINDOW_MS) { from = ''; to = ''; }
  return {
    minP,
    maxP,
    markets: strs(r.markets, ALL_MARKETS, [...ALL_MARKETS]),
    leagues: strs(r.leagues, null, []),
    day: dayOffsets.length === 1 && dayOffsets[0] === 1 ? 'tomorrow' : 'today',
    maxLegs,
    minLegOdds: clamp(num(r.minLegOdds, D.minLegOdds), 1, 20),
    fullStatsOnly: r.fullStatsOnly === true,
    targetOdds: target,
    onlyTarget: r.onlyTarget === true,
    dayOffsets,
    mixDays: r.mixDays === true,
    customMaxLegs,
    includeDraws: r.includeDraws === true,
    drawMinP,
    drawMaxP,
    ...(from ? { from, to } : {}),
  };
}

// Day offsets (0 = today, 1 = tomorrow ...) of every calendar day, in the user's time zone, that the window [from, to) touches.
// Days before today are dropped; at most offset 7. tzMinutes = minutes east of UTC (the same value the route receives as tz).
export function windowOffsets(from: string, to: string, tzMinutes: number, now: number = Date.now()): number[] {
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a || !Number.isFinite(tzMinutes)) return [];
  const idx = (ms: number) => Math.floor((ms + tzMinutes * 60000) / 86400000);
  const today = idx(now);
  const out: number[] = [];
  for (let o = Math.max(0, idx(a) - today); o <= Math.min(7, idx(b - 1) - today); o++) out.push(o);
  return out;
}

// Keeps legs inside the filter range (never outside the hard limit) and the custom window, one per match (the highest), sorted by probability descending.
function clean(legs: DailyLeg[], f: DailyFilters): DailyLeg[] {
  const lo = Math.max(f.minP, HARD_MIN_P);
  const wf = f.from ? Date.parse(f.from) : NaN;
  const wt = f.to ? Date.parse(f.to) : NaN;
  const best = new Map<string, DailyLeg>();
  for (const l of Array.isArray(legs) ? legs : []) {
    if (!l || typeof l.probability !== 'number' || !Number.isFinite(l.probability)) continue;
    if (l.probability < lo || l.probability > f.maxP || l.probability >= HARD_MAX_P) continue;
    if (Number.isFinite(wf) && Number.isFinite(wt)) {
      const k = Date.parse(l.kickoff);
      if (!(k >= wf && k < wt)) continue;
    }
    const key = (l.home + '|' + l.away).trim().toLowerCase();
    const cur = best.get(key);
    if (!cur || l.probability > cur.probability) best.set(key, l);
  }
  return Array.from(best.values()).sort(
    (a, b) => b.probability - a.probability || a.match.localeCompare(b.match) || a.label.localeCompare(b.label),
  );
}

// Same as clean() but for draw legs: the draw range (hard 0.20 to 0.50) instead of the normal range.
function cleanDraws(legs: DailyLeg[], f: DailyFilters): DailyLeg[] {
  const lo = clamp(f.drawMinP ?? DEFAULT_DRAW_MIN, HARD_DRAW_MIN, HARD_DRAW_MAX);
  const hi = clamp(f.drawMaxP ?? DEFAULT_DRAW_MAX, HARD_DRAW_MIN, HARD_DRAW_MAX);
  const wf = f.from ? Date.parse(f.from) : NaN;
  const wt = f.to ? Date.parse(f.to) : NaN;
  const best = new Map<string, DailyLeg>();
  for (const l of Array.isArray(legs) ? legs : []) {
    if (!l || typeof l.probability !== 'number' || !Number.isFinite(l.probability)) continue;
    if (l.probability < lo || l.probability > hi) continue;
    if (Number.isFinite(wf) && Number.isFinite(wt)) {
      const k = Date.parse(l.kickoff);
      if (!(k >= wf && k < wt)) continue;
    }
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

// About how many legs pick() needs to reach the target: counts the pool highest-probability first (as pick does),
// then extends past the end of the pool with the pool's average leg. `pool` is already sorted by probability descending.
function legsNeeded(pool: DailyLeg[], target: number, f: DailyFilters): number {
  const goal = Math.log(target);
  const avg = pool.length ? pool.reduce((a, l) => a - Math.log(l.probability), 0) / pool.length : -Math.log((f.minP + f.maxP) / 2);
  let sum = 0;
  for (let i = 0; i < pool.length; i++) {
    sum -= Math.log(pool[i].probability);
    if (sum >= goal) return i + 1;
  }
  return pool.length + Math.max(1, Math.ceil((goal - sum) / (avg > 0 ? avg : 0.2)));
}

// Local calendar date of a kickoff ('' when the kickoff cannot be read). Runs in the browser, so it is the user's own date.
function dayKey(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return t.getFullYear() + '-' + p(t.getMonth() + 1) + '-' + p(t.getDate());
}

// draw = true builds a draw slip: max 10 legs and the draw note.
function slipFor(pool: DailyLeg[], target: number, f: DailyFilters, day?: string, custom?: boolean, draw?: boolean): DailySlip {
  const cap = draw ? DRAW_MAX_LEGS : custom ? (f.customMaxLegs ?? f.maxLegs) : f.maxLegs;
  const chosen = pick(pool, target, cap);
  const tag = { ...(day !== undefined ? { day } : {}), ...(custom ? { custom: true } : {}) };
  if (chosen.length === 0) {
    let note = NONE;
    if (custom && !draw) {
      const n = pool.length;
      const m = legsNeeded(pool, target, f);
      note = 'No qualifying combination. ' + (n < m
        ? `Not enough qualifying legs (found ${n}, need about ${m}).`
        : cap < m
          ? `Max legs is too low (limit ${cap}, need about ${m}).`
          : 'No mix of legs lands within -15% to +25% of the target.');
    }
    return { target, legs: [], odds: 0, probability: 0, note, ...tag };
  }
  const ts = chosen.map((l) => Date.parse(l.kickoff)).filter((x) => Number.isFinite(x));
  const range = ts.length ? { from: new Date(Math.min(...ts)).toISOString(), to: new Date(Math.max(...ts)).toISOString() } : {};
  return { target, legs: chosen, odds: r2(oddsOf(chosen)), probability: r4(probOf(chosen)), note: draw ? DRAW_NOTE : noteFor(target), ...range, ...tag };
}

export function buildSlips(legs: DailyLeg[], filters?: DailyFilters): DailySlip[] {
  const f = normalizeFilters(filters);
  const pool = clean(legs, f);
  const t = f.targetOdds;
  const extra = t > 0 && !TARGETS.includes(t);
  // 'Target ~X' is the extra card; 'Only my target' replaces the four fixed cards with it.
  const targets = t > 0 && f.onlyTarget ? [t] : extra ? [...TARGETS, t] : TARGETS;
  let groups: { day?: string; pool: DailyLeg[] }[] = [{ pool }];
  if (!f.mixDays && (f.dayOffsets.length > 1 || f.from)) {
    // Mix OFF over several days, or inside a custom window: one set of slips per calendar day.
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

// Draw-only slips: targets 5, 10, 15 plus the custom target when set, max 10 legs, same -15% / +25% tolerance. Never mixes with normal legs.
export function buildDrawSlips(legs: DailyLeg[], filters?: DailyFilters): DailySlip[] {
  const f = normalizeFilters(filters);
  const pool = cleanDraws(legs, f);
  const t = f.targetOdds;
  const extra = t > 0 && !DRAW_TARGETS.includes(t);
  const targets = extra ? [...DRAW_TARGETS, t] : DRAW_TARGETS;
  let groups: { day?: string; pool: DailyLeg[] }[] = [{ pool }];
  if (!f.mixDays && (f.dayOffsets.length > 1 || f.from)) {
    const by = new Map<string, DailyLeg[]>();
    for (const l of pool) {
      const k = dayKey(l.kickoff);
      by.set(k, [...(by.get(k) ?? []), l]);
    }
    groups = Array.from(by.keys()).sort().map((k) => ({ day: k, pool: by.get(k) ?? [] }));
    if (groups.length === 0) groups = [{ pool }];
  }
  return groups.flatMap((g) => targets.map((target) => slipFor(g.pool, target, f, g.day, extra && target === t, true)));
}
