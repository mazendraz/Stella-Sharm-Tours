'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Compass, House, Map, MessageCircle } from 'lucide-react';
import { useTripStore } from './store';
import { track } from '@/lib/links';
export function TabBar() {
  const locale = useLocale(),
    t = useTranslations(),
    path = usePathname(),
    count = useTripStore((s) => s.ids.length);
  const items = [
    { key: 'home', href: '', icon: House },
    { key: 'journeys', href: '#journeys', icon: Compass },
    { key: 'myTrip', href: '/my-trip', icon: Map },
    { key: 'contact', href: '/contact', icon: MessageCircle },
  ] as const;
  return (
    <nav className="tabbar" aria-label={t('journeys')}>
      {items.map((i) => {
        const Icon = i.icon,
          active =
            i.key === 'home'
              ? path === '/' + locale
              : i.key === 'journeys'
                ? path.includes('/c/')
                : path.includes(i.href);
        return (
          <Link
            key={i.key}
            data-mytrip={i.key === 'myTrip' ? 'true' : undefined}
            href={'/' + locale + i.href}
            aria-current={active ? 'page' : undefined}
            onClick={() => {
              if (i.key === 'myTrip') track('mytrip_open');
            }}
          >
            <Icon size={22} />
            <span>{t(i.key)}</span>
            {i.key === 'myTrip' && count > 0 && (
              <b className="badge" key={count}>
                {count}
              </b>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
