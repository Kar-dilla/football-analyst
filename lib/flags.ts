import type { Flag, MatchData } from '@/lib/types';

const DAY = 86400000;

function days(list: string[]): number[] {
  const out = list.map((s) => Math.floor(Date.parse(s) / DAY) * DAY);
  return Array.from(new Set(out.filter((d) => Number.isFinite(d))));
}

export function computeFlags(data: MatchData): Flag[] {
  if (data.competition.type !== 'club') return [];
  const flags: Flag[] = [];
  const add = (key: string, label: string, impact: Flag['impact']) =>
    flags.push({ key, label, impact, source: 'auto' });
  const hn = data.home?.name ?? data.query.home;
  const an = data.away?.name ?? data.query.away;
  const who = (h: boolean, a: boolean) => (h && a ? `${hn} and ${an}` : h ? hn : an);
  const today = Math.floor(Date.now() / DAY) * DAY;
  const home = days(data.fixtureDates.home);
  const away = days(data.fixtureDates.away);
  const shared = home.filter((d) => d >= today && away.includes(d));
  const upcoming = home.filter((d) => d >= today);
  const pool = shared.length ? shared : upcoming;

  if (pool.length) {
    const m = Math.min(...pool);
    const busy = (ds: number[]) => ds.filter((d) => d >= m - 6 * DAY && d <= m).length >= 3;
    const tired = (ds: number[]) => {
      const prev = ds.filter((d) => d < m);
      return prev.length > 0 && m - Math.max(...prev) <= 3 * DAY;
    };
    const hb = busy(home);
    const ab = busy(away);
    if (hb || ab) {
      add('congestion', `Fixture congestion: ${who(hb, ab)} (3+ games in 7 days, league games only)`, 'down');
    }
    if ([2, 3, 4].includes(new Date(m).getUTCDay())) {
      add('midweek', 'Midweek game (Tue-Thu)', 'neutral');
    }
    const hs = tired(home);
    const as2 = tired(away);
    if (hs || as2) {
      add('short_rest', `Short rest: ${who(hs, as2)} (3 days or less since last game, league games only)`, 'down');
    }
  }

  const t = data.table;
  if (t) {
    const hTop = t.homePos <= 3;
    const aTop = t.awayPos <= 3;
    if (hTop || aTop) add('title_race', `Title race: ${who(hTop, aTop)} in the top 3`, 'neutral');
    const hDrop = t.homePos > t.size - 4;
    const aDrop = t.awayPos > t.size - 4;
    if (t.size >= 12 && (hDrop || aDrop)) {
      add('relegation', `Relegation battle: ${who(hDrop, aDrop)} in the bottom 4`, 'neutral');
    }
  }
  return flags;
}
