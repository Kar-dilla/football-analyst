import { getOrSet } from '@/lib/cache';

const clean = (s: string | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

// Women's, youth and reserve sides: dropped, because they are not the men's first team.
const OFF_TOPIC =
  /\b(women|womens|ladies|girls|f[eé]m[ei]n\w*|liga f|wsl|nwsl|frauen|youth|juvenil|castilla|u-?(?:15|16|17|18|19|20|21|23)|under-?(?:15|16|17|18|19|20|21|23)|reserve team|b team)\b|bar[cç]a atl[eè]tic/i;

export async function tavilySearch(query: string): Promise<string[]> {
  try {
    return await getOrSet<string[]>('tv:news8:' + query, 2 * 3_600_000, async () => {
      const apiKey = process.env.TAVILY_KEY;
      if (!apiKey) throw new Error('TAVILY_KEY missing');
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ query: query + ' first team', max_results: 6, search_depth: 'basic', topic: 'news', days: 7 }),
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = (await res.json()) as { results?: { title?: string; url?: string; content?: string }[] };
      const results = Array.isArray(json.results) ? json.results : [];
      return results
        .map((r) => ({ title: clean(r.title), url: clean(r.url), content: clean(r.content) }))
        .filter((r) => r.content.length >= 40)
        .filter((r) => !OFF_TOPIC.test(`${r.title} ${r.url} ${r.content}`))
        .slice(0, 3)
        .map((r) => `${r.title} (${r.url}): ${r.content}`.slice(0, 300));
    });
  } catch {
    return [];
  }
}
