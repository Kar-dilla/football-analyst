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
    const ins = await client.from('selftest').insert({ note: 'ping ' + new Date().toISOString() }).select('id').single();
    if (ins.error) throw new Error(ins.error.message);
    const got = await client.from('selftest').select('*').order('id', { ascending: false }).limit(3);
    if (got.error) throw new Error(got.error.message);
    return Response.json({ ok: true, inserted: ins.data.id, rows: got.data });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return Response.json({ ok: false, error: clean(message) }, { status: 200 });
  }
}
