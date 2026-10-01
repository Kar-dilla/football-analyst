import type { BaseResult, MatchData } from '@/lib/types';

const RECENT_GAMES = 10;

export function subsModel(data: MatchData): BaseResult | null {
  const { query, home, away } = data;
  if (query.market !== 'fh_subs') return null;
  if (!home || !away) return null;
  const h = home.fhSubRate;
  const a = away.fhSubRate;
  if (typeof h !== 'number' || typeof a !== 'number') return null;
  if (!Number.isFinite(h) || !Number.isFinite(a)) return null;
  const none = (1 - Math.min(1, Math.max(0, h))) * (1 - Math.min(1, Math.max(0, a)));
  const no = query.side === 'under' || query.side === 'no';
  const yes = query.side === 'over' || query.side === 'yes';
  if (!no && !yes) return null;
  return {
    market: 'fh_subs',
    probability: no ? none : 1 - none,
    method: 'fh-sub-rate',
    sampleSize: 2 * RECENT_GAMES,
  };
}
