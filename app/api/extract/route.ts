import { extractFacts } from '@/lib/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

export async function POST(req: Request): Promise<Response> {
  const b = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof b?.text === 'string' ? b.text.trim() : '';
  if (!text) return json({ error: 'text must be a non-empty string' }, 400);
  try {
    return json(await extractFacts(text));
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
}
