import { goalsModel } from '@/lib/models/goals';
import { halvesModel } from '@/lib/models/halves';
import { cornersCardsModel } from '@/lib/models/cornersCards';
import { computeFlags } from '@/lib/flags';
import { callJSON } from '@/lib/llm';
import { parseQuery } from '@/lib/parse';
import { getCompetition } from '@/lib/registry';
import { loadMatchData } from '@/lib/orchestrate';
import type { BaseResult, MarketKind, MatchData, ParsedQuery, Tier } from '@/lib/types';

export interface MenuItem {
  label: string; group: string; probability: number; modelProbability: number; shift: number;
  note?: string; fairOdds: number; query: ParsedQuery;
}
export interface AllowedRange { overMin: number; overMax: number; underMin: number; underMax: number }
export type AllowedLines = Record<'goals' | 'firsthalf' | 'secondhalf' | 'corners' | 'cards', AllowedRange>;
export interface BestResult { top: MenuItem[]; mine: MenuItem | null; basis: string; tier: Tier; note: string }

type Side = NonNullable<ParsedQuery['side']>;
type LineGroup = keyof AllowedLines;
const GROUPS = ['goals', 'btts', 'result', 'doublechance', 'firsthalf', 'secondhalf', 'corners', 'cards'];
const NUDGE_SYSTEM =
  'You adjust model probabilities for football bets using only the supplied news, flags and user facts. For each candidate return a shift between -0.08 and 0.08 and a note of at most 100 characters. Shift only when the supplied text clearly affects that bet (for example a key attacker out lowers over and BTTS bets; a rotated or tired side raises under and draw bets). Otherwise shift 0. Never invent facts. Return ONLY JSON {adjustments:[{id,shift,note}]}.';

const r2 = (x: number) => Math.round(x * 100) / 100;
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const cut = (xs: string[] | undefined, len = 120, n = 10) => (xs ?? []).slice(0, n).map((s) => String(s).slice(0, len));

