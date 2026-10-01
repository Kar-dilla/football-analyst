import { goalsModel } from '@/lib/models/goals';
import { getCompetition } from '@/lib/registry';
import { getOrSet } from '@/lib/cache';
import type { Competition, MatchData, ParsedQuery, TeamStats } from '@/lib/types';

type Row = { d: number; h: string; a: string; hg: number; ag: number };
type Rec = Record<string, string>;
type EventDef = { name: string; q: Pick<ParsedQuery, 'market' | 'side' | 'line'>; safe: boolean; hit: (h: number, a: number) => boolean };
type Acc = { n: number; b: number; b0: number; bk: { n: number; p: number; y: number }[]; s75: number[]; s85: number[] };

const DAY = 24 * 60 * 60 * 1000;
const INTL_URL = 'https://raw.githubusercontent.com/martj42/international_results/master/results.csv';
const CLUB_BASE = 'https://www.football-data.co.uk/';
const SINCE = Date.UTC(2021, 0, 1);
const CUTS = [0.5, 0.6, 0.7, 0.8, 0.9];
const LABELS = ['0-0.5', '0.5-0.6', '0.6-0.7', '0.7-0.8', '0.8-0.9', '0.9-1'];
const EVENTS: EventDef[] = [
  { name: 'over1.5', q: { market: 'goals_ou', side: 'over', line: 1.5 }, safe: true, hit: (h, a) => h + a >= 2 },
  { name: 'over2.5', q: { market: 'goals_ou', side: 'over', line: 2.5 }, safe: true, hit: (h, a) => h + a >= 3 },
  { name: 'btts_yes', q: { market: 'btts', side: 'yes' }, safe: true, hit: (h, a) => h > 0 && a > 0 },
  { name: '1x2_1', q: { market: '1x2', side: '1' }, safe: false, hit: (h, a) => h > a },
  { name: '1x2_X', q: { market: '1x2', side: 'X' }, safe: false, hit: (h, a) => h === a },
  { name: '1x2_2', q: { market: '1x2', side: '2' }, safe: false, hit: (h, a) => h < a },
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
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { q = false; }
      } else { cur += c; }
    } else if (c === '"') { q = true; }
    else if (c === ',') { out.push(cur); cur = ''; }
    else { cur += c; }
  }
  out.push(cur);
  return out;
}

function parseCsv(text: string): Rec[] {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return [];
  const head = splitLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const cells = splitLine(l);
    const o: Rec = {};
    head.forEach((h, i) => { o[h] = (cells[i] ?? '').trim(); });
    return o;
  });
}

function parseDmy(s: string): number {
  const [dd = '', mm = '', yy = ''] = s.split('/');
  let y = num(yy);
  if (y < 100) y += 2000;
  return Date.UTC(y, num(mm) - 1, num(dd));
}

async function loadRows(url: string, kind: 'club' | 'intl'): Promise<Row[]> {
  return getOrSet<Row[]>('backtest:' + url, DAY, async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
    const club = kind === 'club';
    const rows: Row[] = [];
    for (const r of parseCsv(await res.text())) {
      const d = club ? parseDmy(get(r, 'Date')) : Date.parse(get(r, 'date'));
      const h = club ? get(r, 'HomeTeam') : get(r, 'home_team');
      const a = club ? get(r, 'AwayTeam') : get(r, 'away_team');
      const hg = num(club ? get(r, 'FTHG') : get(r, 'home_score'));
      const ag = num(club ? get(r, 'FTAG') : get(r, 'away_score'));
      if (!Number.isFinite(d) || !h || !a || !Number.isFinite(hg) || !Number.isFinite(ag)) continue;
      if (!club && d < SINCE) continue;
      rows.push({ d, h, a, hg, ag });
    }
    return rows;
  });
}

function newAcc(): Acc {
  return { n: 0, b: 0, b0: 0, bk: LABELS.map(() => ({ n: 0, p: 0, y: 0 })), s75: [0, 0], s85: [0, 0] };
}

function shrunk(xs: number[], lm: number): number {
  const w = xs.slice(-20);
  return (w.reduce((s, x) => s + x, 0) + (5 * lm) / 2) / (w.length + 5);
}

