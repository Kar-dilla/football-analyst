import { db } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

// Removes the URL and the key from a message, in case a library error ever includes them.
function clean(message: string): string {
  let out = message;
  for (const secret of [process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY]) {
    if (secret) out = out.split(secret).join('[hidden]');
  }
  return out;
}

export async function GET() {
  if (process.env.VERCEL) return new Response('Not found', { status: 404 });
  try {
    const client = db();
    const count = await client.from('suggested_legs').select('*', { count: 'exact', head: true });
    if (count.error) throw new Error(count.error.message);
    const got = await client
      .from('suggested_legs')
      .select('label, prob, home, away, kickoff, source, created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    if (got.error) throw new Error(got.error.message);
    return Response.json({ ok: true, total: count.count ?? 0, last: got.data });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return Response.json({ ok: false, error: clean(message) }, { status: 200 });
  }
}
