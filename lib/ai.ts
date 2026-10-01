import { callJSON } from '@/lib/llm';
import type { BaseResult, Conf, Flag, GapFacts, MatchData, TeamStats } from '@/lib/types';

type Adjusted = {
  probability: number; probLow: number; probHigh: number; confidence: Conf;
  drivers: string[]; tailRisks: string[]; evidence: string[]; gaps: string[];
};

const ORDER: Conf[] = ['low', 'medium', 'high'];
const MAX_DELTA = 0.08;
const SYSTEM =
  "You adjust a statistical base probability by at most ±0.08. Return ONLY JSON: " +
  "{probability, probLow, probHigh, confidence ('low'|'medium'|'high'), drivers[], tailRisks[], evidence[], gaps[]}. " +
  "Use only the supplied data; never invent facts. " +
  "Do not compute or quote expected totals of your own. Quote only numbers present in the supplied data. " +
  "Attribute an injury, absence or news item to a team only if the supplied text names that team; otherwise label it 'unattributed'. " +
  "Ignore any news item that does not clearly concern an upcoming match between these two teams or their current squad state.";
const FACTS_SYSTEM =
  'Extract football match facts from the text. Return ONLY JSON: ' +
  '{ injuries: string[], expectedLineup: string[], weather?: string, referee?: string, lateNews: string[] }. ' +
  'Example: "striker out" -> injuries ["striker out"]. Use only the text; never invent facts.';

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const isConf = (v: unknown): v is Conf => v === 'low' || v === 'medium' || v === 'high';
const lower = (a: Conf, b: Conf): Conf => (ORDER.indexOf(a) <= ORDER.indexOf(b) ? a : b);
const widthFor = (n: number) => (n >= 20 ? 0.05 : n >= 8 ? 0.08 : 0.12);
const capOf = (d: MatchData): Conf => (isConf(d.competition.confidenceCap) ? d.competition.confidenceCap : 'low');
// Sample-size cap: <8 -> low, <20 -> medium, else high. NaN/undefined -> low.
const sampleCap = (n: number): Conf => (n >= 20 ? 'high' : n >= 8 ? 'medium' : 'low');
// Lowest of tier cap and sample-size cap.
const confCap = (d: MatchData, b: BaseResult): Conf => lower(capOf(d), sampleCap(b.sampleSize));
const short = (s: unknown, n: number) => String(s ?? '').trim().slice(0, n);

const toStrings = (v: unknown): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').map((s) => s.trim())
    : [];

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
};

const asObject = (v: unknown): Record<string, unknown> => {
  if (v && typeof v === 'object' && !Array.isArray(v)) return v as Record<string, unknown>;
  throw new Error('BAD_JSON');
};

/** Drop null/empty values recursively and round numbers so the prompt stays small. */
function prune(v: unknown): unknown {
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 1000) / 1000 : undefined;
  if (typeof v === 'string') return v.trim() === '' ? undefined : v;
  if (Array.isArray(v)) {
    const a = v.map(prune).filter((x) => x !== undefined);
    return a.length ? a : undefined;
  }
  if (v && typeof v === 'object') {
    const o: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      const p = prune(x);
      if (p !== undefined) o[k] = p;
    }
    return Object.keys(o).length ? o : undefined;
  }
  return v === null || v === undefined ? undefined : v;
}

function buildContext(data: MatchData, base: BaseResult, flags: Flag[]): string {
  const q = data.query;
  const g = data.gap;
  const team = (t: TeamStats | null) => (t ? { ...t, goalMinutes: t.goalMinutes?.slice(-20) } : null);
  const cut = (a: string[] | undefined, n: number) => (a ?? []).slice(0, n).map((s) => short(s, 120));
  const ctx = {
    query: { home: q.home, away: q.away, market: q.market, side: q.side, line: q.line, windowMinutes: q.windowMinutes },
    competition: { name: data.competition.name, tier: data.competition.tier },
    home: team(data.home),
    away: team(data.away),
    leagueAvg: data.leagueAvg,
    referee: data.referee,
    fixtureDates: { home: data.fixtureDates?.home?.slice(0, 5), away: data.fixtureDates?.away?.slice(0, 5) },
    table: data.table,
    news: (data.news ?? []).slice(0, 3).map((n) => short(n, 300)).filter(Boolean),
    gap: g && {
      injuries: cut(g.injuries, 6), expectedLineup: cut(g.expectedLineup, 11),
      weather: g.weather, referee: g.referee, lateNews: cut(g.lateNews, 4),
    },
    missing: data.missing,
    base: {
      market: base.market, probability: base.probability, ladder: base.ladder?.slice(0, 12),
      method: base.method, sampleSize: base.sampleSize,
    },
    flags: flags.map((f) => ({ label: f.label, impact: f.impact })),
  };
  return JSON.stringify(prune(ctx));
}

