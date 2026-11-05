import { NextResponse } from 'next/server';
import { bestPicks } from '@/lib/best';
import { espnSlug, fetchFixtures } from '@/lib/livefeed';
import type { Fixture } from '@/lib/livefeed';
import { getCompetition } from '@/lib/registry';
import { HARD_MAX_P, HARD_MIN_P, normalizeFilters, windowOffsets } from '@/lib/dailySlips';
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
  let body: { competitionId?: unknown; tz?: unknown; filters?: unknown; dayOffset?: unknown; from?: unknown; to?: unknown } = {};
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
  // Top-level from/to (ISO UTC) win over filters.from/to. An invalid or one-sided window is ignored by normalizeFilters.
  const rawF = body.filters && typeof body.filters === 'object' ? (body.filters as Record<string, unknown>) : {};
  const f = normalizeFilters({ ...rawF, ...(body.from !== undefined || body.to !== undefined ? { from: body.from, to: body.to } : {}) }); // bad or missing fields fall back to defaults
  const lo = Math.max(f.minP, HARD_MIN_P);
  const hasWin = !!f.from && !!f.to;
  const wFrom = hasWin ? Math.max(Date.parse(f.from as string), Date.now()) : 0; // games that have started are never returned
  const wTo = hasWin ? Date.parse(f.to as string) : 0;
  // The app sends one day per request (body.dayOffset) to keep each call short; without it, a window gives every day it touches, else all of filters.dayOffsets are merged.
  const single = typeof body.dayOffset === 'number' && Number.isInteger(body.dayOffset) && body.dayOffset >= 0 && body.dayOffset <= (hasWin ? 7 : 6);
  const offsets = single ? [body.dayOffset as number] : hasWin ? windowOffsets(f.from as string, f.to as string, tz) : f.dayOffsets;

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
        const inside = hasWin ? fixtures.filter((fx) => { const t = Date.parse(fx.kickoff); return t >= wFrom && t < wTo; }) : fixtures;
        for (const fx of inside.slice(0, MAX_FIXTURES)) {
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
          market: best.query.market, side: best.query.side, line: best.query.line,
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
    // games = fixtures found (inside the window when one is set), so the app can tell "no games" from "no qualifying picks"
    return NextResponse.json({ legs: out.filter((l): l is DailyLeg => l !== null), games: list.length });
  } catch {
    return NextResponse.json({ legs: [] });
  }
}
