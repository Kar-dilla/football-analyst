import { extractFacts } from '@/lib/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const fail = (e: unknown): Response => {
  const m = e instanceof Error ? e.message : '';
  const err = (error: string, status: number) => json({ error }, status);
  if (m.startsWith('MISSING_KEY:'))
    return err(`Server setup incomplete: ${m.slice(12).trim()} is not set in the Vercel environment variables.`, 500);
  if (m.includes('HTTP_429')) return err('Too many requests right now. Wait a minute and try again.', 429);
  if (m.includes('HTTP_')) return err('A data service is unavailable. Try again shortly.', 502);
  if (m.startsWith('NO_DATA'))
    return err((m.startsWith('NO_DATA:') ? m.slice(8).trim() : '') || 'No data found for that request.', 404);
  if (m.includes('LEAGUE_NOT_FOUND')) return err('Could not identify the league. Pick it from the league list.', 400);
  if (m.includes('PARSE_FAILED')) return err('Could not understand that query. Try: Arsenal vs Chelsea corners over 6.5', 400);
  if (m.includes('EMPTY_INPUT')) return err('Paste some text first.', 400);
  return err('Something went wrong. Try again.', 500);
};

export async function POST(req: Request): Promise<Response> {
  const b = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof b?.text === 'string' ? b.text.trim() : '';
  if (!text) return json({ error: 'Paste some text first.' }, 400);
  if (text.length > 5000) return json({ error: 'That text is too long. Keep it under 5000 characters.' }, 400);
  try {
    return json(await extractFacts(text));
  } catch (e) {
    return fail(e);
  }
}
