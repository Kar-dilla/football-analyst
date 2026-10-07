'use client';

import { useEffect, useId, useState } from 'react';
import type { ReactNode } from 'react';

type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'accent' | 'off';

const COLOR: Record<Exclude<Tone, 'off'>, string> = { ok: 'var(--ok)', warn: 'var(--warn)', bad: 'var(--bad)', info: 'var(--info)', accent: 'var(--accent)' };
const CONF = { low: ['Low', 'bad'], medium: ['Medium', 'warn'], high: ['High', 'ok'] } as const;
const between = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 } as const;
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const clamp = (n: number, lo: number, hi: number) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo);

export function PageHeader({ eyebrow, title, subtitle, right }: { eyebrow?: string; title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <div style={{ ...between, alignItems: 'flex-start', marginBottom: 16 }}>
      <div style={{ minWidth: 0 }}>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className="h1" style={{ marginTop: 6 }}>{title}</h1>
        {subtitle && <div className="sub" style={{ marginTop: 4 }}>{subtitle}</div>}
      </div>
      {right}
    </div>
  );
}

export function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <div style={{ ...between, marginBottom: 8 }}>
        <h2 className="eyebrow" style={{ color: 'var(--muted)' }}>{title}</h2>
        {hint && <span className="label">{hint}</span>}
      </div>
      <div className="stack">{children}</div>
    </section>
  );
}

export function Dot({ tone }: { tone: Tone }) {
  return <span className={`dot ${tone}`} aria-hidden="true" />;
}

export function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'ok' | 'warn' | 'bad' | 'accent' }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div className="label">{label}</div>
      <div className="num" style={{ fontSize: 26, fontWeight: 700, lineHeight: 1.2, color: tone ? COLOR[tone] : undefined }}>{value}</div>
      {sub && <div className="label">{sub}</div>}
    </div>
  );
}

export function Meter({ label, value, display }: { label: string; value: number; display?: string }) {
  const w = clamp(value * 100, 0, 100);
  return (
    <div>
      <div style={{ ...between, marginBottom: 6 }}>
        <span className="muted">{label}</span>
        <span className="num">{display ?? pct(value)}</span>
      </div>
      <div className="meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(w)}>
        <i style={{ width: `${w}%` }} />
      </div>
    </div>
  );
}

export function Gauge({ value, low, high, threshold, confidence, basis }: { value: number; low: number; high: number; threshold?: number; confidence?: 'low' | 'medium' | 'high'; basis?: string }) {
  const at = (x: number) => clamp(x * 100, 0, 100);
  const a = at(Math.min(low, high));
  const b = at(Math.max(low, high));
  const conf = confidence ? CONF[confidence] : null;
  return (
    <div>
      <div className="gauge" role="img" aria-label={`${pct(value)}, range ${pct(low)} to ${pct(high)}`} style={{ margin: '10px 0 14px' }}>
        <div className="band" style={{ left: `${a}%`, width: `${b - a}%` }} />
        {threshold !== undefined && <div className="tick" style={{ left: `${at(threshold)}%`, transform: 'translateX(-50%)' }} />}
        <div className="mark" style={{ left: `${at(value)}%` }} />
      </div>
      <div style={between}>
        <span><b className="num">{pct(value)}</b> <span className="muted num">({pct(low)} to {pct(high)})</span></span>
        {conf && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Dot tone={conf[1]} />{conf[0]}</span>}
      </div>
      {basis && <div className="label" style={{ marginTop: 4 }}>{basis}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ options, value, onChange, ariaLabel }: { options: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; ariaLabel?: string }) {
  return (
    <div className="seg" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.count !== undefined ? `${o.label} (${o.count})` : o.label}
        </button>
      ))}
    </div>
  );
}

export function Stepper({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void }) {
  const id = useId();
  const [text, setText] = useState(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  const bump = (n: number) => onChange(clamp(Math.round(n * 1e6) / 1e6, min, max));
  function commit() {
    const n = parseFloat(text);
    if (!Number.isFinite(n)) { setText(String(value)); return; }
    const c = clamp(n, min, max);
    setText(String(c));
    if (c !== value) onChange(c);
  }
  return (
    <div>
      <label className="label" htmlFor={id} style={{ display: 'block', marginBottom: 6 }}>{label}</label>
      <div className="stepper">
        <button type="button" aria-label={`Decrease ${label}`} disabled={value <= min} style={{ opacity: value <= min ? 0.35 : 1 }} onClick={() => bump(value - step)}>−</button>
        <input
          id={id} role="spinbutton" inputMode="numeric" aria-valuemin={min} aria-valuemax={max} aria-valuenow={value} value={text}
          onChange={(e) => { if (/^-?\d*\.?\d*$/.test(e.target.value)) setText(e.target.value); }}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
        />
        <button type="button" aria-label={`Increase ${label}`} disabled={value >= max} style={{ opacity: value >= max ? 0.35 : 1 }} onClick={() => bump(value + step)}>+</button>
      </div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <span className="label" style={{ display: 'block', marginBottom: 6 }}>{label}</span>
      {children}
      {hint && <span className="label faint" style={{ display: 'block', marginTop: 6 }}>{hint}</span>}
    </label>
  );
}

export function Accordion({ title, count, defaultOpen, children }: { title: string; count?: number; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details className="acc" open={defaultOpen}>
      <summary>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {title}
          {count !== undefined && <span className="badge">{count}</span>}
        </span>
      </summary>
      <div className="acc-body">{children}</div>
    </details>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="h2">{title}</div>
      {body && <p style={{ margin: '8px 0 0' }}>{body}</p>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

export function Skeleton({ lines = 3, height = 14 }: { lines?: number; height?: number }) {
  return (
    <div className="stack" style={{ gap: 8 }} role="status" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton" style={{ height, width: lines > 1 && i === lines - 1 ? '60%' : '100%' }} />
      ))}
    </div>
  );
}

export function Notice({ tone, children }: { tone: 'ok' | 'warn' | 'bad' | 'info'; children: ReactNode }) {
  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', border: '1px solid var(--border)', borderLeft: `3px solid ${COLOR[tone]}`, borderRadius: 'var(--r-md)', background: `color-mix(in srgb, ${COLOR[tone]} 10%, transparent)` }}
    >
      <span style={{ marginTop: 8 }}><Dot tone={tone} /></span>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}
