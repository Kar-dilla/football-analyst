import type { Pick } from '@/lib/types';

type Rate = { n: number; rate: number };
const LABELS = ['50\u201360%', '60\u201370%', '70\u201380%', '80\u201390%', '90\u2013100%'];

export interface Stats {
  settled: number;
  early: boolean;
  hitRateByMarket: Record<string, Rate>;
  hitRateByTier: Record<string, Rate>;
  brier: number | null;
  buckets: { label: string; n: number; predicted: number; actual: number }[];
  gapFill: { with: Rate; without: Rate };
  avgPredicted: number | null;
  avgBase: number | null;
  brierBase: number | null;
  last20: Rate;
  roi: { n: number; units: number; pct: number; avgOdds: number; breakEven: number | null };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const rateOf = (list: Pick[]): Rate => ({
  n: list.length,
  rate: list.length ? list.filter((p) => p.result === 'won').length / list.length : 0,
});
const stamp = (p: Pick) => p.settledAt ?? p.analysis.createdAt;

export function computeStats(picks: Pick[]): Stats {
  const settled = picks.filter((p) => p.result === 'won' || p.result === 'lost');
  const prob = (p: Pick) => p.analysis.probability;
  const base = (p: Pick) => p.analysis.base.probability;
  const hit = (p: Pick) => (p.result === 'won' ? 1 : 0);
  const group = (key: (p: Pick) => string): Record<string, Rate> => {
    const groups: Record<string, Pick[]> = {};
    for (const p of settled) {
      const k = key(p);
      (groups[k] = groups[k] || []).push(p);
    }
    const out: Record<string, Rate> = {};
    for (const k of Object.keys(groups)) out[k] = rateOf(groups[k]);
    return out;
  };
  const brier = settled.length ? mean(settled.map((p) => (prob(p) - hit(p)) ** 2)) : null;
  const brierBase = settled.length ? mean(settled.map((p) => (base(p) - hit(p)) ** 2)) : null;
  const buckets = LABELS.map((label, i) => {
    const inB = settled.filter(
      (p) => Math.min(4, Math.max(0, Math.floor(Math.round(prob(p) * 100) / 10) - 5)) === i,
    );
    return { label, n: inB.length, predicted: mean(inB.map(prob)), actual: rateOf(inB).rate };
  });
  const priced = settled.filter((p) => p.odds !== undefined && p.odds >= 1.01);
  const units = priced.reduce((sum, p) => sum + (p.result === 'won' ? (p.odds ?? 0) - 1 : -1), 0);
  const avgOdds = mean(priced.map((p) => p.odds ?? 0));
  const recent = [...settled].sort((a, b) => stamp(b).localeCompare(stamp(a))).slice(0, 20);
  return {
    settled: settled.length,
    early: settled.length < 100,
    hitRateByMarket: group((p) => p.analysis.base.market),
    hitRateByTier: group((p) => p.analysis.tier),
    brier,
    buckets,
    gapFill: {
      with: rateOf(settled.filter((p) => p.usedGapFill)),
      without: rateOf(settled.filter((p) => !p.usedGapFill)),
    },
    avgPredicted: settled.length ? mean(settled.map(prob)) : null,
    avgBase: settled.length ? mean(settled.map(base)) : null,
    brierBase,
    last20: rateOf(recent),
    roi: {
      n: priced.length,
      units,
      pct: priced.length ? units / priced.length : 0,
      avgOdds,
      breakEven: priced.length ? 1 / avgOdds : null,
    },
  };
}
