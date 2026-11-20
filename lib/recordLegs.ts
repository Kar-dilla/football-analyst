// Server only: never import this file from a client component or any file starting with 'use client'.
import { db } from '@/lib/supabase';
import type { DailyLeg } from '@/lib/dailySlips';

const MAX_ROWS = 200; // per call
const MODEL_VERSION = 'stats-v1';
const r2 = (x: number) => Math.round(x * 100) / 100;

// Stores the legs a scan found in public.suggested_legs. Never throws: any problem returns 0 and nothing is saved.
// Legs with a bad or past kickoff are skipped. A leg already stored (same unique key) is left alone.
export async function recordLegs(legs: DailyLeg[], filters: unknown, source: 'daily' | 'draw'): Promise<number> {
  try {
    if (!Array.isArray(legs) || legs.length === 0) return 0;
    const f = (filters && typeof filters === 'object' ? filters : {}) as Record<string, unknown>;
    const draw = source === 'draw';
    // A small copy of the filters: probability range, markets and day. Nothing else.
    const small = {
      minP: draw ? f.drawMinP : f.minP,
      maxP: draw ? f.drawMaxP : f.maxP,
      markets: Array.isArray(f.markets) ? f.markets.filter((x): x is string => typeof x === 'string') : [],
      day: typeof f.day === 'string' ? f.day : null,
    };
    const now = Date.now();
    const seen = new Set<string>();
    const rows: Record<string, unknown>[] = [];
    for (const l of legs) {
      if (rows.length >= MAX_ROWS) break;
      if (!l || typeof l.probability !== 'number' || !Number.isFinite(l.probability) || l.probability <= 0 || l.probability > 1) continue;
      if (typeof l.home !== 'string' || typeof l.away !== 'string' || typeof l.label !== 'string' || typeof l.competitionId !== 'string') continue;
      const t = Date.parse(l.kickoff);
      if (!Number.isFinite(t) || t <= now) continue;
      const kickoff = new Date(t).toISOString();
      const key = [source, l.competitionId, l.home, l.away, l.label, kickoff].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      const odds = typeof l.fairOdds === 'number' && Number.isFinite(l.fairOdds) && l.fairOdds > 0 ? l.fairOdds : 1 / l.probability;
      rows.push({
        source,
        competition_id: l.competitionId,
        home: l.home,
        away: l.away,
        kickoff,
        group_name: l.group ?? null,
        market: l.market ?? null,
        side: l.side ?? null,
        line: typeof l.line === 'number' && Number.isFinite(l.line) ? l.line : null,
        label: l.label,
        prob: l.probability,
        fair_odds: r2(odds),
        model_version: MODEL_VERSION,
        filters: small,
      });
    }
    if (rows.length === 0) return 0;
    const { error } = await db()
      .from('suggested_legs')
      .upsert(rows, { onConflict: 'source,competition_id,home,away,label,kickoff', ignoreDuplicates: true });
    return error ? 0 : rows.length;
  } catch {
    return 0;
  }
}
