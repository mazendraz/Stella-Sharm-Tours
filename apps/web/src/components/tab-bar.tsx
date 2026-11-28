'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { Check, Compass, House, Map, MessageCircle } from 'lucide-react';
import { useTripStore } from './store';
import { track } from '@/lib/links';
import { WhatsAppFloat } from './whatsapp-float';
export function TripNavigation({
  inPanel = false,
  whatsappNumber,
}: {
  inPanel?: boolean;
  // Passed by the page shell so the button renders on the server; panels
  // read the same number from the store.
  whatsappNumber?: string | null;
}) {
  const locale = useLocale(),
    t = useTranslations(),
    path = usePathname(),
    count = useTripStore((s) => s.ids.length),
    lastRequest = useTripStore((s) => s.lastRequest),
    toast = useTripStore((s) => s.toast);
  const builder = '/' + locale + '/my-trip';
  const requestPage = lastRequest
    ? '/' + locale + '/request/done/' + lastRequest
    : null;
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
      <WhatsAppFloat whatsappNumber={whatsappNumber} />
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
      {count === 0 && requestPage && path !== requestPage && (
        <Link href={requestPage} className="saved-trip-shortcut">
          <Check size={19} aria-hidden="true" />
          <span>
            {t('requestSentShortcut')} <bdi>{lastRequest}</bdi>
          </span>
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
