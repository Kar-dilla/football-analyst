import { getCompetition } from '@/lib/registry';
import { parseQuery } from '@/lib/parse';
import { getOrSet } from '@/lib/cache';
import { sameTeam, loadTeamStats, loadTeamStatsAnywhere, loadLeagueAvg, loadReferee } from '@/lib/sources/csv';
import { getFixtures, getTable } from '@/lib/sources/fd';
import { getLineupsAndInjuries, getRecentEvents } from '@/lib/sources/apifootball';
import { tavilySearch } from '@/lib/sources/tavily';
import { goalsModel } from '@/lib/models/goals';
import { halvesModel } from '@/lib/models/halves';
import { cornersCardsModel } from '@/lib/models/cornersCards';
import { timingModel } from '@/lib/models/timing';
import { subsModel } from '@/lib/models/subs';
import { safestLine as pickSafestLine } from '@/lib/ladder';
import { computeFlags } from '@/lib/flags';
import { buildNeeds } from '@/lib/needs';
import { adjust } from '@/lib/ai';
import type { Analysis, BaseResult, Competition, Flag, GapFacts, LadderRow, MarketKind, MatchData, ParsedQuery, TeamStats } from '@/lib/types';

type Events = { goalMinutes: number[]; fhSubRate: number } | null;
type Fetched = { data: MatchData; statsComp: Competition };

const wantsEvents = (m: MarketKind) => m === 'window_goals' || m === 'fh_subs';
const withEvents = (s: TeamStats | null, e: Events): TeamStats | null =>
  s && e ? { ...s, goalMinutes: e.goalMinutes, fhSubRate: e.fhSubRate } : s;
const r4 = (x: number) => Math.round(x * 1e4) / 1e4;
const dayOf = (iso: string) => (Number.isNaN(Date.parse(iso)) ? '' : new Date(iso).toISOString().slice(0, 10));

async function fetchMatch(query: ParsedQuery, competition: Competition): Promise<Fetched> {
  const { home: h, away: a } = query;
  const missing: string[] = [];
  let home: TeamStats | null;
  let away: TeamStats | null;
  let leagueAvg: MatchData['leagueAvg'] | null;
  let statsComp = competition;
  if (competition.csvPath) {
    [home, away, leagueAvg] = await Promise.all([loadTeamStats(competition, h), loadTeamStats(competition, a), loadLeagueAvg(competition)]);
  } else {
    const [hr, ar] = await Promise.all([loadTeamStatsAnywhere(h), loadTeamStatsAnywhere(a)]);
    home = hr?.stats ?? null;
    away = ar?.stats ?? null;
    if (hr) statsComp = hr.competition;
    leagueAvg = hr ? await loadLeagueAvg(hr.competition) : null;
  }
  const ev = wantsEvents(query.market);
  const wantTable = competition.tier === 'A' || competition.tier === 'B';
  const [fxH, fxA, table, news, lu, evH, evA] = await Promise.all([
    getFixtures(competition, h),
    getFixtures(competition, a),
    wantTable ? getTable(competition) : Promise.resolve(null),
    tavilySearch(`${h} vs ${a} team news injuries`),
    getLineupsAndInjuries({ home: h, away: a }),
    ev ? getRecentEvents(h) : Promise.resolve(null),
    ev ? getRecentEvents(a) : Promise.resolve(null),
  ]);
  if (!home) missing.push('home stats');
  if (!away) missing.push('away stats');
  if (!leagueAvg) missing.push('league averages');
  if (!fxH || !fxA) missing.push('fixtures');
  if (wantTable && !table) missing.push('table');
  if (!lu) missing.push('injuries/lineups');
  if (ev && (!evH || !evA)) missing.push('recent events');
  if (!home || !away || !leagueAvg) {
    if (!competition.csvPath) throw new Error('NO_DATA: no stats source for ' + competition.name + ' (teams not found in the supported leagues)');
    throw new Error('NO_DATA: ' + missing.join('; '));
  }
  // both teams have fixture data but no shared upcoming day -> any news is probably about a past match
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = (xs: string[]) => xs.map(dayOf).filter((d) => d >= today);
  let newsOut = news;
  if (fxH && fxA && fxH.length > 0 && fxA.length > 0) {
    const up = upcoming(fxH);
    if (!upcoming(fxA).some((d) => up.includes(d))) {
      missing.push('No scheduled match between these teams in the next 14 days; any news found may be outdated');
      newsOut = [];
    }
  }
  const pos = (t: string) => table?.rows.find((r) => sameTeam(r.team, t))?.pos;
  const [hp, ap] = [pos(h), pos(a)];
  const data: MatchData = {
    query, competition, home: withEvents(home, evH), away: withEvents(away, evA), leagueAvg, referee: null,
    fixtureDates: { home: fxH ?? [], away: fxA ?? [] },
    table: table && hp !== undefined && ap !== undefined ? { homePos: hp, awayPos: ap, size: table.size } : undefined,
    news: newsOut,
    // weather: '' only satisfies the GapFacts type; an auto-fetched gap has no weather
    gap: lu ? { injuries: lu.injuries, expectedLineup: lu.expectedLineup, weather: '', lateNews: [] } : undefined,
    missing,
  };
  return { data, statsComp };
}

