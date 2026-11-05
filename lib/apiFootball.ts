const BASE = "https://v3.football.api-sports.io";

export async function af(
  path: string,
  params: Record<string, string | number>,
  revalidate = 600
) {
  const qs = new URLSearchParams(
    Object.entries(params).map(([k, v]) => [k, String(v)])
  );
  const res = await fetch(`${BASE}/${path}?${qs}`, {
    headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY! },
    next: { revalidate },
  });
  const data = await res.json();
  if (data.errors && Object.keys(data.errors).length)
    throw new Error(JSON.stringify(data.errors));
  return data;
}

const MARKETS = ["Match Winner", "Goals Over/Under", "Both Teams Score", "Double Chance"];

export function bestOdds(bookmakers: any[]) {
  const out: Record<string, Record<string, { odd: number; book: string }>> = {};
  for (const b of bookmakers)
    for (const bet of b.bets) {
      if (!MARKETS.includes(bet.name)) continue;
      out[bet.name] ??= {};
      for (const v of bet.values) {
        const odd = parseFloat(v.odd);
        const cur = out[bet.name][v.value];
        if (!cur || odd > cur.odd) out[bet.name][v.value] = { odd, book: b.name };
      }
    }
  return out;
}
