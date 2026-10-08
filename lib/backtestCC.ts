import { cornersCardsModel } from '@/lib/models/cornersCards';
import { poissonOver } from '@/lib/models/poisson';
import { getCompetition } from '@/lib/registry';
import { getOrSet } from '@/lib/cache';
import type { Competition, MatchData, TeamStats } from '@/lib/types';

type Row = { d: number; h: string; a: string; hc: number | null; ac: number | null; hk: number | null; ak: number | null; ref: string };
type Ref = { games: number; cpg: number };
type Cand = { h: string; a: string; home: TeamStats; away: TeamStats; L: number; T: number; ref: Ref | null; fo: number[] };
type Acc = { n: number; b: number; b0: number; p: number; y: number; s75: number[]; s85: number[] };

const DAY = 24 * 60 * 60 * 1000;
const CLUB_BASE = 'https://www.football-data.co.uk/';
const CLINES = [6.5, 7.5, 8.5, 9.5, 10.5, 11.5, 12.5];
const KLINES = [1.5, 2.5, 3.5, 4.5, 5.5, 6.5];
const SPREADS = [0, 0.1, 0.2, 0.3, 0.4];
const NOT_FULL = 'Corners and cards need a league with a full stats file.';

const r4 = (x: number): number => Math.round(x * 10000) / 10000;
const pad = (n: number): string => (n < 10 ? '0' : '') + n;
const get = (r: Record<string, string>, k: string): string => r[k] ?? '';
const num = (s: string): number => (s === '' ? NaN : Number(s));
const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
const mean = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
const tsOf = (name: string, o: Partial<TeamStats>): TeamStats => ({ name, games: 0, gf: 0, ga: 0, fhGf: 0, fhGa: 0, cornersFor: 0, cornersAgainst: 0, cardsFor: 0, shotsFor: 0, foulsFor: 0, htZeroZeroRate: 0, goalMinutes: [], ...o });

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

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return [];
  const head = splitLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const cells = splitLine(l);
    return Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? '').trim()])) as Record<string, string>;
  });
}

function parseDmy(s: string): number {
  const [dd = '', mm = '', yy = ''] = s.split('/');
  return Date.UTC(num(yy) < 100 ? num(yy) + 2000 : num(yy), num(mm) - 1, num(dd));
}

// Missing stats are stored as null (not NaN) so cached rows survive JSON.
async function loadRows(url: string): Promise<Row[]> {
  return getOrSet<Row[]>('backtestcc:' + url, DAY, async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
    const rows: Row[] = [];
    for (const r of parseCsv(await res.text())) {
      const d = parseDmy(get(r, 'Date'));
      const h = get(r, 'HomeTeam');
      const a = get(r, 'AwayTeam');
      if (!Number.isFinite(d) || !h || !a) continue;
      const [hc, ac] = [num(get(r, 'HC')), num(get(r, 'AC'))];
      const [hy, ay, hr, ar] = ['HY', 'AY', 'HR', 'AR'].map((k) => num(get(r, k)));
      const cOk = Number.isFinite(hc) && Number.isFinite(ac);
      const kOk = [hy, ay, hr, ar].every(Number.isFinite);
      rows.push({ d, h, a, hc: cOk ? hc : null, ac: cOk ? ac : null, hk: kOk ? hy + hr : null, ak: kOk ? ay + ar : null, ref: get(r, 'Referee') });
    }
    return rows;
  });
}

