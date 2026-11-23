'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Compass, House, Map, MessageCircle } from 'lucide-react';
import { useTripStore } from './store';
import { track } from '@/lib/links';
export function TripNavigation({ inPanel = false }: { inPanel?: boolean }) {
  const locale = useLocale(),
    t = useTranslations(),
    path = usePathname(),
    count = useTripStore((s) => s.ids.length),
    toast = useTripStore((s) => s.toast);
  const builder = '/' + locale + '/my-trip';
  const items = [
    { key: 'home', href: '', icon: House },
    { key: 'journeys', href: '#journeys', icon: Compass },
    { key: 'myTrip', href: '/my-trip', icon: Map },
    { key: 'contact', href: '/contact', icon: MessageCircle },
  ] as const;
  return (
    <div
      className={'trip-navigation' + (inPanel ? '' : ' trip-navigation-page')}
    >
      <div role="status" className={'toast' + (toast ? ' visible' : '')}>
        {toast ? t(toast.message) : ''}
      </div>
      {count > 0 && path !== builder && (
        <Link
          href={builder}
          className="saved-trip-shortcut"
          data-mytrip="true"
          onClick={() => track('mytrip_open')}
        >
          <Map size={19} aria-hidden="true" />
          {t('openMyTrip', { count })}
        </Link>
      )}
      <nav className="tabbar" aria-label={t('journeys')}>
        {items.map((i) => {
          const Icon = i.icon,
            active =
              i.key === 'home'
                ? path === '/' + locale
                : i.key === 'journeys'
                  ? path.includes('/c/')
                  : path === '/' + locale + i.href;
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
              <Icon size={22} aria-hidden="true" />
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
    </div>
  );
}
