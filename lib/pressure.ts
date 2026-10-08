import type { TeamLive } from '@/lib/livefeed';

const SHOT_W_SOT = 1;
const SHOT_W_OFF = 0.35;
const CORNER_W = 0.25;
const PRIOR = 2;
const POSS_W = 0.15;
const FULL_MINUTE = 60;
const FULL_EVIDENCE = 6;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));
const hasShots = (t: TeamLive): boolean => t.shots !== null || t.shotsOnTarget !== null;

function score(t: TeamLive): number {
  const sot = t.shotsOnTarget ?? 0;
  const off = Math.max((t.shots ?? sot) - sot, 0);
  return SHOT_W_SOT * sot + SHOT_W_OFF * off + CORNER_W * (t.corners ?? 0);
}

export function pressure(home: TeamLive, away: TeamLive, minute: number): { tilt: number; weight: number; shareHome: number } | null {
  if (!hasShots(home) || !hasShots(away)) return null;
  const sH = score(home);
  const sA = score(away);
  const shareHome = (sH + PRIOR) / (sH + sA + 2 * PRIOR);
  const tShots = 2 * (shareHome - 0.5);
  const tPoss = home.possession !== null && away.possession !== null ? (home.possession - away.possession) / 100 : 0;
  const tilt = clamp((1 - POSS_W) * tShots + POSS_W * tPoss, -1, 1);
  const min = Number.isFinite(minute) ? minute : 0;
  const weight = Math.min(1, Math.max(min, 0) / FULL_MINUTE) * Math.min(1, (sH + sA) / FULL_EVIDENCE);
  return { tilt, weight, shareHome };
}
