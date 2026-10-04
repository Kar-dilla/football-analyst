import { goalsModel } from '@/lib/models/goals';
import { fitStrengths } from '@/lib/models/strengths';
import { getCompetition } from '@/lib/registry';
import { getOrSet } from '@/lib/cache';
import type { Competition, MatchData, ParsedQuery, TeamStats } from '@/lib/types';

type Row = { d: number; h: string; a: string; hg: number; ag: number; sw?: number };
type Rec = Record<string, string>;
type EventDef = { name: string; q: Pick<ParsedQuery, 'market' | 'side' | 'line'>; safe: boolean; hit: (h: number, a: number) => boolean };
type Acc = { n: number; b: number; b0: number; bk: { n: number; p: number; y: number }[]; s75: number[]; s85: number[] };
type Fit = NonNullable<ReturnType<typeof fitStrengths>>;
type MRows = Parameters<typeof fitStrengths>[0];
type Opts = { rho?: number; spread?: number };
type Cand = { r: Row; lm: number; home: TeamStats; away: TeamStats; fit: Fit | null; freq: number[] };

const DAY = 24 * 60 * 60 * 1000;
const INTL_URL = 'https://raw.githubusercontent.com/martj42/international_results/master/results.csv';
const CLUB_BASE = 'https://www.football-data.co.uk/';
const SINCE = Date.UTC(2021, 0, 1);
const CUTS = [0.5, 0.6, 0.7, 0.8, 0.9];
const LABELS = ['0-0.5', '0.5-0.6', '0.6-0.7', '0.7-0.8', '0.8-0.9', '0.9-1'];
const RHOS = [0, -0.05, -0.08, -0.12, -0.16];
const SPREADS = [0, 0.1, 0.2, 0.3];
const INTL_NAMES = ['over1.5', 'over2.5', 'btts_yes', '1x2_1', '1x2_X', '1x2_2'];
const EV = (name: string, q: EventDef['q'], safe: boolean, hit: EventDef['hit']): EventDef => ({ name, q, safe, hit });
const EVENTS: EventDef[] = [
  EV('over1.5', { market: 'goals_ou', side: 'over', line: 1.5 }, true, (h, a) => h + a >= 2),
  EV('over2.5', { market: 'goals_ou', side: 'over', line: 2.5 }, true, (h, a) => h + a >= 3),
  EV('over3.5', { market: 'goals_ou', side: 'over', line: 3.5 }, true, (h, a) => h + a >= 4),
  EV('under3.5', { market: 'goals_ou', side: 'under', line: 3.5 }, true, (h, a) => h + a <= 3),
  EV('btts_yes', { market: 'btts', side: 'yes' }, true, (h, a) => h > 0 && a > 0),
  EV('btts_no', { market: 'btts', side: 'no' }, true, (h, a) => h === 0 || a === 0),
  EV('1x2_1', { market: '1x2', side: '1' }, false, (h, a) => h > a),
  EV('1x2_X', { market: '1x2', side: 'X' }, false, (h, a) => h === a),
  EV('1x2_2', { market: '1x2', side: '2' }, false, (h, a) => h < a),
  EV('dc_1X', { market: 'double_chance', side: '1X' }, true, (h, a) => h >= a),
  EV('dc_X2', { market: 'double_chance', side: 'X2' }, true, (h, a) => h <= a),
  EV('dc_12', { market: 'double_chance', side: '12' }, true, (h, a) => h !== a),
];

const r4 = (x: number): number => Math.round(x * 10000) / 10000;
const pad = (n: number): string => (n < 10 ? '0' : '') + n;
const get = (r: Rec, k: string): string => r[k] ?? '';
const num = (s: string): number => (s === '' ? NaN : Number(s));

function splitLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c !== '"') cur += c;
      else if (line[i + 1] === '"') { cur += '"'; i++; } else q = false;
    } else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  return out.concat(cur);
}

