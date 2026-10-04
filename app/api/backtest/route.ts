import { runBacktest } from '@/lib/backtest';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  try {
    const sp = new URL(req.url).searchParams;
    const k = sp.get('kind');
    if (k !== 'club' && k !== 'intl') return Response.json({ error: 'kind must be club or intl' });
    const raw = sp.get('limit');
    const lim = raw !== null && raw.trim() !== '' && Number.isFinite(Number(raw)) ? Number(raw) : undefined;
    const out = await runBacktest(k, sp.get('comp') ?? undefined, lim);
    return Response.json(out);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) });
  }
}
