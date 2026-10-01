const store = new Map<string, { exp: number; p: Promise<unknown> }>();

export async function getOrSet<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.exp > Date.now()) return hit.p as Promise<T>;
  const p = Promise.resolve().then(fn);
  store.set(key, { exp: Date.now() + ttlMs, p });
  p.catch(() => {
    if (store.get(key)?.p === p) store.delete(key);
  });
  return p;
}
