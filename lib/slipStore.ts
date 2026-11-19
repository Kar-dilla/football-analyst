// Small localStorage helpers for the Daily and Live slip screens. Never throws.
export const DAILY_KEY = 'fa_daily_v1';
export const LIVE_KEY = 'fa_live_v1';

// Returns the saved object, or null when nothing valid is saved (it must have a numeric builtAt).
export function loadStored<T>(key: string): T | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const p: unknown = JSON.parse(raw);
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
    const b = (p as { builtAt?: unknown }).builtAt;
    if (typeof b !== 'number' || !Number.isFinite(b)) return null;
    return p as T;
  } catch {
    return null;
  }
}

// Saves value as JSON. If that fails (quota), drops the saved games and tries once more, then gives up silently.
export function saveStored(key: string, value: unknown): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return;
  } catch {
    // fall through to the smaller retry
  }
  try {
    const slim = value && typeof value === 'object' ? { ...(value as Record<string, unknown>), games: [], drawGames: [] } : value;
    window.localStorage.setItem(key, JSON.stringify(slim));
  } catch {
    // nothing saved
  }
}
