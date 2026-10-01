import { callJSON } from '@/lib/llm';
import { allCompetitions, getCompetition } from '@/lib/registry';
import type { MarketKind, ParsedQuery } from '@/lib/types';

type Side = NonNullable<ParsedQuery['side']>;

const MARKETS: MarketKind[] = [
  'goals_ou', 'btts', '1x2', 'double_chance', 'fh_goals_ou',
  'sh_goals_ou', 'corners_ou', 'cards_ou', 'window_goals', 'fh_subs',
];
const SIDES: Side[] = ['over', 'under', 'yes', 'no', '1', 'X', '2', '1X', 'X2', '12'];

function systemPrompt(): string {
  const comps = allCompetitions().map((c) => `${c.id} = ${c.name}`).join('\n');
  return [
    'Convert a football betting query into JSON. Reply with ONLY a JSON object, no prose, no markdown.',
    '{ "home": string, "away": string, "market": string, "side"?: string, "line"?: number, "windowMinutes"?: number, "competitionId"?: string }',
    'home is the first team named, away the second. Omit fields that are not stated.',
    `Allowed market values: ${MARKETS.join(', ')}`,
    `Allowed side values: ${SIDES.join(', ')}`,
    'Allowed competitionId values (id = name):',
    comps,
    'Mapping hints:',
    '- "sub FH", "subs first half", "substitutions first half" -> market fh_subs, line 0.5',
    '- "first 10 minutes" -> window_goals, windowMinutes 10; "first 5 minutes" -> window_goals, windowMinutes 5; "early goal" -> window_goals, windowMinutes 10',
    '- "1st half goals" -> fh_goals_ou; "2nd half goals" -> sh_goals_ou; "corners" -> corners_ou',
    '- "cards", "yellow cards" -> cards_ou; "btts" -> btts (side yes or no)',
    '- "home win" -> 1x2 with side "1"; "double chance" -> double_chance; plain "goals" -> goals_ou',
    '- Leave competitionId out when the league is not stated.',
    '- A team name followed by "win", "to win", "wins" or "straight win" -> market 1x2; side "1" if that team is the first-named (home) team, "2" if it is the second-named (away) team.',
    '- "draw" or "tie" -> market 1x2, side "X".',
    '- "<team> or draw", "<team> double chance" or "<team> DC" -> market double_chance; side "1X" for the home team, "X2" for the away team. "either team to win" or "no draw" -> side "12".',
    '- If the user writes "straight win", "match result", "1x2" or "double chance" WITHOUT naming a team, leave side out (do not guess).',
  ].join('\n');
}

export async function parseQuery(raw: string): Promise<ParsedQuery> {
  const fail = () => new Error('PARSE_FAILED');
  const r = await callJSON(systemPrompt(), raw);
  if (!r || typeof r !== 'object' || Array.isArray(r)) throw fail();
  const o = r as Record<string, unknown>;
  const home = typeof o.home === 'string' ? o.home.trim() : '';
  const away = typeof o.away === 'string' ? o.away.trim() : '';
  if (!home || !away || !MARKETS.includes(o.market as MarketKind)) throw fail();
  const market = o.market as MarketKind;
  const q: ParsedQuery = { home, away, market, raw };
  if (o.side != null) {
    if (!SIDES.includes(o.side as Side)) throw fail();
    q.side = o.side as Side;
  }
  if (o.line != null) {
    if (typeof o.line !== 'number' || !Number.isFinite(o.line)) throw fail();
    q.line = o.line;
  }
  if (market === 'window_goals') {
    const w = o.windowMinutes;
    if (typeof w !== 'number' || (w !== 5 && w !== 10)) throw fail();
    q.windowMinutes = w;
  }
  const cid = typeof o.competitionId === 'string' ? getCompetition(o.competitionId)?.id : undefined;
  if (cid) q.competitionId = cid;
  return q;
}
