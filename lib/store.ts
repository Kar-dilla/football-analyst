import type { Pick } from '@/lib/types';

const KEY = 'fa_picks_v1';

export function loadPicks(): Pick[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) || '[]');
    return Array.isArray(parsed) ? (parsed as Pick[]).filter((p) => p && p.analysis) : [];
  } catch { return []; }
}

function write(picks: Pick[]): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(KEY, JSON.stringify(picks)); } catch { /* storage blocked or full */ }
}

export function savePick(pick: Pick): void {
  const all = loadPicks();
  const i = all.findIndex((p) => p.id === pick.id);
  if (i >= 0) all[i] = pick; else all.push(pick);
  write(all);
}

export function updatePick(id: string, patch: Partial<Pick>): void {
  write(loadPicks().map((p) => (p.id === id ? { ...p, ...patch } : p)));
}

export function removePick(id: string): void {
  write(loadPicks().filter((p) => p.id !== id));
}

export function exportPicksJSON(): string { return JSON.stringify(loadPicks(), null, 2); }
