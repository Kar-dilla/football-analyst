import { NextResponse } from 'next/server';
import { bestPrice, findFixtureId, getBookmakers } from '@/lib/oddsLookup';
import { priceKey } from '@/lib/pricesClient';
import type { Price, PriceReq } from '@/lib/pricesClient';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { legs?: unknown } | null;
  const legs = Array.isArray(b?.legs)
    ? (b!.legs as PriceReq[]).filter((l) => l && typeof l.home === 'string' && typeof l.away === 'string' && typeof l.market === 'string').slice(0, 40)
    : [];
  const prices: Record<string, Price | null> = {};
  const fx = new Map<string, number | null>();
  const deadline = Date.now() + 50000;
  let stop = false;
  for (const l of legs) {
    const k = priceKey(l);
    prices[k] = null;
    if (stop || Date.now() > deadline) continue;
    try {
      const fk = (l.home + '|' + l.away).toLowerCase();
      if (!fx.has(fk)) fx.set(fk, await findFixtureId(l.home, l.away, l.kickoff));
      const id = fx.get(fk);
      if (!id) continue;
      prices[k] = bestPrice(await getBookmakers(id), l.market as string, l.side, l.line);
    } catch {
      stop = true; // rate limit or API error: keep what we have, cached results make the next try cheaper
    }
  }
  return NextResponse.json({ prices });
}
