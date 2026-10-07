'use client';

import { useEffect, useState } from 'react';
import { Segmented, Skeleton } from '@/components/ui';

interface Fx { home: string; away: string; kickoff: string }
type Day = 'today' | 'tomorrow';

const FAIL = 'Could not load games. Type the match instead.';
const DAYS: { value: Day; label: string }[] = [{ value: 'today', label: 'Today' }, { value: 'tomorrow', label: 'Tomorrow' }];
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const ROW = { width: '100%', minHeight: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '8px 4px', color: 'var(--text)', font: 'inherit', textAlign: 'left', cursor: 'pointer' } as const;

export default function FixturePicker({ competitionId, onPick }: { competitionId: string; onPick: (home: string, away: string) => void }) {
  const [day, setDay] = useState<Day>('today');
  const [list, setList] = useState<Fx[]>([]);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [all, setAll] = useState(false);

  useEffect(() => {
    if (!competitionId) return undefined;
    const ctl = new AbortController();
    setLoading(true); setList([]); setNote(''); setAll(false);
    const tz = -new Date().getTimezoneOffset();
    (async () => {
      try {
        const r = await fetch(`/api/fixtures?comp=${encodeURIComponent(competitionId)}&day=${day}&tz=${tz}`, { signal: ctl.signal });
        const d = await r.json().catch(() => null);
        if (ctl.signal.aborted) return;
        const fx: Fx[] = r.ok && Array.isArray(d?.fixtures)
          ? d.fixtures.filter((x: Fx) => x && typeof x.home === 'string' && typeof x.away === 'string' && typeof x.kickoff === 'string')
          : [];
        setList(fx);
        setNote(fx.length ? '' : (r.ok && typeof d?.note === 'string' && d.note) || FAIL);
      } catch {
        if (!ctl.signal.aborted) { setList([]); setNote(FAIL); }
      } finally {
        if (!ctl.signal.aborted) setLoading(false);
      }
    })();
    return () => ctl.abort();
  }, [competitionId, day]);

  if (!competitionId) return <div className="muted">Choose a league to see its games.</div>;

  const shown = all ? list : list.slice(0, 8);
  return (
    <div className="stack">
      <div><Segmented<Day> ariaLabel="Day" options={DAYS} value={day} onChange={setDay} /></div>
      {loading && <Skeleton lines={3} />}
      {!loading && note && <div className="muted">{note}</div>}
      {shown.length > 0 && (
        <div>
          {shown.map((f) => (
            <button key={`${f.kickoff}|${f.home}|${f.away}`} type="button" className="card flat" style={ROW} onClick={() => onPick(f.home, f.away)}>
              <span style={{ minWidth: 0, overflowWrap: 'anywhere', fontWeight: 600 }}>{f.home} vs {f.away}</span>
              <span className="num muted">{hhmm(f.kickoff)}</span>
            </button>
          ))}
        </div>
      )}
      {!all && list.length > 8 && <button type="button" className="btn ghost block" onClick={() => setAll(true)}>Show more</button>}
    </div>
  );
}