// One walk forward: every number for a match comes only from earlier rows.
function walk(rows: Row[]): { cc: Cand[]; kc: Cand[] } {
  const cH = new Map<string, { f: number[]; a: number[] }>();
  const kH = new Map<string, number[]>();
  const refs = new Map<string, { n: number; sum: number }>();
  const cCnt = CLINES.map(() => 0);
  const kCnt = KLINES.map(() => 0);
  const cc: Cand[] = [];
  const kc: Cand[] = [];
  let cN = 0, cSum = 0, kN = 0, kSum = 0;
  const m20 = (xs: number[], lpt: number): number => (xs.slice(-20).reduce((s, x) => s + x, 0) + 5 * lpt) / (Math.min(xs.length, 20) + 5);
  for (const r of rows) {
    if (r.hc !== null && r.ac !== null) {
      const H = cH.get(r.h), A = cH.get(r.a), T = r.hc + r.ac;
      if (cN > 0 && H && A && H.f.length >= 5 && A.f.length >= 5) {
        const L = cSum / cN, lpt = L / 2;
        cc.push({ h: r.h, a: r.a, L, T, ref: null, fo: cCnt.map((x) => x / cN),
          home: tsOf(r.h, { games: Math.min(H.f.length, 20), cornersFor: m20(H.f, lpt), cornersAgainst: m20(H.a, lpt) }),
          away: tsOf(r.a, { games: Math.min(A.f.length, 20), cornersFor: m20(A.f, lpt), cornersAgainst: m20(A.a, lpt) }) });
      }
      for (const [t, f, a] of [[r.h, r.hc, r.ac], [r.a, r.ac, r.hc]] as [string, number, number][]) {
        const h = cH.get(t) ?? { f: [], a: [] };
        h.f.push(f); h.a.push(a); cH.set(t, h);
      }
      cN++; cSum += T;
      CLINES.forEach((l, i) => { if (T > l) cCnt[i]++; });
    }
    if (r.hk !== null && r.ak !== null) {
      const H = kH.get(r.h) ?? [], A = kH.get(r.a) ?? [], T = r.hk + r.ak, g = r.ref ? refs.get(r.ref) : undefined;
      if (kN > 0 && H.length >= 5 && A.length >= 5) {
        const L = kSum / kN, lpt = L / 2;
        kc.push({ h: r.h, a: r.a, L, T, fo: kCnt.map((x) => x / kN), ref: g && g.n >= 3 ? { games: g.n, cpg: g.sum / g.n } : null,
          home: tsOf(r.h, { games: Math.min(H.length, 20), cardsFor: m20(H, lpt) }),
          away: tsOf(r.a, { games: Math.min(A.length, 20), cardsFor: m20(A, lpt) }) });
      }
      kH.set(r.h, H.concat(r.hk)); kH.set(r.a, A.concat(r.ak));
      if (r.ref) refs.set(r.ref, { n: (g?.n ?? 0) + 1, sum: (g?.sum ?? 0) + T });
      kN++; kSum += T;
      KLINES.forEach((l, i) => { if (T > l) kCnt[i]++; });
    }
  }
  return { cc, kc };
}

// Plain models, written out the way the product does them.
const muC = (c: Cand): number => 0.7 * ((c.home.cornersFor + c.away.cornersAgainst) / 2 + (c.away.cornersFor + c.home.cornersAgainst) / 2) + 0.3 * c.L;
const muK0 = (c: Cand): number => 0.7 * (c.home.cardsFor + c.away.cardsFor) + 0.3 * c.L;
const refF = (c: Cand): number => (c.ref ? 1 + ((clamp(c.ref.cpg / c.L, 0.75, 1.25) - 1) * c.ref.games) / (c.ref.games + 10) : 1);
const muK = (c: Cand): number => muK0(c) * refF(c);
const mix = (m: number, l: number, s: number): number => (s ? 0.25 * poissonOver(m * (1 - s), l) + 0.5 * poissonOver(m, l) + 0.25 * poissonOver(m * (1 + s), l) : poissonOver(m, l));
const brier = (m: number, T: number, lines: number[]): number => mean(lines.map((l) => (poissonOver(m, l) - (T > l ? 1 : 0)) ** 2));

const newAcc = (): Acc => ({ n: 0, b: 0, b0: 0, p: 0, y: 0, s75: [0, 0], s85: [0, 0] });
function rec(a: Acc, p: number, y: number, base: number): void {
  a.n++; a.b += (p - y) ** 2; a.b0 += (base - y) ** 2; a.p += p; a.y += y;
  if (p >= 0.75) { a.s75[0]++; a.s75[1] += y; }
  if (p >= 0.85) { a.s85[0]++; a.s85[1] += y; }
}
const safe = (s: number[]) => ({ picks: s[0], hitRate: s[0] ? r4(s[1] / s[0]) : null });
function sum(a: Acc) {
  const b = a.b / a.n, b0 = a.b0 / a.n;
  return { n: a.n, brier: r4(b), baselineBrier: r4(b0), skill: b0 > 0 ? r4((b0 - b) / b0) : null, safe75: safe(a.s75), safe85: safe(a.s85), predicted: r4(a.p / a.n), actual: r4(a.y / a.n) };
}