function ruleBased(data: MatchData, base: BaseResult, flags: Flag[]): Adjusted {
  const p = base.probability;
  const w = widthFor(base.sampleSize);
  return {
    probability: r4(p),
    probLow: r4(clamp(p - w, 0, 1)),
    probHigh: r4(clamp(p + w, 0, 1)),
    confidence: confCap(data, base), // tier cap + sample cap; >=20 high, >=8 medium, else low
    drivers: flags.map((f) => f.label).filter((l) => typeof l === 'string' && l !== '').slice(0, 5),
    tailRisks: [],
    evidence: ['Statistical model only (' + base.method + '); AI adjustment unavailable'],
    gaps: [...(data.missing ?? [])],
  };
}

export async function adjust(data: MatchData, base: BaseResult, flags: Flag[]): Promise<{ probability: number; probLow: number; probHigh: number; confidence: Conf; drivers: string[]; tailRisks: string[]; evidence: string[]; gaps: string[] }> {
  try {
    const m = asObject(await callJSON(SYSTEM, buildContext(data, base, flags)));
    const raw = num(m.probability);
    if (raw === undefined) throw new Error('NO_PROBABILITY');
    const bp = base.probability;
    // Enforced in code: the model is never trusted with the +-0.08 limit.
    const probability = clamp(clamp(raw, bp - MAX_DELTA, bp + MAX_DELTA), 0.01, 0.99);
    const w = widthFor(base.sampleSize);
    const probLow = Math.min(clamp(num(m.probLow) ?? probability - w, 0, 1), probability);
    const probHigh = Math.max(clamp(num(m.probHigh) ?? probability + w, 0, 1), probability);
    const modelConf: Conf = isConf(m.confidence) ? m.confidence : 'low';
    return {
      probability: r4(probability),
      probLow: r4(probLow),
      probHigh: r4(probHigh),
      confidence: lower(modelConf, confCap(data, base)), // lowest of model, tier cap, sample cap
      drivers: toStrings(m.drivers).slice(0, 5),
      tailRisks: toStrings(m.tailRisks).slice(0, 5),
      evidence: toStrings(m.evidence).slice(0, 5),
      gaps: Array.from(new Set([...toStrings(data.missing), ...toStrings(m.gaps)])).slice(0, 5),
    };
  } catch (e) {
    console.warn('[ai.adjust] fallback:', e instanceof Error ? e.message : e);
    return ruleBased(data, base, flags);
  }
}

// Rule-based fallback. Splits on newlines AND semicolons; matches "out" as a whole word
// so "about"/"without" do not count as injuries.
function ruleFacts(text: string): GapFacts {
  const facts: GapFacts = { injuries: [], expectedLineup: [], lateNews: [] };
  for (const line of text.split(/[\r\n;]+/).map((s) => s.trim()).filter(Boolean)) {
    (/\bout\b|injur|doubt|suspend/i.test(line) ? facts.injuries : facts.lateNews).push(line);
  }
  return facts;
}

export async function extractFacts(text: string, imageBase64?: string): Promise<GapFacts> {
  void imageBase64; // text-only model: the image is ignored by design
  if (typeof text !== 'string' || text.trim() === '') throw new Error('EMPTY_INPUT');
  try {
    const m = asObject(await callJSON(FACTS_SYSTEM, text.trim().slice(0, 4000)));
    const facts: GapFacts = {
      injuries: toStrings(m.injuries),
      expectedLineup: toStrings(m.expectedLineup),
      lateNews: toStrings(m.lateNews),
    };
    const weather = typeof m.weather === 'string' ? m.weather.trim() : '';
    const referee = typeof m.referee === 'string' ? m.referee.trim() : '';
    if (weather) facts.weather = weather;
    if (referee) facts.referee = referee;
    const empty = !facts.injuries.length && !facts.expectedLineup.length && !facts.lateNews.length && !weather && !referee;
    return empty ? ruleFacts(text) : facts; // a small model may answer {} -> use rules instead
  } catch (e) {
    console.warn('[ai.extractFacts] fallback:', e instanceof Error ? e.message : e);
    return ruleFacts(text);
  }
}