function teamStats(name: string, f: number[], c: number[], lm: number): TeamStats {
  return {
    name, games: Math.min(f.length, 20), gf: shrunk(f, lm), ga: shrunk(c, lm),
    fhGf: 0, fhGa: 0, cornersFor: 0, cornersAgainst: 0, cardsFor: 0, shotsFor: 0, foulsFor: 0,
    htZeroZeroRate: 0, goalMinutes: [], fhSubRate: 0,
  };
}

function record(a: Acc, p: number, y: number, base: number, safe: boolean): void {
  a.n++;
  a.b += (p - y) ** 2;
  a.b0 += (base - y) ** 2;
  let k = CUTS.findIndex((c) => p < c);
  if (k < 0) k = CUTS.length;
  const bk = a.bk[k];
  bk.n++; bk.p += p; bk.y += y;
  if (!safe) return;
  if (p >= 0.75) { a.s75[0]++; a.s75[1] += y; }
  if (p >= 0.85) { a.s85[0]++; a.s85[1] += y; }
}

function walk(rows: Row[], competition: Competition): { tested: number; acc: Acc[] } {
  const hist = new Map<string, { f: number[]; c: number[] }>();
  const acc = EVENTS.map(() => newAcc());
  const freq = EVENTS.map(() => 0);
  let total = 0;
  let goalSum = 0;
  let tested = 0;
  const push = (t: string, f: number, c: number) => {
    const h = hist.get(t) ?? { f: [], c: [] };
    h.f.push(f); h.c.push(c); hist.set(t, h);
  };
  for (const r of rows) {
    const H = hist.get(r.h);
    const A = hist.get(r.a);
    if (total > 0 && H && A && H.f.length >= 5 && A.f.length >= 5) {
      const lm = goalSum / total;
      const home = teamStats(r.h, H.f, H.c, lm);
      const away = teamStats(r.a, A.f, A.c, lm);
      tested++;
      EVENTS.forEach((ev, i) => {
        const data: MatchData = {
          query: { home: r.h, away: r.a, raw: '', ...ev.q },
          competition, home, away,
          leagueAvg: { goals: lm, fhGoals: 0, corners: 0, cards: 0 },
          referee: null, fixtureDates: { home: [], away: [] }, news: [], missing: [],
        };
        const res = goalsModel(data);
        if (!res || !Number.isFinite(res.probability)) return;
        const p = Math.min(1, Math.max(0, res.probability));
        record(acc[i], p, ev.hit(r.hg, r.ag) ? 1 : 0, freq[i] / total, ev.safe);
      });
    }
    total++;
    goalSum += r.hg + r.ag;
    EVENTS.forEach((ev, i) => { if (ev.hit(r.hg, r.ag)) freq[i]++; });
    push(r.h, r.hg, r.ag);
    push(r.a, r.ag, r.hg);
  }
  return { tested, acc };
}

function summarize(ev: EventDef, a: Acc): Record<string, unknown> {
  const n = a.n;
  const brier = n ? a.b / n : NaN;
  const base = n ? a.b0 / n : NaN;
  const safe = (s: number[]) => ({ picks: s[0], hitRate: s[0] ? r4(s[1] / s[0]) : null });
  return {
    n,
    brier: n ? r4(brier) : null,
    baselineBrier: n ? r4(base) : null,
    skill: n && base > 0 ? r4((base - brier) / base) : null,
    buckets: a.bk.map((k, i) => ({ range: LABELS[i], n: k.n, predicted: k.n ? r4(k.p / k.n) : null, actual: k.n ? r4(k.y / k.n) : null })),
    safe75: ev.safe ? safe(a.s75) : undefined,
    safe85: ev.safe ? safe(a.s85) : undefined,
  };
}

export async function runBacktest(kind: 'club' | 'intl', comp?: string): Promise<unknown> {
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
      for (const g of got) {
        if (g.status === 'fulfilled') rows = rows.concat(g.value);
        else errs.push(String(g.reason?.message ?? g.reason));
      }
    }
    if (rows.length < 20) return { error: 'not enough data' + (errs.length ? ': ' + errs.join('; ') : '') };
    rows.sort((x, y) => x.d - y.d);
    const { tested, acc } = walk(rows, competition);
    const events: Record<string, unknown> = {};
    EVENTS.forEach((ev, i) => { events[ev.name] = summarize(ev, acc[i]); });
    return {
      kind,
      comp: kind === 'intl' ? 'intl' : comp,
      matchesTested: tested,
      events,
      note: 'skill > 0 means better than the naive baseline; hit rates at the 0.85 threshold should be near or above 0.85 if calibrated',
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
