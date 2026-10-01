import type { Competition } from '@/lib/types';
import { getOrSet } from '@/lib/cache';
import { sameTeam } from '@/lib/sources/csv';

const BASE = 'https://api.football-data.org/v4/competitions';
const SIX_HOURS = 6 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

interface FdMatch { utcDate: string; homeTeam?: { name?: string }; awayTeam?: { name?: string } }
interface FdStanding { table?: { position: number; team: { name: string } }[] }

async function fdGet<T>(code: string, path: string): Promise<T | null> {
  const token = process.env.FOOTBALL_DATA_KEY;
  if (!token) return null;
  try {
    return await getOrSet<T>(`fd:${code}:${path}`, SIX_HOURS, async () => {
      const res = await fetch(`${BASE}/${code}/${path}`, { headers: { 'X-Auth-Token': token } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    });
  } catch {
    return null;
  }
}

export async function getFixtures(competition: Competition, team: string): Promise<string[] | null> {
  const code = competition.fdCode;
  if (!code) return null;
  const data = await fdGet<{ matches?: FdMatch[] }>(code, 'matches');
  if (!data?.matches) return null;
  const now = Date.now();
  return data.matches
    .filter((m) => {
      const mine = sameTeam(m.homeTeam?.name ?? '', team) || sameTeam(m.awayTeam?.name ?? '', team);
      return mine && Math.abs(new Date(m.utcDate).getTime() - now) <= 14 * DAY;
    })
    .map((m) => m.utcDate)
    .sort();
}

export async function getTable(competition: Competition): Promise<{ size: number; rows: { team: string; pos: number }[] } | null> {
  const code = competition.fdCode;
  if (!code) return null;
  const data = await fdGet<{ standings?: FdStanding[] }>(code, 'standings');
  const table = data?.standings?.[0]?.table;
  if (!table?.length) return null;
  const rows = table.map((r) => ({ team: r.team.name, pos: r.position }));
  return { size: rows.length, rows };
}