function runModel(data: MatchData): BaseResult | null {
  switch (data.query.market) {
    case 'goals_ou': case 'btts': case '1x2': case 'double_chance': return goalsModel(data);
    case 'fh_goals_ou': case 'sh_goals_ou': return halvesModel(data);
    case 'corners_ou': case 'cards_ou': return cornersCardsModel(data);
    case 'window_goals': return timingModel(data);
    case 'fh_subs': return subsModel(data);
    default: return null;
  }
}

export async function analyze(raw: string, threshold: number, gap?: GapFacts, competitionId?: string): Promise<Analysis> {
  const query = await parseQuery(raw);
  const forced = competitionId ? getCompetition(competitionId) : null;
  if (forced) query.competitionId = forced.id;
  const competition = getCompetition(query.competitionId ?? '');
  if (!competition) throw new Error('LEAGUE_NOT_FOUND');
  const market = query.market;
  if (competition.csvPath?.startsWith('new/') && ['fh_goals_ou', 'sh_goals_ou', 'corners_ou', 'cards_ou'].includes(market)) throw new Error('NO_DATA: only goals, early-goal and sub markets are available for ' + competition.name);
  // ':ev' stops an events-less cache entry from serving window_goals / fh_subs
  const key = `match:${competition.id}:${query.home}|${query.away}${wantsEvents(market) ? ':ev' : ''}`.toLowerCase();
  const { data: cached, statsComp } = await getOrSet<Fetched>(key, 15 * 60 * 1000, () => fetchMatch(query, competition));
  // current query overrides the cached one (market differs per request); copy missing so the cache is never mutated
  const data: MatchData = { ...cached, query, gap: gap ?? cached.gap, missing: [...cached.missing] };
  if (gap?.referee) {
    data.referee = await loadReferee(statsComp, gap.referee);
    if (!data.referee) data.missing.push('referee');
  }
  const base = runModel(data);
  if (!base) throw new Error('NO_DATA: not enough data for this market (' + market + '). Corners and cards need a league with full stats; early-goal and first-half-sub markets need API-Football data for the current season.');
  const flags: Flag[] = [...computeFlags(data)];
  for (const item of gap?.injuries ?? []) flags.push({ key: 'injury', label: item, impact: 'down', source: 'user' });
  for (const item of gap?.lateNews ?? []) flags.push({ key: 'news', label: item, impact: 'neutral', source: 'user' });
  const ai = await adjust(data, base, flags);
  // shift every row of the chosen side by the AI delta so ladder, safe and safestLine agree with the headline probability
  const side = query.side;
  const delta = ai.probability - base.probability;
  let outBase = base;
  let line: number | undefined;
  let evidence = ai.evidence;
  if (base.ladder && (side === 'over' || side === 'under')) {
    const ladder: LadderRow[] = base.ladder.map((row) => {
      const p = r4(Math.min(0.99, Math.max(0.01, row[side] + delta)));
      return side === 'over' ? { line: row.line, over: p, under: r4(1 - p) } : { line: row.line, over: r4(1 - p), under: p };
    });
    outBase = { ...base, ladder };
    line = pickSafestLine(ladder, threshold, side);
    if (delta !== 0) evidence = [...ai.evidence, 'Ladder shifted by the AI adjustment (' + (delta * 100).toFixed(1) + ' pts)'];
  }
  return {
    query, tier: competition.tier, base: outBase,
    probability: ai.probability, probLow: ai.probLow, probHigh: ai.probHigh, confidence: ai.confidence,
    drivers: ai.drivers, tailRisks: ai.tailRisks, evidence, gaps: ai.gaps,
    safe: ai.probability >= threshold, safestLine: line, flags, needs: buildNeeds(data),
    sources: data.news.slice(0, 5), createdAt: new Date().toISOString(),
  };
}
