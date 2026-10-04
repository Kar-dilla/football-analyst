// Weighted multiplicative attack/defence strengths (Poisson-style), fitted by fixed-point sweeps.
export interface MatchRow { date: number; home: string; away: string; hg: number; ag: number; w: number }
export interface FitResult {
  att: Map<string, number>; def: Map<string, number>; n: Map<string, number>;
  homeAdv: number; mu: number;
}

const SWEEPS = 25;
const PSEUDO = 6; // pseudo-games of shrinkage toward 1 (average)

type Ent = { opp: number; w: number; gf: number; ga: number; home: boolean };

export function fitStrengths(rows: MatchRow[]): FitResult | null {
  try {
    if (!Array.isArray(rows) || rows.length < 40) return null;
    const ok = rows.filter((r) =>
      r && r.home && r.away && r.home !== r.away &&
      isFinite(r.hg) && isFinite(r.ag) && r.hg >= 0 && r.ag >= 0 && isFinite(r.w) && r.w > 0);
    if (ok.length < 40) return null;

    let sumW = 0, goals = 0, homeG = 0, awayG = 0;
    for (const r of ok) {
      sumW += r.w; goals += r.w * (r.hg + r.ag); homeG += r.w * r.hg; awayG += r.w * r.ag;
    }
    if (!(sumW > 0) || !(goals > 0) || !(homeG > 0) || !(awayG > 0)) return null;
    const mu = goals / (2 * sumW);        // league mean goals per team per match
    const homeAdv = homeG / awayG;        // home goals / away goals
    const sh = Math.sqrt(homeAdv);        // home scores x sh, away scores x 1/sh

    // index teams and collect each team's matches from its own point of view
    const names: string[] = [];
    const idx = new Map<string, number>();
    const ents: Ent[][] = [];
    const n: number[] = [];
    const id = (t: string): number => {
      let i = idx.get(t);
      if (i === undefined) { i = names.length; idx.set(t, i); names.push(t); ents.push([]); n.push(0); }
      return i;
    };
    for (const r of ok) {
      const h = id(r.home);
      const a = id(r.away);
      ents[h].push({ opp: a, w: r.w, gf: r.hg, ga: r.ag, home: true });
      ents[a].push({ opp: h, w: r.w, gf: r.ag, ga: r.hg, home: false });
      n[h] += r.w; n[a] += r.w;
    }

    const T = names.length;
    const att: number[] = names.map(() => 1);
    const def: number[] = names.map(() => 1);
    for (let it = 0; it < SWEEPS; it++) {
      for (let i = 0; i < T; i++) {
        let sf = 0, sa = 0, ef = 0, ea = 0;
        for (const e of ents[i]) {
          sf += e.w * e.gf;                                         // goals scored
          sa += e.w * e.ga;                                         // goals conceded
          ef += e.w * mu * (e.home ? sh : 1 / sh) * def[e.opp];     // expected scored at att = 1
          ea += e.w * mu * (e.home ? 1 / sh : sh) * att[e.opp];     // expected conceded at def = 1
        }
        if (ef > 0) att[i] = sf / ef;
        if (ea > 0) def[i] = sa / ea;
      }
      const ma = att.reduce((s, x) => s + x, 0) / T;                // unweighted mean over teams
      const md = def.reduce((s, x) => s + x, 0) / T;
      if (!(ma > 0) || !(md > 0)) return null;
      for (let i = 0; i < T; i++) { att[i] /= ma; def[i] /= md; }
    }

    const res: FitResult = { att: new Map(), def: new Map(), n: new Map(), homeAdv, mu };
    for (let i = 0; i < T; i++) {
      const a = (n[i] * att[i] + PSEUDO) / (n[i] + PSEUDO);
      const d = (n[i] * def[i] + PSEUDO) / (n[i] + PSEUDO);
      if (!isFinite(a) || !isFinite(d)) return null;
      res.att.set(names[i], a); res.def.set(names[i], d); res.n.set(names[i], n[i]);
    }
    return res;
  } catch {
    return null;
  }
}
