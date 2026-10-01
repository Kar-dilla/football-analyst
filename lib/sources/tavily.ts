import { getOrSet } from '@/lib/cache';

const clean = (s: string | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

export async function tavilySearch(query: string): Promise<string[]> {
  try {
    return await getOrSet<string[]>('tv:news7:' + query, 2 * 3_600_000, async () => {
      const apiKey = process.env.TAVILY_KEY;
      if (!apiKey) throw new Error('TAVILY_KEY missing');
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ query, max_results: 3, search_depth: 'basic', topic: 'news', days: 7 }),
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[] };
      const results = Array.isArray(json.results) ? json.results : [];
      return results
        .map((r) => ({ title: clean(r.title), url: clean(r.url), content: clean(r.content) }))
        .filter((r) => r.content.length >= 40)
        .slice(0, 3)
        .map((r) => `${r.title} (${r.url}): ${r.content}`.slice(0, 300));
    });
  } catch {
    return [];
  }
}
