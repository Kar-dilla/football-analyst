import { runBacktestCC } from '@/lib/backtestCC';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request): Promise<Response> {
  try {
    const sp = new URL(req.url).searchParams;
    const raw = sp.get('limit');
    const lim = raw !== null && raw.trim() !== '' && Number.isFinite(Number(raw)) ? Number(raw) : undefined;
    return Response.json(await runBacktestCC(sp.get('comp') ?? '', lim));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) });
  }
}
