export async function callJSON(system: string, user: string): Promise<unknown> {
  const key = process.env.AI_KEY;
  const model = process.env.AI_MODEL;
  if (!key) throw new Error('MISSING_KEY:AI_KEY');
  if (!model) throw new Error('MISSING_KEY:AI_MODEL');
  const base = process.env.AI_BASE_URL ?? 'https://api.groq.com/openai/v1';
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      temperature: 0.2,
      max_tokens: 1500,
    }),
  });
  if (!res.ok) throw new Error('HTTP_' + res.status + ':llm');
  try {
    const data = await res.json();
    const text: string = data.choices[0].message.content;
    const a = text.indexOf('{');
    const b = text.lastIndexOf('}');
    return JSON.parse(text.slice(a, b + 1));
  } catch {
    throw new Error('AI_BAD_JSON');
  }
}
