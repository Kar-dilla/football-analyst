import type { AllowedLines } from '@/lib/best';

const KEY = 'fa_settings_v1';
const range = (a: number, b: number, c: number, d: number) => ({ overMin: a, overMax: b, underMin: c, underMax: d });

export const DEFAULT_ALLOWED: AllowedLines = {
  goals: range(0.5, 4.5, 0.5, 4.5),
  firsthalf: range(0.5, 2.5, 0.5, 2.5),
  secondhalf: range(0.5, 2.5, 0.5, 2.5),
  corners: range(6.5, 12.5, 6.5, 12.5),
  cards: range(1.5, 6.5, 1.5, 6.5),
};

type Settings = { allowed: AllowedLines; maxPct: number };
const GROUPS = Object.keys(DEFAULT_ALLOWED) as (keyof AllowedLines)[];
const FIELDS = ['overMin', 'overMax', 'underMin', 'underMax'] as const;

export function loadSettings(): Settings {
  const out: Settings = { allowed: JSON.parse(JSON.stringify(DEFAULT_ALLOWED)), maxPct: 100 };
  if (typeof window === 'undefined') return out;
  try {
    const p = JSON.parse(window.localStorage.getItem(KEY) ?? 'null');
    if (!p || typeof p !== 'object') return out;
    for (const g of GROUPS) {
      for (const f of FIELDS) {
        const v = p.allowed?.[g]?.[f];
        if (typeof v === 'number' && Number.isFinite(v)) out.allowed[g][f] = v;
      }
    }
    if (typeof p.maxPct === 'number' && p.maxPct >= 50 && p.maxPct <= 100) out.maxPct = p.maxPct;
  } catch { /* malformed: keep defaults */ }
  return out;
}

export function saveSettings(s: Settings): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* storage unavailable */ }
}