function parseCsv(text: string): Rec[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return [];
  const head = splitLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const cells = splitLine(l);
    return Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? '').trim()])) as Rec;
  });
}

function parseDmy(s: string): number {
  const [dd = '', mm = '', yy = ''] = s.split('/');
  return Date.UTC(num(yy) < 100 ? num(yy) + 2000 : num(yy), num(mm) - 1, num(dd));
}

async function loadRows(url: string, kind: 'club' | 'intl'): Promise<Row[]> {
  return getOrSet<Row[]>('backtest:' + url, DAY, async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
    const club = kind === 'club', rows: Row[] = [];
    for (const r of parseCsv(await res.text())) {
      const d = club ? parseDmy(get(r, 'Date')) : Date.parse(get(r, 'date'));
      const h = club ? get(r, 'HomeTeam') : get(r, 'home_team');
      const a = club ? get(r, 'AwayTeam') : get(r, 'away_team');
      const hg = num(club ? get(r, 'FTHG') : get(r, 'home_score'));
      const ag = num(club ? get(r, 'FTAG') : get(r, 'away_score'));
      if (!Number.isFinite(d) || !h || !a || !Number.isFinite(hg) || !Number.isFinite(ag) || (!club && d < SINCE)) continue;
      rows.push({ d, h, a, hg, ag });
    }
    return rows;
  });
}

const newAcc = (): Acc => ({ n: 0, b: 0, b0: 0, bk: LABELS.map(() => ({ n: 0, p: 0, y: 0 })), s75: [0, 0], s85: [0, 0] });
const shrunk = (xs: number[], lm: number): number => {
  const w = xs.slice(-20);
  return (w.reduce((s, x) => s + x, 0) + (5 * lm) / 2) / (w.length + 5);
};
function teamStats(name: string, f: number[], c: number[], lm: number): TeamStats {
  const z = { fhGf: 0, fhGa: 0, cornersFor: 0, cornersAgainst: 0, cardsFor: 0, shotsFor: 0, foulsFor: 0, htZeroZeroRate: 0, goalMinutes: [] as number[], fhSubRate: 0 };
  return { name, games: Math.min(f.length, 20), gf: shrunk(f, lm), ga: shrunk(c, lm), ...z };
}

function record(a: Acc, p: number, y: number, base: number, safe: boolean): void {
  a.n++; a.b += (p - y) ** 2; a.b0 += (base - y) ** 2;
  let k = CUTS.findIndex((c) => p < c);
  if (k < 0) k = CUTS.length;
  const bk = a.bk[k];
  bk.n++; bk.p += p; bk.y += y;
  if (!safe) return;
  if (p >= 0.75) { a.s75[0]++; a.s75[1] += y; }
  if (p >= 0.85) { a.s85[0]++; a.s85[1] += y; }
}

function fitRows(rows: Row[], upto: number, at: number): MRows {
  const out: MRows = [];
  for (let j = 0; j < upto && rows[j].d < at; j++) {
    const x = rows[j];
    out.push({ date: x.d, home: x.h, away: x.a, hg: x.hg, ag: x.ag, w: Math.max(0.05, Math.exp(((-(at - x.d) / DAY) * Math.LN2) / 90)) * (x.sw ?? 1) });
  }
  return out;
}

