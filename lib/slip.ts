const KEY = 'fa_slip_v1';

export interface SlipLeg { id: string; match: string; label: string; probability: number }

export function loadSlip(): SlipLeg[] {
  if (typeof window === 'undefined') return [];
  try {
    const p = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(p)) return [];
    return p.filter(
      (l): l is SlipLeg =>
        !!l && typeof l.id === 'string' && typeof l.match === 'string' &&
        typeof l.label === 'string' && typeof l.probability === 'number',
    );
  } catch { return []; }
}

export function saveSlip(legs: SlipLeg[]): void {
  if (typeof window === 'undefined') return;
  try { window.localStorage.setItem(KEY, JSON.stringify(legs)); } catch { /* storage unavailable */ }
}

export function combinedProbability(legs: SlipLeg[]): number {
  return legs.reduce((acc, l) => acc * l.probability, 1);
}
