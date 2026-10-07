'use client';

import { allCompetitions } from '@/lib/registry';
import { Accordion } from '@/components/ui';

const CUPS = ['ucl', 'uel', 'uecl'];
const NONE = ['saudi', 'india'];

export default function Coverage() {
  const all = allCompetitions();
  const none = all.filter((c) => NONE.includes(c.id));
  const cups = all.filter((c) => !NONE.includes(c.id) && CUPS.includes(c.id));
  const nat = all.filter((c) => !NONE.includes(c.id) && !CUPS.includes(c.id) && c.type === 'national');
  const rest = all.filter((c) => !NONE.includes(c.id) && !CUPS.includes(c.id) && c.type !== 'national');
  const a = rest.filter((c) => c.tier === 'A');
  const b = rest.filter((c) => c.tier === 'B');
  const other = rest.filter((c) => c.tier !== 'A' && c.tier !== 'B');
  const groups = [
    { title: 'Full stats (tier A)', note: 'Goals, both teams to score, result, double chance, half goals, corners and cards where the stats file has them.', list: a },
    { title: 'Goals only (tier B)', note: 'Goals, both teams to score, result and double chance only.', list: b },
    { title: 'Uses club leagues (Champions, Europa, Conference)', note: "Uses each club's domestic stats; confidence is low.", list: cups },
    { title: 'National teams', note: 'Goals, both teams to score, result and double chance from recent international results; confidence is capped at medium.', list: nat },
    { title: 'Other competitions', note: 'Coverage varies for these competitions.', list: other },
    { title: 'No stats source yet', note: 'These leagues have no free stats source, so analysis is not available.', list: none },
  ];
  return (
    <div className="stack">
      {groups.filter((g) => g.list.length > 0).map((g) => (
        <Accordion key={g.title} title={g.title} count={g.list.length}>
          <p className="muted" style={{ margin: '0 0 12px' }}>{g.note}</p>
          <div className="row">{g.list.map((c) => <span key={c.id} className="chip">{c.name}</span>)}</div>
        </Accordion>
      ))}
    </div>
  );
}
