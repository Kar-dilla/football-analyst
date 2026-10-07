import type { ParsedQuery } from '@/lib/types';

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

export function betLabel(q: ParsedQuery): string {
  const { side, line, home, away, windowMinutes } = q;
  const ou = (noun: string, suffix = ''): string =>
    (side === 'over' || side === 'under') && line != null ? `${cap(side)} ${line} ${noun}${suffix}` : q.raw;
  switch (q.market) {
    case 'goals_ou': return ou('goals');
    case 'fh_goals_ou': return ou('goals', ' (1st half)');
    case 'sh_goals_ou': return ou('goals', ' (2nd half)');
    case 'corners_ou': return ou('corners');
    case 'cards_ou': return ou('cards');
    case 'btts':
      return side === 'yes' || side === 'no' ? `Both teams to score: ${cap(side)}` : q.raw;
    case '1x2':
      if (side === 'X') return 'Draw';
      if (side === '1' && home) return `${home} win`;
      if (side === '2' && away) return `${away} win`;
      return q.raw;
    case 'double_chance':
      if (side === '1X' && home) return `${home} or draw`;
      if (side === 'X2' && away) return `${away} or draw`;
      if (side === '12' && home && away) return `${home} or ${away} (no draw)`;
      return q.raw;
    case 'window_goals':
      return windowMinutes && (side === 'yes' || side === 'no') ? `Goal in first ${windowMinutes} min: ${cap(side)}` : q.raw;
    case 'fh_subs':
      if (!side) return q.raw;
      return side === 'under' || side === 'no' ? 'No first-half substitution' : 'A first-half substitution';
    default:
      return q.raw;
  }
}
