import type { Pick } from '@/lib/types';

type Rate = { n: number; rate: number };
const LABELS = ['50–60%', '60–70%', '70–80%', '80–90%', '90–100%'];

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const rateOf = (list: Pick[]): Rate => ({
  n: list.length,
  rate: list.length ? list.filter((p) => p.result === 'won').length / list.length : 0,
});

export function computeStats(picks: Pick[]): { settled: number; early: boolean; hitRateByMarket: Record<string, { n: number; rate: number }>; hitRateByTier: Record<string, { n: number; rate: number }>; brier: number | null; buckets: { label: string; n: number; predicted: number; actual: number }[]; gapFill: { with: { n: number; rate: number }; without: { n: number; rate: number } } } {
  const settled = picks.filter((p) => p.result === 'won' || p.result === 'lost');
  const prob = (p: Pick) => p.analysis.probability;
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
  const brier = settled.length
    ? mean(settled.map((p) => (prob(p) - (p.result === 'won' ? 1 : 0)) ** 2))
    : null;
  const buckets = LABELS.map((label, i) => {
    const inB = settled.filter(
      (p) => Math.min(4, Math.max(0, Math.floor(Math.round(prob(p) * 100) / 10) - 5)) === i,
    );
    return { label, n: inB.length, predicted: mean(inB.map(prob)), actual: rateOf(inB).rate };
  });
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
  };
}
