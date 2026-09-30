import { allCompetitions, getCompetition } from '@/lib/registry';

export const dynamic = 'force-dynamic';

export async function GET() {
  const premierLeagueTier = getCompetition('epl')?.tier;
  const worldCupCap = getCompetition('worldcup')?.confidenceCap;
  const uclCap = getCompetition('ucl')?.confidenceCap;
  const count = allCompetitions().length;
  const ok =
    premierLeagueTier === 'A' &&
    worldCupCap === 'medium' &&
    uclCap === 'low' &&
    count === 20;
  return Response.json({ premierLeagueTier, worldCupCap, uclCap, count, ok });
}