// Runs the matching model on a clone of data carrying query q; null when the model has no answer.
function price(data: MatchData, q: ParsedQuery): BaseResult | null {
  const d: MatchData = { ...data, query: q };
  try {
    switch (q.market) {
      case 'goals_ou':
      case 'btts':
      case '1x2':
      case 'double_chance':
        return goalsModel(d);
      case 'fh_goals_ou':
      case 'sh_goals_ou':
        return halvesModel(d);
      case 'corners_ou':
      case 'cards_ou':
        return cornersCardsModel(d);
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export async function bestPicks(match: string, competitionId: string, mine?: string, allowed?: AllowedLines, maxProbability?: number): Promise<BestResult> {
  const parts = match.trim().split(/\s+(?:vs\.?|v|-)\s+/i).map((s) => s.trim());
  if (parts.length !== 2 || !parts[0] || !parts[1]) throw new Error('NO_DATA: Type the match as "Team A vs Team B".');
  const [home, away] = parts;
  const competition = getCompetition(competitionId);
  if (!competition) throw new Error('LEAGUE_NOT_FOUND');
  const q0: ParsedQuery = { home, away, market: 'goals_ou', side: 'over', line: 2.5, competitionId: competition.id, raw: match };
  const data = await loadMatchData(q0, competition);
  const national = competition.type === 'national';

  const items: MenuItem[] = [];
  const mk = (group: string, label: string, query: ParsedQuery, p: number): MenuItem | null => {
    const probability = r4(p);
    if (!Number.isFinite(probability) || probability <= 0) return null;
    return { label, group, probability, modelProbability: probability, shift: 0, fairOdds: r2(1 / probability), query };
  };
  const rawOf = (label: string) => (match + ' — ' + label).slice(0, 200);
  const add = (group: string, label: string, market: MarketKind, side: Side, p: number, line?: number) => {
    const it = mk(group, label, { ...q0, market, side, line, raw: rawOf(label) }, p);
    if (it) items.push(it);
  };
  const single = (group: string, market: MarketKind, side: Side, label: string) => {
    const r = price(data, { ...q0, market, side, line: undefined });
    if (r) add(group, label, market, side, r.probability);
  };
  const ladder = (group: LineGroup, market: MarketKind, line0: number, unit: string, lo = 0, hi = 99) => {
    const r = allowed?.[group];
    for (const row of price(data, { ...q0, market, side: 'over', line: line0 })?.ladder ?? []) {
      if (row.line < lo || row.line > hi) continue;
      for (const side of ['over', 'under'] as const) {
        const ok = !r || (side === 'over' ? row.line >= r.overMin && row.line <= r.overMax : row.line >= r.underMin && row.line <= r.underMax);
        if (ok) add(group, (side === 'over' ? 'Over ' : 'Under ') + row.line + ' ' + unit, market, side, row[side], row.line);
      }
    }
  };

  ladder('goals', 'goals_ou', 2.5, 'goals', 0.5, 4.5);
  single('btts', 'btts', 'yes', 'Both teams to score: Yes');
  single('btts', 'btts', 'no', 'Both teams to score: No');
  single('result', '1x2', '1', home + ' win');
  single('result', '1x2', 'X', 'Draw');
  single('result', '1x2', '2', away + ' win');
  if (!national) {
    single('doublechance', 'double_chance', '1X', home + ' or draw');
    single('doublechance', 'double_chance', 'X2', away + ' or draw');
    single('doublechance', 'double_chance', '12', home + ' or ' + away + ' (no draw)');
    ladder('firsthalf', 'fh_goals_ou', 0.5, 'goals (1st half)');
    ladder('secondhalf', 'sh_goals_ou', 0.5, 'goals (2nd half)');
    ladder('corners', 'corners_ou', 9.5, 'corners');
    ladder('cards', 'cards_ou', 3.5, 'cards');
  }

  // The user's own bet (never filtered by `allowed`)
  let mineItem: MenuItem | null = null;
  const text = (mine ?? '').trim();
  if (text) {
    try {
      const parsed = await parseQuery(home + ' vs ' + away + ' ' + text);
      const q: ParsedQuery = { ...parsed, home, away, competitionId: competition.id, raw: rawOf(text) };
      const r = price(data, q);
      if (r) mineItem = mk(q.market, text, q, r.probability);
    } catch {
      mineItem = null;
    }
  }
  const mineNote = text && !mineItem ? ' Your bet could not be priced from stats (only goals, half, corners, cards, result and BTTS bets can).' : '';

  // Live-info nudge: ONE AI call, max +-8 points, all-or-nothing
  const gap = data.gap;
  const gapN = (gap?.injuries?.length ?? 0) + (gap?.expectedLineup?.length ?? 0) + (gap?.lateNews?.length ?? 0);
  let applied = false;
  if (data.news.length > 0 || gapN > 0) {
    const cap = maxProbability === undefined ? 1 : maxProbability;
    // only shortlist bets that could still land in the 55%..cap window after a max 8-point shift
    const short = items
      .filter((c) => c.modelProbability >= 0.47 && c.modelProbability <= cap + 0.08)
      .sort((a, b) => b.modelProbability - a.modelProbability)
      .slice(0, 6);
    if (mineItem) short.push(mineItem);
    try {
      if (short.length === 0) throw new Error('nothing to adjust');
      const ids = short.map((c, i) => (c === mineItem ? 'mine' : 'c' + i));
      const ctx = {
        home, away, competition: competition.name,
        flags: computeFlags(data).slice(0, 12).map((f) => f.label.slice(0, 120)),
        news: data.news.slice(0, 3).map((s) => s.slice(0, 300)),
        facts: { injuries: cut(gap?.injuries), expectedLineup: cut(gap?.expectedLineup), lateNews: cut(gap?.lateNews) },
        candidates: short.map((c, i) => ({ id: ids[i], label: c.label, p: c.modelProbability })),
      };
      const out = (await callJSON(NUDGE_SYSTEM, JSON.stringify(ctx))) as { adjustments?: unknown } | null;
      if (!out || !Array.isArray(out.adjustments)) throw new Error('bad nudge reply');
      const adj = new Map<string, { shift: number; note: string }>();
      for (const a of out.adjustments as unknown[]) {
        const r = a as Record<string, unknown> | null;
        if (!r || typeof r.id !== 'string' || typeof r.shift !== 'number' || !Number.isFinite(r.shift)) continue;
        adj.set(r.id as string, { shift: clamp(r.shift as number, -0.08, 0.08), note: typeof r.note === 'string' ? r.note.trim().slice(0, 100) : '' });
      }
      short.forEach((c, i) => {
        const a = adj.get(ids[i]);
        if (!a) return;
        c.probability = r4(clamp(c.modelProbability + a.shift, 0.01, 0.99));
        c.shift = r4(c.probability - c.modelProbability);
        c.fairOdds = r2(1 / c.probability);
        if (c.shift !== 0 && a.note) c.note = a.note;
      });
      applied = true;
    } catch {
      applied = false;
    }
  }

  // Ranking: >= 55%, <= cap, best per group, top 3
  const winners = new Map<string, MenuItem>();
  for (const c of items) {
    if (c.probability < 0.55 || (maxProbability !== undefined && c.probability > maxProbability)) continue;
    const cur = winners.get(c.group);
    if (!cur || c.probability > cur.probability) winners.set(c.group, c);
  }
  const top = Array.from(winners.values())
    .sort((a, b) => b.probability - a.probability || GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group))
    .slice(0, 3);

  const basis =
    'Stats: ' + (data.home?.name ?? home) + ' ' + (data.home?.games ?? 0) + ' games, ' + (data.away?.name ?? away) + ' ' + (data.away?.games ?? 0) +
    ' games (this season, blended with last season where available) · News snippets: ' + data.news.length +
    ' · Your added info: ' + gapN + ' items · Live-info nudge: ' + (applied ? 'applied (max ±8 points)' : 'not applied');
  const note =
    (top.length
      ? 'Probabilities come from team stats (Poisson model), optionally nudged by news. Bookmaker odds are not known; lines are limited to the ranges you set. Tap Analyze for the full check.'
      : 'No pick reaches 55% for this match within your allowed lines.') + mineNote;
  return { top, mine: mineItem, basis, tier: competition.tier, note };
}
