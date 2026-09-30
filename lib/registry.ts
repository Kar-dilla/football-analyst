import type { Competition, Conf, Tier } from './types';

// [id, name, tier, type, fdCode, csvPath, apiFootballId]  ("-" = undefined)
type Row = [string, string, Tier, Competition['type'], string, string, number];

const ROWS: Row[] = [
  ['epl', 'Premier League', 'A', 'club', 'PL', 'mmz4281/2627/E0.csv', 39],
  ['seriea', 'Serie A', 'A', 'club', 'SA', 'mmz4281/2627/I1.csv', 135],
  ['laliga', 'La Liga', 'A', 'club', 'PD', 'mmz4281/2627/SP1.csv', 140],
  ['bundesliga', 'Bundesliga', 'A', 'club', 'BL1', 'mmz4281/2627/D1.csv', 78],
  ['ligue1', 'Ligue 1', 'A', 'club', 'FL1', 'mmz4281/2627/F1.csv', 61],
  ['eredivisie', 'Eredivisie', 'A', 'club', 'DED', 'mmz4281/2627/N1.csv', 88],
  ['portugal', 'Liga Portugal', 'A', 'club', 'PPL', 'mmz4281/2627/P1.csv', 94],
  ['belgium', 'Belgian Pro League', 'A', 'club', '-', 'mmz4281/2627/B1.csv', 144],
  ['superlig', 'Süper Lig', 'A', 'club', '-', 'mmz4281/2627/T1.csv', 203],
  ['brazil', 'Brazil Serie A', 'B', 'club', 'BSA', 'new/BRA.csv', 71],
  ['mls', 'MLS', 'B', 'club', '-', 'new/USA.csv', 253],
  ['japan', 'J1 League (Japan)', 'B', 'club', '-', 'new/JPN.csv', 98],
  ['saudi', 'Saudi Pro League', 'C', 'club', '-', '-', 307],
  ['india', 'Indian Super League', 'C', 'club', '-', '-', 323],
  ['ucl', 'Champions League', 'C', 'club', 'CL', '-', 2],
  ['uel', 'Europa League', 'C', 'club', '-', '-', 3],
  ['uecl', 'Conference League', 'C', 'club', '-', '-', 848],
  ['worldcup', 'World Cup', 'C', 'national', 'WC', '-', 1],
  ['afcon', 'AFCON', 'C', 'national', '-', '-', 6],
  ['nations', 'Nations League', 'C', 'national', '-', '-', 5],
];

const CAP: Record<Tier, Conf> = { A: 'high', B: 'medium', C: 'low' };

const COMPETITIONS: Competition[] = ROWS.map(([id, name, tier, type, fd, csv, api]) => ({
  id,
  name,
  tier,
  type,
  ...(fd !== '-' ? { fdCode: fd } : {}),
  ...(csv !== '-' ? { csvPath: csv } : {}),
  apiFootballId: api,
  confidenceCap: type === 'national' ? 'medium' : CAP[tier],
}));

function norm(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

export function allCompetitions(): Competition[] {
  return COMPETITIONS.map((c) => ({ ...c }));
}

export function getCompetition(nameOrId: string): Competition | null {
  const q = norm(nameOrId);
  if (!q) return null;
  const list = allCompetitions();
  const exact = list.find((c) => norm(c.id) === q || norm(c.name) === q);
  if (exact) return exact;
  if (q.length < 3) return null;
  const loose = list.find((c) => {
    const n = norm(c.name);
    return n.includes(q) || q.includes(n);
  });
  return loose ?? null;
}
