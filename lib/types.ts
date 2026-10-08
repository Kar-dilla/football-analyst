export type Tier = 'A' | 'B' | 'C';
export type Conf = 'low' | 'medium' | 'high';
export type MarketKind = 'goals_ou'|'btts'|'1x2'|'double_chance'|'fh_goals_ou'|'sh_goals_ou'|'corners_ou'|'cards_ou'|'window_goals'|'fh_subs';

export interface Competition {
  id: string; name: string; tier: Tier;
  type: 'club'|'national'|'youth';
  fdCode?: string;        // football-data.org code
  csvPath?: string;       // e.g. "mmz4281/2627/E0.csv" or "new/JPN.csv"
  apiFootballId?: number;
  confidenceCap: Conf;
}

export interface ParsedQuery {
  home: string; away: string; market: MarketKind;
  side?: 'over'|'under'|'yes'|'no'|'1'|'X'|'2'|'1X'|'X2'|'12';
  line?: number; windowMinutes?: number;
  competitionId?: string; raw: string;
}

export interface TeamStats {
  name: string; games: number;
  gf: number; ga: number; fhGf: number; fhGa: number;
  cornersFor: number; cornersAgainst: number;
  cardsFor: number; shotsFor: number; foulsFor: number;
  htZeroZeroRate: number;
  goalMinutes: number[];      // minutes of goals in recent games
  fhSubRate?: number;         // share of recent games with a 1st-half sub
}
export interface RefereeStats { name: string; games: number; cardsPerGame: number; foulsPerGame?: number }

export interface GapFacts {
  injuries: string[]; expectedLineup: string[];
  weather?: string; referee?: string; lateNews: string[];
}

export interface MatchData {
  query: ParsedQuery; competition: Competition;
  home: TeamStats | null; away: TeamStats | null;
  leagueAvg: { goals: number; fhGoals: number; corners: number; cards: number };
  referee: RefereeStats | null;
  fixtureDates: { home: string[]; away: string[] };   // ISO dates, last+next fixtures
  table?: { homePos: number; awayPos: number; size: number };
  news: string[]; gap?: GapFacts;
  missing: string[];          // what could not be found
  strengths?: { home: { att: number; def: number; n: number }; away: { att: number; def: number; n: number }; homeAdv: number; mu: number };   // att/def are multipliers vs the league average (1 = average; def above 1 means concedes more); n = effective weighted games; homeAdv = home goals / away goals for an average pair; mu = league mean goals per team per match
}

export interface LadderRow { line: number; over: number; under: number }
export interface BaseResult {
  market: MarketKind; probability: number;   // prob of the user's chosen side
  ladder?: LadderRow[]; method: string; sampleSize: number;
}

export interface Flag { key: string; label: string; impact: 'up'|'down'|'neutral'; source: 'auto'|'search'|'user' }

export interface Analysis {
  query: ParsedQuery; tier: Tier; base: BaseResult;
  probability: number; probLow: number; probHigh: number;
  confidence: Conf; safe: boolean; safestLine?: number;
  drivers: string[]; tailRisks: string[]; flags: Flag[];
  evidence: string[]; gaps: string[];
  needs: string[];            // info the user could paste to sharpen the analysis
  sources: string[];          // search snippets used
  createdAt: string;
}

export interface Pick {
  id: string; analysis: Analysis; threshold: number;
  usedGapFill: boolean; odds?: number; result?: 'won'|'lost'|'void';
  settledAt?: string;
  live?: { minute: number; homeGoals: number; awayGoals: number; homeReds: number; awayReds: number; label: string; group: string; fairOdds: number; pressureHome?: number; pressureWeight?: number; stats?: { home: { shots: number | null; shotsOnTarget: number | null; corners: number | null; possession: number | null }; away: { shots: number | null; shotsOnTarget: number | null; corners: number | null; possession: number | null } }; modelVersion: string };   // pressureHome is the home share of pressure from 0 to 100
}
