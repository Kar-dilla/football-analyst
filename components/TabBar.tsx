'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '@/components/AppProvider';

const TABS = [
  { href: '/', label: 'Picks' },
  { href: '/analyze', label: 'Analyze' },
  { href: '/live', label: 'Live' },
  { href: '/log', label: 'Log' },
  { href: '/more', label: 'More' },
];

export default function TabBar() {
  const pathname = usePathname() ?? '';
  const { slip } = useApp();
  const navStyle = { position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 50, display: 'flex', gap: 4, margin: 0, borderRadius: 0, padding: '6px 8px calc(6px + env(safe-area-inset-bottom))' } as const;
  return (
    <nav className="card" style={navStyle}>
      {TABS.map((t) => {
        const active = t.href === '/' ? pathname === '/' : pathname.startsWith(t.href);
        const linkStyle = { flex: 1, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, textDecoration: 'none', fontWeight: active ? 700 : 400 } as const;
        return (
          <Link key={t.href} href={t.href} className={active ? 'chip' : 'muted'} aria-current={active ? 'page' : undefined} style={linkStyle}>
            {t.label}
            {t.label === 'More' && slip.length > 0 && <span className="badge ok">{slip.length}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