function market(cands: Cand[], lines: number[], mu: (c: Cand) => number, mu0?: (c: Cand) => number): Record<string, unknown> {
  if (cands.length < 20) return { error: 'not enough testable matches (' + cands.length + ')' };
  const accs = lines.flatMap(() => [newAcc(), newAcc()]);
  const sb = SPREADS.map(() => 0);
  const ms: number[] = [];
  const ts: number[] = [];
  let refN = 0, bw = 0, bn = 0;
  for (const c of cands) {
    const m = mu(c);
    ms.push(m); ts.push(c.T);
    lines.forEach((l, i) => {
      const p = poissonOver(m, l), y = c.T > l ? 1 : 0;
      rec(accs[2 * i], p, y, c.fo[i]);
      rec(accs[2 * i + 1], 1 - p, 1 - y, 1 - c.fo[i]);
      SPREADS.forEach((s, k) => { sb[k] += (mix(m, l, s) - y) ** 2; });
    });
    if (mu0 && c.ref) { refN++; bw += brier(m, c.T, lines); bn += brier(mu0(c), c.T, lines); }
  }
  const events: Record<string, unknown> = {};
  lines.forEach((l, i) => { events['over' + l] = sum(accs[2 * i]); events['under' + l] = sum(accs[2 * i + 1]); });
  const mt = mean(ts);
  const spreadTuning = SPREADS.map((spread, k) => ({ spread, meanBrier: r4(sb[k] / (cands.length * lines.length)) }));
  const best = spreadTuning.reduce((b, t) => (t.meanBrier < b.meanBrier ? t : b));
  const out = { meanPredicted: r4(mean(ms)), meanActual: r4(mt), dispersion: mt > 0 ? r4(ts.reduce((s, x) => s + (x - mt) ** 2, 0) / (ts.length - 1) / mt) : null, events, spreadTuning, recommendedSpread: best.spread };
  return mu0 ? { ...out, withReferee: { n: refN, meanBrierWithRef: refN ? r4(bw / refN) : null, meanBrierNoRef: refN ? r4(bn / refN) : null } } : out;
}

// Largest gap between this file's plain model and cornersCardsModel over the first 30 tested matches (1 = the product model returned nothing).
function consist(cands: Cand[], comp: Competition, kind: 'corners_ou' | 'cards_ou', mu: (c: Cand) => number): number {
  const corners = kind === 'corners_ou';
  const line = corners ? 9.5 : 3.5;
  let worst = 0;
  for (const c of cands.slice(0, 30)) {
    const res = cornersCardsModel({
      query: { home: c.h, away: c.a, market: kind, side: 'over' as const, line, raw: '' }, competition: comp, home: c.home, away: c.away,
      leagueAvg: { goals: 0, fhGoals: 0, corners: corners ? c.L : 0, cards: corners ? 0 : c.L },
      referee: c.ref ? { name: '', games: c.ref.games, cardsPerGame: c.ref.cpg } : null,
      fixtureDates: { home: [], away: [] }, news: [], missing: [],
    } as MatchData);
    if (!res) { worst = 1; continue; }
    const m = mu(c);
    const diffs = (res.ladder ?? []).flatMap((x) => [Math.abs(x.over - poissonOver(m, x.line)), Math.abs(x.under - (1 - poissonOver(m, x.line)))]);
    worst = Math.max(worst, Math.abs(res.probability - poissonOver(m, line)), ...diffs);
  }
  return Math.round(worst * 1e6) / 1e6;
}

export async function runBacktestCC(comp: string, limit?: number): Promise<unknown> {
  try {
    const c = comp ? getCompetition(comp) : null;
    if (!c) return { error: 'unknown competition: ' + (comp || '(none)') };
    if (!c.csvPath || !c.csvPath.startsWith('mmz4281')) return { error: NOT_FULL };
    const prev = c.csvPath.replace(/\/(\d{2})(\d{2})\//, (_m, a, b) => '/' + pad((Number(a) + 99) % 100) + pad((Number(b) + 99) % 100) + '/');
    const paths = prev !== c.csvPath ? [c.csvPath, prev] : [c.csvPath];
    const errs: string[] = [];
    let rows: Row[] = [];
    (await Promise.allSettled(paths.map((p) => loadRows(CLUB_BASE + p)))).forEach((g) => {
      if (g.status === 'fulfilled') rows = rows.concat(g.value);
      else errs.push(String(g.reason?.message ?? g.reason));
    });
    const fe = errs.length ? ': ' + errs.join('; ') : '';
    if (rows.length < 100) return { error: 'not enough data' + fe };
    const lim = typeof limit === 'number' && Number.isFinite(limit) ? Math.min(400, Math.max(50, Math.floor(limit))) : 250;
    const { cc, kc } = walk(rows.sort((x, y) => x.d - y.d));
    const cs = cc.slice(-lim);
    const ks = kc.slice(-lim);
    return {
      kind: 'cc', comp: c.id, matchesTested: { corners: cs.length, cards: ks.length },
      consistency: { corners: consist(cs, c, 'corners_ou', muC), cards: consist(ks, c, 'cards_ou', muK) },
      corners: market(cs, CLINES, muC), cards: market(ks, KLINES, muK, muK0),
      note: 'skill > 0 means better than the naive baseline; safe85 hit rates should be at or above 0.85 if calibrated; dispersion above 1 means counts vary more than Poisson allows' + (fe ? ' | fetch errors' + fe : ''),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
