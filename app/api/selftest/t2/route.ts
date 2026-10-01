import { callJSON } from '@/lib/llm';

export const dynamic = 'force-dynamic';

export async function GET(req: Request): Promise<Response> {
  if (new URL(req.url).searchParams.get('ai') !== '1') {
    return Response.json({ skipped: true });
  }
  try {
    const result = await callJSON('Return ONLY JSON {"ok":true}', 'ping');
    return Response.json({ result });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : 'UNKNOWN' }, { status: 500 });
  }
}
