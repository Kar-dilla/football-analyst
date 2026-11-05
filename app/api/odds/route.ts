import { af, bestOdds } from "@/lib/apiFootball";

export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const league = p.get("league");
  const date = p.get("date") ?? new Date().toISOString().slice(0, 10);
  const limit = Number(p.get("limit") ?? 5);
  try {
    const fx = await af("fixtures", { date }, 600);
    let games = fx.response.filter((g: any) => g.fixture.status.short === "NS");
    if (league) games = games.filter((g: any) => String(g.league.id) === league);
    games = games.slice(0, limit);
    const matches = await Promise.all(
      games.map(async (g: any) => {
        const o = await af("odds", { fixture: g.fixture.id }, 600);
        return {
          fixtureId: g.fixture.id,
          home: g.teams.home.name,
          away: g.teams.away.name,
          league: g.league.name,
          kickoff: g.fixture.date,
          odds: o.response?.[0] ? bestOdds(o.response[0].bookmakers) : null,
        };
      })
    );
    return Response.json({ matches });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
