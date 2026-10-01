import type { MarketKind, MatchData } from '@/lib/types';

const GOALISH: MarketKind[] = [
  'goals_ou', 'btts', '1x2', 'double_chance', 'fh_goals_ou', 'sh_goals_ou', 'window_goals',
];

export function buildNeeds(data: MatchData): string[] {
  const m = data.query.market;
  const gap = data.gap;
  const out: string[] = ['Did either team play a European or cup game this midweek? (which)'];
  if (!gap?.injuries?.length) out.push('Injuries, suspensions and doubts for both teams');
  if (!gap?.expectedLineup?.length) {
    out.push('Expected starting lineups (keeper and main striker especially)');
  }
  if ((m === 'corners_ou' || m === 'cards_ou') && !data.referee && !gap?.referee?.trim()) {
    out.push('Referee name');
  }
  if (m === 'corners_ou') out.push('Is either team rotating or playing for a result?');
  if (m === 'cards_ou') out.push('Derby or high-stakes game?');
  if (GOALISH.includes(m)) {
    out.push('Key attackers or defenders missing?');
    if (!gap?.weather) out.push('Weather (heavy rain or wind)');
  }
  if (m === 'window_goals') out.push('Do either team start fast (pressing) or cautiously?');
  if (m === 'fh_subs') {
    out.push('Manager habit of early first-half substitutions');
    out.push('Any player returning from injury (minutes managed)?');
  }
  return out.slice(0, 6);
}
