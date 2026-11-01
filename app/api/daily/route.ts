import { NextResponse } from 'next/server';
import { bestPicks } from '@/lib/best';
import { espnSlug, fetchFixtures } from '@/lib/livefeed';
import type { Fixture } from '@/lib/livefeed';
import { getCompetition } from '@/lib/registry';
import { HARD_MAX_P, HARD_MIN_P, normalizeFilters } from '@/lib/dailySlips';
import type { DailyLeg } from '@/lib/dailySlips';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MAX_FIXTURES = 8; // per league, per day
const CONCURRENCY = 3;
const TIMEOUT_MS = 15000;
const DEADLINE_MS = 50000; // stop starting new matches after this, so a many-day request still answers inside maxDuration

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); },
    );
  });
}

export async function POST(req: Request) {
  let body: { competitionId?: unknown; tz?: unknown; filters?: unknown; dayOffset?: unknown } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ legs: [], error: 'Bad request' }, { status: 400 });
  }
  const competitionId = typeof body.competitionId === 'string' ? body.competitionId : '';
  const tz = typeof body.tz === 'number' ? body.tz : NaN;
  if (!competitionId || !espnSlug(competitionId) || !Number.isFinite(tz) || Math.abs(tz) > 840) {
    return NextResponse.json({ legs: [], error: 'Bad request' }, { status: 400 });
  }
  const f = normalizeFilters(body.filters); // bad or missing fields fall back to defaults
  const lo = Math.max(f.minP, HARD_MIN_P);
  // The app sends one day per request (body.dayOffset) to keep each call short; without it, all of filters.dayOffsets are merged.
  const single = typeof body.dayOffset === 'number' && Number.isInteger(body.dayOffset) && body.dayOffset >= 0 && body.dayOffset <= 6;
  const offsets = single ? [body.dayOffset as number] : f.dayOffsets;

  try {
    const competition = getCompetition(competitionId);
    if (!competition) return NextResponse.json({ legs: [] });
    if (f.leagues.length > 0 && !f.leagues.includes(competitionId)) return NextResponse.json({ legs: [] });
    if (f.fullStatsOnly && String(competition.tier) !== 'A') return NextResponse.json({ legs: [] });
    const seen = new Set<string>();
    const list: Fixture[] = [];
    for (const off of offsets) {
      try {
        const { fixtures } = await fetchFixtures(competitionId, off === 1 ? 'tomorrow' : 'today', tz, off);
        for (const fx of fixtures.slice(0, MAX_FIXTURES)) {
          const key = (fx.home + '|' + fx.away).toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          list.push(fx);
        }
      } catch {
        // skip a day that failed
      }
    }
    const out: (DailyLeg | null)[] = new Array(list.length).fill(null);
    let next = 0;
    const deadline = Date.now() + DEADLINE_MS;

    const one = async (fx: Fixture): Promise<DailyLeg | null> => {
      try {
        const match = `${fx.home} vs ${fx.away}`;
        const res = await withTimeout(
          bestPicks(match, competitionId, undefined, undefined, undefined, { skipAi: true, skipNews: true, all: true }),
          TIMEOUT_MS,
        );
        let best: (typeof res.top)[number] | null = null;
        for (const c of res.candidates ?? []) {
          const p = c.probability;
          if (!f.markets.includes(c.group)) continue;
          if (p < lo || p > f.maxP || p >= HARD_MAX_P || c.fairOdds < f.minLegOdds) continue;
          if (!best || p > best.probability) best = c;
        }
        if (!best) return null;
        return {
          match, home: fx.home, away: fx.away, kickoff: fx.kickoff,
          competitionId, competitionName: competition.name,
          label: best.label, probability: best.probability,
        };
      } catch {
        return null;
      }
    };

    const worker = async () => {
      while (next < list.length && Date.now() < deadline) {
        const i = next++;
        out[i] = await one(list[i]);
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, list.length) }, worker));
    return NextResponse.json({ legs: out.filter((l): l is DailyLeg => l !== null) });
  } catch {
    return NextResponse.json({ legs: [] });
  }
}
