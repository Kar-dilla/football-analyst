'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { allCompetitions } from '@/lib/registry';
import type { Competition } from '@/lib/types';

// Groups shown before the plain leagues, in this order.
const HEAD_GROUPS = ['England', 'Scotland', 'Italy', 'Spain', 'Germany', 'France'];
// Group shown after the plain leagues, and the label it is displayed with.
const TAIL_GROUP = 'International';
const TAIL_LABEL = 'Country';

const rowStyle = (selected: boolean, indent = false): CSSProperties => ({
  width: '100%',
  minHeight: 48,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 12,
  padding: indent ? '8px 14px 8px 28px' : '8px 14px',
  background: 'transparent',
  borderTop: '1px solid var(--border)',
  borderLeft: 0,
  borderRight: 0,
  borderBottom: 0,
  color: selected ? 'var(--accent)' : 'var(--text)',
  fontFamily: 'inherit',
  fontSize: 'inherit',
  fontWeight: selected ? 700 : 400,
  textAlign: 'left',
  cursor: 'pointer',
});

function Chevron({ open }: { open: boolean }) {
  return (
    <span aria-hidden="true" style={{ display: 'inline-block', transition: 'transform 0.15s', transform: open ? 'rotate(90deg)' : 'none' }}>›</span>
  );
}

export default function LeaguePicker(props: {
  value: string;
  onChange: (id: string) => void;
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  placeholderDisabled?: boolean;
}) {
  const comps = useMemo(() => allCompetitions(), []);
  const [open, setOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const selected = comps.find((c) => c.id === props.value);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', down);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', down);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  useEffect(() => { if (props.disabled) setOpen(false); }, [props.disabled]);

  function toggle() {
    if (props.disabled) return;
    if (!open) setOpenGroup(selected?.group ?? null);
    setOpen(!open);
  }

  function choose(id: string) {
    props.onChange(id);
    setOpen(false);
  }

  const leagueRow = (c: Competition, indent: boolean) => {
    const on = c.id === props.value;
    return (
      <button key={c.id} type="button" style={rowStyle(on, indent)} aria-pressed={on} onClick={() => choose(c.id)}>
        <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{c.name}</span>
        {on && <span aria-hidden="true">✓</span>}
      </button>
    );
  };

  const groupBlock = (g: string, label: string) => {
    const items = comps.filter((c) => c.group === g);
    if (items.length === 0) return null;
    const isOpen = openGroup === g;
    return (
      <div key={g}>
        <button type="button" style={rowStyle(false)} aria-expanded={isOpen} onClick={() => setOpenGroup(isOpen ? null : g)}>
          <span style={{ fontWeight: 600 }}>{label}</span>
          <Chevron open={isOpen} />
        </button>
        {isOpen && items.map((c) => leagueRow(c, true))}
      </div>
    );
  };

  const showAuto = props.placeholder !== undefined && !props.placeholderDisabled;

  return (
    <div ref={box}>
      <button
        type="button"
        className={props.className}
        disabled={props.disabled}
        aria-expanded={open}
        onClick={toggle}
        style={{ width: '100%', minHeight: 48, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, textAlign: 'left', cursor: props.disabled ? 'default' : 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}
      >
        <span style={{ minWidth: 0, overflowWrap: 'anywhere', color: selected ? undefined : 'var(--muted)' }}>{selected ? selected.name : (props.placeholder ?? 'Choose league')}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div
          onClick={(e) => e.preventDefault()}
          style={{ marginTop: 6, border: '1px solid var(--border)', borderRadius: 'var(--r-md)', maxHeight: '60vh', overflowY: 'auto' }}
        >
          <div style={{ marginTop: -1 }}>
            {showAuto && (
              <button type="button" style={rowStyle(props.value === '')} onClick={() => choose('')}>
                <span>{props.placeholder}</span>
                {props.value === '' && <span aria-hidden="true">✓</span>}
              </button>
            )}
            {HEAD_GROUPS.map((g) => groupBlock(g, g))}
            {comps.filter((c) => !c.group).map((c) => leagueRow(c, false))}
            {groupBlock(TAIL_GROUP, TAIL_LABEL)}
          </div>
        </div>
      )}
    </div>
  );
}
