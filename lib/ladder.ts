import type { LadderRow } from '@/lib/types';
import { poissonOver } from '@/lib/models/poisson';

const r4 = (x: number) => Math.round(x * 10000) / 10000;

export function buildLadder(mean: number, lines: number[]): LadderRow[] {
  return lines.map((line) => {
    const over = r4(poissonOver(mean, line));
    return { line, over, under: r4(1 - over) };
  });
}

export function safestLine(ladder: LadderRow[], threshold: number, side: 'over' | 'under' = 'over'): number | undefined {
  const ok = ladder.filter((r) => (side === 'under' ? r.under : r.over) >= threshold).map((r) => r.line);
  if (ok.length === 0) return undefined;
  return side === 'under' ? Math.min(...ok) : Math.max(...ok);
}