function walk(rows: Row[], club: boolean): Cand[] {
  const hist = new Map<string, { f: number[]; c: number[] }>();
  const freq = EVENTS.map(() => 0);
  const out: Cand[] = [];
  let fit: Fit | null = null;
  let fitAt = -Infinity;
  let total = 0, goalSum = 0;
  const push = (t: string, f: number, c: number) => { const h = hist.get(t) ?? { f: [], c: [] }; h.f.push(f); h.c.push(c); hist.set(t, h); };
  for (let j = 0; j < rows.length; j++) {
    const r = rows[j];
    if (club && r.d - fitAt >= 10 * DAY) { const tr = fitRows(rows, j, r.d); fit = tr.length ? fitStrengths(tr) : null; fitAt = r.d; }
    const H = hist.get(r.h), A = hist.get(r.a);
    const ok = club
      ? !!fit && fit.att.has(r.h) && fit.att.has(r.a) && fit.def.has(r.h) && fit.def.has(r.a)
      : !!H && !!A && H.f.length >= 5 && A.f.length >= 5;
    if (total > 0 && H && A && ok) {
      const lm = goalSum / total;
      out.push({ r, lm, home: teamStats(r.h, H.f, H.c, lm), away: teamStats(r.a, A.f, A.c, lm), fit: club ? fit : null, freq: freq.map((x) => x / total) });
    }
    total++;
    goalSum += r.hg + r.ag;
    EVENTS.forEach((ev, k) => { if (ev.hit(r.hg, r.ag)) freq[k]++; });
    push(r.h, r.hg, r.ag);
    push(r.a, r.ag, r.hg);
  }
  return out;
}

function score(cands: Cand[], comp: Competition, on: boolean, opts?: Opts, only?: string[]): Acc[] {
  const acc = EVENTS.map(() => newAcc());
  for (const c of cands) {
    const f = c.fit;
    const side = (t: string) => ({ att: f?.att.get(t) ?? 0, def: f?.def.get(t) ?? 0, n: f?.n.get(t) ?? 0 });
    const st = on && f ? { home: side(c.r.h), away: side(c.r.a), homeAdv: f.homeAdv, mu: f.mu } : undefined;
    EVENTS.forEach((ev, i) => {
      if (only && !only.includes(ev.name)) return;
      const data = {
        query: { home: c.r.h, away: c.r.a, raw: '', ...ev.q }, competition: comp, home: c.home, away: c.away, referee: null,
        leagueAvg: { goals: c.lm, fhGoals: 0, corners: 0, cards: 0 }, fixtureDates: { home: [], away: [] }, news: [], missing: [], ...(st ? { strengths: st } : {}),
      } as MatchData;
      const res = goalsModel(data, opts);
      if (res && Number.isFinite(res.probability)) record(acc[i], Math.min(1, Math.max(0, res.probability)), ev.hit(c.r.hg, c.r.ag) ? 1 : 0, c.freq[i], ev.safe);
    });
  }
  return acc;
}

function summarize(ev: EventDef, a: Acc, compact = false): Record<string, unknown> {
  const n = a.n;
  const [brier, base] = n ? [a.b / n, a.b0 / n] : [NaN, NaN];
  const safe = (s: number[]) => ({ picks: s[0], hitRate: s[0] ? r4(s[1] / s[0]) : null });
  const bucket = (k: Acc['bk'][number], i: number) => {
    const p = k.n ? r4(k.p / k.n) : null;
    const y = k.n ? r4(k.y / k.n) : null;
    return compact ? [k.n, p, y] : { range: LABELS[i], n: k.n, predicted: p, actual: y };
  };
  return {
    n, brier: n ? r4(brier) : null, baselineBrier: n ? r4(base) : null, skill: n && base > 0 ? r4((base - brier) / base) : null,
    buckets: a.bk.map(bucket),
    safe75: ev.safe ? safe(a.s75) : undefined,
    safe85: ev.safe ? safe(a.s85) : undefined,
  };
}

const meanBrier = (acc: Acc[]): number => {
  const v = acc.filter((a) => a.n > 0).map((a) => a.b / a.n);
  return v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN;
};
function variant(acc: Acc[]): Record<string, unknown> {
  const events: Record<string, unknown> = {};
  EVENTS.forEach((ev, i) => { events[ev.name] = summarize(ev, acc[i], true); });
  const bk = acc[EVENTS.findIndex((e) => e.name === '1x2_X')].bk;
  const n = bk.reduce((s, k) => s + k.n, 0);
  const mean = (g: (k: { p: number; y: number }) => number) => (n ? r4(bk.reduce((s, k) => s + g(k), 0) / n) : null);
  return { meanBrier: r4(meanBrier(acc)), drawBias: { predicted: mean((k) => k.p), actual: mean((k) => k.y) }, events };
}

