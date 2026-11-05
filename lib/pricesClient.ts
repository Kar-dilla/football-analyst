export interface Price { odd: number; book: string }
export interface PriceReq { home: string; away: string; kickoff?: string; market?: string; side?: string; line?: number }

export const priceKey = (l: PriceReq) => [l.home, l.away, l.market, l.side, l.line].join('|').toLowerCase();

export async function fetchPrices(legs: PriceReq[]): Promise<Record<string, Price | null>> {
  const seen = new Set<string>();
  const req: PriceReq[] = [];
  for (const l of legs) {
    if (!l.market) continue;
    const k = priceKey(l);
    if (seen.has(k)) continue;
    seen.add(k);
    req.push({ home: l.home, away: l.away, kickoff: l.kickoff, market: l.market, side: l.side, line: l.line });
  }
  if (req.length === 0) return {};
  try {
    const r = await fetch('/api/odds', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ legs: req.slice(0, 40) }) });
    if (!r.ok) return {};
    const j = (await r.json()) as { prices?: Record<string, Price | null> };
    return j.prices ?? {};
  } catch {
    return {};
  }
}
