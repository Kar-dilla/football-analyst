'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApp } from '@/components/AppProvider';
import { IconAnalyze, IconLive, IconLog, IconMore, IconPicks, IconSlips } from '@/components/icons';

const TABS = [
  { href: '/', label: 'Picks', Icon: IconPicks },
  { href: '/analyze', label: 'Analyze', Icon: IconAnalyze },
  { href: '/live', label: 'Live', Icon: IconLive },
  { href: '/slips', label: 'Slips', Icon: IconSlips },
  { href: '/log', label: 'Log', Icon: IconLog },
  { href: '/more', label: 'More', Icon: IconMore },
];

export default function TabBar() {
  const pathname = usePathname() ?? '';
  const { slip } = useApp();
  return (
    <nav className="tabbar" aria-label="Main" style={{ display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))' }}>
      {TABS.map(({ href, label, Icon }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? 'page' : undefined} style={{ minWidth: 0 }}>
            <span className="ico">
              <Icon />
              {label === 'More' && slip.length > 0 && <span className="count">{slip.length}</span>}
            </span>
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