export async function runBacktest(kind: 'club' | 'intl', comp?: string, limit?: number): Promise<unknown> {
  try {
    let rows: Row[] = [];
    let competition: Competition;
    const errs: string[] = [];
    if (kind === 'intl') {
      competition = { id: 'nations', type: 'national', tier: 'C', confidenceCap: 'medium', name: 'intl' };
      rows = await loadRows(INTL_URL, 'intl');
    } else {
      const c = comp ? getCompetition(comp) : null;
      if (!c) return { error: 'unknown competition: ' + (comp ?? '(none)') };
      if (!c.csvPath || !c.csvPath.startsWith('mmz4281')) return { error: 'competition has no mmz4281 csvPath: ' + c.id };
      competition = c;
      const prev = c.csvPath.replace(/\/(\d{2})(\d{2})\//, (_m, a, b) => '/' + pad((Number(a) + 99) % 100) + pad((Number(b) + 99) % 100) + '/');
      const paths = prev !== c.csvPath ? [c.csvPath, prev] : [c.csvPath];
      const got = await Promise.allSettled(paths.map((p) => loadRows(CLUB_BASE + p, 'club')));
      got.forEach((g, gi) => {
        if (g.status === 'fulfilled') rows = rows.concat(g.value.map((r) => ({ ...r, sw: gi === 0 ? 1 : 0.5 })));
        else errs.push(String(g.reason?.message ?? g.reason));
      });
    }
    const fe = errs.length ? ': ' + errs.join('; ') : '';
    if (rows.length < 20) return { error: 'not enough data' + fe };
    const all = walk(rows.sort((x, y) => x.d - y.d), kind === 'club');
    if (kind === 'intl') {
      const acc = score(all, competition, false, undefined, INTL_NAMES);
      const events: Record<string, unknown> = {};
      EVENTS.forEach((ev, i) => { if (INTL_NAMES.includes(ev.name)) events[ev.name] = summarize(ev, acc[i]); });
      return {
        kind, comp: 'intl', matchesTested: all.length, events,
        note: 'skill > 0 means better than the naive baseline; hit rates at the 0.85 threshold should be near or above 0.85 if calibrated',
      };
    }
    const lim = typeof limit === 'number' && Number.isFinite(limit) && limit >= 1 ? Math.min(1000, Math.floor(limit)) : 250;
    const cands = all.slice(-lim);
    if (cands.length < 20) return { error: 'not enough testable matches (' + cands.length + ')' + fe };
    const V = (on: boolean, o?: Opts) => variant(score(cands, competition, on, o));
    const tuning: { rho: number; spread: number; meanBrier: number }[] = [];
    let best: (typeof tuning)[number] | null = null;
    let bestRaw = Infinity;
    for (const rho of RHOS) for (const spread of SPREADS) {
      const mb = meanBrier(score(cands, competition, true, { rho, spread }));
      const t = { rho, spread, meanBrier: r4(mb) };
      tuning.push(t);
      if (mb < bestRaw) { bestRaw = mb; best = t; }
    }
    return {
      kind, comp, matchesTested: cands.length, variants: { old: V(false, { rho: 0, spread: 0 }), dcMix: V(false), strengthsDcMix: V(true) }, tuning, recommended: best,
      note: 'Brier: lower is better; skill > 0 beats the frequency baseline. buckets = [n, predicted, actual] for ranges 0-0.5, 0.5-0.6, 0.6-0.7, 0.7-0.8, 0.8-0.9, 0.9-1. safe75/85 = hit rate of picks with p >= 0.75/0.85. tuning is in-sample on the tested matches (optimistic).' + (fe ? ' | fetch errors' + fe : ''),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
