import { runBacktestRows } from '@/lib/backtest';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const VARIANTS = ['old', 'dcMix', 'strengthsDcMix'] as const;

export async function GET(req: Request): Promise<Response> {
  if (process.env.VERCEL) return new Response('Not found', { status: 404 });
  try {
    const sp = new URL(req.url).searchParams;
    const comp = (sp.get('comp') ?? '').trim();
    if (!comp) return Response.json({ error: 'comp is required' });
    const rs = sp.get('seasons');
    const seasons = rs !== null && rs.trim() !== '' && Number.isFinite(Number(rs)) ? Number(rs) : 1;
    const rl = sp.get('limit');
    const lim = rl !== null && rl.trim() !== '' && Number.isFinite(Number(rl)) ? Number(rl) : undefined;
    const rv = sp.get('variant');
    const variant = VARIANTS.find((x) => x === rv);
    if (rv !== null && rv.trim() !== '' && !variant) return Response.json({ error: 'variant must be old, dcMix or strengthsDcMix' });
    const out = await runBacktestRows(comp, seasons, lim, variant);
    return Response.json(out);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) });
  }
}
